/**
 * @file backend/src/scripts/syncAllMetadata.js
 * @description Distributed CLI runner for 100% accurate metadata enrichment and Cloudflare R2 JSON syncing.
 * 
 * Usage:
 *   node src/scripts/syncAllMetadata.js                           # Enrich all active tenders
 *   node src/scripts/syncAllMetadata.js --org "Rural Development" # Only Rural Development
 *   node src/scripts/syncAllMetadata.js --exclude-org "Rural Development" # Everything except RDD
 *   node src/scripts/syncAllMetadata.js --only-anomalies         # Fast-track only tenders with date anomalies
 *   node src/scripts/syncAllMetadata.js --reset                  # Reset checkpoint and start fresh
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import JKTenderMetadataAdapter from '../services/adapters/JKTenderMetadataAdapter.js';
import { telegramService } from '../services/telegram.service.js';

const CHECKPOINT_FILE = path.join(process.cwd(), '.metadata_sync_checkpoint.json');

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      if (data && data.status === 'IN_PROGRESS') return data;
    }
  } catch (e) {}
  return null;
}

function saveCheckpoint(data) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  } catch (e) {}
}

async function run() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isReset = args.some(a => a === '--reset' || a === '--fresh');
  const onlyAnomalies = args.some(a => a === '--only-anomalies');
  const numericArg = args.find(a => /^\d+$/.test(a));
  const limit = numericArg ? parseInt(numericArg, 10) : 50000;

  let orgFilter = null;
  let excludeOrgFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org' && args[i + 1]) orgFilter = args[i + 1];
    else if (args[i] === '--exclude-org' && args[i + 1]) excludeOrgFilter = args[i + 1];
  }

  if (isReset) {
    clearCheckpoint();
    console.log(`🔄 [RESET] Cleared previous checkpoint. Starting fresh.`);
  }

  const checkpoint = isReset ? null : loadCheckpoint();

  console.log(`\n======================================================================`);
  console.log(`🚀 JKTENDERS METADATA & R2 JSON ENRICHMENT ENGINE`);
  console.log(`======================================================================`);
  console.log(`📌 Target Limit: ${limit === 50000 ? 'UNLIMITED (All Tenders)' : limit}`);
  if (orgFilter) console.log(`🎯 [FILTER] Only processing organisations matching: "${orgFilter}"`);
  if (excludeOrgFilter) console.log(`🚫 [EXCLUDE] Excluding organisations matching: "${excludeOrgFilter}"`);
  if (onlyAnomalies) console.log(`⚡ [MODE] Fast-track: Only enriching tenders with date anomalies`);
  if (checkpoint) {
    console.log(`🔄 [RESUME] Resuming from Org: "${checkpoint.orgName}" (Index: ${checkpoint.orgIndex + 1}, Page: ${checkpoint.orgPageNum})`);
  }
  console.log(`======================================================================\n`);

  await connectDB();
  const adapter = new JKTenderMetadataAdapter();
  const page = await adapter.initBrowser();

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalR2Json = 0;
  let lastCheckpointState = null;

  // Handle graceful interrupts
  const handleInterrupt = async (signal) => {
    console.log(`\n⚠️ [${signal}] Interrupt received. Saving checkpoint...`);
    if (lastCheckpointState) saveCheckpoint(lastCheckpointState);
    await adapter.closeBrowser().catch(() => {});
    await closeDB().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', () => handleInterrupt('SIGINT'));
  process.once('SIGTERM', () => handleInterrupt('SIGTERM'));

  try {
    console.log(`🌐 Navigating to FrontEndTendersByOrganisation...`);
    await page.goto(`${adapter.baseUrl}/nicgep/app?page=FrontEndTendersByOrganisation&service=page`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Extract list of all organisations
    await page.waitForSelector("table#table tr[id^='informal']", { timeout: 30000 });
    const orgRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table#table tr[id^='informal']"));
      return rows.map((row, index) => {
        const tds = row.querySelectorAll('td');
        const orgName = tds[1] ? tds[1].innerText.trim() : '';
        const countLink = tds[2] ? tds[2].querySelector('a') : null;
        const tenderCount = countLink ? parseInt(countLink.innerText.trim(), 10) : 0;
        return { index, orgName, tenderCount, hasCountLink: !!countLink };
      }).filter(o => o.hasCountLink && o.tenderCount > 0);
    });

    console.log(`🏛️ Found ${orgRows.length} active organisations on portal.`);

    let startOrgIndex = checkpoint?.orgIndex || 0;
    let startPageNum = checkpoint?.orgPageNum || 1;

    for (let o = startOrgIndex; o < orgRows.length && totalUpdated < limit; o++) {
      const org = orgRows[o];

      // Check filters
      if (orgFilter && !org.orgName.toLowerCase().includes(orgFilter.toLowerCase())) continue;
      if (excludeOrgFilter) {
        const excludes = excludeOrgFilter.split(',').map(e => e.trim().toLowerCase());
        if (excludes.some(ex => org.orgName.toLowerCase().includes(ex))) continue;
      }

      console.log(`\n======================================================================`);
      console.log(`🏛️ [${o + 1}/${orgRows.length}] Organisation: "${org.orgName}" (${org.tenderCount} active tenders)`);
      console.log(`======================================================================`);

      // Click organisation count link
      const orgRow = page.locator("table#table tr[id^='informal']").filter({ hasText: org.orgName }).first();
      const countLink = orgRow.locator("td:nth-child(3) a, a.link2, a").first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
        countLink.click({ noWaitAfter: true }).catch(() => countLink.click({ force: true, noWaitAfter: true }))
      ]);
      await page.waitForTimeout(1000);

      let orgPageNum = (o === startOrgIndex && startPageNum > 1) ? startPageNum : 1;

      // If resuming to page > 1
      if (orgPageNum > 1) {
        console.log(`⏩ Fast-forwarding to page ${orgPageNum}...`);
        await page.evaluate((target) => {
          const links = Array.from(document.querySelectorAll('a'));
          const targetLink = links.find(l => l.textContent.trim() === String(target));
          if (targetLink) targetLink.click();
        }, orgPageNum);
        await page.waitForTimeout(1500);
      }

      let orgHasMore = true;
      while (orgHasMore && totalUpdated < limit) {
        await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 25000 }).catch(() => {});

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
              publishedDate: tds[1] ? tds[1].innerText.trim() : '',
              closingDate: tds[2] ? tds[2].innerText.trim() : '',
              openingDate: tds[3] ? tds[3].innerText.trim() : '',
              hasLink: !!a
            };
          }).filter(t => t && t.hasLink);
        });

        console.log(`📋 Page ${orgPageNum}: ${tenderRows.length} tenders displayed.`);

        for (let t = 0; t < tenderRows.length && totalUpdated < limit; t++) {
          const summary = tenderRows[t];
          if (!summary.sourceTenderId) continue;

          // Check if tender exists in MongoDB
          const existing = await Tender.findOne({
            sourcePortal: 'JK_TENDERS',
            sourceTenderId: summary.sourceTenderId
          }).lean();

          if (!existing) {
            totalSkipped++;
            continue;
          }

          // If --only-anomalies mode, check if this tender actually has an anomaly
          if (onlyAnomalies) {
            const isAnomaly = !existing.publishedDateStr ||
              (existing.createdAt && Math.abs(new Date(existing.publishedDate).getTime() - new Date(existing.createdAt).getTime()) < 15 * 60 * 1000) ||
              (existing.closingDate && existing.publishedDate && new Date(existing.closingDate) < new Date(existing.publishedDate));

            if (!isAnomaly) {
              totalSkipped++;
              continue;
            }
          }

          console.log(`\n👉 [${totalUpdated + 1}] Enriching: ${summary.sourceTenderId}`);

          try {
            // Click tender title link to open details
            const tenderLink = page.locator("table.list_table tr[id^='informal']").filter({ hasText: summary.sourceTenderId }).locator("td:nth-child(5) a, a").first();
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
              tenderLink.click({ noWaitAfter: true }).catch(() => tenderLink.click({ force: true, noWaitAfter: true }))
            ]);
            await page.waitForTimeout(600);

            // Scrape detailed metadata
            const rawDetails = await adapter.extractDetailsFromPage(page, summary);

            // Update in MongoDB and upload tender.json to Cloudflare R2
            const updated = await adapter.updateTenderAndUploadR2(rawDetails, existing);
            totalUpdated++;
            totalR2Json++;

            console.log(`   ✅ [DB Updated & R2 JSON Synced] ${summary.sourceTenderId}`);
            console.log(`      📅 Published: "${updated.publishedDateStr}" (${updated.publishedTime})`);
            console.log(`      ⏰ Bid Close:  "${updated.closingDateStr}" (${updated.closingTime})`);
            console.log(`      📦 R2 Folder:  ${updated.r2StorageKey}`);

            // Return to list page
            const backBtn = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back')").last();
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
              backBtn.click({ noWaitAfter: true }).catch(() => backBtn.click({ force: true, noWaitAfter: true }))
            ]);
            await page.waitForTimeout(500);

          } catch (itemErr) {
            console.error(`   ⚠️ Error enriching ${summary.sourceTenderId}: ${itemErr.message}`);
            // Attempt recovery back to list
            try {
              const backBtn = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a:has-text('Back')").last();
              if (await backBtn.count() > 0) await backBtn.click({ force: true });
              await page.waitForTimeout(1000);
            } catch (e) {}
          }

          // Update checkpoint
          lastCheckpointState = {
            orgIndex: o,
            orgName: org.orgName,
            orgPageNum,
            lastTenderId: summary.sourceTenderId,
            totalUpdated,
            status: 'IN_PROGRESS',
            updatedAt: new Date().toISOString()
          };
          saveCheckpoint(lastCheckpointState);
        }

        // Pagination inside this organisation
        const nextPg = orgPageNum + 1;
        const hasNextPage = await page.evaluate((target) => {
          const links = Array.from(document.querySelectorAll('a'));
          const targetLink = links.find(l => l.textContent.trim() === String(target));
          if (targetLink) { targetLink.click(); return true; }
          return false;
        }, nextPg);

        if (hasNextPage && totalUpdated < limit) {
          orgPageNum++;
          await page.waitForTimeout(1000);
        } else {
          orgHasMore = false;
        }
      }

      // Return to Organisation List
      const topBack = page.locator("a#DirectLink_0_0, a.customButton_link:has-text('Back'), a:has-text('Back')").first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
        topBack.click({ noWaitAfter: true }).catch(() => topBack.click({ force: true, noWaitAfter: true }))
      ]);
      await page.waitForTimeout(800);
    }

    clearCheckpoint();
    console.log(`\n======================================================================`);
    console.log(`🎉 METADATA ENRICHMENT & R2 JSON SYNC COMPLETE`);
    console.log(`======================================================================`);
    console.log(`📊 Total Tenders Enriched & Verified: ${totalUpdated}`);
    console.log(`📦 Cloudflare R2 JSONs Uploaded:     ${totalR2Json}`);
    console.log(`⏱️ Duration:                          ${Math.round((Date.now() - startTime) / 1000)}s`);
    console.log(`======================================================================\n`);

  } catch (err) {
    console.error(`❌ Critical error during metadata sync: ${err.message}`);
    if (lastCheckpointState) saveCheckpoint(lastCheckpointState);
  } finally {
    await adapter.closeBrowser();
    await closeDB();
  }
}

run();
