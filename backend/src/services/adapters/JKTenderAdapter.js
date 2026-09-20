import { TenderSourceAdapter } from './TenderSourceAdapter.js';
import { chromium } from 'playwright';
import { uploadFileToR2, uploadPdfToR2, uploadJsonToR2, formatTenderStorageKey, extractDeptCode } from '../../utils/r2Storage.js';
import { captchaService } from '../captcha.service.js';
import SystemLog from '../../models/SystemLog.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
    this.baseUrl = 'https://jktenders.gov.in';
    this.latestActiveUrl = 'https://jktenders.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page';
    this.departmentRootUrl = 'https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page';
  }

  /**
   * Main entry point for crawling tenders
   */
  async fetchList(pageNumber = 1, filters = { syncMode: 'DEPARTMENT', limit: 100 }, onPageScraped = null) {
    const maxTenders = filters.limit || 100;
    const isHeadless = process.env.SCRAPER_HEADLESS !== 'false';
    const syncMode = filters.syncMode || 'DEPARTMENT';
    logger.info(`[Scraper] Launching Playwright (headless: ${isHeadless}) for mode: ${syncMode} (Target limit: ${maxTenders})...`);

    const browser = await chromium.launch({ 
      headless: isHeadless, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
    });
    const context = await browser.newContext({ 
      acceptDownloads: true,
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let globalTenderCount = 0;
    let totalPdfsSecured = 0;
    let missingPdfsCount = 0;

    try {
      if (syncMode === 'LATEST') {
        logger.info(`[Scraper] Running LATEST ACTIVE TENDERS crawl (Target limit: ${maxTenders})...`);
        await this.crawlLatestActiveTenders(page, context, maxTenders, onPageScraped, (count, pdfs, missing) => {
          globalTenderCount += count;
          totalPdfsSecured += pdfs;
          missingPdfsCount += missing;
        }, filters);
      } else {
        logger.info(`[Scraper] Running DEPARTMENT-WISE crawl for ALL active tenders (Target limit: ${maxTenders})...`);
        await this.crawlByDepartment(page, context, maxTenders, onPageScraped, (count, pdfs, missing) => {
          globalTenderCount += count;
          totalPdfsSecured += pdfs;
          missingPdfsCount += missing;
        }, filters);
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
   * Crawls tenders ordered by current issue date (Latest Published Tenders)
   */
  async crawlLatestActiveTenders(page, context, maxTenders, onPageScraped, onBatchUpdate, filters = {}) {
    logger.info(`[Latest Crawl] Navigating to Latest Active Tenders feed: ${this.latestActiveUrl}`);
    await page.goto(this.latestActiveUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Resolve search captcha if presented
    await this.handleSearchFormCaptcha(page, 'Latest Active Tenders');
    await page.waitForTimeout(1500);

    let currentPage = 1;
    let hasMorePages = true;
    let currentCount = 0;
    let pdfCountTotal = 0;
    let missingCountTotal = 0;
    let consecutiveExistingCount = 0;

    while (hasMorePages && currentCount < maxTenders) {
      logger.info(`[Latest Crawl] Extracting rows from Page ${currentPage}...`);
      
      try {
        await page.waitForSelector('table.list_table tbody tr', { visible: true, timeout: 12000 });
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

      for (let i = 0; i < listData.length && currentCount < maxTenders; i++) {
        const item = listData[i];
        if (!item.detailsUrl) continue;

        // Check if tender is already in DB and complete (incremental crawl check)
        if (filters.shouldSkipTender && item.sourceTenderId) {
          const shouldSkip = await filters.shouldSkipTender(item.sourceTenderId, item.publishedDate);
          if (shouldSkip) {
            logger.info(`⏩ [Skip Already Ingested] Tender ${item.sourceTenderId} is already saved and complete in DB.`);
            if (filters.countSkippedTowardsLimit !== false) {
              currentCount++;
            }
            consecutiveExistingCount++;
            if (filters.stopAfterConsecutiveSkips && consecutiveExistingCount >= filters.stopAfterConsecutiveSkips) {
              logger.info(`🛑 Reached ${filters.stopAfterConsecutiveSkips} consecutive already-ingested tenders. Latest crawl caught up!`);
              hasMorePages = false;
              break;
            }
            continue;
          } else {
            consecutiveExistingCount = 0;
          }
        }

        logger.info(`👉 [${currentCount + 1}/${maxTenders}] Opening Latest Tender: ${item.sourceTenderId}`);

        // Click tender link to open Tender Details in the same tab
        let tenderLink = page.locator("table.list_table tr").filter({ hasText: item.sourceTenderId }).locator("a[href*='FrontEndTenderDetails'], a").first();
        const exists = await tenderLink.count().catch(() => 0);
        if (exists === 0) {
          tenderLink = page.locator("table.list_table tr").nth(i + 1).locator("a[href*='FrontEndTenderDetails'], a").first();
        }

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
          tenderLink.click({ noWaitAfter: true, timeout: 20000 }).catch(() => tenderLink.click({ force: true, noWaitAfter: true }))
        ]);
        await this.humanDelay(page, 400, 650);

        // Scrape tender details & download documents directly in page
        const { processedItem, pdfCount } = await this.scrapeTenderDetailAndPdfInPage(page, item, item.organisationChain || 'Latest');
        if (pdfCount > 0) pdfCountTotal += pdfCount;
        else if (processedItem.pdfFetchStatus === 'PENDING') missingCountTotal++;

        currentCount++;

        if (onPageScraped) {
          await onPageScraped([processedItem]);
        }

        // Return to Latest Active Tenders list
        logger.info(`🔙 Returning from Tender Details to Latest Active List...`);
        await this.ensureOnLatestActiveTendersList(page, currentPage);
        await this.humanDelay(page, 400, 650);
      }

      if (!hasMorePages) break;

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
   * Ensures page returns to the Latest Active Tenders list
   */
  async ensureOnLatestActiveTendersList(page, currentPage = 1) {
    const isList = await page.locator('table.list_table').isVisible({ timeout: 4000 }).catch(() => false);
    if (isList) return true;

    // Check if on captcha page
    const isCaptcha = await page.locator("img[name='captchaImage'], #captchaImage").isVisible({ timeout: 2000 }).catch(() => false);
    if (isCaptcha) {
      const captchaBack = page.locator("a.customButton_link:has-text('Back'), a:has-text('Back'), input[value='Back']").first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        captchaBack.click({ noWaitAfter: true }).catch(() => {})
      ]);
      await this.humanDelay(page, 400, 600);
    }

    // If on Details page, click Back
    const backBtn = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back'), input[value='Back']").last();
    const hasBack = await backBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasBack) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        backBtn.click({ noWaitAfter: true }).catch(() => {})
      ]);
      await this.humanDelay(page, 400, 600);
    }

    // If still not on list, navigate cleanly to latestActiveUrl
    const onListNow = await page.locator('table.list_table').isVisible({ timeout: 3000 }).catch(() => false);
    if (!onListNow) {
      await page.goto(this.latestActiveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.handleSearchFormCaptcha(page, 'Latest Active Tenders');
      if (currentPage > 1) {
        await page.evaluate((targetPg) => {
          const links = Array.from(document.querySelectorAll('a'));
          let targetLink = links.find(l => l.textContent.trim() === String(targetPg));
          if (targetLink) targetLink.click();
        }, currentPage);
        await page.waitForTimeout(2000);
      }
    }
    return true;
  }

  /**
   * Randomized human-like delay to prevent robotic timing signatures
   */
  async humanDelay(page, minMs = 300, maxMs = 600) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
  }

  /**
   * Crawls tenders by Department hierarchy
   */
  async crawlByDepartment(page, context, maxTenders, onPageScraped, onBatchUpdate, filters = {}) {
    logger.info(`[Homepage] Navigating to JK Tenders homepage: https://jktenders.gov.in/nicgep/app`);
    await page.goto('https://jktenders.gov.in/nicgep/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.humanDelay(page, 600, 900);

    logger.info(`[Homepage] Clicking "Tenders by Organisation" link...`);
    const orgLinkLocator = page.locator("a:has-text('Tenders by Organisation'), a[title*='Tenders by Organisation'], a#PageLink_0").first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
      orgLinkLocator.click().catch(async () => {
        await page.goto(this.departmentRootUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      })
    ]);
    await this.humanDelay(page, 600, 900);

    let currentCount = 0;
    let pdfCountTotal = 0;
    let missingCountTotal = 0;

    // Loop through organisations on the Tenders by Organisation page
    while (currentCount < maxTenders) {
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

      if (!orgRows || orgRows.length === 0) {
        logger.warn('No organisations found on Tenders by Organisation table.');
        break;
      }

      logger.info(`🏛️ Found ${orgRows.length} organisation(s) with active tenders.`);

      for (let o = 0; o < orgRows.length && currentCount < maxTenders; o++) {
        const org = orgRows[o];

        // Resume support: skip organisations before resumeFrom.orgIndex
        if (filters.resumeFrom && typeof filters.resumeFrom.orgIndex === 'number') {
          if (o < filters.resumeFrom.orgIndex) {
            logger.info(`⏩ [Resume Checkpoint] Skipping already completed Organisation ${o + 1}/${orgRows.length}: "${org.orgName}"`);
            continue;
          }
        }

        logger.info(`\n======================================================`);
        logger.info(`🏛️ [Organisation ${o + 1}/${orgRows.length}] Entering: "${org.orgName}" (${org.count} tenders)`);
        logger.info(`======================================================`);

        // Click the tender count link for this organisation in table#table tr[id^='informal']
        const orgRowLocator = page.locator("table#table tr[id^='informal']").nth(org.index);
        const countLinkLocator = orgRowLocator.locator("td:nth-child(3) a, a.link2").first();

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
          countLinkLocator.click({ noWaitAfter: true, timeout: 20000 }).catch(() => countLinkLocator.click({ force: true, noWaitAfter: true }))
        ]);
        await this.humanDelay(page, 600, 900);

        // Now on Organisation's Tender List
        let orgHasMore = true;
        let orgPageNum = 1;
        let orgConsecutiveExisting = 0;

        // If resuming on this specific organisation and orgPageNum > 1, fast forward to that page
        if (filters.resumeFrom && filters.resumeFrom.orgIndex === o && filters.resumeFrom.orgPageNum > 1) {
          const targetPg = filters.resumeFrom.orgPageNum;
          logger.info(`⏩ [Resume Checkpoint] Fast-forwarding to Page ${targetPg} for "${org.orgName}"...`);
          try {
            const jumped = await page.evaluate((pg) => {
              const links = Array.from(document.querySelectorAll('a'));
              const targetLink = links.find(l => l.textContent.trim() === String(pg));
              if (targetLink) { targetLink.click(); return true; }
              return false;
            }, targetPg);
            if (jumped) {
              orgPageNum = targetPg;
              await this.humanDelay(page, 1000, 1500);
            }
          } catch (jumpErr) {
            logger.warn(`Fast-forward page navigation failed: ${jumpErr.message}`);
          }
        }

        while (orgHasMore && currentCount < maxTenders) {
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
                hasLink: !!a
              };
            }).filter(t => t && t.hasLink);
          });

          logger.info(`📋 [Tender List] "${org.orgName}" Page ${orgPageNum}: ${tenderRows.length} tenders displayed.`);

          for (let t = 0; t < tenderRows.length && currentCount < maxTenders; t++) {
            const tenderSummary = tenderRows[t];

            // Check if tender is already in DB and complete (skips re-opening and re-downloading)
            if (filters.shouldSkipTender && tenderSummary.sourceTenderId) {
              const shouldSkip = await filters.shouldSkipTender(tenderSummary.sourceTenderId, tenderSummary.publishedDate);
              if (shouldSkip) {
                logger.info(`⏩ [Skip Already Ingested] Tender ${tenderSummary.sourceTenderId} (${tenderSummary.publishedDate || 'N/A'}) is already in DB.`);
                if (filters.countSkippedTowardsLimit !== false) {
                  currentCount++;
                }
                orgConsecutiveExisting++;
                if (filters.stopAfterConsecutiveSkips && orgConsecutiveExisting >= filters.stopAfterConsecutiveSkips) {
                  logger.info(`🛑 Found ${filters.stopAfterConsecutiveSkips} consecutive tenders already scraped for "${org.orgName}". Tenders are latest! Moving to next organisation.`);
                  orgHasMore = false;
                  break;
                }
                continue;
              } else {
                orgConsecutiveExisting = 0;
              }
            }

            logger.info(`👉 [${currentCount + 1}/${maxTenders}] Opening Tender: ${tenderSummary.sourceTenderId || tenderSummary.title.substring(0, 40)}`);

            // Click tender title link (in td 5) to open Tender Details in the SAME tab
            let tenderLink = page.locator("table.list_table tr, tr[id^='informal']").filter({ hasText: tenderSummary.sourceTenderId }).locator("td:nth-child(5) a, a").first();
            const exists = await tenderLink.count().catch(() => 0);
            if (exists === 0) {
              tenderLink = page.locator("table.list_table tr:has(td:nth-child(5) a)").nth(t).locator("td:nth-child(5) a").first();
            }
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
              tenderLink.click({ noWaitAfter: true, timeout: 20000 }).catch(() => tenderLink.click({ force: true, noWaitAfter: true }))
            ]);
            await this.humanDelay(page, 400, 650);

            // Scrape tender details & download documents directly in page
            const { processedItem, pdfCount } = await this.scrapeTenderDetailAndPdfInPage(page, tenderSummary, org.orgName);
            if (pdfCount > 0) pdfCountTotal += pdfCount;
            else if (processedItem.pdfFetchStatus === 'PENDING') missingCountTotal++;

            currentCount++;

            if (onPageScraped) {
              await onPageScraped([processedItem]);
            }

            if (filters.onCheckpoint) {
              await filters.onCheckpoint({
                orgIndex: o,
                orgName: org.orgName,
                orgPageNum,
                lastTenderId: tenderSummary.sourceTenderId,
                totalProcessed: currentCount,
                status: 'IN_PROGRESS'
              });
            }

            // Safely return to the Organisation's Tender List
            logger.info(`🔙 Returning from Tender Details to Tender List...`);
            await this.ensureOnOrganisationTenderList(page, org.orgName, orgPageNum);
            await this.humanDelay(page, 400, 650);
          }

          // Pagination inside this organisation
          const nextPg = orgPageNum + 1;
          const hasNextPage = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a'));
            const targetLink = links.find(l => l.textContent.trim() === String(target));
            if (targetLink) { targetLink.click(); return true; }
            return false;
          }, nextPg);

          if (hasNextPage && currentCount < maxTenders) {
            orgPageNum++;
            await this.humanDelay(page, 700, 1100);
          } else {
            orgHasMore = false;
          }
        }

        // Return to Organisation List by clicking top right Back button
        if (currentCount < maxTenders) {
          logger.info(`🔙 [Organisation Complete] Returning to Organisation List...`);
          const topBackBtn = page.locator("a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back')").first();
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
              topBackBtn.click({ noWaitAfter: true, timeout: 20000 })
            ]);
          } catch (topBackErr) {
            logger.warn(`Top back button initial click failed: ${topBackErr.message}, retrying...`);
            await topBackBtn.click({ force: true, noWaitAfter: true }).catch(() => {});
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          }
          await page.waitForSelector("table#table tr[id^='informal']", { timeout: 20000 }).catch(() => {});
          await this.humanDelay(page, 600, 900);

          if (filters.onCheckpoint) {
            await filters.onCheckpoint({
              orgIndex: o + 1,
              orgName: orgRows[o + 1]?.orgName || '',
              orgPageNum: 1,
              lastTenderId: null,
              totalProcessed: currentCount,
              status: 'IN_PROGRESS'
            });
          }
        }
      }

      if (filters.onCheckpoint) {
        await filters.onCheckpoint({
          status: 'COMPLETED',
          totalProcessed: currentCount
        });
      }

      break; // Crawl cycle finished
    }

    onBatchUpdate(currentCount, pdfCountTotal, missingCountTotal);
  }

  /**
   * Scrapes detailed tender fields and downloads documents in the SAME page tab
   */
  async scrapeTenderDetailAndPdfInPage(page, summary, orgName) {
    const item = { ...summary };
    let pdfCountSecured = 0;

    try {
      const detailedData = await page.evaluate(() => {
        const pageText = document.body.innerText;
        const isDocumentAvailable = !pageText.includes('Document download date is not begun yet');

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
                return next.textContent.trim().replace(/\s+/g, ' ');
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

        // Extract Payment Instruments (Offline Instruments table)
        const offlineInstruments = [];
        const allTables = Array.from(document.querySelectorAll('table'));
        for (const tbl of allTables) {
          // Strictly skip outer container/wrapper tables
          if (tbl.querySelectorAll('table').length > 0) continue;

          const trs = Array.from(tbl.querySelectorAll('tr'));
          const hasHeader = trs.some(tr => {
            const txt = tr.textContent;
            return txt.includes('Instrument Type') && (txt.includes('S.No') || txt.includes('S.No.'));
          });

          if (hasHeader) {
            for (const tr of trs) {
              // Skip header rows or navigation bars
              if (tr.querySelector('th') || tr.textContent.includes('Instrument Type') || tr.textContent.includes('Active Tenders')) continue;
              const tds = Array.from(tr.querySelectorAll('td'));
              if (tds.length >= 2) {
                let sNo = null;
                let instType = '';

                if (tds.length === 2) {
                  sNo = parseInt(tds[0].textContent.trim(), 10);
                  instType = tds[1].textContent.trim().replace(/\s+/g, ' ');
                } else if (tds.length >= 3) {
                  const p0 = parseInt(tds[0].textContent.trim(), 10);
                  const p1 = parseInt(tds[1].textContent.trim(), 10);
                  if (!isNaN(p0)) {
                    sNo = p0;
                    instType = tds[1].textContent.trim().replace(/\s+/g, ' ');
                  } else if (!isNaN(p1)) {
                    sNo = p1;
                    instType = tds[2].textContent.trim().replace(/\s+/g, ' ');
                  }
                }

                if (sNo !== null && !isNaN(sNo) && instType && instType.length >= 3) {
                  // Guard against any leaked navbar or date strings
                  if (!/\d{1,2}-[a-z]{3}-\d{4}/i.test(instType) && !instType.includes('Search') && !instType.includes('Results') && !instType.toLowerCase().includes('other document')) {
                    offlineInstruments.push({ sNo, instrumentType: instType });
                  }
                }
              }
            }
            if (offlineInstruments.length > 0) break;
          }
        }

        // Extract Covers Information table (with full Description, Document Type, and rowspan support)
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
              if (tr.querySelector('th') || tr.textContent.includes('Cover No') || tr.textContent.includes('Document Type') || tr.textContent.includes('Active Tenders')) continue;
              const tds = Array.from(tr.querySelectorAll('td'));
              if (tds.length === 0) continue;

              if (tds.length >= 4) {
                const parsedNo = parseInt(tds[0].textContent.trim(), 10);
                if (!isNaN(parsedNo)) currentCoverNo = parsedNo;
                const parsedType = tds[1].textContent.trim().replace(/\s+/g, ' ');
                if (parsedType) currentCoverType = parsedType;
                const desc = tds[2].textContent.trim().replace(/\s+/g, ' ');
                const docType = tds[3].textContent.trim().replace(/\s+/g, ' ');

                if (desc || docType) {
                  coversInfo.push({
                    coverNo: currentCoverNo,
                    coverType: currentCoverType,
                    description: desc,
                    documentType: docType
                  });
                }
              } else if (tds.length === 2) {
                // Continuation row under same cover due to rowspan (Description, Document Type)
                const desc = tds[0].textContent.trim().replace(/\s+/g, ' ');
                const docType = tds[1].textContent.trim().replace(/\s+/g, ' ');

                if (desc || docType) {
                  coversInfo.push({
                    coverNo: currentCoverNo,
                    coverType: currentCoverType,
                    description: desc,
                    documentType: docType
                  });
                }
              } else if (tds.length === 3) {
                const parsedNo = parseInt(tds[0].textContent.trim(), 10);
                let desc = '';
                let docType = '';
                if (!isNaN(parsedNo)) {
                  currentCoverNo = parsedNo;
                  desc = tds[1].textContent.trim().replace(/\s+/g, ' ');
                  docType = tds[2].textContent.trim().replace(/\s+/g, ' ');
                } else {
                  const parsedType = tds[0].textContent.trim().replace(/\s+/g, ' ');
                  if (parsedType) currentCoverType = parsedType;
                  desc = tds[1].textContent.trim().replace(/\s+/g, ' ');
                  docType = tds[2].textContent.trim().replace(/\s+/g, ' ');
                }

                if (desc || docType) {
                  coversInfo.push({
                    coverNo: currentCoverNo,
                    coverType: currentCoverType,
                    description: desc,
                    documentType: docType
                  });
                }
              }
            }
            if (coversInfo.length > 0) break;
          }
        }

        // Extract Tender Inviting Authority (specifically from authority table if present)
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

        return {
          isDocumentAvailable,
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
          tendererClass: getTableVal('Tenderer Class'),

          publishedDate: getTableVal('Published Date'),
          bidOpeningDate: getTableVal('Bid Opening Date'),
          documentDownloadStartDate: getTableVal('Document Download / Sale Start Date'),
          documentDownloadEndDate: getTableVal('Document Download / Sale End Date'),
          clarificationStartDate: getTableVal('Clarification Start Date'),
          clarificationEndDate: getTableVal('Clarification End Date'),
          bidSubmissionStartDate: getTableVal('Bid Submission Start Date'),
          bidSubmissionEndDate: getTableVal('Bid Submission End Date'),
          closingDate: getTableVal('Bid Submission End Date') || getTableVal('Document Download / Sale End Date'),

          invitingAuthorityName,
          invitingAuthorityAddress,
          offlineInstruments,
          coversInfo
        };
      });

      Object.assign(item, detailedData);
      item.pdfUrls = [];
      item.nitDocuments = [];
      item.workItemDocuments = [];

      // 1. Scroll down to "Tenders Documents" section
      logger.info(`📜 Scrolling down to "Tenders Documents" for: ${item.sourceTenderId}`);
      await page.evaluate(() => {
        const docHeader = Array.from(document.querySelectorAll('td, th, span, div, b')).find(el => el.textContent.trim().includes('Tenders Documents'));
        if (docHeader) {
          docHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          window.scrollTo({ top: document.body.scrollHeight * 0.75, behavior: 'smooth' });
        }
      });
      await this.humanDelay(page, 300, 500);

      // Check available documents
      const docLinkSelector = "a#docDownoad, a[href*='docDownoad'], a:has-text('Tendernotice'), a:not(.Menu):not(.footerlink):not(.left_nav):has-text('.pdf')";
      const pdfLocator = page.locator(docLinkSelector);
      const pdfCount = await pdfLocator.count().catch(() => 0);

      const zipLocator = page.locator("a#DirectLink_8, a:has-text('Download as zip file'), a[href*='DirectLink']:has(img[src*='zip']), a:has(img[src*='zip'])").first();
      const hasZip = await zipLocator.count().catch(() => 0);

      const processedFileNames = new Set();
      let pdfCountSecured = 0;

      // If no documents are published yet (common in newly published tenders)
      if (pdfCount === 0 && hasZip === 0) {
        logger.info(`ℹ️ [No Documents Yet] Tender ${item.sourceTenderId} has no downloadable documents yet (marked as PENDING for future sync).`);
        item.isDocumentAvailable = false;
        item.pdfFetchStatus = 'PENDING';
        item.boqFetchStatus = 'PENDING';
      } else {
        // 2. Download NIT Documents (.pdf)
        logger.info(`📄 Found ${pdfCount} NIT document link(s) for tender: ${item.sourceTenderId}`);

        let captchaPassed = true;

        for (let j = 0; j < pdfCount; j++) {
          const currentLocator = page.locator(docLinkSelector);
          const pdfLink = currentLocator.nth(j);
          await pdfLink.scrollIntoViewIfNeeded().catch(() => {});
          await this.humanDelay(page, 200, 350);

          let docDesc = "Tender Notice Document";
          try {
            const rowText = await pdfLink.locator('xpath=ancestor::tr').locator('td').allInnerTexts();
            if (rowText && rowText.length >= 3 && rowText[2].trim()) {
              docDesc = rowText[2].trim();
            }
          } catch (e) {}

          let download = null;
          logger.info(`👉 Clicking NIT PDF link ${j + 1}/${pdfCount}...`);
          const downloadPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
          await pdfLink.click().catch(() => {});

          const outcome = await Promise.race([
            downloadPromise.then(d => d ? { type: 'download', dl: d } : null),
            page.waitForSelector("img[name='captchaImage'], #captchaImage, input[name='captchaText']", { timeout: 20000 })
              .then(() => ({ type: 'captcha' }))
              .catch(() => null)
          ]);

          if (outcome && outcome.type === 'download') {
            download = outcome.dl;
          } else if (outcome && outcome.type === 'captcha') {
            logger.info(`🔑 [Captcha Detected] Document verification required for tender: ${item.sourceTenderId}`);
            const verified = await this.resolveDocumentDownloadCaptcha(page, item.sourceTenderId);
            if (!verified) {
              logger.warn(`Captcha not solved for ${item.sourceTenderId}. Marking documents as PENDING for future sync.`);
              captchaPassed = false;
              break;
            }
            // After captcha verification, portal navigates back to Tender Details!
            await page.evaluate(() => {
              const docHeader = Array.from(document.querySelectorAll('td, th, span, div, b')).find(el => el.textContent.trim().includes('Tenders Documents'));
              if (docHeader) docHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
              else window.scrollTo({ top: document.body.scrollHeight * 0.75, behavior: 'smooth' });
            });
            await this.humanDelay(page, 300, 500);

            const refreshedLocator = page.locator(docLinkSelector);
            const refreshedLink = refreshedLocator.nth(j);
            await refreshedLink.scrollIntoViewIfNeeded().catch(() => {});
            await this.humanDelay(page, 200, 350);

            logger.info(`👉 Clicking NIT PDF link again after verification...`);
            const retryDlPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
            await refreshedLink.click().catch(() => {});
            download = await retryDlPromise;
          }

          if (download) {
            const uploaded = await this.processDownloadedPdf(download, item, processedFileNames, docDesc);
            if (uploaded) pdfCountSecured++;
          }
        }

        // 3. Download BOQ ZIP (only if captcha was not unsolved)
        try {
          if (captchaPassed && hasZip > 0) {
            logger.info(`📦 Scrolling to and clicking "Download as zip file" for: ${item.sourceTenderId}`);
            await zipLocator.scrollIntoViewIfNeeded().catch(() => {});
            await this.humanDelay(page, 200, 350);

            const zipDlPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
            await zipLocator.click().catch(() => {});

            const zipOutcome = await Promise.race([
              zipDlPromise.then(d => d ? { type: 'download', dl: d } : null),
              page.waitForSelector("img[name='captchaImage'], #captchaImage, input[name='captchaText']", { timeout: 20000 })
                .then(() => ({ type: 'captcha' }))
                .catch(() => null)
            ]);

            let zipDownload = null;
            if (zipOutcome && zipOutcome.type === 'download') {
              zipDownload = zipOutcome.dl;
            } else if (zipOutcome && zipOutcome.type === 'captcha') {
              logger.info(`🔑 [Captcha Detected] Document verification required for BOQ zip: ${item.sourceTenderId}`);
              const verified = await this.resolveDocumentDownloadCaptcha(page, item.sourceTenderId);
              if (verified) {
                const refreshedZip = page.locator("a#DirectLink_8, a:has-text('Download as zip file'), a[href*='DirectLink']:has(img[src*='zip']), a:has(img[src*='zip'])").first();
                await refreshedZip.scrollIntoViewIfNeeded().catch(() => {});
                const retryZipPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
                await refreshedZip.click().catch(() => {});
                zipDownload = await retryZipPromise;
              }
            }

            if (zipDownload) {
              await this.processDownloadedZip(zipDownload, item);
            }
          }
        } catch (boqErr) {
          logger.error(`[BOQ Error] Failed to process BOQ zip for ${item.sourceTenderId}: ${boqErr.message}`);
          item.boqFetchStatus = 'FAILED';
        }

        item.isDocumentAvailable = (item.pdfUrls.length > 0 || item.workItemDocuments.length > 0);
        if (item.pdfUrls.length > 0 || item.workItemDocuments.length > 0) {
          item.pdfFetchStatus = 'COMPLETED';
        } else {
          item.pdfFetchStatus = 'PENDING';
        }
      }

      // Metadata keys
      const deptCode = extractDeptCode(item.sourceTenderId, item.organisationChain || orgName);
      item.departmentCode = deptCode;
      item.departmentName = item.organisationChain ? item.organisationChain.split('||')[0].trim() : (orgName || 'General');
      item.r2StorageKey = formatTenderStorageKey(item.sourceTenderId, item.publishedDate, deptCode);

      return { processedItem: item, pdfCount: pdfCountSecured };

    } catch (err) {
      logger.error(`Error scraping tender ${item.sourceTenderId}: ${err.message}`);
      item.pdfFetchStatus = 'PENDING';
      return { processedItem: item, pdfCount: 0 };
    }
  }

  /**
   * Resolves Document Download Captcha and waits for redirect back to Tender Details
   */
  async resolveDocumentDownloadCaptcha(page, tenderId) {
    const now = Date.now();
    let timeSinceLastCaptcha = null;
    if (this.lastCaptchaTime) {
      const elapsedSec = Math.round((now - this.lastCaptchaTime) / 1000);
      const elapsedMin = (elapsedSec / 60).toFixed(1);
      timeSinceLastCaptcha = `${elapsedSec}s (~${elapsedMin} min)`;
      logger.info(`⏱️ [CAPTCHA INTERVAL] ${elapsedSec}s (~${elapsedMin} minutes) since last captcha prompt.`);
    }
    this.lastCaptchaTime = now;
    this.captchaCount = (this.captchaCount || 0) + 1;

    const captchaImg = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
    const inputLocator = page.locator("input[name='captchaText'], #captchaText, input[name*='captcha']").first();
    const submitBtn = page.locator("input[type='submit'], button[type='submit'], input[value*='Submit'], #Submit").first();

    const maxAttempts = 10;

    // Auto-solve if cloud solver (TrueCaptcha or CapSolver) is configured
    if (captchaService.isAutoSolveEnabled()) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const captchaImg = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
          const isImgVisible = await captchaImg.isVisible({ timeout: 3000 }).catch(() => false);
          
          // If captcha image is no longer visible, we may have already navigated back!
          if (!isImgVisible) {
            const hasTenderDetails = await page.locator("a[href*='download'], a.customButton_link, table.list_table").isVisible({ timeout: 2000 }).catch(() => false);
            if (hasTenderDetails) {
              logger.info('✅ Captcha already solved/not required!');
              return true;
            }
          }

          logger.info(`🔄 [Auto-Captcha] Attempt ${attempt}/${maxAttempts} for tender: ${tenderId}...`);
          
          // Allow full render time to capture high-clarity captcha image
          await page.waitForTimeout(1800);
          const imgBuffer = await captchaImg.screenshot().catch(() => null);
          if (!imgBuffer) {
            logger.warn(`[Auto-Captcha] Could not screenshot captcha image on attempt ${attempt}`);
            continue;
          }

          const { text: solvedText, provider } = await captchaService.solveImageCaptcha(imgBuffer);
          if (!solvedText || solvedText.length < 4) {
            logger.warn(`[Auto-Captcha] Solver returned invalid text ("${solvedText}") on attempt ${attempt}`);
            continue;
          }

          logger.info(`[Auto-Captcha] Attempt ${attempt}: Solved via ${provider} as "${solvedText}". Entering and waiting 2s before submit...`);

          const inputLocator = page.locator("input[name='captchaText'], #captchaText, input[name*='captcha']").first();
          await inputLocator.click().catch(() => {});
          await inputLocator.fill('');
          await inputLocator.fill(solvedText);
          await inputLocator.dispatchEvent('input').catch(() => {});
          await inputLocator.dispatchEvent('change').catch(() => {});
          
          // Wait 2 full seconds after entering before submitting
          await page.waitForTimeout(2000);

          // Click submit button firmly
          const submitBtn = page.locator("#Submit, input[type='submit'][value*='Submit'], input[name='Submit'], button[type='submit']").first();
          
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            submitBtn.click({ force: true, timeout: 5000 }).catch(async () => {
              // Fallback: press Enter on the input
              await inputLocator.press('Enter').catch(() => {});
            })
          ]);

          await page.waitForTimeout(1500);

          // Check if captcha was accepted
          const stillCaptcha = await page.locator("img[name='captchaImage'], #captchaImage").isVisible({ timeout: 3000 }).catch(() => false);
          const hasTenderDetails = await page.locator("a[href*='download'], a.customButton_link, table.list_table").isVisible({ timeout: 2000 }).catch(() => false);

          if (!stillCaptcha || hasTenderDetails) {
            logger.info(`✅ [Auto-Captcha] Solved and accepted by portal on attempt ${attempt}!`);
            return true;
          }

          // Check for error text on page
          const errorMsg = await page.locator('.error, .errorMessage, font[color="red"]').allInnerTexts().catch(() => []);
          const errorStr = errorMsg.filter(Boolean).join('; ');
          logger.warn(`⚠️ [Auto-Captcha] Attempt ${attempt}/${maxAttempts} rejected by portal${errorStr ? ': ' + errorStr : ''}. Retrying...`);

          // If there is a refresh button, refresh the captcha image for next attempt
          const refreshBtn = page.locator("#captcha, button:has-text('Refresh'), a:has-text('Refresh')").first();
          if (await refreshBtn.isVisible().catch(() => false)) {
            await refreshBtn.click().catch(() => {});
            await page.waitForTimeout(1000);
          }

        } catch (err) {
          logger.warn(`[Auto-Captcha] Error on attempt ${attempt}: ${err.message}`);
          await page.waitForTimeout(1000);
        }
      }

      logger.warn(`❌ [Auto-Captcha] All ${maxAttempts} automatic attempts failed for tender: ${tenderId}.`);
    }

    // Manual solving prompt in open browser
    console.log('\n======================================================');
    console.log(`🔑 [MANUAL CAPTCHA #${this.captchaCount}] Required for Tender: ${tenderId}`);
    if (timeSinceLastCaptcha) {
      console.log(`⏱️ Elapsed time since previous captcha: ${timeSinceLastCaptcha}`);
    } else {
      console.log(`⏱️ This is the first captcha prompt of the session.`);
    }
    console.log(`👉 Please view the browser window, type the captcha, and click Submit (Timeout: 3 minutes).`);
    console.log('======================================================\n');

    await inputLocator.focus().catch(() => {});

    // Wait until the page leaves the Document Download / Captcha view (returns to Tender Details)
    try {
      await page.waitForFunction(() => {
        const hasTenderDetails = document.querySelector("a[href*='download'], a.customButton_link, table.list_table");
        const hasCaptchaImg = document.querySelector("img[name='captchaImage'], #captchaImage");
        return !hasCaptchaImg && !!hasTenderDetails;
      }, undefined, { timeout: 180000 });
      logger.info('✅ Captcha successfully submitted! Returned to Tender Details.');
      await page.waitForTimeout(1000);
      return true;
    } catch (e) {
      logger.warn(`Wait for captcha submission timed out: ${e.message}`);
      const onCaptchaPage = await page.locator("img[name='captchaImage'], #captchaImage").isVisible().catch(() => false);
      if (onCaptchaPage) {
        logger.info(`🔙 Still on captcha page after timeout, clicking Back to return to details...`);
        const captchaBackBtn = page.locator("a.customButton_link:has-text('Back'), a:has-text('Back'), input[value='Back']").first();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          captchaBackBtn.click({ noWaitAfter: true }).catch(() => {})
        ]);
        await this.humanDelay(page, 500, 800);
      }
      return false;
    }
  }

  /**
   * Ensures the page is currently on the Organisation's Tender List table.
   * If on a Captcha page, Tender Details page, or Organisation List page, navigates appropriately.
   */
  async ensureOnOrganisationTenderList(page, orgName, orgPageNum = 1) {
    const checkPageState = async () => {
      return await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const hasCaptcha = !!document.querySelector("img[name='captchaImage'], #captchaImage");
        if (hasCaptcha) return 'CAPTCHA';
        if (text.includes('Organisation Chain') && text.includes('Title and Ref.No./Tender ID')) return 'TENDER_LIST';
        if (text.includes('Tender Reference Number') || text.includes('Work Item Details')) return 'TENDER_DETAILS';
        if (text.includes('Organisation Name') && text.includes('Tender Count')) return 'ORG_LIST';
        return 'UNKNOWN';
      }).catch(() => 'UNKNOWN');
    };

    let state = await checkPageState();
    if (state === 'TENDER_LIST') return true;

    // If on Captcha page, click Back
    if (state === 'CAPTCHA') {
      logger.info('🔙 On captcha page, clicking Back to return to Tender Details...');
      const captchaBack = page.locator("a.customButton_link:has-text('Back'), a:has-text('Back'), input[value='Back']").first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        captchaBack.click({ noWaitAfter: true }).catch(() => {})
      ]);
      await this.humanDelay(page, 400, 600);
      state = await checkPageState();
    }

    // If on Tender Details, click Back to return to Tender List
    if (state === 'TENDER_DETAILS' || state === 'UNKNOWN') {
      logger.info('🔙 On Tender Details page, clicking Back to return to Tender List...');
      const detailsBack = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back'), input[value='Back']").last();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        detailsBack.click({ noWaitAfter: true }).catch(() => {})
      ]);

      // Wait until we reach TENDER_LIST
      await page.waitForFunction(() => {
        const text = document.body ? document.body.innerText : '';
        return text.includes('Organisation Chain') && text.includes('Title and Ref.No./Tender ID');
      }, undefined, { timeout: 25000 }).catch(() => {});

      await this.humanDelay(page, 400, 600);
      state = await checkPageState();
      if (state === 'TENDER_LIST') return true;
    }

    // If on Organisation List, re-enter the organisation
    if (state === 'ORG_LIST') {
      logger.warn(`🔙 On Organisation List, re-entering "${orgName}"...`);
      const orgLink = page.locator(`a:has-text("${orgName}")`).first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
        orgLink.click({ noWaitAfter: true })
      ]);
      await this.humanDelay(page, 500, 800);
    } else if (state !== 'TENDER_LIST') {
      // If state is still unknown, navigate cleanly from homepage
      logger.warn(`⚠️ Navigation state unclear. Re-navigating to "${orgName}" from homepage...`);
      await page.goto(`${this.baseUrl}/nicgep/app`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.humanDelay(page, 500, 800);
      const orgMenuLink = page.locator("a:has-text('Tenders by Organisation'), a#DirectLink_0").first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
        orgMenuLink.click({ noWaitAfter: true })
      ]);
      await this.humanDelay(page, 500, 800);
      const orgLink = page.locator(`a:has-text("${orgName}")`).first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
        orgLink.click({ noWaitAfter: true })
      ]);
      await this.humanDelay(page, 500, 800);
    }

    // If we were on page > 1, navigate back to that page number
    if (orgPageNum > 1) {
      await page.evaluate((target) => {
        const links = Array.from(document.querySelectorAll('a'));
        const targetLink = links.find(l => l.textContent.trim() === String(target));
        if (targetLink) targetLink.click();
      }, orgPageNum);
      await this.humanDelay(page, 700, 1100);
    }

    await page.waitForFunction(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('Organisation Chain') && text.includes('Title and Ref.No./Tender ID');
    }, undefined, { timeout: 30000 });

    return true;
  }

  /**
   * Processes a downloaded PDF, compresses if > 5MB, and uploads to R2
   */
  async processDownloadedPdf(download, item, processedFileNames, docDescription = 'Tender Notice Document') {
    try {
      const tempPath = await download.path().catch(() => null);
      if (!tempPath || !fs.existsSync(tempPath)) return false;

      const fileName = download.suggestedFilename();
      if (processedFileNames.has(fileName)) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return false;
      }

      processedFileNames.add(fileName);
      let pathToUpload = tempPath;

      const stats = fs.statSync(tempPath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > 5) {
        const compressedPath = `${tempPath}_compressed.pdf`;
        const isCompressed = await compressPDF(tempPath, compressedPath);
        if (isCompressed && fs.existsSync(compressedPath)) {
          pathToUpload = compressedPath;
        }
      }

      const r2Url = await uploadFileToR2({
        filePath: pathToUpload,
        fileName,
        tenderId: item.sourceTenderId,
        publishedDate: item.publishedDate,
        contentType: 'application/pdf',
      });

      if (r2Url) {
        const finalSizeKb = Math.round(fs.statSync(pathToUpload).size / 1024);
        item.pdfUrls.push(r2Url);
        item.nitDocuments.push({
          documentName: fileName,
          description: docDescription || "Tender Notice Document",
          documentSizeKb: finalSizeKb,
          fileUrl: r2Url
        });
        logger.info(`📄 [PDF Secured] ${fileName} (${finalSizeKb} KB) -> R2`);
      }

      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (pathToUpload !== tempPath && fs.existsSync(pathToUpload)) fs.unlinkSync(pathToUpload);
      return !!r2Url;
    } catch (err) {
      logger.error(`Error processing downloaded PDF: ${err.message}`);
      return false;
    }
  }

  /**
   * Directly uploads the downloaded BOQ ZIP archive to Cloudflare R2 without local extraction
   */
  async processDownloadedZip(zipDownload, item) {
    try {
      const tempZipPath = await zipDownload.path().catch(() => null);
      if (!tempZipPath || !fs.existsSync(tempZipPath)) return;

      const fileName = zipDownload.suggestedFilename() || `Tender_Packet_${item.sourceTenderId}.zip`;
      const stats = fs.statSync(tempZipPath);
      const fileSizeKb = Math.round(stats.size / 1024);

      logger.info(`📦 [Direct ZIP Upload] Uploading ${fileName} (${fileSizeKb} KB) directly to Cloudflare R2...`);

      const r2Url = await uploadFileToR2({
        filePath: tempZipPath,
        fileName,
        tenderId: item.sourceTenderId,
        publishedDate: item.publishedDate,
        contentType: 'application/zip',
      });

      if (r2Url) {
        item.boqZipUrl = r2Url;
        item.boqFileUrl = r2Url; // Keep for backwards compatibility
        item.zipFileName = fileName;
        item.zipFileSizeKb = fileSizeKb;
        item.boqFetchStatus = 'COMPLETED';

        logger.info(`✅ [ZIP Secured] ${fileName} (${fileSizeKb} KB) -> Cloudflare R2 & DB`);
      } else {
        item.boqFetchStatus = 'FAILED';
      }

      if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    } catch (err) {
      logger.error(`Error processing downloaded ZIP: ${err.message}`);
      item.boqFetchStatus = 'FAILED';
    }
  }

  /**
   * Backward compatibility alias
   */
  async handlePopupCaptchaAndDownload(popupPage) {
    return this.handleCaptchaAndDownload(popupPage, 'NIT_DOCUMENT', 'PDF_NOTICE');
  }

  /**
   * Resolves search form captcha on pages like FrontEndLatestActiveTenders
   */
  async handleSearchFormCaptcha(page, formName = 'Active Tenders Search') {
    const captchaImgLocator = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
    const hasCaptcha = await captchaImgLocator.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCaptcha) return true;

    logger.info(`[Search Form] Captcha detected on ${formName}`);
    const inputLocator = page.locator("input[name='captchaText'], #captchaText, input[name*='captcha']").first();
    await inputLocator.focus().catch(() => {});
    await page.bringToFront().catch(() => {});

    const maxAttempts = 10;

    if (captchaService.isAutoSolveEnabled()) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const isImgVisible = await captchaImgLocator.isVisible({ timeout: 3000 }).catch(() => false);
          if (!isImgVisible) {
            logger.info(`✅ [Auto-Captcha Search] Captcha passed on ${formName}!`);
            return true;
          }

          logger.info(`🔄 [Auto-Captcha Search] Attempt ${attempt}/${maxAttempts} on ${formName}...`);
          
          // Allow full render time to capture high-clarity captcha image
          await page.waitForTimeout(1800);

          const imgBuffer = await captchaImgLocator.screenshot().catch(() => null);
          if (!imgBuffer) {
            logger.warn(`[Auto-Captcha Search] Could not screenshot captcha on attempt ${attempt}`);
            continue;
          }

          const { text: solvedText, provider } = await captchaService.solveImageCaptcha(imgBuffer);
          if (!solvedText || solvedText.length < 4) {
            logger.warn(`[Auto-Captcha Search] Solver returned invalid text ("${solvedText}") on attempt ${attempt}`);
            continue;
          }

          logger.info(`[Auto-Captcha Search] Attempt ${attempt}: Solved via ${provider} as "${solvedText}". Entering and waiting 2s before submit...`);
          await inputLocator.click().catch(() => {});
          await inputLocator.fill('');
          await inputLocator.fill(solvedText);
          await inputLocator.dispatchEvent('input').catch(() => {});
          await inputLocator.dispatchEvent('change').catch(() => {});
          
          // Wait 2 full seconds after entering before submitting
          await page.waitForTimeout(2000);

          const submitLocator = page.locator("#Submit, input[type='submit'][value*='Search'], input[type='submit'], #submit").first();
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            submitLocator.click({ force: true, timeout: 5000 }).catch(async () => {
              await inputLocator.press('Enter').catch(() => {});
            })
          ]);

          await page.waitForTimeout(1500);

          const passed = !(await captchaImgLocator.isVisible({ timeout: 2000 }).catch(() => false));
          if (passed) {
            logger.info(`✅ [Auto-Captcha Search] Passed on attempt ${attempt}!`);
            return true;
          }

          logger.warn(`⚠️ [Auto-Captcha Search] Attempt ${attempt}/${maxAttempts} rejected by portal. Retrying...`);
          
          // Refresh captcha if refresh button available
          const refreshBtn = page.locator("#captcha, button:has-text('Refresh'), a:has-text('Refresh')").first();
          if (await refreshBtn.isVisible().catch(() => false)) {
            await refreshBtn.click().catch(() => {});
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          logger.warn(`[Auto-Captcha Search] Attempt ${attempt} error: ${e.message}`);
          await page.waitForTimeout(1000);
        }
      }

      logger.warn(`❌ [Auto-Captcha Search] All ${maxAttempts} automatic attempts failed for ${formName}.`);
    }

    // Manual search captcha fallback
    console.log('\n======================================================');
    console.log(`🔑 [MANUAL SEARCH CAPTCHA] Required for ${formName}`);
    console.log(`👉 Please view the browser window, type the captcha, and click Search!`);
    console.log('======================================================\n');

    try {
      await page.waitForFunction(() => {
        const rows = document.querySelectorAll('table.list_table tr');
        return Array.from(rows).some(r => r.querySelector("a[href*='FrontEndTenderDetails'], td a"));
      }, { timeout: 120000 });
      logger.info('✅ Search form successfully submitted. Tender list loaded!');
      return true;
    } catch (waitErr) {
      logger.warn(`Search results wait timed out: ${waitErr.message}`);
      return false;
    }
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
          if (processedItem.workItemDocuments && processedItem.workItemDocuments.length > 0) {
            tender.workItemDocuments = processedItem.workItemDocuments;
          }
          if (processedItem.boqFileUrl) {
            tender.boqFileUrl = processedItem.boqFileUrl;
            tender.boqFetchStatus = 'COMPLETED';
          }
          tender.pdfFetchStatus = 'COMPLETED';
          tender.pdfRetryCount = (tender.pdfRetryCount || 0) + 1;
          await tender.save();
          updatedCount++;
          logger.info(`✅ Successfully recovered ${pdfCount} PDF(s) and ${tender.workItemDocuments?.length || 0} work item document(s) for ${tender.sourceTenderId}`);
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
      if (!dateStr || dateStr === 'NA' || dateStr === 'N/A' || (typeof dateStr === 'string' && dateStr.trim() === '')) return null;
      const timestamp = Date.parse(String(dateStr).replace(/-/g, ' '));
      return !isNaN(timestamp) ? new Date(timestamp) : null;
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
      tendererClass: rawTenderData.tendererClass || '',

      publishedDate: parseDate(rawTenderData.publishedDate) || new Date(),
      bidOpeningDate: parseDate(rawTenderData.bidOpeningDate),
      documentDownloadStartDate: parseDate(rawTenderData.documentDownloadStartDate),
      documentDownloadEndDate: parseDate(rawTenderData.documentDownloadEndDate),
      clarificationStartDate: rawTenderData.clarificationStartDate === 'NA' ? null : rawTenderData.clarificationStartDate,
      clarificationEndDate: rawTenderData.clarificationEndDate === 'NA' ? null : rawTenderData.clarificationEndDate,
      bidSubmissionStartDate: parseDate(rawTenderData.bidSubmissionStartDate),
      bidSubmissionEndDate: parseDate(rawTenderData.bidSubmissionEndDate),
      closingDate: parseDate(rawTenderData.closingDate) || parseDate(rawTenderData.bidSubmissionEndDate),

      departmentCode: rawTenderData.departmentCode || extractDeptCode(rawTenderData.sourceTenderId, rawTenderData.organisationChain),
      departmentName: rawTenderData.departmentName || (rawTenderData.organisationChain ? rawTenderData.organisationChain.split('||')[0].trim() : 'General'),
      nitDocuments: rawTenderData.nitDocuments || [],
      workItemDocuments: rawTenderData.workItemDocuments || [],
      pdfUrls: rawTenderData.pdfUrls || [],
      boqFileUrl: rawTenderData.boqFileUrl || rawTenderData.boqZipUrl || null,
      boqZipUrl: rawTenderData.boqZipUrl || rawTenderData.boqFileUrl || null,
      zipFileName: rawTenderData.zipFileName || null,
      zipFileSizeKb: rawTenderData.zipFileSizeKb || null,
      r2StorageKey: rawTenderData.r2StorageKey || formatTenderStorageKey(rawTenderData.sourceTenderId, rawTenderData.publishedDate, rawTenderData.departmentCode || rawTenderData.organisationChain),
      boqFetchStatus: rawTenderData.boqFetchStatus || (rawTenderData.boqZipUrl || rawTenderData.boqFileUrl ? 'COMPLETED' : 'PENDING'),

      invitingAuthorityName: rawTenderData.invitingAuthorityName,
      invitingAuthorityAddress: rawTenderData.invitingAuthorityAddress,
      status: 'ACTIVE'
    };
  }
}