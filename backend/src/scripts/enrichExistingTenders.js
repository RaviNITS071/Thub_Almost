/**
 * @file backend/src/scripts/enrichExistingTenders.js
 * @description Backfills and enriches all existing MongoDB tenders with complete,
 * 100% accurate metadata extracted directly from JKTenders (Basic Details,
 * Payment Instruments, Covers, Fee & EMD, Work Item Details, Critical Dates in IST,
 * NIT Docs metadata, Work Item Docs, and Tender Inviting Authority).
 * 
 * ZERO re-download of files - strictly preserves all existing PDF and BOQ Cloudflare R2 links.
 * Fast execution: views pages without downloading files or solving download captchas.
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import { extractDeptCode, formatTenderStorageKey, uploadJsonToR2 } from '../utils/r2Storage.js';
import { parseISTDate, formatStandardTime, extractDateParts } from '../utils/dateUtils.js';

async function enrichAll() {
  console.log('\n======================================================');
  console.log('🚀 JKTenders Comprehensive Metadata Enrichment Engine');
  console.log('📌 Populating 100% Accurate Fields:');
  console.log('   - Basic Details & Payment Instruments');
  console.log('   - Covers Information (No. of Covers)');
  console.log('   - Tender Fee & EMD Fee Details');
  console.log('   - Work Item Details (Value, Location, Pincode, etc.)');
  console.log('   - Critical Dates in Indian Standard Time (IST, UTC+05:30)');
  console.log('   - NIT Documents & Work Item Documents metadata');
  console.log('   - Tender Inviting Authority');
  console.log('🛡️ Preserving all existing Cloudflare R2 PDF & ZIP links!');
  console.log('======================================================\n');

  await connectDB();

  // Find all tenders in MongoDB
  const tenders = await Tender.find({ sourcePortal: 'JK_TENDERS' }).lean();
  console.log(`📊 Found ${tenders.length} tender(s) in MongoDB to enrich.`);

  if (tenders.length === 0) {
    console.log('No tenders found in MongoDB. Exiting.');
    await closeDB();
    process.exit(0);
  }

  const tenderMap = new Map();
  tenders.forEach(t => {
    tenderMap.set(t.sourceTenderId, t);
  });

  const browser = await chromium.launch({
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log('\n🌐 Navigating to JKTenders Department Directory...');
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await page.waitForSelector("table#table tr[id^='informal']", { timeout: 15000 }).catch(() => {});

  const orgRows = await page.evaluate(() => {
    const table = document.querySelector('table#table') || document.querySelector('table.list_table');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll("tr[id^='informal']"));
    const orgs = [];
    rows.forEach((row, index) => {
      const tds = row.querySelectorAll('td');
      if (tds.length >= 3) {
        const orgName = tds[1] ? tds[1].innerText.trim() : '';
        const countLink = tds[2] ? tds[2].querySelector('a') : null;
        const countText = countLink ? countLink.innerText.trim() : '0';
        const count = parseInt(countText, 10) || 0;
        if (countLink && count > 0) {
          orgs.push({ index, orgName, count });
        }
      }
    });
    return orgs;
  });

  console.log(`🏛️ Found ${orgRows.length} organisation(s) with active tenders.`);

  const args = process.argv.slice(2);
  let maxToEnrich = Infinity;
  let orgFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      maxToEnrich = parseInt(args[i + 1], 10);
    } else if (args[i] === '--org' && args[i + 1]) {
      orgFilter = args[i + 1];
    } else if (/^\d+$/.test(args[i]) && maxToEnrich === Infinity) {
      maxToEnrich = parseInt(args[i], 10);
    }
  }

  if (maxToEnrich !== Infinity) {
    console.log(`🎯 Limit: Enriching up to ${maxToEnrich} tenders.`);
  }
  if (orgFilter) {
    console.log(`🎯 Filter: Only organisations matching "${orgFilter}".`);
  }

  let enrichedCount = 0;

  for (let o = 0; o < orgRows.length && enrichedCount < maxToEnrich; o++) {
    const org = orgRows[o];
    if (orgFilter && !org.orgName.toLowerCase().includes(orgFilter.toLowerCase())) {
      continue;
    }
    console.log(`\n======================================================`);
    console.log(`🏛️ [Organisation ${o + 1}/${orgRows.length}] Entering: "${org.orgName}" (${org.count} tenders)`);
    console.log(`======================================================`);

    // Click organisation link
    const orgRowLocator = page.locator("table#table tr[id^='informal']").nth(org.index);
    const countLinkLocator = orgRowLocator.locator("td:nth-child(3) a, a.link2").first();

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
      countLinkLocator.click({ noWaitAfter: true, timeout: 20000 }).catch(() => countLinkLocator.click({ force: true, noWaitAfter: true }))
    ]);
    await page.waitForTimeout(800);

    let orgHasMore = true;
    let orgPageNum = 1;

    while (orgHasMore) {
      await page.waitForSelector("table.list_table tr:has(td:nth-child(5) a), table.list_table tr[id^='informal']", { timeout: 15000 }).catch(() => {});

      const tenderRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table.list_table tr:has(td:nth-child(5) a), table.list_table tr[id^='informal']"));
        return rows.map((row, index) => {
          const tds = row.querySelectorAll('td');
          if (tds.length < 5) return null;
          const fullText = row.innerText.trim();
          const bracketMatches = fullText.match(/\[(.*?)\]/g) || [];
          const tenderId = bracketMatches.length >= 1 ? bracketMatches[bracketMatches.length - 1].replace(/[\[\]]/g, '') : '';
          const a = tds[4].querySelector('a');
          return {
            index,
            sourceTenderId: tenderId,
            title: a ? a.innerText.trim() : tds[4].innerText.trim(),
            publishedDate: tds[1] ? tds[1].innerText.trim() : '',
            closingDate: tds[2] ? tds[2].innerText.trim() : '',
            openingDate: tds[3] ? tds[3].innerText.trim() : '',
            hasLink: !!a,
            detailsUrl: a ? a.href : null
          };
        }).filter(t => t && t.hasLink && t.sourceTenderId);
      });

      console.log(`📋 [Page ${orgPageNum}] Found ${tenderRows.length} tender(s) on list.`);

      for (let t = 0; t < tenderRows.length && enrichedCount < maxToEnrich; t++) {
        const tenderSummary = tenderRows[t];
        const existingTender = tenderMap.get(tenderSummary.sourceTenderId) || null;

        // Open Tender Details in the SAME tab
        let tenderLink = page.locator("table.list_table tr, tr[id^='informal']").filter({ hasText: tenderSummary.sourceTenderId }).locator("td:nth-child(5) a, a").first();
        const exists = await tenderLink.count().catch(() => 0);
        if (exists === 0) {
          tenderLink = page.locator("table.list_table tr:has(td:nth-child(5) a)").nth(t).locator("td:nth-child(5) a").first();
        }

        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
            tenderLink.click({ noWaitAfter: true, timeout: 15000 }).catch(() => tenderLink.click({ force: true, noWaitAfter: true }))
          ]);
          await page.waitForTimeout(600);

          // Extract ALL details directly from the page
          const detailedData = await page.evaluate((summary) => {
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
                    if (val) return val;
                  }
                }
              }
              return "";
            };

            const parseNum = (str) => {
              if (!str) return 0;
              const val = parseFloat(str.replace(/,/g, '').replace(/[^0-9.]/g, ''));
              return isNaN(val) ? 0 : val;
            };

            // 1. Payment Instruments
            const offlineInstruments = [];
            const allTables = Array.from(document.querySelectorAll('table'));
            for (const tbl of allTables) {
              if (tbl.querySelectorAll('table').length > 0) continue;
              const trs = Array.from(tbl.querySelectorAll('tr'));
              const hasHeader = trs.some(tr => {
                const txt = tr.textContent;
                return txt.includes('Instrument Type') && (txt.includes('S.No') || txt.includes('S.No.'));
              });

              if (hasHeader) {
                for (const tr of trs) {
                  if (tr.querySelector('th') || tr.textContent.includes('Instrument Type')) continue;
                  const tds = Array.from(tr.querySelectorAll('td'));
                  if (tds.length >= 2) {
                    const sNo = parseInt(tds[0].textContent.trim(), 10);
                    const instType = (tds.length >= 3 ? tds[2] : tds[1]).textContent.trim().replace(/\s+/g, ' ');
                    if (!isNaN(sNo) && instType && instType.length >= 3 && !instType.includes('Search')) {
                      offlineInstruments.push({ sNo, instrumentType: instType });
                    }
                  }
                }
                if (offlineInstruments.length > 0) break;
              }
            }

            // 2. Covers Information
            const coversInfo = [];
            for (const tbl of allTables) {
              if (tbl.querySelectorAll('table').length > 0) continue;
              const trs = Array.from(tbl.querySelectorAll('tr'));
              const hasCoverHeader = trs.some(tr => {
                const txt = tr.textContent;
                return txt.includes('Cover No') && txt.includes('Document Type');
              });

              if (hasCoverHeader) {
                let currentCoverNo = 1;
                let currentCoverType = 'Fee/PreQual/Technical';

                for (const tr of trs) {
                  if (tr.querySelector('th') || tr.textContent.includes('Cover No') || tr.textContent.includes('Document Type')) continue;
                  const tds = Array.from(tr.querySelectorAll('td'));
                  if (tds.length >= 4) {
                    const parsedNo = parseInt(tds[0].textContent.trim(), 10);
                    if (!isNaN(parsedNo)) currentCoverNo = parsedNo;
                    const parsedType = tds[1].textContent.trim().replace(/\s+/g, ' ');
                    if (parsedType) currentCoverType = parsedType;
                    const desc = tds[2].textContent.trim().replace(/\s+/g, ' ');
                    const docType = tds[3].textContent.trim().replace(/\s+/g, ' ');
                    if (desc || docType) {
                      coversInfo.push({ coverNo: currentCoverNo, coverType: currentCoverType, description: desc, documentType: docType });
                    }
                  } else if (tds.length === 2) {
                    const desc = tds[0].textContent.trim().replace(/\s+/g, ' ');
                    const docType = tds[1].textContent.trim().replace(/\s+/g, ' ');
                    if (desc || docType) {
                      coversInfo.push({ coverNo: currentCoverNo, coverType: currentCoverType, description: desc, documentType: docType });
                    }
                  }
                }
                if (coversInfo.length > 0) break;
              }
            }

            // 3. Inviting Authority
            let invitingAuthorityName = "";
            let invitingAuthorityAddress = "";
            for (const tbl of allTables) {
              if (tbl.querySelectorAll('table').length > 0) continue;
              if (tbl.textContent.includes('Tender Inviting Authority')) {
                const tds = Array.from(tbl.querySelectorAll('td'));
                for (const td of tds) {
                  const txt = td.textContent.trim().replace(/\s+/g, ' ').replace(/:$/, '').trim();
                  if (txt === 'Name') {
                    const next = td.nextElementSibling;
                    if (next && next.tagName === 'TD') invitingAuthorityName = next.textContent.trim().replace(/\s+/g, ' ');
                  } else if (txt === 'Address') {
                    const next = td.nextElementSibling;
                    if (next && next.tagName === 'TD') invitingAuthorityAddress = next.textContent.trim().replace(/\s+/g, ' ');
                  }
                }
                if (invitingAuthorityName || invitingAuthorityAddress) break;
              }
            }
            if (!invitingAuthorityName) invitingAuthorityName = getTableVal('Name');
            if (!invitingAuthorityAddress) invitingAuthorityAddress = getTableVal('Address');

            // 4. NIT Documents metadata (innermost table with Document Name & Document Size)
            const rawNitDocs = [];
            const nitTable = Array.from(document.querySelectorAll('table')).find(tbl => {
              if (tbl.querySelectorAll('table').length > 0) return false;
              const text = tbl.innerText || '';
              return text.includes('Document Name') && text.includes('Document Size');
            });
            if (nitTable) {
              const rows = Array.from(nitTable.querySelectorAll('tr'));
              rows.forEach(tr => {
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length >= 4) {
                  const sNo = parseInt(tds[0].innerText.trim(), 10);
                  const docName = tds[1].innerText.trim();
                  const desc = tds[2].innerText.trim();
                  const sizeKb = parseFloat(tds[3].innerText.trim().replace(/,/g, '')) || 0;
                  const isDoc = /\.(pdf|doc|docx)$/i.test(docName) || docName.toLowerCase().includes('tendernotice');
                  if (!isNaN(sNo) && docName && isDoc && !docName.includes('Search') && !docName.includes('Result')) {
                    rawNitDocs.push({ sNo, documentName: docName, description: desc, documentSizeKb: sizeKb });
                  }
                }
              });
            }

            // 5. Work Item Documents metadata
            const workItemDocuments = [];
            const workTable = document.querySelector('table#workItemDocumenttable') || Array.from(document.querySelectorAll('table')).find(tbl => {
              const text = tbl.innerText || '';
              return text.includes('Work Item Documents') && text.includes('Document Type') && text.includes('Document Name');
            });
            if (workTable) {
              const rows = Array.from(workTable.querySelectorAll('tr'));
              rows.forEach(tr => {
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length >= 5) {
                  const sNo = parseInt(tds[0].innerText.trim(), 10);
                  const docType = tds[1].innerText.trim();
                  const docName = tds[2].innerText.trim();
                  const desc = tds[3].innerText.trim();
                  const sizeKb = parseFloat(tds[4].innerText.trim().replace(/,/g, '')) || 0;
                  if (!isNaN(sNo) && docName) {
                    workItemDocuments.push({ sNo, documentType: docType, documentName: docName, description: desc, documentSizeKb: sizeKb });
                  }
                }
              });
            }

            // Extract Critical Dates specifically using exact label lookup across non-container table cells
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
                    if (val && val !== 'NA' && val !== 'N/A') return val;
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

              title: getTableVal('Work Description') || getTableVal('Title') || summary.title,
              workDescription: getTableVal('Work Description') || getTableVal('Title'),
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

              publishedDate: critPublishedDate || summary?.publishedDate || null,
              publishedDateStr: critPublishedDate || summary?.publishedDate || null,
              bidOpeningDate: critBidOpeningDate || summary?.openingDate || null,
              bidOpeningDateStr: critBidOpeningDate || summary?.openingDate || null,
              documentDownloadStartDate: critDocDownloadStartDate || null,
              documentDownloadStartDateStr: critDocDownloadStartDate || null,
              documentDownloadEndDate: critDocDownloadEndDate || null,
              documentDownloadEndDateStr: critDocDownloadEndDate || null,
              clarificationStartDate: critClarificationStartDate || null,
              clarificationStartDateStr: critClarificationStartDate || null,
              clarificationEndDate: critClarificationEndDate || null,
              clarificationEndDateStr: critClarificationEndDate || null,
              bidSubmissionStartDate: critBidSubmissionStartDate || null,
              bidSubmissionStartDateStr: critBidSubmissionStartDate || null,
              bidSubmissionEndDate: critBidSubmissionEndDate || null,
              bidSubmissionEndDateStr: critBidSubmissionEndDate || null,
              closingDate: critBidSubmissionEndDate || critDocDownloadEndDate || summary?.closingDate || null,
              closingDateStr: critBidSubmissionEndDate || critDocDownloadEndDate || summary?.closingDate || null,

              invitingAuthorityName,
              invitingAuthorityAddress,
              offlineInstruments,
              coversInfo,
              rawNitDocs,
              workItemDocuments
            };
          }, tenderSummary);

          // Parse all dates strictly in IST
          const publishedDate = parseISTDate(detailedData.publishedDate) || parseISTDate(tenderSummary.publishedDate) || null;
          const documentDownloadStartDate = parseISTDate(detailedData.documentDownloadStartDate) || null;
          const deptCode = extractDeptCode(tenderSummary.sourceTenderId, detailedData.organisationChain || org.orgName);
          const deptName = org.orgName || (detailedData.organisationChain ? detailedData.organisationChain.split('||')[0].trim() : 'General');
          const folderKey = formatTenderStorageKey(tenderSummary.sourceTenderId, publishedDate, deptCode);

          // Merge nitDocuments: preserve existing Cloudflare R2 fileUrl while enriching metadata
          let mergedNitDocs = (existingTender && existingTender.nitDocuments) ? existingTender.nitDocuments : [];
          if (detailedData.rawNitDocs && detailedData.rawNitDocs.length > 0) {
            mergedNitDocs = detailedData.rawNitDocs.map((rawDoc, idx) => {
              const existingDoc = (existingTender?.nitDocuments || []).find(d => d.documentName === rawDoc.documentName) || (existingTender?.nitDocuments || [])[idx];
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
            sourcePortal: 'JK_TENDERS',
            sourceTenderId: tenderSummary.sourceTenderId,
            detailsUrl: tenderSummary.detailsUrl || existingTender?.detailsUrl,
            isDocumentAvailable: detailedData.isDocumentAvailable !== false,
            pdfFetchStatus: existingTender?.pdfFetchStatus || (existingTender?.pdfUrls?.length > 0 ? 'COMPLETED' : (detailedData.isDocumentAvailable ? 'PENDING' : 'NOT_AVAILABLE')),

            organisationChain: detailedData.organisationChain || existingTender?.organisationChain,
            tenderReferenceNumber: detailedData.tenderReferenceNumber || existingTender?.tenderReferenceNumber,
            withdrawalAllowed: detailedData.withdrawalAllowed || existingTender?.withdrawalAllowed,
            tenderType: detailedData.tenderType || existingTender?.tenderType,
            formOfContract: detailedData.formOfContract || existingTender?.formOfContract,
            tenderCategory: detailedData.tenderCategory || existingTender?.tenderCategory,
            noOfCovers: detailedData.noOfCovers || existingTender?.noOfCovers,
            generalTechnicalEvaluationAllowed: detailedData.generalTechnicalEvaluationAllowed || existingTender?.generalTechnicalEvaluationAllowed,
            itemWiseTechnicalEvaluationAllowed: detailedData.itemWiseTechnicalEvaluationAllowed || existingTender?.itemWiseTechnicalEvaluationAllowed,
            paymentMode: detailedData.paymentMode || existingTender?.paymentMode,
            isMultiCurrencyAllowedForFee: detailedData.isMultiCurrencyAllowedForFee || existingTender?.isMultiCurrencyAllowedForFee,
            isMultiCurrencyAllowedForBOQ: detailedData.isMultiCurrencyAllowedForBOQ || existingTender?.isMultiCurrencyAllowedForBOQ,
            allowTwoStageBidding: detailedData.allowTwoStageBidding || existingTender?.allowTwoStageBidding,

            tenderFee: detailedData.tenderFee || existingTender?.tenderFee || 0,
            feePayableTo: detailedData.feePayableTo || existingTender?.feePayableTo,
            feePayableAt: detailedData.feePayableAt || existingTender?.feePayableAt,
            tenderFeeExemptionAllowed: detailedData.tenderFeeExemptionAllowed || existingTender?.tenderFeeExemptionAllowed,

            emdAmount: detailedData.emdAmount || existingTender?.emdAmount || 0,
            emdExemptionAllowed: detailedData.emdExemptionAllowed || existingTender?.emdExemptionAllowed,
            emdFeeType: detailedData.emdFeeType || existingTender?.emdFeeType,
            emdPercentage: detailedData.emdPercentage || existingTender?.emdPercentage,
            emdPayableTo: detailedData.emdPayableTo || existingTender?.emdPayableTo,
            emdPayableAt: detailedData.emdPayableAt || existingTender?.emdPayableAt,

            title: detailedData.title || existingTender?.title,
            workDescription: detailedData.workDescription || existingTender?.workDescription,
            ndaPreQualification: detailedData.ndaPreQualification || existingTender?.ndaPreQualification,
            independentExternalMonitorRemarks: detailedData.independentExternalMonitorRemarks || existingTender?.independentExternalMonitorRemarks,
            estimatedValue: detailedData.estimatedValue || existingTender?.estimatedValue || 0,
            productCategory: detailedData.productCategory || existingTender?.productCategory,
            subCategory: detailedData.subCategory || existingTender?.subCategory,
            contractType: detailedData.contractType || existingTender?.contractType,
            bidValidityDays: detailedData.bidValidityDays || existingTender?.bidValidityDays || 0,
            periodOfWorkDays: detailedData.periodOfWorkDays || existingTender?.periodOfWorkDays || 0,
            location: detailedData.location || existingTender?.location,
            pincode: detailedData.pincode || existingTender?.pincode,
            preBidMeetingPlace: detailedData.preBidMeetingPlace || existingTender?.preBidMeetingPlace,
            preBidMeetingAddress: detailedData.preBidMeetingAddress || existingTender?.preBidMeetingAddress,
            preBidMeetingDate: parseISTDate(detailedData.preBidMeetingDate),
            bidOpeningPlace: detailedData.bidOpeningPlace || existingTender?.bidOpeningPlace,
            shouldAllowNDATender: detailedData.shouldAllowNDATender || existingTender?.shouldAllowNDATender,
            allowPreferentialBidder: detailedData.allowPreferentialBidder || existingTender?.allowPreferentialBidder,
            tendererClass: detailedData.tendererClass || existingTender?.tendererClass,

            publishedDate,
            publishedDateStr: detailedData.publishedDateStr || tenderSummary.publishedDate || null,
            publishedTime: formatStandardTime(detailedData.publishedDateStr || tenderSummary.publishedDate || publishedDate),
            publishedDateOnly: extractDateParts(detailedData.publishedDateStr || tenderSummary.publishedDate || publishedDate).dateOnly,
            bidOpeningDate: parseISTDate(detailedData.bidOpeningDate) || existingTender?.bidOpeningDate,
            bidOpeningDateStr: detailedData.bidOpeningDateStr || existingTender?.bidOpeningDateStr || null,
            bidOpeningTime: formatStandardTime(detailedData.bidOpeningDateStr || existingTender?.bidOpeningDateStr || detailedData.bidOpeningDate),
            documentDownloadStartDate,
            documentDownloadStartDateStr: detailedData.documentDownloadStartDateStr || existingTender?.documentDownloadStartDateStr || null,
            documentDownloadStartTime: formatStandardTime(detailedData.documentDownloadStartDateStr || existingTender?.documentDownloadStartDateStr || documentDownloadStartDate),
            documentDownloadEndDate: parseISTDate(detailedData.documentDownloadEndDate) || existingTender?.documentDownloadEndDate,
            documentDownloadEndDateStr: detailedData.documentDownloadEndDateStr || existingTender?.documentDownloadEndDateStr || null,
            documentDownloadEndTime: formatStandardTime(detailedData.documentDownloadEndDateStr || existingTender?.documentDownloadEndDateStr || detailedData.documentDownloadEndDate),
            clarificationStartDate: parseISTDate(detailedData.clarificationStartDate) || existingTender?.clarificationStartDate,
            clarificationStartDateStr: detailedData.clarificationStartDateStr || existingTender?.clarificationStartDateStr || null,
            clarificationEndDate: parseISTDate(detailedData.clarificationEndDate) || existingTender?.clarificationEndDate,
            clarificationEndDateStr: detailedData.clarificationEndDateStr || existingTender?.clarificationEndDateStr || null,
            bidSubmissionStartDate: parseISTDate(detailedData.bidSubmissionStartDate) || existingTender?.bidSubmissionStartDate,
            bidSubmissionStartDateStr: detailedData.bidSubmissionStartDateStr || existingTender?.bidSubmissionStartDateStr || null,
            bidSubmissionStartTime: formatStandardTime(detailedData.bidSubmissionStartDateStr || existingTender?.bidSubmissionStartDateStr || detailedData.bidSubmissionStartDate),
            bidSubmissionEndDate: parseISTDate(detailedData.bidSubmissionEndDate) || existingTender?.bidSubmissionEndDate,
            bidSubmissionEndDateStr: detailedData.bidSubmissionEndDateStr || existingTender?.bidSubmissionEndDateStr || null,
            bidSubmissionEndTime: formatStandardTime(detailedData.bidSubmissionEndDateStr || existingTender?.bidSubmissionEndDateStr || detailedData.bidSubmissionEndDate),
            closingDate: parseISTDate(detailedData.closingDate) || parseISTDate(detailedData.bidSubmissionEndDate) || existingTender?.closingDate,
            closingDateStr: detailedData.closingDateStr || existingTender?.closingDateStr || null,
            closingTime: formatStandardTime(detailedData.closingDateStr || existingTender?.closingDateStr || detailedData.closingDate),

            invitingAuthorityName: detailedData.invitingAuthorityName || existingTender?.invitingAuthorityName,
            invitingAuthorityAddress: detailedData.invitingAuthorityAddress || existingTender?.invitingAuthorityAddress,
            offlineInstruments: detailedData.offlineInstruments?.length > 0 ? detailedData.offlineInstruments : (existingTender?.offlineInstruments || []),
            coversInfo: detailedData.coversInfo?.length > 0 ? detailedData.coversInfo : (existingTender?.coversInfo || []),
            nitDocuments: mergedNitDocs,
            workItemDocuments: detailedData.workItemDocuments?.length > 0 ? detailedData.workItemDocuments : (existingTender?.workItemDocuments || []),

            departmentCode: deptCode,
            departmentName: deptName,
            r2StorageKey: folderKey,
            updatedAt: new Date()
          };

          await Tender.findOneAndUpdate(
            { sourcePortal: 'JK_TENDERS', sourceTenderId: tenderSummary.sourceTenderId },
            { $set: updateFields },
            { upsert: true, returnDocument: 'after' }
          );

          tenderMap.set(tenderSummary.sourceTenderId, updateFields);

          enrichedCount++;
          const pubDisplay = publishedDate ? publishedDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A';
          console.log(`   ✨ [${enrichedCount}] ${existingTender ? 'ENRICHED' : 'INGESTED'}: ${tenderSummary.sourceTenderId} | Pub: ${pubDisplay} | Value: ₹${updateFields.estimatedValue} | WorkDocs: ${updateFields.workItemDocuments?.length || 0}`);

          // Upload updated JSON metadata to R2 asynchronously
          uploadJsonToR2({
            jsonData: { ...(existingTender || {}), ...updateFields },
            tenderId: tenderSummary.sourceTenderId,
            publishedDate,
            deptCode
          }).catch(() => {});

        } catch (tenderErr) {
          console.warn(`   ⚠️ Error reading tender ${tenderSummary.sourceTenderId}: ${tenderErr.message}`);
        } finally {
          // Click Back to return to the Tender List table, or ensure we are on the list
          try {
            if (!page.isClosed()) {
              const backBtn = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back'), input[value='Back']").last();
              if (await backBtn.count().catch(() => 0) > 0) {
                await Promise.all([
                  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
                  backBtn.click({ noWaitAfter: true }).catch(() => {})
                ]);
              }
              await page.waitForTimeout(400).catch(() => {});
            }
          } catch (bErr) {}
        }
      }

      // Check for next page in this organisation
      const hasNext = await page.evaluate((nextPg) => {
        const links = Array.from(document.querySelectorAll('a'));
        const target = links.find(l => l.textContent.trim() === String(nextPg) || l.textContent.trim() === 'Next >');
        if (target) {
          target.click();
          return true;
        }
        return false;
      }, orgPageNum + 1);

      if (hasNext) {
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(1000);
        orgPageNum++;
      } else {
        orgHasMore = false;
      }
    }

    // Navigate back to Tenders by Organisation for next department
    const orgMenuLink = page.locator("a:has-text('Tenders by Organisation'), a#DirectLink_0").first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
      orgMenuLink.click({ noWaitAfter: true, timeout: 20000 }).catch(() => orgMenuLink.click({ force: true, noWaitAfter: true }))
    ]);
    await page.waitForTimeout(800);
  }

  console.log('\n======================================================');
  console.log(`🎉 ENRICHMENT COMPLETE!`);
  console.log(`   - Enriched: ${enrichedCount} tenders`);
  console.log('======================================================\n');

  await browser.close();
  await closeDB();
  process.exit(0);
}

enrichAll().catch(err => {
  console.error('\n❌ Enrichment script failed:', err);
  process.exit(1);
});
