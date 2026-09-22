/**
 * @file backend/src/services/adapters/JKTenderDateAdapter.js
 * @description Dedicated adapter for targeted daily and custom-date tender ingestion on JKTenders (jktenders.gov.in).
 * 
 * Features:
 * 1. Targeted Date Crawling:
 *    - Ingests tenders published on any specified date (default: today's date in IST).
 *    - Visits each department in "Tenders by Organisation" (FrontEndTendersByOrganisation).
 *    - Checks the genuine "e-Published Date" (column 1) on the list table.
 *    - Early-exit optimization: Since portal lists tenders newest-first, stops scanning an organisation
 *      as soon as tenders are older than the target date.
 * 2. Complete Metadata & Document Ingestion:
 *    - Extracts 100% of fields: Basic Details, Payment Instruments, Covers, Fee & EMD, Work Item Details, Critical Dates in IST.
 *    - Automatically handles download captchas via captchaService (TrueCaptcha / CapSolver / local).
 *    - Downloads all NIT PDFs and BOQ ZIP packages.
 *    - Compresses large PDFs (>5MB) via Ghostscript.
 *    - Uploads documents and self-describing tender.json to Cloudflare R2.
 *    - Upserts clean, validated tender records into MongoDB Atlas.
 * 3. Zero Date Anomalies:
 *    - Published Date is strictly verified against the portal's e-Published Date and Document Download Start Date.
 *    - Never leaks the scraper execution timestamp into the published date field.
 */

import { TenderSourceAdapter } from './TenderSourceAdapter.js';
import { chromium } from 'playwright';
import { uploadFileToR2, uploadJsonToR2, formatTenderStorageKey, extractDeptCode } from '../../utils/r2Storage.js';
import { parseISTDate, formatStandardTime, extractDateParts } from '../../utils/dateUtils.js';
import { captchaService } from '../captcha.service.js';
import Tender from '../../models/Tender.js';
import PendingDocumentTender from '../../models/PendingDocumentTender.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import pino from 'pino';

const logger = pino();
const execPromise = util.promisify(exec);

/**
 * Compresses large PDF files (>5MB) using Ghostscript to reduce storage footprint.
 */
async function compressPDF(inputPath, outputPath) {
  try {
    const gsCommand = os.platform() === 'win32' ? 'gswin64c' : 'gs';
    const command = `${gsCommand} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;
    await execPromise(command, { timeout: 120000 });
    return true;
  } catch (err) {
    logger.warn(`[Compression] Ghostscript compression skipped: ${err.message}`);
    return false;
  }
}

/**
 * Normalizes user-supplied date string (or defaults to current IST date) into standard components.
 * 
 * Supports:
 * - "22/09/2026"
 * - "22-09-2026"
 * - "22-Sep-2026"
 * - "2026-09-22"
 * - "today" / undefined
 * 
 * @param {string} [inputDate]
 * @returns {Object} { targetDatePrefix, targetDateISO, targetDateIST, targetDateEndIST, displayString }
 */
export function normalizeTargetDate(inputDate) {
  let d, m, y;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthMap = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
    'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr', 'may': 'May', 'jun': 'Jun',
    'jul': 'Jul', 'aug': 'Aug', 'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dec'
  };

  if (!inputDate || String(inputDate).trim().toLowerCase() === 'today') {
    // Current IST date (UTC + 05:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    d = String(istNow.getUTCDate()).padStart(2, '0');
    m = monthNames[istNow.getUTCMonth()];
    y = String(istNow.getUTCFullYear());
  } else {
    const str = String(inputDate).trim();
    const dmyMatch = str.match(/^(\d{1,2})[-/]([a-zA-Z]{3}|\d{1,2})[-/](\d{4})$/);
    const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

    if (dmyMatch) {
      d = dmyMatch[1].padStart(2, '0');
      const rawMonth = dmyMatch[2].toLowerCase();
      m = monthMap[rawMonth] || rawMonth.slice(0, 3).toUpperCase();
      y = dmyMatch[3];
    } else if (ymdMatch) {
      y = ymdMatch[1];
      const rawMonth = ymdMatch[2].padStart(2, '0');
      m = monthMap[rawMonth] || 'Jan';
      d = ymdMatch[3].padStart(2, '0');
    } else {
      throw new Error(`Invalid date format: "${inputDate}". Please use DD/MM/YYYY, DD-MMM-YYYY, or YYYY-MM-DD.`);
    }
  }

  const targetDatePrefix = `${d}-${m}-${y}`;
  const monthNum = String(monthNames.indexOf(m) + 1).padStart(2, '0');
  const targetDateISO = `${y}-${monthNum}-${d}`;
  const targetDateIST = new Date(`${y}-${monthNum}-${d}T00:00:00+05:30`);
  const targetDateEndIST = new Date(`${y}-${monthNum}-${d}T23:59:59+05:30`);

  return {
    targetDatePrefix, // e.g. "22-Sep-2026"
    targetDateISO,    // e.g. "2026-09-22"
    targetDateIST,
    targetDateEndIST,
    displayString: `${d} ${m} ${y}`
  };
}

export class JKTenderDateAdapter extends TenderSourceAdapter {
  constructor() {
    super('JK_TENDERS');
    this.baseUrl = 'https://jktenders.gov.in';
    this.departmentRootUrl = 'https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page';
    this.browser = null;
    this.context = null;
    this.lastCaptchaTime = null;
    this.captchaCount = 0;
    this.captchaAttempts = 0;
    this.captchaSuccesses = 0;
  }

  async humanDelay(page, minMs = 300, maxMs = 600) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
  }

  /**
   * Main entry point: crawls all tenders published on the target date across all organisations.
   * 
   * @param {Object} options
   * @param {string} [options.targetDate] - Custom date (e.g. "22/09/2026", "22-Sep-2026", or "today")
   * @param {string} [options.orgFilter] - Optional filter for specific department (e.g. "Rural Development")
   * @param {boolean} [options.headless=true] - Run browser in headless mode
   * @param {boolean} [options.force=false] - Force re-download even if already complete in DB
   * @param {number} [options.limit=Infinity] - Max tenders to ingest
   * @param {Function} [options.onProgress] - Callback on each processed tender
   */
  async fetchTendersByDate(options = {}) {
    const dateConfig = normalizeTargetDate(options.targetDate);
    const targetPrefix = dateConfig.targetDatePrefix.toLowerCase(); // e.g. "22-sep-2026"
    const orgFilter = options.orgFilter || null;
    const excludeOrg = options.excludeOrg || null;
    const isHeadless = options.headless !== false && process.env.SCRAPER_HEADLESS !== 'false';
    const force = !!options.force;
    const limit = options.limit || Infinity;
    const shard = options.shard || null;
    let shardPart = null;
    let shardTotal = null;
    if (shard) {
      const parts = String(shard).split('/').map(n => parseInt(n.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] > 0) {
        shardPart = parts[0];
        shardTotal = parts[1];
      }
    }

    console.log(`\n======================================================================`);
    console.log(`🚀 JKTENDERS TARGETED DATE CRAWLER`);
    console.log(`======================================================================`);
    console.log(`📅 Target Published Date: ${dateConfig.displayString} ("${dateConfig.targetDatePrefix}")`);
    console.log(`🏛️ Organisation Filter:   ${orgFilter || 'ALL ORGANISATIONS'}`);
    if (excludeOrg) {
      console.log(`🚫 Excluded Organisation: ${excludeOrg}`);
    }
    if (shardPart !== null && shardTotal !== null) {
      console.log(`🔀 Distributed Shard:     ${shardPart}/${shardTotal} (Instance ${shardPart} of ${shardTotal})`);
    }
    console.log(`🌐 Browser Headless:      ${isHeadless}`);
    console.log(`⚡ Force Re-ingest:       ${force}`);
    console.log(`🎯 Ingestion Limit:       ${limit === Infinity ? 'Unlimited' : limit}`);
    console.log(`======================================================================\n`);

    this.browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    this.context = await this.browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await this.context.newPage();

    let totalInspected = 0;
    let totalTargetDateFound = 0;
    let totalIngested = 0;
    let totalSkippedAlreadyComplete = 0;
    let totalWithDocuments = 0;
    let totalWithoutDocuments = 0;
    let totalPdfsSecured = 0;
    let totalBoqsSecured = 0;

    try {
      console.log(`🌐 Navigating to FrontEndTendersByOrganisation...`);
      await page.goto(this.departmentRootUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector("table#table tr[id^='informal']", { timeout: 35000 });

      // Extract all organisations from directory table
      const organisations = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table#table tr[id^='informal']"));
        return rows.map((row, index) => {
          const tds = row.querySelectorAll('td');
          const orgName = tds[1] ? tds[1].innerText.trim() : '';
          const countLink = tds[2] ? tds[2].querySelector('a') : null;
          const tenderCount = countLink ? parseInt(countLink.innerText.trim(), 10) : 0;
          return { index, orgName, tenderCount, hasCountLink: !!countLink };
        }).filter(o => o.hasCountLink && o.tenderCount > 0);
      });

      console.log(`🏛️ Found ${organisations.length} active organisations on portal.\n`);

      for (let o = 0; o < organisations.length && totalIngested < limit; o++) {
        const org = organisations[o];
        if (shardPart !== null && shardTotal !== null) {
          if (o % shardTotal !== (shardPart - 1)) {
            continue;
          }
        }
        if (orgFilter && !org.orgName.toLowerCase().includes(orgFilter.toLowerCase())) {
          continue;
        }
        if (excludeOrg && org.orgName.toLowerCase().includes(excludeOrg.toLowerCase())) {
          console.log(`⏩ Skipping excluded organisation: "${org.orgName}"`);
          continue;
        }

        console.log(`\n----------------------------------------------------------------------`);
        console.log(`🏛️ [${o + 1}/${organisations.length}]${shardTotal ? ` [Shard ${shardPart}/${shardTotal}]` : ''} Organisation: "${org.orgName}" (${org.tenderCount} active tenders on portal)`);
        console.log(`----------------------------------------------------------------------`);

        // Click organisation link
        const orgRow = page.locator("table#table tr[id^='informal']").filter({ hasText: org.orgName }).first();
        const countLink = orgRow.locator("td:nth-child(3) a, a.link2, a").first();

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
          countLink.click({ noWaitAfter: true, timeout: 20000 }).catch(() => countLink.click({ force: true, noWaitAfter: true }))
        ]);
        await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 35000 }).catch(() => {});
        await this.humanDelay(page, 400, 700);

        let orgHasMore = true;
        let orgPageNum = 1;

        while (orgHasMore && totalIngested < limit) {
          // Extract listing table rows with explicit columns:
          // tds[0]: S.No
          // tds[1]: e-Published Date
          // tds[2]: Closing Date
          // tds[3]: Opening Date
          // tds[4]: Title & Tender ID
          // tds[5]: Organisation Chain
          const tenderRows = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll("table.list_table tr[id^='informal']"));
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
                publishedDateStr: tds[1] ? tds[1].innerText.trim() : '',
                closingDateStr: tds[2] ? tds[2].innerText.trim() : '',
                openingDateStr: tds[3] ? tds[3].innerText.trim() : '',
                hasLink: !!a
              };
            }).filter(t => t && t.hasLink && t.sourceTenderId);
          });

          if (tenderRows.length === 0) {
            orgHasMore = false;
            break;
          }

          console.log(`📋 Page ${orgPageNum}: ${tenderRows.length} tenders displayed. Scanning for date "${dateConfig.targetDatePrefix}"...`);

          let pageHasOlderThanTarget = false;
          let targetDateRowsOnThisPage = 0;

          for (let t = 0; t < tenderRows.length && totalIngested < limit; t++) {
            const rowSummary = tenderRows[t];
            totalInspected++;

            const pubDateStr = rowSummary.publishedDateStr; // e.g. "22-Sep-2026 06:55 PM"
            const pubDatePart = pubDateStr ? pubDateStr.split(' ')[0].toLowerCase() : ''; // "22-sep-2026"
            const parsedPubDate = parseISTDate(pubDateStr);

            // 1. Check if row date matches target date
            const isTargetDate = pubDatePart === targetPrefix;

            if (isTargetDate) {
              totalTargetDateFound++;
              targetDateRowsOnThisPage++;

              // Check if already in MongoDB with documents completed
              const existing = await Tender.findOne({
                sourcePortal: 'JK_TENDERS',
                sourceTenderId: rowSummary.sourceTenderId
              }).lean();

              const isComplete = existing && 
                existing.pdfFetchStatus === 'COMPLETED' && 
                (existing.boqZipUrl || existing.boqFetchStatus === 'COMPLETED' || existing.boqFetchStatus === 'NOT_AVAILABLE' || existing.isDocumentAvailable === false);

              if (isComplete && !force) {
                totalSkippedAlreadyComplete++;
                console.log(`   ⏩ [ALREADY INGESTED & COMPLETE] ${rowSummary.sourceTenderId} (${rowSummary.publishedDateStr})`);
                continue;
              }

              console.log(`\n👉 [${totalIngested + 1}] Processing Target Date Tender: ${rowSummary.sourceTenderId}`);
              console.log(`   📅 Portal Published Date: "${rowSummary.publishedDateStr}"`);
              console.log(`   🔖 Title: "${rowSummary.title.slice(0, 75)}..."`);

              try {
                // Click tender link: match exact bracketed tender ID to avoid substring or index shift collisions
                let tenderRow = page.locator("table.list_table tr[id^='informal']").filter({ hasText: `[${rowSummary.sourceTenderId}]` }).first();
                let hasExactRow = (await tenderRow.count().catch(() => 0)) > 0;
                let tenderLink;
                if (hasExactRow) {
                  tenderLink = tenderRow.locator("td:nth-child(5) a, a").first();
                } else {
                  const candidateRow = page.locator("table.list_table tr[id^='informal']").nth(rowSummary.index);
                  const candidateText = await candidateRow.innerText().catch(() => '');
                  if (candidateText.includes(rowSummary.sourceTenderId)) {
                    tenderLink = candidateRow.locator("td:nth-child(5) a, a").first();
                  } else {
                    console.warn(`⚠️ [Strict Match Guard] Row for ${rowSummary.sourceTenderId} not verified on current page. Skipping to avoid cross-tender contamination.`);
                    continue;
                  }
                }

                await Promise.all([
                  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
                  tenderLink.click({ noWaitAfter: true, timeout: 15000 }).catch(() => tenderLink.click({ force: true, noWaitAfter: true }))
                ]);
                await this.humanDelay(page, 500, 800);

                // Check if loaded page is an intermediate multi-item list ("Tender List : Open Tender")
                const isMultiTenderList = await page.evaluate(() => {
                  const text = document.body ? document.body.innerText : '';
                  const hasSubTable = !!document.querySelector("table.list_table tr[id^='informal']");
                  const hasBasicDetails = text.includes('Basic Details') || !!document.querySelector("table:has(td:has-text('Basic Details'))");
                  return (text.includes('Tender List : Open Tender') || text.includes('Tender List :')) && hasSubTable && !hasBasicDetails;
                }).catch(() => false);

                if (isMultiTenderList) {
                  console.log(`\n🗂️ [MULTI-TENDER DETECTED] Portal opened multi-work table for NIT: ${rowSummary.sourceTenderId}`);

                  const workRows = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll("table.list_table tr[id^='informal']"));
                    return rows.map((r, idx) => {
                      const tds = r.querySelectorAll('td');
                      if (tds.length < 5) return null;
                      const fullText = r.innerText.trim();
                      const bracketMatches = fullText.match(/\[(.*?)\]/g) || [];
                      const tenderId = bracketMatches.length >= 1 ? bracketMatches[bracketMatches.length - 1].replace(/[\[\]]/g, '').trim() : '';
                      const a = tds[4].querySelector('a');
                      return {
                        index: idx,
                        sourceTenderId: tenderId,
                        title: a ? a.innerText.trim() : tds[4].innerText.trim(),
                        publishedDateStr: tds[1] ? tds[1].innerText.trim() : '',
                        closingDateStr: tds[2] ? tds[2].innerText.trim() : '',
                        openingDateStr: tds[3] ? tds[3].innerText.trim() : '',
                        hasLink: !!a
                      };
                    }).filter(w => w && w.hasLink && w.sourceTenderId);
                  });

                  console.log(`   📋 Found ${workRows.length} work items in multi-tender table.`);
                  const allWorkIds = workRows.map(w => w.sourceTenderId);
                  const baseId = rowSummary.sourceTenderId.replace(/_\d+$/, '') || rowSummary.sourceTenderId;

                  for (let w = 0; w < workRows.length && totalIngested < limit; w++) {
                    const workSummary = workRows[w];
                    console.log(`\n   🔨 [Multi-Work Item ${w + 1}/${workRows.length}] Processing: ${workSummary.sourceTenderId}`);
                    console.log(`      🔖 Work Title: "${workSummary.title.slice(0, 70)}..."`);

                    // Strictly locate work item row by bracketed ID to avoid index drift
                    let workRow = page.locator("table.list_table tr[id^='informal']").filter({ hasText: `[${workSummary.sourceTenderId}]` }).first();
                    let hasExactWork = (await workRow.count().catch(() => 0)) > 0;
                    let workLink;
                    if (hasExactWork) {
                      workLink = workRow.locator("td:nth-child(5) a, a").first();
                    } else {
                      const candidateWork = page.locator("table.list_table tr[id^='informal']").nth(workSummary.index);
                      const candText = await candidateWork.innerText().catch(() => '');
                      if (candText.includes(workSummary.sourceTenderId)) {
                        workLink = candidateWork.locator("td:nth-child(5) a, a").first();
                      } else {
                        console.warn(`⚠️ [Strict Match Guard] Sub-table row for ${workSummary.sourceTenderId} not verified. Skipping.`);
                        continue;
                      }
                    }

                    await Promise.all([
                      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
                      workLink.click({ noWaitAfter: true, timeout: 15000 }).catch(() => workLink.click({ force: true, noWaitAfter: true }))
                    ]);
                    await page.waitForSelector("table:has-text('Basic Details'), table:has-text('Critical Dates')", { timeout: 30000 }).catch(() => {});
                    await this.humanDelay(page, 400, 650);

                    const { processedItem, pdfCount, boqCount, hasDocuments, docReason } = await this.scrapeDetailAndDocuments(page, workSummary, org.orgName);
                    if (pdfCount > 0) totalPdfsSecured += pdfCount;
                    if (boqCount > 0) totalBoqsSecured += boqCount;

                    const isActuallyMulti = workRows.length > 1;
                    processedItem.isMultiTender = isActuallyMulti;
                    processedItem.baseTenderId = isActuallyMulti ? baseId : null;
                    processedItem.relatedTenderIds = isActuallyMulti ? allWorkIds.filter(id => id !== workSummary.sourceTenderId) : [];

                    const saved = await this.saveTenderAndUploadR2(processedItem);
                    totalIngested++;

                    if (hasDocuments) {
                      totalWithDocuments++;
                      console.log(`      ✅ [Saved Multi-Tender Work] ${saved.sourceTenderId} (${saved.pdfUrls?.length || 0} PDFs, BOQ: ${saved.boqZipUrl ? 'Yes' : 'No'})`);
                      await PendingDocumentTender.findOneAndUpdate(
                        { sourceTenderId: saved.sourceTenderId },
                        { $set: { status: 'DOWNLOADED', downloadedAt: new Date(), lastCheckedAt: new Date() } }
                      ).catch(() => {});
                    } else {
                      totalWithoutDocuments++;
                      console.log(`      ⏳ [Pending Docs Multi-Tender Work] ${saved.sourceTenderId} -> pending_document_tenders`);
                      const isFuture = processedItem.documentDownloadStartDate && processedItem.documentDownloadStartDate > new Date();
                      await PendingDocumentTender.findOneAndUpdate(
                        { sourceTenderId: saved.sourceTenderId },
                        {
                          $set: {
                            sourcePortal: 'JK_TENDERS',
                            sourceTenderId: saved.sourceTenderId,
                            tenderReferenceNumber: saved.tenderReferenceNumber || '',
                            title: saved.title,
                            organisationChain: saved.organisationChain || org.orgName,
                            departmentName: saved.departmentName,
                            departmentCode: saved.departmentCode,
                            tenderCategory: saved.tenderCategory || '',
                            estimatedValue: saved.estimatedValue || 0,
                            publishedDateStr: saved.publishedDateStr,
                            publishedDate: saved.publishedDate,
                            publishedTime: saved.publishedTime,
                            documentDownloadStartDateStr: processedItem.documentDownloadStartDateStr,
                            documentDownloadStartDate: processedItem.documentDownloadStartDate,
                            documentDownloadEndDateStr: processedItem.documentDownloadEndDateStr,
                            documentDownloadEndDate: processedItem.documentDownloadEndDate,
                            bidSubmissionStartDateStr: processedItem.bidSubmissionStartDateStr,
                            bidSubmissionStartDate: processedItem.bidSubmissionStartDate,
                            bidSubmissionEndDateStr: processedItem.bidSubmissionEndDateStr,
                            bidSubmissionEndDate: processedItem.bidSubmissionEndDate,
                            bidOpeningDateStr: processedItem.bidOpeningDateStr,
                            bidOpeningDate: processedItem.bidOpeningDate,
                            hasDownloadLinks: (processedItem.rawNitDocs?.length > 0 || processedItem.isDocumentAvailable),
                            portalTenderUrl: page.url(),
                            reason: docReason,
                            status: isFuture ? 'AWAITING_DOWNLOAD_DATE' : 'READY_TO_DOWNLOAD',
                            lastCheckedAt: new Date()
                          },
                          $inc: { attemptCount: 1 }
                        },
                        { upsert: true, new: true }
                      ).catch(() => {});
                    }

                    if (options.onProgress) {
                      await options.onProgress({
                        tender: saved,
                        totalIngested,
                        totalTargetDateFound
                      });
                    }

                    // Return from work details to intermediate "Tender List : Open Tender"
                    await this.navigateBackFromTenderDetails(page);
                    await this.humanDelay(page, 300, 500);
                  }

                  // After all works finished, return to organisation's main tender list
                  await this.ensureOnOrganisationTenderList(page, org.orgName, orgPageNum);
                  await this.humanDelay(page, 300, 500);

                } else {
                  // Standard Single Tender Flow
                  await page.waitForSelector("table:has-text('Basic Details'), table:has-text('Critical Dates')", { timeout: 30000 }).catch(() => {});
                  await this.humanDelay(page, 400, 650);

                  const { processedItem, pdfCount, boqCount, hasDocuments, docReason } = await this.scrapeDetailAndDocuments(page, rowSummary, org.orgName);
                  if (pdfCount > 0) totalPdfsSecured += pdfCount;
                  if (boqCount > 0) totalBoqsSecured += boqCount;

                  const saved = await this.saveTenderAndUploadR2(processedItem);
                  totalIngested++;

                  if (hasDocuments) {
                    totalWithDocuments++;
                    console.log(`   ✅ [Saved to MongoDB & R2] ${saved.sourceTenderId}`);
                    console.log(`      📅 Published: "${saved.publishedDateStr}" (${saved.publishedTime})`);
                    console.log(`      📁 R2 Key:    ${saved.r2StorageKey}`);
                    console.log(`      📄 PDFs:      ${saved.pdfUrls?.length || 0} secured`);
                    console.log(`      📦 BOQ:       ${saved.boqZipUrl ? 'Secured ✅' : 'None / Not Released'}`);

                    await PendingDocumentTender.findOneAndUpdate(
                      { sourceTenderId: saved.sourceTenderId },
                      { $set: { status: 'DOWNLOADED', downloadedAt: new Date(), lastCheckedAt: new Date() } }
                    ).catch(() => {});
                  } else {
                    totalWithoutDocuments++;
                    console.log(`   ⏳ [Unpublished Documents -> Stored in pending_document_tenders] ${saved.sourceTenderId}`);
                    console.log(`      📅 Published:           "${saved.publishedDateStr}" (${saved.publishedTime})`);
                    console.log(`      🕒 Download Start Date: "${processedItem.documentDownloadStartDateStr || 'Not Specified'}"`);
                    console.log(`      ℹ️ Reason:              ${docReason}`);

                    const isFuture = processedItem.documentDownloadStartDate && processedItem.documentDownloadStartDate > new Date();
                    await PendingDocumentTender.findOneAndUpdate(
                      { sourceTenderId: saved.sourceTenderId },
                      {
                        $set: {
                          sourcePortal: 'JK_TENDERS',
                          sourceTenderId: saved.sourceTenderId,
                          tenderReferenceNumber: saved.tenderReferenceNumber || '',
                          title: saved.title,
                          organisationChain: saved.organisationChain || org.orgName,
                          departmentName: saved.departmentName,
                          departmentCode: saved.departmentCode,
                          tenderCategory: saved.tenderCategory || '',
                          estimatedValue: saved.estimatedValue || 0,
                          publishedDateStr: saved.publishedDateStr,
                          publishedDate: saved.publishedDate,
                          publishedTime: saved.publishedTime,
                          documentDownloadStartDateStr: processedItem.documentDownloadStartDateStr,
                          documentDownloadStartDate: processedItem.documentDownloadStartDate,
                          documentDownloadEndDateStr: processedItem.documentDownloadEndDateStr,
                          documentDownloadEndDate: processedItem.documentDownloadEndDate,
                          bidSubmissionStartDateStr: processedItem.bidSubmissionStartDateStr,
                          bidSubmissionStartDate: processedItem.bidSubmissionStartDate,
                          bidSubmissionEndDateStr: processedItem.bidSubmissionEndDateStr,
                          bidSubmissionEndDate: processedItem.bidSubmissionEndDate,
                          bidOpeningDateStr: processedItem.bidOpeningDateStr,
                          bidOpeningDate: processedItem.bidOpeningDate,
                          hasDownloadLinks: (processedItem.rawNitDocs?.length > 0 || processedItem.isDocumentAvailable),
                          portalTenderUrl: page.url(),
                          reason: docReason,
                          status: isFuture ? 'AWAITING_DOWNLOAD_DATE' : 'READY_TO_DOWNLOAD',
                          lastCheckedAt: new Date()
                        },
                        $inc: { attemptCount: 1 }
                      },
                      { upsert: true, new: true }
                    ).catch(() => {});
                  }

                  if (options.onProgress) {
                    await options.onProgress({
                      tender: saved,
                      totalIngested,
                      totalTargetDateFound
                    });
                  }

                  // Return to organisation's tender list
                  await this.ensureOnOrganisationTenderList(page, org.orgName, orgPageNum);
                  await this.humanDelay(page, 300, 500);
                }

              } catch (itemErr) {
                console.error(`   ⚠️ Error ingesting ${rowSummary.sourceTenderId}: ${itemErr.message}`);
                await this.ensureOnOrganisationTenderList(page, org.orgName, orgPageNum);
              }

            } else if (parsedPubDate && parsedPubDate < dateConfig.targetDateIST) {
              // Row date is strictly older than target date
              pageHasOlderThanTarget = true;
            }
          }

          // EARLY-EXIT OPTIMIZATION:
          // In NIC eProcurement, tenders are sorted newest-first.
          // If we found older tenders on this page, and no tenders matching target date on this page,
          // then all subsequent pages will only be even older. We can safely conclude this organisation!
          if (pageHasOlderThanTarget && targetDateRowsOnThisPage === 0) {
            console.log(`   🛑 Reached tenders older than ${dateConfig.displayString}. Concluding organisation "${org.orgName}".`);
            orgHasMore = false;
            break;
          }

          // Pagination within this organisation
          const nextPg = orgPageNum + 1;
          const hasNextPage = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a'));
            const targetLink = links.find(l => l.textContent.trim() === String(target));
            if (targetLink) { targetLink.click(); return true; }
            return false;
          }, nextPg);

          if (hasNextPage && totalIngested < limit && !pageHasOlderThanTarget) {
            orgPageNum++;
            await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 25000 }).catch(() => {});
            await this.humanDelay(page, 500, 900);
          } else {
            orgHasMore = false;
          }
        }

        // Return to Organisation List before visiting next organisation
        await this.returnToOrganisationDirectory(page);
        await this.humanDelay(page, 400, 700);
      }

      console.log(`\n======================================================================`);
      console.log(`🎉 TARGETED CRAWL COMPLETE FOR DATE: ${dateConfig.displayString}`);
      console.log(`======================================================================`);
      console.log(`📋 Total Tenders Inspected:           ${totalInspected}`);
      console.log(`🎯 Tenders Found on Target Date:      ${totalTargetDateFound}`);
      console.log(`✅ Newly Ingested to DB & R2:        ${totalIngested}`);
      console.log(`📄 Tenders WITH Documents Secured:    ${totalWithDocuments}`);
      console.log(`⏳ Tenders WITHOUT Documents Yet:     ${totalWithoutDocuments} (in pending_document_tenders)`);
      console.log(`🔐 Captchas Encountered / Solved:     ${this.captchaAttempts} / ${this.captchaSuccesses}`);
      console.log(`⏩ Skipped (Already Complete in DB): ${totalSkippedAlreadyComplete}`);
      console.log(`📄 NIT PDFs Secured:                 ${totalPdfsSecured}`);
      console.log(`📦 BOQ ZIPs Secured:                 ${totalBoqsSecured}`);
      console.log(`======================================================================\n`);

      return {
        targetDate: dateConfig.displayString,
        totalInspected,
        totalTargetDateFound,
        totalIngested,
        totalSkippedAlreadyComplete,
        totalWithDocuments,
        totalWithoutDocuments,
        totalPdfsSecured,
        totalBoqsSecured,
        totalCaptchaAttempts: this.captchaAttempts,
        totalCaptchaSuccess: this.captchaSuccesses
      };

    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Scrapes detailed tender metadata and downloads all associated documents in page.
   */
  async scrapeDetailAndDocuments(page, summary, orgName) {
    const item = { ...summary };
    let pdfCountSecured = 0;
    let boqCountSecured = 0;

    const detailedData = await page.evaluate((summaryData) => {
      const pageText = document.body ? document.body.innerText : '';
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

      // 1. Critical Dates with full minute precision
      const getDateByLabel = (labels) => {
        const normalizedLabels = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase().replace(/[:₹\s]/g, ''));
        const tds = Array.from(document.querySelectorAll('td'));
        for (const td of tds) {
          if (td.querySelector('table')) continue;
          const text = td.innerText.replace(/\u00A0/g, ' ').trim().toLowerCase().replace(/[:₹\s]/g, '');
          if (normalizedLabels.includes(text)) {
            let next = td.nextElementSibling;
            if (next && next.tagName === 'TD') {
              const val = next.innerText.replace(/\u00A0/g, ' ').trim().replace(/\s+/g, ' ');
              if (val && val !== 'NA' && val !== 'N/A' && /\d{1,2}[-/][a-zA-Z0-9]{2,4}[-/]\d{4}/.test(val)) {
                return val;
              }
            }
          }
        }

        // Secondary fallback: regex scan across innermost Critical Dates table text
        const critTable = Array.from(document.querySelectorAll('table')).find(t => t.innerText && t.innerText.includes('Critical Dates') && t.querySelectorAll('table').length === 0) ||
                          Array.from(document.querySelectorAll('table')).find(t => t.innerText && t.innerText.includes('Critical Dates'));
        if (critTable) {
          const tableText = critTable.innerText.replace(/\u00A0/g, ' ');
          for (const label of (Array.isArray(labels) ? labels : [labels])) {
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reg = new RegExp(escaped + '[\\s\\t:]*([0-9]{1,2}[-/][a-zA-Z0-9]{3}[-/][0-9]{4}(?:\\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\\s*(?:AM|PM)?)?)', 'i');
            const match = tableText.match(reg);
            if (match && match[1] && match[1] !== 'NA' && match[1] !== 'N/A') {
              return match[1].trim().replace(/\s+/g, ' ');
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

      // Date Guard: Use detail page official critical date, or listing table date
      let finalPublishedDateStr = critPublishedDate || summaryData?.publishedDateStr || critDocDownloadStartDate || critBidSubmissionStartDate || null;
      const refStartDate = critDocDownloadStartDate || critBidSubmissionStartDate;
      if (finalPublishedDateStr && refStartDate) {
        const parseFullIST = (s) => {
          if (!s) return null;
          const m = s.match(/(\d{1,2})[-/]([a-zA-Z]{3}|\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
          if (!m) return null;
          const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
          const mo = months[m[2].toLowerCase()] ?? (parseInt(m[2], 10) - 1);
          let h = m[4] ? parseInt(m[4], 10) : 0;
          const min = m[5] ? parseInt(m[5], 10) : 0;
          const ampm = m[7] ? m[7].toUpperCase() : null;
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          return new Date(Date.UTC(parseInt(m[3], 10), mo, parseInt(m[1], 10), h, min));
        };
        const pubD = parseFullIST(finalPublishedDateStr);
        const refD = parseFullIST(refStartDate);
        // If published date exceeds doc download or bid submission even by 1 minute, clamp to refStartDate
        if (pubD && refD && pubD.getTime() > refD.getTime() && refD.getUTCFullYear() >= 2026) {
          finalPublishedDateStr = refStartDate;
        }
      }

      // 2. Payment Instruments
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

      // 3. Covers Information
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

      // 3b. Other Important Documents List (Mandatory Bidder Checklist)
      const otherImportantDocuments = [];
      const oidTable = allTables.find(t => 
        t.innerText && 
        (t.innerText.includes('Other Important Documents') || t.innerText.includes('Other Important Documents List')) &&
        t.innerText.includes('Sub Category')
      );
      if (oidTable) {
        const rows = Array.from(oidTable.querySelectorAll('tr'));
        for (const tr of rows) {
          if (tr.querySelector('th') || (tr.textContent.includes('Sub Category') && tr.textContent.includes('Category'))) {
            continue;
          }
          const tds = Array.from(tr.querySelectorAll('td'));
          if (tds.length >= 4) {
            const sNo = parseInt(tds[0].innerText.trim(), 10);
            const category = tds[1].innerText.trim().replace(/\s+/g, ' ');
            const subCategory = tds[2].innerText.trim().replace(/\s+/g, ' ');
            const description = tds[3].innerText.trim().replace(/\s+/g, ' ');
            const format = tds[4] ? tds[4].innerText.trim().replace(/\s+/g, ' ') : '';
            if (!isNaN(sNo) && (category || subCategory)) {
              otherImportantDocuments.push({
                sNo,
                category,
                subCategory,
                description,
                format
              });
            }
          }
        }
      }

      // 4. NIT Documents metadata
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

      // 6. Tender Inviting Authority
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

        publishedDateStr: finalPublishedDateStr,
        bidOpeningDateStr: critBidOpeningDate || summaryData?.openingDateStr || null,
        documentDownloadStartDateStr: critDocDownloadStartDate || null,
        documentDownloadEndDateStr: critDocDownloadEndDate || null,
        clarificationStartDateStr: critClarificationStartDate || null,
        clarificationEndDateStr: critClarificationEndDate || null,
        bidSubmissionStartDateStr: critBidSubmissionStartDate || null,
        bidSubmissionEndDateStr: critBidSubmissionEndDate || null,
        closingDateStr: critBidSubmissionEndDate || critDocDownloadEndDate || summaryData?.closingDateStr || null,

        offlineInstruments,
        coversInfo,
        otherImportantDocuments,
        workItemDocuments,
        rawNitDocs,
        invitingAuthorityName,
        invitingAuthorityAddress
      };
    }, summary);

    Object.assign(item, detailedData);
    const deptCode = extractDeptCode(item.sourceTenderId, item.organisationChain || orgName);
    item.departmentCode = deptCode;
    item.departmentName = item.organisationChain ? item.organisationChain.split('||')[0].trim() : (orgName || 'General');
    item.publishedDate = parseISTDate(item.publishedDateStr);
    item.documentDownloadStartDate = parseISTDate(item.documentDownloadStartDateStr);
    item.documentDownloadEndDate = parseISTDate(item.documentDownloadEndDateStr);
    item.bidSubmissionStartDate = parseISTDate(item.bidSubmissionStartDateStr);
    item.bidSubmissionEndDate = parseISTDate(item.bidSubmissionEndDateStr);
    item.bidOpeningDate = parseISTDate(item.bidOpeningDateStr);
    item.r2StorageKey = formatTenderStorageKey(item.sourceTenderId, item.publishedDate, deptCode);
    item.pdfUrls = [];
    item.nitDocuments = [];

    const now = new Date();
    const isFutureDownload = item.documentDownloadStartDate && item.documentDownloadStartDate > now;
    if (isFutureDownload) {
      item.isDocumentAvailable = false;
    }

    // Scroll to "Tenders Documents" section
    await page.evaluate(() => {
      const docHeader = Array.from(document.querySelectorAll('td, th, span, div, b')).find(el => el.textContent.trim().includes('Tenders Documents'));
      if (docHeader) docHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: document.body.scrollHeight * 0.75, behavior: 'smooth' });
    });
    await this.humanDelay(page, 300, 500);

    const docLinkSelector = "a#docDownoad, a[href*='docDownoad'], a:has-text('Tendernotice'), a:not(.Menu):not(.footerlink):not(.left_nav):has-text('.pdf')";
    const pdfLocator = page.locator(docLinkSelector);
    const pdfCount = await pdfLocator.count().catch(() => 0);

    const zipLocator = page.locator("a#DirectLink_8, a:has-text('Download as zip file'), a[href*='DirectLink']:has(img[src*='zip']), a:has(img[src*='zip'])").first();
    const hasZip = await zipLocator.count().catch(() => 0);

    const processedFileNames = new Set();

    if (pdfCount === 0 && hasZip === 0) {
      item.isDocumentAvailable = false;
      item.pdfFetchStatus = 'NOT_AVAILABLE';
      item.boqFetchStatus = 'NOT_AVAILABLE';
    } else {
      let captchaPassed = true;

      // 1. Download NIT PDFs
      for (let j = 0; j < pdfCount; j++) {
        const currentLocator = page.locator(docLinkSelector);
        const pdfLink = currentLocator.nth(j);
        await pdfLink.scrollIntoViewIfNeeded().catch(() => {});
        await this.humanDelay(page, 200, 350);

        let docDesc = (item.rawNitDocs && item.rawNitDocs[j]?.description) || "Tender Notice Document";
        let docSNo = (item.rawNitDocs && item.rawNitDocs[j]?.sNo) || (j + 1);
        let docDeclaredSize = (item.rawNitDocs && item.rawNitDocs[j]?.documentSizeKb) || null;

        let download = null;
        const downloadPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
        await pdfLink.click().catch(() => {});

        const outcome = await Promise.race([
          downloadPromise.then(d => d ? { type: 'download', dl: d } : null),
          page.waitForSelector("img[name='captchaImage'], #captchaImage, input[name='captchaText']", { timeout: 18000 })
            .then(() => ({ type: 'captcha' }))
            .catch(() => null)
        ]);

        if (outcome && outcome.type === 'download') {
          download = outcome.dl;
        } else if (outcome && outcome.type === 'captcha') {
          const verified = await this.resolveDownloadCaptcha(page, item.sourceTenderId);
          if (!verified) {
            captchaPassed = false;
            break;
          }
          const refreshedLocator = page.locator(docLinkSelector);
          const refreshedLink = refreshedLocator.nth(j);
          await refreshedLink.scrollIntoViewIfNeeded().catch(() => {});
          await this.humanDelay(page, 200, 350);

          const retryDlPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
          await refreshedLink.click().catch(() => {});
          download = await retryDlPromise;
        }

        if (download) {
          const uploaded = await this.processDownloadedPdf(download, item, processedFileNames, docDesc, docSNo, docDeclaredSize);
          if (uploaded) pdfCountSecured++;
        }
      }

      // 2. Download BOQ ZIP
      if (captchaPassed && hasZip > 0) {
        try {
          await zipLocator.scrollIntoViewIfNeeded().catch(() => {});
          await this.humanDelay(page, 200, 350);

          const zipDlPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
          await zipLocator.click().catch(() => {});

          const zipOutcome = await Promise.race([
            zipDlPromise.then(d => d ? { type: 'download', dl: d } : null),
            page.waitForSelector("img[name='captchaImage'], #captchaImage, input[name='captchaText']", { timeout: 18000 })
              .then(() => ({ type: 'captcha' }))
              .catch(() => null)
          ]);

          let zipDownload = null;
          if (zipOutcome && zipOutcome.type === 'download') {
            zipDownload = zipOutcome.dl;
          } else if (zipOutcome && zipOutcome.type === 'captcha') {
            const verified = await this.resolveDownloadCaptcha(page, item.sourceTenderId);
            if (verified) {
              const refreshedZip = page.locator("a#DirectLink_8, a:has-text('Download as zip file'), a[href*='DirectLink']:has(img[src*='zip']), a:has(img[src*='zip'])").first();
              await refreshedZip.scrollIntoViewIfNeeded().catch(() => {});
              const retryZipPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null);
              await refreshedZip.click().catch(() => {});
              zipDownload = await retryZipPromise;
            }
          }

          if (zipDownload) {
            const uploaded = await this.processDownloadedZip(zipDownload, item);
            if (uploaded) boqCountSecured++;
          }
        } catch (boqErr) {
          logger.warn(`BOQ zip fetch error for ${item.sourceTenderId}: ${boqErr.message}`);
          item.boqFetchStatus = 'FAILED';
        }
      }

      item.isDocumentAvailable = (item.pdfUrls.length > 0 || item.workItemDocuments.length > 0);
      item.pdfFetchStatus = item.pdfUrls.length > 0 ? 'COMPLETED' : (item.isDocumentAvailable ? 'PENDING' : 'NOT_AVAILABLE');
    }

    let docReason = '';
    const hasAnyDocsSecured = (pdfCountSecured > 0 || boqCountSecured > 0);

    if (!hasAnyDocsSecured) {
      if (isFutureDownload) {
        docReason = `Document download start date in future: ${item.documentDownloadStartDateStr}`;
      } else if (pdfCount === 0 && hasZip === 0) {
        docReason = 'No document download links published on portal yet';
      } else if (!captchaPassed) {
        docReason = 'Captcha verification could not be completed';
      } else {
        docReason = 'Portal documents not yet available for download';
      }
    }

    return {
      processedItem: item,
      pdfCount: pdfCountSecured,
      boqCount: boqCountSecured,
      hasDocuments: hasAnyDocsSecured,
      docReason
    };
  }

  /**
   * Resolves Document Download Captchas using cloud solvers (TrueCaptcha / CapSolver) or prompt.
   */
  async resolveDownloadCaptcha(page, tenderId) {
    this.captchaAttempts++;
    this.captchaCount++;
    const captchaImg = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
    const inputLocator = page.locator("input[name='captchaText'], #captchaText, input[name*='captcha']").first();
    const submitBtn = page.locator("#Submit, input[type='submit'][value*='Submit'], input[name='Submit'], button[type='submit']").first();

    const maxAttempts = 10;

    if (captchaService.isAutoSolveEnabled()) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const isImgVisible = await captchaImg.isVisible({ timeout: 2500 }).catch(() => false);
          if (!isImgVisible) {
            this.captchaSuccesses++;
            return true;
          }

          await page.waitForTimeout(1800);
          const imgBuffer = await captchaImg.screenshot().catch(() => null);
          if (!imgBuffer) continue;

          const { text: solvedText, provider } = await captchaService.solveImageCaptcha(imgBuffer);
          if (!solvedText || solvedText.length < 4) continue;

          logger.info(`[Auto-Captcha] Attempt ${attempt}/${maxAttempts} (${provider}): "${solvedText}"`);
          await inputLocator.click().catch(() => {});
          await inputLocator.fill('');
          await inputLocator.fill(solvedText);
          await inputLocator.dispatchEvent('input').catch(() => {});
          await page.waitForTimeout(2000);

          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            submitBtn.click({ force: true, timeout: 5000 }).catch(async () => inputLocator.press('Enter').catch(() => {}))
          ]);

          await page.waitForTimeout(1500);

          const stillCaptcha = await page.locator("img[name='captchaImage'], #captchaImage").isVisible({ timeout: 2500 }).catch(() => false);
          if (!stillCaptcha) {
            this.captchaSuccesses++;
            return true;
          }

          const refreshBtn = page.locator("#captcha, button:has-text('Refresh'), a:has-text('Refresh')").first();
          if (await refreshBtn.isVisible().catch(() => false)) {
            await refreshBtn.click().catch(() => {});
            await page.waitForTimeout(1000);
          }
        } catch (err) {
          await page.waitForTimeout(1000);
        }
      }
    }

    // Manual fallback if headed
    try {
      await page.waitForFunction(() => {
        const hasTenderDetails = document.querySelector("a[href*='download'], a.customButton_link, table.list_table");
        const hasCaptchaImg = document.querySelector("img[name='captchaImage'], #captchaImage");
        return !hasCaptchaImg && !!hasTenderDetails;
      }, undefined, { timeout: 120000 });
      this.captchaSuccesses++;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Processes a downloaded PDF, compresses if needed, and uploads directly to R2.
   */
  async processDownloadedPdf(download, item, processedFileNames, docDesc, docSNo, docDeclaredSize) {
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
        if (isCompressed && fs.existsSync(compressedPath)) pathToUpload = compressedPath;
      }

      const r2Url = await uploadFileToR2({
        filePath: pathToUpload,
        fileName,
        tenderId: item.sourceTenderId,
        publishedDate: item.publishedDate,
        deptCode: item.departmentCode,
        contentType: 'application/pdf'
      });

      if (r2Url) {
        const finalSizeKb = Math.round(fs.statSync(pathToUpload).size / 1024);
        item.pdfUrls.push(r2Url);
        item.nitDocuments.push({
          sNo: docSNo,
          documentName: fileName,
          description: docDesc || "Tender Notice Document",
          documentSizeKb: docDeclaredSize || finalSizeKb,
          fileUrl: r2Url
        });
      }

      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (pathToUpload !== tempPath && fs.existsSync(pathToUpload)) fs.unlinkSync(pathToUpload);
      return !!r2Url;
    } catch (err) {
      logger.error(`Error uploading PDF: ${err.message}`);
      return false;
    }
  }

  /**
   * Uploads downloaded BOQ ZIP archive to R2.
   */
  async processDownloadedZip(zipDownload, item) {
    try {
      const tempZipPath = await zipDownload.path().catch(() => null);
      if (!tempZipPath || !fs.existsSync(tempZipPath)) return false;

      const fileName = zipDownload.suggestedFilename() || `Tender_Packet_${item.sourceTenderId}.zip`;
      const stats = fs.statSync(tempZipPath);
      const fileSizeKb = Math.round(stats.size / 1024);

      const r2Url = await uploadFileToR2({
        filePath: tempZipPath,
        fileName,
        tenderId: item.sourceTenderId,
        publishedDate: item.publishedDate,
        deptCode: item.departmentCode,
        contentType: 'application/zip'
      });

      if (r2Url) {
        item.boqZipUrl = r2Url;
        item.boqFileUrl = r2Url;
        item.zipFileName = fileName;
        item.zipFileSizeKb = fileSizeKb;
        item.boqFetchStatus = 'COMPLETED';
      }

      if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
      return !!r2Url;
    } catch (err) {
      logger.error(`Error uploading BOQ ZIP: ${err.message}`);
      return false;
    }
  }

  /**
   * Saves or updates tender in MongoDB Atlas and uploads self-describing tender.json to Cloudflare R2.
   */
  async saveTenderAndUploadR2(item) {
    let publishedDate = parseISTDate(item.publishedDateStr);
    let publishedDateStr = item.publishedDateStr;

    // Invariant Lock: Published Date can NEVER exceed Document Download or Bid Submission Start Date
    const docStart = parseISTDate(item.documentDownloadStartDateStr);
    const bidStart = parseISTDate(item.bidSubmissionStartDateStr);
    const refStart = (docStart && docStart.getFullYear() >= 2026) ? docStart : ((bidStart && bidStart.getFullYear() >= 2026) ? bidStart : null);
    const refStartStr = (docStart && docStart.getFullYear() >= 2026) ? item.documentDownloadStartDateStr : ((bidStart && bidStart.getFullYear() >= 2026) ? item.bidSubmissionStartDateStr : null);

    if (publishedDate && refStart && publishedDate.getTime() > refStart.getTime()) {
      publishedDate = refStart;
      publishedDateStr = refStartStr;
      item.publishedDateStr = refStartStr;
    }

    const deptCode = item.departmentCode || extractDeptCode(item.sourceTenderId, item.organisationChain);
    const folderKey = formatTenderStorageKey(item.sourceTenderId, publishedDate, deptCode);

    const docToSave = {
      sourcePortal: 'JK_TENDERS',
      sourceTenderId: item.sourceTenderId,
      title: item.title,
      departmentCode: deptCode,
      departmentName: item.departmentName,
      organisationChain: item.organisationChain,
      tenderReferenceNumber: item.tenderReferenceNumber,
      withdrawalAllowed: item.withdrawalAllowed,
      tenderType: item.tenderType,
      formOfContract: item.formOfContract,
      tenderCategory: item.tenderCategory,
      noOfCovers: item.noOfCovers,
      generalTechnicalEvaluationAllowed: item.generalTechnicalEvaluationAllowed,
      itemWiseTechnicalEvaluationAllowed: item.itemWiseTechnicalEvaluationAllowed,
      paymentMode: item.paymentMode,
      isMultiCurrencyAllowedForBOQ: item.isMultiCurrencyAllowedForBOQ,
      isMultiCurrencyAllowedForFee: item.isMultiCurrencyAllowedForFee,
      allowTwoStageBidding: item.allowTwoStageBidding,

      tenderFee: item.tenderFee || 0,
      feePayableTo: item.feePayableTo,
      feePayableAt: item.feePayableAt,
      tenderFeeExemptionAllowed: item.tenderFeeExemptionAllowed,

      emdAmount: item.emdAmount || 0,
      emdExemptionAllowed: item.emdExemptionAllowed,
      emdFeeType: item.emdFeeType,
      emdPercentage: item.emdPercentage,
      emdPayableTo: item.emdPayableTo,
      emdPayableAt: item.emdPayableAt,

      workDescription: item.workDescription,
      ndaPreQualification: item.ndaPreQualification,
      independentExternalMonitorRemarks: item.independentExternalMonitorRemarks,
      estimatedValue: item.estimatedValue || 0,
      productCategory: item.productCategory,
      subCategory: item.subCategory,
      contractType: item.contractType,
      bidValidityDays: item.bidValidityDays || 0,
      periodOfWorkDays: item.periodOfWorkDays || 0,
      location: item.location,
      pincode: item.pincode,
      preBidMeetingPlace: item.preBidMeetingPlace,
      preBidMeetingAddress: item.preBidMeetingAddress,
      preBidMeetingDate: parseISTDate(item.preBidMeetingDate),
      bidOpeningPlace: item.bidOpeningPlace,
      shouldAllowNDATender: item.shouldAllowNDATender,
      allowPreferentialBidder: item.allowPreferentialBidder,
      tendererClass: item.tendererClass,

      publishedDate,
      publishedDateStr: item.publishedDateStr,
      publishedTime: formatStandardTime(item.publishedDateStr || publishedDate),
      publishedDateOnly: extractDateParts(item.publishedDateStr || publishedDate).dateOnly,

      bidOpeningDate: parseISTDate(item.bidOpeningDateStr),
      bidOpeningDateStr: item.bidOpeningDateStr,
      bidOpeningTime: formatStandardTime(item.bidOpeningDateStr),

      documentDownloadStartDate: parseISTDate(item.documentDownloadStartDateStr),
      documentDownloadStartDateStr: item.documentDownloadStartDateStr,
      documentDownloadStartTime: formatStandardTime(item.documentDownloadStartDateStr),

      documentDownloadEndDate: parseISTDate(item.documentDownloadEndDateStr),
      documentDownloadEndDateStr: item.documentDownloadEndDateStr,
      documentDownloadEndTime: formatStandardTime(item.documentDownloadEndDateStr),

      clarificationStartDate: parseISTDate(item.clarificationStartDateStr),
      clarificationStartDateStr: item.clarificationStartDateStr,

      clarificationEndDate: parseISTDate(item.clarificationEndDateStr),
      clarificationEndDateStr: item.clarificationEndDateStr,

      bidSubmissionStartDate: parseISTDate(item.bidSubmissionStartDateStr),
      bidSubmissionStartDateStr: item.bidSubmissionStartDateStr,
      bidSubmissionStartTime: formatStandardTime(item.bidSubmissionStartDateStr),

      bidSubmissionEndDate: parseISTDate(item.bidSubmissionEndDateStr),
      bidSubmissionEndDateStr: item.bidSubmissionEndDateStr,
      bidSubmissionEndTime: formatStandardTime(item.bidSubmissionEndDateStr),

      closingDate: parseISTDate(item.closingDateStr) || parseISTDate(item.bidSubmissionEndDateStr),
      closingDateStr: item.closingDateStr || item.bidSubmissionEndDateStr,
      closingTime: formatStandardTime(item.closingDateStr || item.bidSubmissionEndDateStr),

      offlineInstruments: item.offlineInstruments || [],
      coversInfo: item.coversInfo || [],
      otherImportantDocuments: item.otherImportantDocuments || [],
      nitDocuments: item.nitDocuments || [],
      workItemDocuments: item.workItemDocuments || [],
      pdfUrls: item.pdfUrls || [],
      boqZipUrl: item.boqZipUrl || null,
      boqFileUrl: item.boqFileUrl || null,
      zipFileName: item.zipFileName || null,
      zipFileSizeKb: item.zipFileSizeKb || null,
      isDocumentAvailable: item.isDocumentAvailable !== false,
      pdfFetchStatus: item.pdfFetchStatus || (item.pdfUrls?.length > 0 ? 'COMPLETED' : 'PENDING'),
      boqFetchStatus: item.boqFetchStatus || (item.boqZipUrl ? 'COMPLETED' : 'PENDING'),

      invitingAuthorityName: item.invitingAuthorityName,
      invitingAuthorityAddress: item.invitingAuthorityAddress,
      isMultiTender: !!item.isMultiTender,
      baseTenderId: item.baseTenderId || null,
      relatedTenderIds: Array.isArray(item.relatedTenderIds) ? item.relatedTenderIds : [],
      r2StorageKey: folderKey,
      status: 'ACTIVE',
      updatedAt: new Date()
    };

    // 1. Upsert in MongoDB Atlas
    const saved = await Tender.findOneAndUpdate(
      { sourcePortal: 'JK_TENDERS', sourceTenderId: item.sourceTenderId },
      { $set: docToSave },
      { upsert: true, returnDocument: 'after' }
    ).lean();

    // 1b. If part of a multi-tender group, link sibling tenders mutually
    if (saved.isMultiTender && saved.baseTenderId) {
      await Tender.updateMany(
        {
          sourcePortal: 'JK_TENDERS',
          $or: [
            { baseTenderId: saved.baseTenderId },
            { tenderReferenceNumber: saved.tenderReferenceNumber }
          ],
          sourceTenderId: { $ne: saved.sourceTenderId }
        },
        {
          $set: { isMultiTender: true, baseTenderId: saved.baseTenderId },
          $addToSet: { relatedTenderIds: saved.sourceTenderId }
        }
      ).catch(() => {});
    }

    // 2. Upload tender.json directly to Cloudflare R2
    try {
      await uploadJsonToR2({
        jsonData: saved,
        fileName: 'tender.json',
        tenderId: item.sourceTenderId,
        publishedDate,
        deptCode
      });
    } catch (r2Err) {
      logger.warn(`Could not upload tender.json to R2 for ${item.sourceTenderId}: ${r2Err.message}`);
    }

    return saved;
  }

  /**
   * Navigates back one level from Tender Details to the intermediate multi-item sub-table.
   */
  async navigateBackFromTenderDetails(page) {
    try {
      const backBtn = page.locator("a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back'), input[value='Back']").last();
      if (await backBtn.count() > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
          backBtn.click({ timeout: 5000 }).catch(() => {})
        ]);
        await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 20000 }).catch(() => {});
        return true;
      }
    } catch (e) {
      // Fallback
    }
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 20000 }).catch(() => {});
    return true;
  }

  /**
   * Ensures the browser returns safely to the organisation tender list.
   */
  async ensureOnOrganisationTenderList(page, orgName, orgPageNum = 1) {
    try {
      const onList = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        return text.includes('Organisation Chain') && text.includes('Title and Ref.No./Tender ID');
      }).catch(() => false);

      if (onList) return true;

      const backBtn = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back')").last();
      if (await backBtn.count() > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
          backBtn.click({ timeout: 5000 }).catch(() => {})
        ]);
        await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 20000 }).catch(() => {});
        return true;
      }
    } catch (e) {
      // If lost, return from directory
      await page.goto(this.departmentRootUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      const orgRow = page.locator("table#table tr[id^='informal']").filter({ hasText: orgName }).first();
      await orgRow.locator("td:nth-child(3) a").first().click();
      await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 25000 }).catch(() => {});
    }
  }

  /**
   * Returns from an organisation's tender list back to the main organisation directory.
   */
  async returnToOrganisationDirectory(page) {
    try {
      const topBackBtn = page.locator("a#DirectLink_0_0, a.customButton_link:has-text('Back'), a:has-text('Back')").first();
      if (await topBackBtn.count() > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          topBackBtn.click({ timeout: 5000 }).catch(() => {})
        ]);
      } else {
        await page.goto(this.departmentRootUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      }
      await page.waitForSelector("table#table tr[id^='informal']", { timeout: 25000 }).catch(() => {});
    } catch (e) {
      await page.goto(this.departmentRootUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    }
  }

  /**
   * Dedicated recovery worker: fetches tenders stored in pending_document_tenders collection
   * whose document download start date has arrived (or all if forceAll).
   */
  async fetchPendingDocuments(options = {}) {
    const limit = options.limit || 50;
    const isHeadless = options.headless !== false && process.env.SCRAPER_HEADLESS !== 'false';
    const forceAll = !!options.all;
    const specificId = options.id || null;

    console.log(`\n======================================================================`);
    console.log(`🚀 JKTENDERS PENDING DOCUMENTS RECOVERY WORKER`);
    console.log(`======================================================================`);
    console.log(`🎯 Mode:              ${forceAll ? 'CHECK ALL PENDING' : 'READY TO DOWNLOAD ONLY'}`);
    console.log(`📋 Max Limit:         ${limit}`);
    console.log(`🌐 Headless:          ${isHeadless}`);
    if (specificId) console.log(`🎯 Target Tender:     ${specificId}`);
    console.log(`======================================================================\n`);

    const now = new Date();
    const query = {
      status: { $in: ['AWAITING_DOWNLOAD_DATE', 'READY_TO_DOWNLOAD'] }
    };

    if (specificId) {
      query.sourceTenderId = specificId;
    } else if (!forceAll) {
      query.$or = [
        { documentDownloadStartDate: { $lte: now } },
        { documentDownloadStartDate: null },
        { status: 'READY_TO_DOWNLOAD' }
      ];
    }

    const pendingList = await PendingDocumentTender.find(query).sort({ documentDownloadStartDate: 1 }).limit(limit).lean();

    if (pendingList.length === 0) {
      console.log(`ℹ️ No pending document tenders ready for download at this time.`);
      return { totalChecked: 0, recoveredCount: 0, stillPendingCount: 0, totalPdfsSecured: 0, totalBoqsSecured: 0 };
    }

    console.log(`📋 Found ${pendingList.length} tender(s) in pending_document_tenders ready for document fetching.\n`);

    this.browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    this.context = await this.browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await this.context.newPage();
    let recoveredCount = 0;
    let stillPendingCount = 0;
    let totalPdfsSecured = 0;
    let totalBoqsSecured = 0;

    // Group pending tenders by departmentName
    const byOrg = {};
    for (const item of pendingList) {
      const org = item.departmentName || 'General';
      if (!byOrg[org]) byOrg[org] = [];
      byOrg[org].push(item);
    }

    try {
      for (const [orgName, tenders] of Object.entries(byOrg)) {
        console.log(`\n🏛️ Organisation: "${orgName}" (${tenders.length} pending tenders to check)`);
        await page.goto(this.departmentRootUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector("table#table tr[id^='informal']", { timeout: 35000 }).catch(() => {});

        const orgRow = page.locator("table#table tr[id^='informal']").filter({ hasText: orgName }).first();
        const countLink = orgRow.locator("td:nth-child(3) a, a.link2, a").first();

        if (await countLink.count() === 0) {
          console.log(`   ⚠️ Could not locate organisation link for "${orgName}", checking next...`);
          stillPendingCount += tenders.length;
          continue;
        }

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
          countLink.click({ noWaitAfter: true, timeout: 20000 }).catch(() => countLink.click({ force: true, noWaitAfter: true }))
        ]);
        await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 35000 }).catch(() => {});
        await this.humanDelay(page, 400, 700);

        for (const targetTender of tenders) {
          console.log(`\n👉 Checking Pending Tender: ${targetTender.sourceTenderId}`);
          console.log(`   🔖 Title: "${targetTender.title.slice(0, 70)}..."`);
          console.log(`   🕒 Scheduled Download Start: "${targetTender.documentDownloadStartDateStr || 'None'}"`);

          let foundLink = page.locator("table.list_table tr[id^='informal']")
            .filter({ hasText: targetTender.sourceTenderId })
            .locator("td:nth-child(5) a, a")
            .first();

          let tenderFound = (await foundLink.count()) > 0;
          let currentPage = 1;

          while (!tenderFound && currentPage < 5) {
            currentPage++;
            const hasNext = await page.evaluate((pg) => {
              const links = Array.from(document.querySelectorAll('a'));
              const target = links.find(l => l.textContent.trim() === String(pg));
              if (target) { target.click(); return true; }
              return false;
            }, currentPage);

            if (hasNext) {
              await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 25000 }).catch(() => {});
              await this.humanDelay(page, 400, 700);
              foundLink = page.locator("table.list_table tr[id^='informal']")
                .filter({ hasText: targetTender.sourceTenderId })
                .locator("td:nth-child(5) a, a")
                .first();
              tenderFound = (await foundLink.count()) > 0;
            } else {
              break;
            }
          }

          if (!tenderFound) {
            console.log(`   ⚠️ Tender ${targetTender.sourceTenderId} not currently visible in listing pages for "${orgName}".`);
            await PendingDocumentTender.updateOne(
              { sourceTenderId: targetTender.sourceTenderId },
              { $set: { lastCheckedAt: new Date() }, $inc: { attemptCount: 1 } }
            );
            stillPendingCount++;
            continue;
          }

          // Click tender
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
            foundLink.click({ noWaitAfter: true, timeout: 15000 }).catch(() => foundLink.click({ force: true, noWaitAfter: true }))
          ]);
          await page.waitForSelector("table:has-text('Basic Details'), table:has-text('Critical Dates')", { timeout: 30000 }).catch(() => {});
          await this.humanDelay(page, 400, 650);

          const rowSummary = {
            sourceTenderId: targetTender.sourceTenderId,
            title: targetTender.title,
            publishedDateStr: targetTender.publishedDateStr,
            closingDateStr: targetTender.documentDownloadEndDateStr,
            hasLink: true
          };

          const { processedItem, pdfCount, boqCount, hasDocuments, docReason } = await this.scrapeDetailAndDocuments(page, rowSummary, orgName);

          if (hasDocuments) {
            recoveredCount++;
            if (pdfCount > 0) totalPdfsSecured += pdfCount;
            if (boqCount > 0) totalBoqsSecured += boqCount;

            // Save to primary MongoDB collection & upload tender.json
            const saved = await this.saveTenderAndUploadR2(processedItem);

            // Mark as DOWNLOADED in pending_document_tenders
            await PendingDocumentTender.updateOne(
              { sourceTenderId: targetTender.sourceTenderId },
              {
                $set: {
                  status: 'DOWNLOADED',
                  downloadedAt: new Date(),
                  lastCheckedAt: new Date()
                }
              }
            );

            console.log(`   🎉 [DOCUMENTS RECOVERED] ${saved.sourceTenderId}`);
            console.log(`      📄 PDFs: ${saved.pdfUrls?.length || 0} secured`);
            console.log(`      📦 BOQ:  ${saved.boqZipUrl ? 'Secured ✅' : 'None'}`);
          } else {
            stillPendingCount++;
            console.log(`   ⏳ Still without documents: ${docReason}`);
            await PendingDocumentTender.updateOne(
              { sourceTenderId: targetTender.sourceTenderId },
              {
                $set: {
                  reason: docReason,
                  lastCheckedAt: new Date()
                },
                $inc: { attemptCount: 1 }
              }
            );
          }

          // Return to organisation list
          await this.ensureOnOrganisationTenderList(page, orgName, currentPage);
          await this.humanDelay(page, 300, 500);
        }
      }

      console.log(`\n======================================================================`);
      console.log(`🏁 PENDING DOCUMENTS RECOVERY SUMMARY`);
      console.log(`======================================================================`);
      console.log(`📋 Total Checked:                     ${pendingList.length}`);
      console.log(`🎉 Documents Recovered & Saved:       ${recoveredCount}`);
      console.log(`⏳ Still Pending (Awaiting Release):  ${stillPendingCount}`);
      console.log(`📄 NIT PDFs Secured:                 ${totalPdfsSecured}`);
      console.log(`📦 BOQ ZIPs Secured:                 ${totalBoqsSecured}`);
      console.log(`🔐 Captchas Encountered / Solved:     ${this.captchaAttempts} / ${this.captchaSuccesses}`);
      console.log(`======================================================================\n`);

      return {
        totalChecked: pendingList.length,
        recoveredCount,
        stillPendingCount,
        totalPdfsSecured,
        totalBoqsSecured,
        totalCaptchaAttempts: this.captchaAttempts,
        totalCaptchaSuccess: this.captchaSuccesses
      };

    } finally {
      await this.closeBrowser();
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
    }
  }
}

export default JKTenderDateAdapter;
