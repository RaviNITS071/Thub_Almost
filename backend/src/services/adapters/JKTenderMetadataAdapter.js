/**
 * @file backend/src/services/adapters/JKTenderMetadataAdapter.js
 * @description Dedicated, high-speed metadata enrichment adapter for JKTenders.
 * 
 * Features:
 * - 100% accurate extraction of Critical Dates directly from the portal's inner tables.
 * - Zero fallback to live page header timestamps (guards against session captcha clock leak).
 * - Extracts Basic Details, Payment Instruments, Covers, Fee/EMD, Work Item details, and Inviting Authority.
 * - Strictly PRESERVES all existing Cloudflare R2 PDF & BOQ links in MongoDB.
 * - Packages and uploads self-describing `tender.json` directly into each tender's Cloudflare R2 folder.
 * - Does NOT download binary files (PDFs/ZIPs) or solve download captchas -> high-speed execution.
 */

import { chromium } from 'playwright';
import pino from 'pino';
import Tender from '../../models/Tender.js';
import { extractDeptCode, formatTenderStorageKey, uploadJsonToR2 } from '../../utils/r2Storage.js';
import { parseISTDate, formatStandardTime, extractDateParts } from '../../utils/dateUtils.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

export class JKTenderMetadataAdapter {
  constructor(options = {}) {
    this.portalName = 'JK_TENDERS';
    this.baseUrl = 'https://jktenders.gov.in';
    this.headless = options.headless !== undefined ? options.headless : (process.env.SCRAPER_HEADLESS !== 'false');
    this.browser = null;
    this.context = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
    }
    return await this.context.newPage();
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
    }
  }

  /**
   * Scrapes detailed metadata from an already-opened Tender Details page.
   * Guaranteed against clock-leak by strictly targeting innermost Critical Dates cells.
   */
  async extractDetailsFromPage(page, summary = {}) {
    return await page.evaluate((summaryData) => {
      // 1. Helper to find value by label across clean innermost table cells
      const getTableVal = (labelText) => {
        const cleanTarget = labelText.toLowerCase().replace(/[:₹\s]/g, '');
        const tds = Array.from(document.querySelectorAll('td'));
        for (const td of tds) {
          if (td.querySelector('table')) continue;
          const raw = td.textContent.trim().replace(/\s+/g, ' ');
          const clean = raw.toLowerCase().replace(/[:₹\s]/g, '');
          if (clean === cleanTarget || clean.startsWith(cleanTarget)) {
            let next = td.nextElementSibling;
            if (next && next.tagName === 'TD') {
              const val = next.textContent.trim().replace(/\s+/g, ' ');
              if (val && val !== 'NA' && val !== 'N/A') return val;
            }
          }
        }
        return '';
      };

      const parseNum = (str) => {
        if (!str) return 0;
        const val = parseFloat(str.replace(/,/g, '').replace(/[^0-9.]/g, ''));
        return isNaN(val) ? 0 : val;
      };

      // 2. Extract Critical Dates ONLY from innermost cells matching exact date labels
      const getDateByLabel = (labels) => {
        const normalizedLabels = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase().replace(/[:₹\s]/g, ''));
        const tds = Array.from(document.querySelectorAll('td'));
        for (const td of tds) {
          if (td.querySelector('table')) continue;
          const text = td.innerText.trim().toLowerCase().replace(/[:₹\s]/g, '');
          if (normalizedLabels.includes(text)) {
            let next = td.nextElementSibling;
            if (next && next.tagName === 'TD') {
              const val = next.innerText.trim().replace(/\s+/g, ' ');
              // Ensure it matches an actual date pattern (DD-MMM-YYYY or DD-MM-YYYY)
              if (val && val !== 'NA' && val !== 'N/A' && /\d{1,2}[-/][a-zA-Z0-9]{2,4}[-/]\d{4}/.test(val)) {
                return val;
              }
            }
          }
        }
        return '';
      };

      const critPublishedDate = getDateByLabel(['Published Date', 'e-Published Date', 'Publish Date']);
      const critBidOpeningDate = getDateByLabel(['Bid Opening Date']);
      const critDocDownloadStartDate = getDateByLabel(['Document Download / Sale Start Date', 'Document Download Start Date']);
      const critDocDownloadEndDate = getDateByLabel(['Document Download / Sale End Date', 'Document Download End Date']);
      const critClarificationStartDate = getDateByLabel(['Clarification Start Date']);
      const critClarificationEndDate = getDateByLabel(['Clarification End Date']);
      const critBidSubmissionStartDate = getDateByLabel(['Bid Submission Start Date']);
      const critBidSubmissionEndDate = getDateByLabel(['Bid Submission End Date']);

      // 3. Payment Instruments (Offline Instruments)
      const offlineInstruments = [];
      const allTables = Array.from(document.querySelectorAll('table'));
      for (const tbl of allTables) {
        if (tbl.querySelectorAll('table').length > 0) continue;
        const trs = Array.from(tbl.querySelectorAll('tr'));
        const hasHeader = trs.some(tr => tr.textContent.includes('Instrument Type'));
        if (hasHeader) {
          for (const tr of trs) {
            if (tr.querySelector('th') || tr.textContent.includes('Instrument Type')) continue;
            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length >= 2) {
              let sNo = parseInt(tds[0].textContent.trim(), 10);
              let instType = tds[1].textContent.trim().replace(/\s+/g, ' ');
              if (tds.length >= 3 && isNaN(sNo)) {
                sNo = parseInt(tds[1].textContent.trim(), 10);
                instType = tds[2].textContent.trim().replace(/\s+/g, ' ');
              }
              if (!isNaN(sNo) && instType && !instType.includes('Search') && !/\d{1,2}-[a-z]{3}-\d{4}/i.test(instType)) {
                offlineInstruments.push({ sNo, instrumentType: instType });
              }
            }
          }
          if (offlineInstruments.length > 0) break;
        }
      }

      // 4. Covers Information
      const coversInfo = [];
      for (const tbl of allTables) {
        if (tbl.querySelectorAll('table').length > 0) continue;
        const trs = Array.from(tbl.querySelectorAll('tr'));
        const hasCoverHeader = trs.some(tr => tr.textContent.includes('Cover No') && tr.textContent.includes('Document Type'));
        if (hasCoverHeader) {
          let currentCoverNo = 1;
          let currentCoverType = 'Fee/PreQual/Technical';
          for (const tr of trs) {
            if (tr.querySelector('th') || tr.textContent.includes('Cover No')) continue;
            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length >= 4) {
              const pNo = parseInt(tds[0].textContent.trim(), 10);
              if (!isNaN(pNo)) currentCoverNo = pNo;
              const pType = tds[1].textContent.trim().replace(/\s+/g, ' ');
              if (pType) currentCoverType = pType;
              const desc = tds[2].textContent.trim().replace(/\s+/g, ' ');
              const docType = tds[3].textContent.trim().replace(/\s+/g, ' ');
              if (desc || docType) coversInfo.push({ coverNo: currentCoverNo, coverType: currentCoverType, description: desc, documentType: docType });
            } else if (tds.length === 2) {
              const desc = tds[0].textContent.trim().replace(/\s+/g, ' ');
              const docType = tds[1].textContent.trim().replace(/\s+/g, ' ');
              if (desc || docType) coversInfo.push({ coverNo: currentCoverNo, coverType: currentCoverType, description: desc, documentType: docType });
            }
          }
          if (coversInfo.length > 0) break;
        }
      }

      // 5. Work Item Documents metadata
      const workItemDocuments = [];
      const workTable = document.querySelector('table#workItemDocumenttable') || allTables.find(t => t.innerText.includes('Work Item Documents') && t.innerText.includes('Document Name'));
      if (workTable) {
        Array.from(workTable.querySelectorAll('tr')).forEach(tr => {
          const tds = Array.from(tr.querySelectorAll('td'));
          if (tds.length >= 5) {
            const sNo = parseInt(tds[0].innerText.trim(), 10);
            const docType = tds[1].innerText.trim();
            const docName = tds[2].innerText.trim();
            const desc = tds[3].innerText.trim();
            const sizeKb = parseFloat(tds[4].innerText.trim().replace(/,/g, '')) || 0;
            if (!isNaN(sNo) && docName) workItemDocuments.push({ sNo, documentType: docType, documentName: docName, description: desc, documentSizeKb: sizeKb });
          }
        });
      }

      // 6. NIT Documents metadata (innermost)
      const rawNitDocs = [];
      const nitTable = allTables.find(tbl => tbl.querySelectorAll('table').length === 0 && tbl.innerText.includes('Document Name') && tbl.innerText.includes('Document Size'));
      if (nitTable) {
        Array.from(nitTable.querySelectorAll('tr')).forEach(tr => {
          const tds = Array.from(tr.querySelectorAll('td'));
          if (tds.length >= 4) {
            const sNo = parseInt(tds[0].innerText.trim(), 10);
            const docName = tds[1].innerText.trim();
            const desc = tds[2].innerText.trim();
            const sizeKb = parseFloat(tds[3].innerText.trim().replace(/,/g, '')) || 0;
            const isDoc = /\.(pdf|doc|docx)$/i.test(docName) || docName.toLowerCase().includes('tendernotice');
            if (!isNaN(sNo) && docName && isDoc && !docName.includes('Search')) {
              rawNitDocs.push({ sNo, documentName: docName, description: desc, documentSizeKb: sizeKb });
            }
          }
        });
      }

      // 7. Tender Inviting Authority
      let invitingAuthorityName = "";
      let invitingAuthorityAddress = "";
      for (const tbl of allTables) {
        if (tbl.querySelectorAll('table').length > 0) continue;
        if (tbl.textContent.includes('Tender Inviting Authority')) {
          const tds = Array.from(tbl.querySelectorAll('td'));
          for (const td of tds) {
            const txt = td.textContent.trim().replace(/\s+/g, ' ').replace(/:$/, '').trim();
            if (txt === 'Name') invitingAuthorityName = td.nextElementSibling?.textContent.trim().replace(/\s+/g, ' ') || '';
            else if (txt === 'Address') invitingAuthorityAddress = td.nextElementSibling?.textContent.trim().replace(/\s+/g, ' ') || '';
          }
          if (invitingAuthorityName || invitingAuthorityAddress) break;
        }
      }
      if (!invitingAuthorityName) invitingAuthorityName = getTableVal('Name');
      if (!invitingAuthorityAddress) invitingAuthorityAddress = getTableVal('Address');

      // Fallback & Sanity Guard: Published Date in NIC portals cannot be later than Document Download / Bid Submission Start Date
      let finalPublishedDateStr = critPublishedDate || summaryData?.publishedDate || critDocDownloadStartDate || critBidSubmissionStartDate || null;
      const referenceStartDate = critDocDownloadStartDate || critBidSubmissionStartDate;
      if (finalPublishedDateStr && referenceStartDate) {
        const parseD = (s) => {
          if (!s) return null;
          const m = s.match(/(\d{1,2})[-/]([a-zA-Z]{3}|\d{1,2})[-/](\d{4})/);
          if (!m) return null;
          const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
          const mo = months[m[2].toLowerCase()] ?? (parseInt(m[2], 10) - 1);
          return new Date(parseInt(m[3], 10), mo, parseInt(m[1], 10));
        };
        const pubD = parseD(finalPublishedDateStr);
        const refD = parseD(referenceStartDate);
        if (pubD && refD && pubD > refD && refD.getFullYear() === 2026) {
          finalPublishedDateStr = referenceStartDate;
        }
      }
      const finalClosingDateStr = critBidSubmissionEndDate || critDocDownloadEndDate || summaryData?.closingDate || null;

      return {
        organisationChain: getTableVal('Organisation Chain'),
        tenderReferenceNumber: getTableVal('Tender Reference Number'),
        withdrawalAllowed: getTableVal('Withdrawal Allowed'),
        tenderType: getTableVal('Tender Type'),
        formOfContract: getTableVal('Form Of Contract'),
        tenderCategory: getTableVal('Tender Category'),
        noOfCovers: parseInt(getTableVal('No. of Covers')) || coversInfo.length || 2,
        generalTechnicalEvaluationAllowed: getTableVal('General Technical Evaluation Allowed'),
        itemWiseTechnicalEvaluationAllowed: getTableVal('ItemWise Technical Evaluation Allowed'),
        paymentMode: getTableVal('Payment Mode'),
        isMultiCurrencyAllowedForFee: getTableVal('Is Multi Currency Allowed For Fee'),
        isMultiCurrencyAllowedForBOQ: getTableVal('Is Multi Currency Allowed For BOQ'),
        allowTwoStageBidding: getTableVal('Allow Two Stage Bidding'),

        tenderFee: parseNum(getTableVal('Tender Fee in')),
        feePayableTo: getTableVal('Fee Payable To'),
        feePayableAt: getTableVal('Fee Payable At'),
        tenderFeeExemptionAllowed: getTableVal('Tender Fee Exemption Allowed'),

        emdAmount: parseNum(getTableVal('EMD Amount in')),
        emdExemptionAllowed: getTableVal('EMD Exemption Allowed'),
        emdFeeType: getTableVal('EMD Fee Type'),
        emdPercentage: getTableVal('EMD Percentage'),
        emdPayableTo: getTableVal('EMD Payable To'),
        emdPayableAt: getTableVal('EMD Payable At'),

        title: getTableVal('Work Description') || getTableVal('Title') || summaryData?.title || '',
        workDescription: getTableVal('Work Description') || getTableVal('Title') || '',
        ndaPreQualification: getTableVal('NDA/Pre Qualification'),
        independentExternalMonitorRemarks: getTableVal('Independent External Monitor/Remarks'),
        estimatedValue: parseNum(getTableVal('Tender Value')),
        productCategory: getTableVal('Product Category'),
        subCategory: getTableVal('Sub category'),
        contractType: getTableVal('Contract Type'),
        bidValidityDays: parseInt(getTableVal('Bid Validity(Days)')) || 0,
        periodOfWorkDays: parseInt(getTableVal('Period Of Work(Days)')) || 0,
        location: getTableVal('Location'),
        pincode: getTableVal('Pincode'),
        preBidMeetingPlace: getTableVal('Pre Bid Meeting Place'),
        preBidMeetingAddress: getTableVal('Pre Bid Meeting Address'),
        preBidMeetingDate: getTableVal('Pre Bid Meeting Date'),
        bidOpeningPlace: getTableVal('Bid Opening Place'),
        shouldAllowNDATender: getTableVal('Should Allow NDA Tender'),
        allowPreferentialBidder: getTableVal('Allow Preferential Bidder'),
        tendererClass: getTableVal('Tenderer Class'),

        publishedDateStr: finalPublishedDateStr,
        bidOpeningDateStr: critBidOpeningDate || summaryData?.openingDate || null,
        documentDownloadStartDateStr: critDocDownloadStartDate || null,
        documentDownloadEndDateStr: critDocDownloadEndDate || null,
        clarificationStartDateStr: critClarificationStartDate || null,
        clarificationEndDateStr: critClarificationEndDate || null,
        bidSubmissionStartDateStr: critBidSubmissionStartDate || null,
        bidSubmissionEndDateStr: critBidSubmissionEndDate || null,
        closingDateStr: finalClosingDateStr,

        offlineInstruments,
        coversInfo,
        workItemDocuments,
        rawNitDocs,
        invitingAuthorityName,
        invitingAuthorityAddress
      };
    }, summary);
  }

  /**
   * Enriches a single tender record in MongoDB with verified metadata and uploads tender.json to R2.
   * 
   * @param {Object} rawDetails - Metadata extracted from page
   * @param {Object} existingTender - Existing tender document from MongoDB
   * @returns {Promise<Object>} Updated tender document
   */
  async updateTenderAndUploadR2(rawDetails, existingTender) {
    let publishedDate = parseISTDate(rawDetails.publishedDateStr) || existingTender.publishedDate || null;
    let publishedDateStr = rawDetails.publishedDateStr || existingTender.publishedDateStr || null;

    const docStart = parseISTDate(rawDetails.documentDownloadStartDateStr) || existingTender.documentDownloadStartDate;
    const bidStart = parseISTDate(rawDetails.bidSubmissionStartDateStr) || existingTender.bidSubmissionStartDate;
    const refStart = (docStart && docStart.getFullYear() >= 2026) ? docStart : ((bidStart && bidStart.getFullYear() >= 2026) ? bidStart : null);
    const refStartStr = (docStart && docStart.getFullYear() >= 2026) ? (rawDetails.documentDownloadStartDateStr || existingTender.documentDownloadStartDateStr) : ((bidStart && bidStart.getFullYear() >= 2026) ? (rawDetails.bidSubmissionStartDateStr || existingTender.bidSubmissionStartDateStr) : null);

    if (publishedDate && refStart && publishedDate.getTime() > refStart.getTime()) {
      publishedDate = refStart;
      publishedDateStr = refStartStr;
    }

    const deptCode = existingTender.departmentCode || extractDeptCode(existingTender.sourceTenderId, rawDetails.organisationChain || existingTender.organisationChain);
    const deptName = rawDetails.organisationChain ? rawDetails.organisationChain.split('||')[0].trim() : (existingTender.departmentName || 'General');
    const folderKey = formatTenderStorageKey(existingTender.sourceTenderId, publishedDate, deptCode);

    // Merge nitDocuments: preserve existing Cloudflare R2 fileUrl while enriching metadata
    let mergedNitDocs = existingTender.nitDocuments || [];
    if (rawDetails.rawNitDocs && rawDetails.rawNitDocs.length > 0) {
      mergedNitDocs = rawDetails.rawNitDocs.map((rawDoc, idx) => {
        const existingDoc = (existingTender.nitDocuments || []).find(d => d.documentName === rawDoc.documentName) || (existingTender.nitDocuments || [])[idx];
        return {
          sNo: rawDoc.sNo || (idx + 1),
          documentName: rawDoc.documentName,
          description: rawDoc.description || (existingDoc ? existingDoc.description : "Tender Notice Document"),
          documentSizeKb: rawDoc.documentSizeKb || (existingDoc ? existingDoc.documentSizeKb : 0),
          fileUrl: existingDoc ? existingDoc.fileUrl : ''
        };
      });
    }

    const updateFields = {
      title: rawDetails.title || existingTender.title,
      departmentCode: deptCode,
      departmentName: deptName,
      organisationChain: rawDetails.organisationChain || existingTender.organisationChain,
      tenderReferenceNumber: rawDetails.tenderReferenceNumber || existingTender.tenderReferenceNumber,
      withdrawalAllowed: rawDetails.withdrawalAllowed || existingTender.withdrawalAllowed,
      tenderType: rawDetails.tenderType || existingTender.tenderType,
      formOfContract: rawDetails.formOfContract || existingTender.formOfContract,
      tenderCategory: rawDetails.tenderCategory || existingTender.tenderCategory,
      noOfCovers: rawDetails.noOfCovers || existingTender.noOfCovers,
      generalTechnicalEvaluationAllowed: rawDetails.generalTechnicalEvaluationAllowed || existingTender.generalTechnicalEvaluationAllowed,
      itemWiseTechnicalEvaluationAllowed: rawDetails.itemWiseTechnicalEvaluationAllowed || existingTender.itemWiseTechnicalEvaluationAllowed,
      paymentMode: rawDetails.paymentMode || existingTender.paymentMode,
      isMultiCurrencyAllowedForFee: rawDetails.isMultiCurrencyAllowedForFee || existingTender.isMultiCurrencyAllowedForFee,
      isMultiCurrencyAllowedForBOQ: rawDetails.isMultiCurrencyAllowedForBOQ || existingTender.isMultiCurrencyAllowedForBOQ,
      allowTwoStageBidding: rawDetails.allowTwoStageBidding || existingTender.allowTwoStageBidding,

      tenderFee: rawDetails.tenderFee || existingTender.tenderFee || 0,
      feePayableTo: rawDetails.feePayableTo || existingTender.feePayableTo,
      feePayableAt: rawDetails.feePayableAt || existingTender.feePayableAt,
      tenderFeeExemptionAllowed: rawDetails.tenderFeeExemptionAllowed || existingTender.tenderFeeExemptionAllowed,

      emdAmount: rawDetails.emdAmount || existingTender.emdAmount || 0,
      emdExemptionAllowed: rawDetails.emdExemptionAllowed || existingTender.emdExemptionAllowed,
      emdFeeType: rawDetails.emdFeeType || existingTender.emdFeeType,
      emdPercentage: rawDetails.emdPercentage || existingTender.emdPercentage,
      emdPayableTo: rawDetails.emdPayableTo || existingTender.emdPayableTo,
      emdPayableAt: rawDetails.emdPayableAt || existingTender.emdPayableAt,

      workDescription: rawDetails.workDescription || existingTender.workDescription,
      ndaPreQualification: rawDetails.ndaPreQualification || existingTender.ndaPreQualification,
      independentExternalMonitorRemarks: rawDetails.independentExternalMonitorRemarks || existingTender.independentExternalMonitorRemarks,
      estimatedValue: rawDetails.estimatedValue || existingTender.estimatedValue || 0,
      productCategory: rawDetails.productCategory || existingTender.productCategory,
      subCategory: rawDetails.subCategory || existingTender.subCategory,
      contractType: rawDetails.contractType || existingTender.contractType,
      bidValidityDays: rawDetails.bidValidityDays || existingTender.bidValidityDays || 0,
      periodOfWorkDays: rawDetails.periodOfWorkDays || existingTender.periodOfWorkDays || 0,
      location: rawDetails.location || existingTender.location,
      pincode: rawDetails.pincode || existingTender.pincode,
      preBidMeetingPlace: rawDetails.preBidMeetingPlace || existingTender.preBidMeetingPlace,
      preBidMeetingAddress: rawDetails.preBidMeetingAddress || existingTender.preBidMeetingAddress,
      preBidMeetingDate: parseISTDate(rawDetails.preBidMeetingDate),
      bidOpeningPlace: rawDetails.bidOpeningPlace || existingTender.bidOpeningPlace,
      shouldAllowNDATender: rawDetails.shouldAllowNDATender || existingTender.shouldAllowNDATender,
      allowPreferentialBidder: rawDetails.allowPreferentialBidder || existingTender.allowPreferentialBidder,
      tendererClass: rawDetails.tendererClass || existingTender.tendererClass,

      // --- Precise Critical Dates ---
      publishedDate,
      publishedDateStr,
      publishedTime: formatStandardTime(publishedDateStr || publishedDate),
      publishedDateOnly: extractDateParts(publishedDateStr || publishedDate).dateOnly,

      bidOpeningDate: parseISTDate(rawDetails.bidOpeningDateStr) || existingTender.bidOpeningDate,
      bidOpeningDateStr: rawDetails.bidOpeningDateStr,
      bidOpeningTime: formatStandardTime(rawDetails.bidOpeningDateStr || existingTender.bidOpeningDate),

      documentDownloadStartDate: parseISTDate(rawDetails.documentDownloadStartDateStr) || existingTender.documentDownloadStartDate,
      documentDownloadStartDateStr: rawDetails.documentDownloadStartDateStr,
      documentDownloadStartTime: formatStandardTime(rawDetails.documentDownloadStartDateStr),

      documentDownloadEndDate: parseISTDate(rawDetails.documentDownloadEndDateStr) || existingTender.documentDownloadEndDate,
      documentDownloadEndDateStr: rawDetails.documentDownloadEndDateStr,
      documentDownloadEndTime: formatStandardTime(rawDetails.documentDownloadEndDateStr),

      clarificationStartDate: parseISTDate(rawDetails.clarificationStartDateStr) || existingTender.clarificationStartDate,
      clarificationStartDateStr: rawDetails.clarificationStartDateStr,

      clarificationEndDate: parseISTDate(rawDetails.clarificationEndDateStr) || existingTender.clarificationEndDate,
      clarificationEndDateStr: rawDetails.clarificationEndDateStr,

      bidSubmissionStartDate: parseISTDate(rawDetails.bidSubmissionStartDateStr) || existingTender.bidSubmissionStartDate,
      bidSubmissionStartDateStr: rawDetails.bidSubmissionStartDateStr,
      bidSubmissionStartTime: formatStandardTime(rawDetails.bidSubmissionStartDateStr),

      bidSubmissionEndDate: parseISTDate(rawDetails.bidSubmissionEndDateStr) || existingTender.bidSubmissionEndDate,
      bidSubmissionEndDateStr: rawDetails.bidSubmissionEndDateStr,
      bidSubmissionEndTime: formatStandardTime(rawDetails.bidSubmissionEndDateStr),

      closingDate: parseISTDate(rawDetails.closingDateStr) || parseISTDate(rawDetails.bidSubmissionEndDateStr) || existingTender.closingDate,
      closingDateStr: rawDetails.closingDateStr || rawDetails.bidSubmissionEndDateStr,
      closingTime: formatStandardTime(rawDetails.closingDateStr || rawDetails.bidSubmissionEndDateStr),

      offlineInstruments: rawDetails.offlineInstruments?.length > 0 ? rawDetails.offlineInstruments : existingTender.offlineInstruments,
      coversInfo: rawDetails.coversInfo?.length > 0 ? rawDetails.coversInfo : existingTender.coversInfo,
      workItemDocuments: rawDetails.workItemDocuments?.length > 0 ? rawDetails.workItemDocuments : existingTender.workItemDocuments,
      nitDocuments: mergedNitDocs,
      invitingAuthorityName: rawDetails.invitingAuthorityName || existingTender.invitingAuthorityName,
      invitingAuthorityAddress: rawDetails.invitingAuthorityAddress || existingTender.invitingAuthorityAddress,

      r2StorageKey: folderKey,
      updatedAt: new Date()
    };

    // 1. Update in MongoDB Atlas
    const updated = await Tender.findByIdAndUpdate(existingTender._id, { $set: updateFields }, { returnDocument: 'after' }).lean();

    // 2. Upload tender.json directly into the tender's Cloudflare R2 folder
    try {
      await uploadJsonToR2({
        jsonData: updated,
        fileName: 'tender.json',
        tenderId: existingTender.sourceTenderId,
        publishedDate,
        deptCode
      });
    } catch (r2Err) {
      logger.warn(`Could not upload tender.json to R2 for ${existingTender.sourceTenderId}: ${r2Err.message}`);
    }

    return updated;
  }
}
export default JKTenderMetadataAdapter;
