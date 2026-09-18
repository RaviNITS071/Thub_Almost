import { TenderSourceAdapter } from './TenderSourceAdapter.js';
import { chromium } from 'playwright';
import { uploadPdfToR2 } from '../../utils/r2Storage.js';
import { captchaService } from '../captcha.service.js';
import SystemLog from '../../models/SystemLog.js';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import pino from 'pino';

const logger = pino();
const execPromise = util.promisify(exec);

/**
 * Helper Function: Compresses a PDF file using Ghostscript to reduce storage footprint.
 * Includes a 2-minute timeout to prevent the worker from hanging on corrupted PDFs.
 */
async function compressPDF(inputPath, outputPath) {
  try {
    const gsCommand = os.platform() === 'win32' ? 'gswin64c' : 'gs';
    const command = `${gsCommand} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;
    await execPromise(command, { timeout: 120000 }); 
    return true;
  } catch (err) {
    logger.warn(`[Compression] Ghostscript failed or timed out for ${inputPath}: ${err.message}`);
    return false;
  }
}

export class JKTenderAdapter extends TenderSourceAdapter {
  constructor() {
    super('JK_TENDERS');
    this.latestActiveUrl = 'https://jktenders.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page';
    this.departmentRootUrl = 'https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page';
  }

  /**
   * Main entry point for crawling tenders
   */
  async fetchList(pageNumber = 1, filters = { syncMode: 'LATEST', limit: 100 }, onPageScraped = null) {
    const maxTenders = filters.limit || 100;
    const isHeadless = process.env.SCRAPER_HEADLESS !== 'false';
    logger.info(`[Scraper] Launching Playwright (headless: ${isHeadless}) for ${filters.syncMode || 'LATEST'} ingestion (Target limit: ${maxTenders})...`);

    const browser = await chromium.launch({ 
      headless: isHeadless, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const context = await browser.newContext({ 
      acceptDownloads: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let globalTenderCount = 0;
    let totalPdfsSecured = 0;
    let missingPdfsCount = 0;

    try {
      if (filters.syncMode === 'DEPARTMENT') {
        await this.crawlByDepartment(page, context, maxTenders, onPageScraped, (count, pdfs, missing) => {
          globalTenderCount += count;
          totalPdfsSecured += pdfs;
          missingPdfsCount += missing;
        });
      } else {
        // Default: Crawl latest tenders by current issuing date
        await this.crawlLatestActiveTenders(page, context, maxTenders, onPageScraped, (count, pdfs, missing) => {
          globalTenderCount += count;
          totalPdfsSecured += pdfs;
          missingPdfsCount += missing;
        });
      }

      logger.info(`🎉 Crawl Complete! Processed: ${globalTenderCount}, PDFs Secured: ${totalPdfsSecured}, Missing PDFs: ${missingPdfsCount}`);
      await browser.close();

      return {
        totalProcessed: globalTenderCount,
        pdfsSecured: totalPdfsSecured,
        missingPdfs: missingPdfsCount
      };
    } catch (error) {
      logger.error(`Adapter Error: ${error.message}`);
      await browser.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Crawls tenders ordered by current issue date
   */
  async crawlLatestActiveTenders(page, context, maxTenders, onPageScraped, onBatchUpdate) {
    logger.info(`[Latest Crawl] Navigating to Latest Active Tenders feed: ${this.latestActiveUrl}`);
    await page.goto(this.latestActiveUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    let currentPage = 1;
    let hasMorePages = true;
    let currentCount = 0;
    let pdfCountTotal = 0;
    let missingCountTotal = 0;

    while (hasMorePages && currentCount < maxTenders) {
      logger.info(`[Latest Crawl] Extracting rows from Page ${currentPage}...`);
      
      try {
        await page.waitForSelector('table.list_table tbody tr', { visible: true, timeout: 8000 });
      } catch (e) {
        logger.warn('No tenders table found on Latest Active page. Concluding crawl.');
        break;
      }

      const listData = await page.evaluate((currPg) => {
        const extracted = [];
        const rows = document.querySelectorAll('table.list_table tbody tr');
        rows.forEach((row, index) => {
          if (index === 0) return;
          const tds = row.querySelectorAll('td');
          if (tds.length >= 5) {
            // Find link inside title or detail column
            const titleAnchor = row.querySelector("td a[href*='FrontEndTenderDetails']") || row.querySelector('td a');
            const fullText = row.innerText.trim();
            const bracketMatches = fullText.match(/\[(.*?)\]/g) || [];
            const tenderId = bracketMatches.length >= 1 ? bracketMatches[bracketMatches.length - 1].replace(/[\[\]]/g, '') : '';
            
            extracted.push({
              title: titleAnchor ? titleAnchor.innerText.trim() : (tds[1] ? tds[1].innerText.trim() : 'Active Tender'),
              detailsUrl: titleAnchor ? titleAnchor.href : null,
              sourceTenderId: tenderId || `JK-TENDER-LATEST-${currPg}-${index}`,
              publishedDate: tds[3] ? tds[3].innerText.trim() : '',
              closingDate: tds[4] ? tds[4].innerText.trim() : '',
              openingDate: tds[5] ? tds[5].innerText.trim() : '',
            });
          }
        });
        return extracted;
      }, currentPage);

      logger.info(`[Latest Crawl] Found ${listData.length} tenders on Page ${currentPage}.`);

      for (const item of listData) {
        if (currentCount >= maxTenders) break;
        if (!item.detailsUrl) continue;

        logger.info(`[${currentCount + 1}/${maxTenders}] Fetching Details & Documents: ${item.sourceTenderId}`);
        const { processedItem, pdfCount } = await this.scrapeTenderDetailAndPdf(context, item);

        if (pdfCount > 0) pdfCountTotal += pdfCount;
        else if (processedItem.pdfFetchStatus === 'PENDING') missingCountTotal++;

        currentCount++;

        if (onPageScraped) {
          await onPageScraped([processedItem]);
        }
      }

      // Pagination check
      const nextTargetPage = currentPage + 1;
      try {
        hasMorePages = await page.evaluate((targetPg) => {
          const links = Array.from(document.querySelectorAll('a'));
          let targetLink = links.find(l => l.textContent.trim() === String(targetPg));
          if (targetLink) { targetLink.click(); return true; }
          return false;
        }, nextTargetPage);
      } catch (navErr) {
        hasMorePages = false;
      }

      if (hasMorePages && currentCount < maxTenders) {
        currentPage++;
        await page.waitForTimeout(2500);
      } else {
        hasMorePages = false;
      }
    }

    onBatchUpdate(currentCount, pdfCountTotal, missingCountTotal);
  }

  /**
   * Crawls tenders by Department hierarchy
   */
  async crawlByDepartment(page, context, maxTenders, onPageScraped, onBatchUpdate) {
    logger.info(`[Department Crawl] Navigating to ${this.departmentRootUrl}`);
    await page.goto(this.departmentRootUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const departmentLinks = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.list_table tbody tr'));
      const links = [];
      rows.forEach((row, index) => {
        if (index === 0) return; 
        const aTag = row.querySelector('td a');
        if (aTag && aTag.href) links.push(aTag.href);
      });
      return links;
    });

    let currentCount = 0;
    let pdfCountTotal = 0;
    let missingCountTotal = 0;

    for (let i = 0; i < departmentLinks.length; i++) {
      if (currentCount >= maxTenders) break;
      const deptUrl = departmentLinks[i];
      await page.goto(deptUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);

      let currentPage = 1;
      let hasDeptPages = true;

      while (hasDeptPages && currentCount < maxTenders) {
        try {
          await page.waitForSelector('table.list_table tbody tr', { visible: true, timeout: 5000 });
        } catch (e) {
          break;
        }

        const listData = await page.evaluate((currPg) => {
          const extracted = [];
          const rows = document.querySelectorAll('table.list_table tbody tr');
          rows.forEach((row, index) => {
            if (index === 0) return;
            const tds = row.querySelectorAll('td');
            if (tds.length >= 6) {
              const titleAnchor = tds[4].querySelector('a');
              const bracketMatches = tds[4].innerText.trim().match(/\[(.*?)\]/g) || [];
              const tenderId = bracketMatches.length >= 2 ? bracketMatches[bracketMatches.length - 1].replace(/[\[\]]/g, '') : '';
              extracted.push({
                title: titleAnchor ? titleAnchor.innerText.trim() : tds[4].innerText.trim(),
                detailsUrl: titleAnchor ? titleAnchor.href : null,
                sourceTenderId: tenderId || `JK-TENDER-${currPg}-${index}`,
                publishedDate: tds[1].innerText.trim(),
                closingDate: tds[2].innerText.trim(),
                openingDate: tds[3].innerText.trim(),
              });
            }
          });
          return extracted;
        }, currentPage);

        for (const item of listData) {
          if (currentCount >= maxTenders) break;
          if (!item.detailsUrl) continue;

          const { processedItem, pdfCount } = await this.scrapeTenderDetailAndPdf(context, item);
          if (pdfCount > 0) pdfCountTotal += pdfCount;
          else if (processedItem.pdfFetchStatus === 'PENDING') missingCountTotal++;

          currentCount++;

          if (onPageScraped) {
            await onPageScraped([processedItem]);
          }
        }

        const nextPg = currentPage + 1;
        try {
          hasDeptPages = await page.evaluate((targetPg) => {
            const links = Array.from(document.querySelectorAll('a'));
            let targetLink = links.find(l => l.textContent.trim() === String(targetPg));
            if (targetLink) { targetLink.click(); return true; }
            return false;
          }, nextPg);
        } catch (err) {
          hasDeptPages = false;
        }

        if (hasDeptPages && currentCount < maxTenders) {
          currentPage++;
          await page.waitForTimeout(2500);
        } else {
          hasDeptPages = false;
        }
      }
    }

    onBatchUpdate(currentCount, pdfCountTotal, missingCountTotal);
  }

  /**
   * Scrapes full metadata table and downloads associated PDF documents with CapSolver automated solving
   */
  async scrapeTenderDetailAndPdf(context, item) {
    const itemPage = await context.newPage();
    let pdfCountSecured = 0;

    try {
      await itemPage.goto(item.detailsUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await itemPage.waitForTimeout(1000);

      const detailedData = await itemPage.evaluate(() => {
        const pageText = document.body.innerText;
        const isDocumentAvailable = !pageText.includes('Document download date is not begun yet');

        const getTableVal = (labelText) => {
          const tds = Array.from(document.querySelectorAll('td'));
          for (const td of tds) {
            if (td.querySelector('table')) continue; 
            const text = td.textContent.trim().replace(/\s+/g, ' ');
            if (text === labelText || text.startsWith(labelText)) {
              let next = td.nextElementSibling;
              if (next && next.tagName === 'TD') {
                return next.textContent.trim().replace(/\s+/g, ' ');
              }
            }
          }
          return "";
        };

        const parseNum = (str) => {
          const val = parseFloat(str.replace(/,/g, '').replace(/[^0-9.]/g, ''));
          return isNaN(val) ? 0 : val;
        };

        return {
          isDocumentAvailable,
          organisationChain: getTableVal('Organisation Chain'),
          tenderReferenceNumber: getTableVal('Tender Reference Number'),
          withdrawalAllowed: getTableVal('Withdrawal Allowed'),
          tenderType: getTableVal('Tender Type'),
          formOfContract: getTableVal('Form Of Contract'),
          tenderCategory: getTableVal('Tender Category'),
          noOfCovers: parseInt(getTableVal('No. of Covers')) || 2,
          generalTechnicalEvaluationAllowed: getTableVal('General Technical Evaluation Allowed'),
          itemWiseTechnicalEvaluationAllowed: getTableVal('ItemWise Technical Evaluation Allowed'),
          paymentMode: getTableVal('Payment Mode'),
          isMultiCurrencyAllowedForBOQ: getTableVal('Is Multi Currency Allowed For BOQ'),
          isMultiCurrencyAllowedForFee: getTableVal('Is Multi Currency Allowed For Fee'),
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

          workDescription: getTableVal('Work Description'),
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

          publishedDate: getTableVal('Published Date'),
          bidOpeningDate: getTableVal('Bid Opening Date'),
          documentDownloadStartDate: getTableVal('Document Download / Sale Start Date'),
          documentDownloadEndDate: getTableVal('Document Download / Sale End Date'),
          clarificationStartDate: getTableVal('Clarification Start Date'),
          clarificationEndDate: getTableVal('Clarification End Date'),
          bidSubmissionStartDate: getTableVal('Bid Submission Start Date'),
          bidSubmissionEndDate: getTableVal('Bid Submission End Date'),
          closingDate: getTableVal('Bid Submission End Date') || getTableVal('Document Download / Sale End Date'),

          invitingAuthorityName: getTableVal('Name'),
          invitingAuthorityAddress: getTableVal('Address'),
          offlineInstruments: [],
          coversInfo: []
        };
      });

      Object.assign(item, detailedData);
      item.pdfUrls = [];
      item.nitDocuments = [];
      item.workItemDocuments = [];

      // Download PDFs if documents are available
      if (item.isDocumentAvailable) {
        const pdfCount = await itemPage.locator("a:has-text('.pdf')").count();
        const processedFileNames = new Set();

        for (let j = 0; j < pdfCount; j++) {
          if (!itemPage.url().includes('FrontEndTenderDetails')) {
            await itemPage.goto(item.detailsUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await itemPage.waitForTimeout(1000);
          }

          const pdfLink = itemPage.locator("a:has-text('.pdf')").nth(j);
          const popupPromise = itemPage.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
          const directDownloadPromise = itemPage.waitForEvent('download', { timeout: 15000 }).catch(() => null);

          await pdfLink.click().catch(() => {});

          const raceResult = await Promise.race([
            popupPromise.then(p => p ? { type: 'popup', page: p } : null),
            directDownloadPromise.then(d => d ? { type: 'download', dl: d } : null),
            itemPage.waitForTimeout(15000).then(() => null)
          ]);

          let finalDownload = null;
          let popupPage = null;

          if (raceResult && raceResult.type === 'download') {
            finalDownload = raceResult.dl;
          } else if (raceResult && raceResult.type === 'popup') {
            popupPage = raceResult.page;
            await popupPage.waitForLoadState('domcontentloaded').catch(() => {});

            // Automated Captcha Recognition & Resolution
            finalDownload = await this.handlePopupCaptchaAndDownload(popupPage);
          }

          if (finalDownload) {
            try {
              const tempPath = await finalDownload.path().catch(() => null);
              if (tempPath) {
                const fileName = finalDownload.suggestedFilename();
                if (processedFileNames.has(fileName)) {
                  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                  if (popupPage && !popupPage.isClosed()) await popupPage.close().catch(() => {});
                  continue;
                }

                processedFileNames.add(fileName);
                let pathToUpload = tempPath;

                const stats = fs.statSync(tempPath);
                const fileSizeMB = stats.size / (1024 * 1024);

                if (fileSizeMB > 5) {
                  const compressedPath = `${tempPath}_compressed.pdf`;
                  const isCompressed = await compressPDF(tempPath, compressedPath);
                  if (isCompressed) pathToUpload = compressedPath;
                }

                const r2Url = await uploadPdfToR2(pathToUpload, fileName);
                if (r2Url) {
                  const finalSizeKb = Math.round(fs.statSync(pathToUpload).size / 1024);
                  item.pdfUrls.push(r2Url);
                  item.nitDocuments.push({
                    documentName: fileName,
                    description: "Tender Notice Document",
                    documentSizeKb: finalSizeKb, 
                    fileUrl: r2Url
                  });
                  pdfCountSecured++;
                }

                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                if (pathToUpload !== tempPath && fs.existsSync(pathToUpload)) fs.unlinkSync(pathToUpload);
              }
            } catch (err) {
              logger.error(`Error processing PDF download: ${err.message}`);
            }
          }

          if (popupPage && !popupPage.isClosed()) {
            await popupPage.close().catch(() => {});
          }
        }
      }

      // Assign PDF status
      if (item.pdfUrls.length > 0) {
        item.pdfFetchStatus = 'COMPLETED';
      } else if (!item.isDocumentAvailable) {
        item.pdfFetchStatus = 'NOT_AVAILABLE';
      } else {
        item.pdfFetchStatus = 'PENDING';
      }

      return { processedItem: item, pdfCount: pdfCountSecured };

    } catch (err) {
      logger.error(`Error fetching details for ${item.sourceTenderId}: ${err.message}`);
      item.pdfFetchStatus = 'FAILED';
      return { processedItem: item, pdfCount: 0 };
    } finally {
      await itemPage.close().catch(() => {});
    }
  }

  /**
   * Automated Captcha Resolver using CapSolver
   */
  async handlePopupCaptchaAndDownload(popupPage) {
    const popupDownloadPromise = popupPage.waitForEvent('download', { timeout: 60000 }).catch(() => null);

    // Check for presence of captcha image
    const captchaImgLocator = popupPage.locator("img[src*='captcha'], #captchaImage, img[id*='captcha']").first();
    const hasCaptcha = await captchaImgLocator.isVisible({ timeout: 4000 }).catch(() => false);

    if (hasCaptcha) {
      logger.info('🤖 Captcha detected in download popup. Engaging CapSolver...');
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const imgBuffer = await captchaImgLocator.screenshot();
          const { text: solvedText, provider } = await captchaService.solveImageCaptcha(imgBuffer);
          
          if (solvedText && solvedText.length >= 4) {
            logger.info(`[Auto-Captcha] Solved via ${provider} (Attempt ${attempt}): "${solvedText}". Submitting...`);
            
            const inputLocator = popupPage.locator("input[name*='captcha'], input[id*='captcha'], input[type='text']").first();
            await inputLocator.fill(solvedText);
            
            const submitLocator = popupPage.locator("input[type='submit'], button[type='submit'], input[value*='Submit']").first();
            await submitLocator.click().catch(() => {});

            // Brief wait to see if download starts or error appears
            await popupPage.waitForTimeout(2000);
            
            // If captcha image is still visible, the solve was incorrect
            const stillHasCaptcha = await captchaImgLocator.isVisible({ timeout: 1500 }).catch(() => false);
            if (!stillHasCaptcha) {
              logger.info('✅ Captcha successfully validated. Download in progress.');
              break;
            } else {
              logger.warn(`⚠️ Captcha solve attempt ${attempt} was rejected by portal. Retrying...`);
            }
          }
        }
      } catch (solveErr) {
        logger.error(`[Auto-Captcha] Error executing automated solve: ${solveErr.message}`);
      }
    }

    return await popupDownloadPromise;
  }

  /**
   * Backfill / Retry Missing PDFs for Tenders flagged with pdfFetchStatus === 'PENDING'
   */
  async retryMissingPdfs(tenderDocs = [], onProgress = null) {
    if (!tenderDocs || tenderDocs.length === 0) return { updatedCount: 0 };
    logger.info(`[Missing PDF Retry] Initiating retry cycle for ${tenderDocs.length} tender(s)...`);

    const browser = await chromium.launch({ 
      headless: process.env.SCRAPER_HEADLESS !== 'false', 
      args: ['--no-sandbox'] 
    });
    const context = await browser.newContext({ acceptDownloads: true });
    let updatedCount = 0;

    try {
      for (const tender of tenderDocs) {
        if (!tender.detailsUrl) continue;

        logger.info(`[PDF Retry] Attempting download for ${tender.sourceTenderId}...`);
        const itemMock = { ...tender.toObject(), pdfUrls: [], nitDocuments: [] };
        const { processedItem, pdfCount } = await this.scrapeTenderDetailAndPdf(context, itemMock);

        if (pdfCount > 0 && processedItem.pdfUrls.length > 0) {
          tender.pdfUrls = processedItem.pdfUrls;
          tender.nitDocuments = processedItem.nitDocuments;
          tender.pdfFetchStatus = 'COMPLETED';
          tender.pdfRetryCount = (tender.pdfRetryCount || 0) + 1;
          await tender.save();
          updatedCount++;
          logger.info(`✅ Successfully recovered ${pdfCount} PDF(s) for ${tender.sourceTenderId}`);
        } else {
          tender.pdfRetryCount = (tender.pdfRetryCount || 0) + 1;
          if (tender.pdfRetryCount >= 3) {
            tender.pdfFetchStatus = 'NOT_AVAILABLE';
          }
          await tender.save();
        }

        if (onProgress) onProgress(updatedCount, tenderDocs.length);
      }

      await browser.close();
      return { updatedCount };
    } catch (err) {
      logger.error(`[PDF Retry] Failed: ${err.message}`);
      await browser.close().catch(() => {});
      throw err;
    }
  }

  normalize(rawTenderData) {
    const parseDate = (dateStr) => {
      if (!dateStr) return new Date();
      const timestamp = Date.parse(dateStr.replace(/-/g, ' '));
      return !isNaN(timestamp) ? new Date(timestamp) : new Date();
    };

    return {
      title: rawTenderData.title || "Untitled Tender",
      sourcePortal: this.portalName,
      sourceTenderId: rawTenderData.sourceTenderId,
      detailsUrl: rawTenderData.detailsUrl,
      isDocumentAvailable: rawTenderData.isDocumentAvailable !== false,
      pdfFetchStatus: rawTenderData.pdfFetchStatus || (rawTenderData.pdfUrls?.length > 0 ? 'COMPLETED' : (rawTenderData.isDocumentAvailable ? 'PENDING' : 'NOT_AVAILABLE')),
      
      organisationChain: rawTenderData.organisationChain,
      tenderReferenceNumber: rawTenderData.tenderReferenceNumber,
      withdrawalAllowed: rawTenderData.withdrawalAllowed,
      tenderType: rawTenderData.tenderType,
      formOfContract: rawTenderData.formOfContract,
      tenderCategory: rawTenderData.tenderCategory,
      noOfCovers: rawTenderData.noOfCovers,
      generalTechnicalEvaluationAllowed: rawTenderData.generalTechnicalEvaluationAllowed,
      itemWiseTechnicalEvaluationAllowed: rawTenderData.itemWiseTechnicalEvaluationAllowed,
      paymentMode: rawTenderData.paymentMode,
      isMultiCurrencyAllowedForBOQ: rawTenderData.isMultiCurrencyAllowedForBOQ,
      isMultiCurrencyAllowedForFee: rawTenderData.isMultiCurrencyAllowedForFee,
      allowTwoStageBidding: rawTenderData.allowTwoStageBidding,

      offlineInstruments: rawTenderData.offlineInstruments || [],
      coversInfo: rawTenderData.coversInfo || [],

      tenderFee: rawTenderData.tenderFee || 0,
      feePayableTo: rawTenderData.feePayableTo,
      feePayableAt: rawTenderData.feePayableAt,
      tenderFeeExemptionAllowed: rawTenderData.tenderFeeExemptionAllowed,

      emdAmount: rawTenderData.emdAmount || 0,
      emdExemptionAllowed: rawTenderData.emdExemptionAllowed,
      emdFeeType: rawTenderData.emdFeeType,
      emdPercentage: rawTenderData.emdPercentage,
      emdPayableTo: rawTenderData.emdPayableTo,
      emdPayableAt: rawTenderData.emdPayableAt,

      workDescription: rawTenderData.workDescription,
      ndaPreQualification: rawTenderData.ndaPreQualification,
      independentExternalMonitorRemarks: rawTenderData.independentExternalMonitorRemarks,
      estimatedValue: rawTenderData.estimatedValue,
      productCategory: rawTenderData.productCategory,
      subCategory: rawTenderData.subCategory,
      contractType: rawTenderData.contractType,
      bidValidityDays: rawTenderData.bidValidityDays,
      periodOfWorkDays: rawTenderData.periodOfWorkDays,
      location: rawTenderData.location,
      pincode: rawTenderData.pincode,
      preBidMeetingPlace: rawTenderData.preBidMeetingPlace,
      preBidMeetingAddress: rawTenderData.preBidMeetingAddress,
      preBidMeetingDate: rawTenderData.preBidMeetingDate ? parseDate(rawTenderData.preBidMeetingDate) : null,
      bidOpeningPlace: rawTenderData.bidOpeningPlace,
      shouldAllowNDATender: rawTenderData.shouldAllowNDATender,
      allowPreferentialBidder: rawTenderData.allowPreferentialBidder,

      publishedDate: parseDate(rawTenderData.publishedDate),
      bidOpeningDate: parseDate(rawTenderData.bidOpeningDate),
      documentDownloadStartDate: parseDate(rawTenderData.documentDownloadStartDate),
      documentDownloadEndDate: parseDate(rawTenderData.documentDownloadEndDate),
      clarificationStartDate: rawTenderData.clarificationStartDate,
      clarificationEndDate: rawTenderData.clarificationEndDate,
      bidSubmissionStartDate: parseDate(rawTenderData.bidSubmissionStartDate),
      bidSubmissionEndDate: parseDate(rawTenderData.bidSubmissionEndDate),
      closingDate: parseDate(rawTenderData.closingDate),

      nitDocuments: rawTenderData.nitDocuments || [],
      workItemDocuments: rawTenderData.workItemDocuments || [],
      pdfUrls: rawTenderData.pdfUrls || [],

      invitingAuthorityName: rawTenderData.invitingAuthorityName,
      invitingAuthorityAddress: rawTenderData.invitingAuthorityAddress,
      status: 'ACTIVE'
    };
  }
}