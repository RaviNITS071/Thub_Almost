/**
 * @file backend/src/scripts/fetchTendersByDate.js
 * @description Command-line runner to fetch all tenders published on a customized date (or today).
 * 
 * Features:
 * - Runs through all organisations in "Tenders by Organisation".
 * - Scrapes and stores all tenders published on the specified date.
 * - Downloads all NIT PDFs and BOQ zip archives, uploads them to Cloudflare R2, and saves to MongoDB.
 * - Fast early-exit: Stops scanning each organisation as soon as tenders are older than the target date.
 * 
 * Usage:
 *   # Fetch all tenders published TODAY (default in IST):
 *   node src/scripts/fetchTendersByDate.js
 * 
 *   # Fetch all tenders published on a SPECIFIC date:
 *   node src/scripts/fetchTendersByDate.js --date "22/09/2026"
 *   node src/scripts/fetchTendersByDate.js --date "22-Sep-2026"
 *   node src/scripts/fetchTendersByDate.js --date "2026-09-22"
 * 
 *   # Filter by specific organisation:
 *   node src/scripts/fetchTendersByDate.js --date "22/09/2026" --org "Rural Development"
 * 
 *   # Force re-download even if already complete:
 *   node src/scripts/fetchTendersByDate.js --force
 * 
 *   # Watch in visible browser (headed mode):
 *   node src/scripts/fetchTendersByDate.js --headed
 */

import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import { JKTenderDateAdapter, normalizeTargetDate } from '../services/adapters/JKTenderDateAdapter.js';
import { telegramService } from '../services/telegram.service.js';

async function main() {
  const args = process.argv.slice(2);

  // 1. Parse arguments
  let dateArg = null;
  let orgFilter = null;
  let excludeOrg = null;
  let limit = Infinity;
  let force = false;
  let isHeadless = true;
  let shard = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--date' || a === '-d') && args[i + 1]) {
      dateArg = args[i + 1];
      i++;
    } else if ((a === '--org' || a === '-o') && args[i + 1]) {
      orgFilter = args[i + 1];
      i++;
    } else if ((a === '--exclude-org' || a === '--exclude' || a === '-x') && args[i + 1]) {
      excludeOrg = args[i + 1];
      i++;
    } else if ((a === '--limit' || a === '-l') && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (a === '--force' || a === '-f') {
      force = true;
    } else if (a === '--headed') {
      isHeadless = false;
    } else if (a === '--headless' && args[i + 1] === 'false') {
      isHeadless = false;
      i++;
    } else if ((a === '--shard' || a === '-s' || a === '--instance') && args[i + 1]) {
      shard = args[i + 1];
      i++;
    } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(a) || /^\d{4}-\d{2}-\d{2}$/.test(a)) {
      dateArg = a;
    }
  }

  const dateConfig = normalizeTargetDate(dateArg);
  const startTime = Date.now();

  console.log(`\n======================================================================`);
  console.log(`📅 JKTENDERS DATE-TARGETED INGESTION RUNNER`);
  console.log(`======================================================================`);
  console.log(`🎯 Target Published Date: ${dateConfig.displayString} ("${dateConfig.targetDatePrefix}")`);
  console.log(`🏛️ Organisation Filter:   ${orgFilter || 'ALL ORGANISATIONS'}`);
  if (excludeOrg) console.log(`🚫 Excluded Organisation: ${excludeOrg}`);
  if (shard) console.log(`🔀 Distributed Shard:     ${shard}`);
  console.log(`🌐 Headless Mode:         ${isHeadless}`);
  console.log(`⚡ Force Re-download:     ${force}`);
  console.log(`🎯 Limit:                 ${limit === Infinity ? 'Unlimited' : limit}`);
  console.log(`======================================================================\n`);

  await connectDB();

  // Send Telegram crawl started update (if configured)
  try {
    await telegramService.sendCrawlStarted?.({
      mode: `TARGETED DATE (${dateConfig.displayString})${shard ? ` [Shard ${shard}]` : ''}`,
      targetLimit: orgFilter ? `Org: ${orgFilter}` : (shard ? `Shard ${shard}` : 'All Organisations')
    });
  } catch {}

  const adapter = new JKTenderDateAdapter();

  // Handle graceful interrupts
  const handleInterrupt = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Closing browser and cleaning up...`);
    await adapter.closeBrowser().catch(() => {});
    await closeDB();
    process.exit(0);
  };
  process.once('SIGINT', () => handleInterrupt('SIGINT'));
  process.once('SIGTERM', () => handleInterrupt('SIGTERM'));

  try {
    const summary = await adapter.fetchTendersByDate({
      targetDate: dateConfig.targetDatePrefix,
      orgFilter,
      excludeOrg,
      shard,
      headless: isHeadless,
      force,
      limit
    });

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const elapsedMinutes = (elapsedSeconds / 60).toFixed(1);

    console.log(`\n======================================================================`);
    console.log(`🏁 INGESTION & DOCUMENT METRICS: ${dateConfig.displayString}`);
    console.log(`======================================================================`);
    console.log(`⏱️ Duration:                          ${elapsedSeconds}s (~${elapsedMinutes} min)`);
    console.log(`🔐 Captchas Encountered / Solved:     ${summary.totalCaptchaAttempts || 0} attempts (${summary.totalCaptchaSuccess || 0} solved)`);
    console.log(`📋 Total Inspected Across Portal:     ${summary.totalInspected}`);
    console.log(`🎯 Total Matching Published Date:     ${summary.totalTargetDateFound}`);
    console.log(`✅ Tenders WITH Documents Secured:    ${summary.totalWithDocuments || 0}`);
    console.log(`⏳ Tenders WITHOUT Documents Yet:     ${summary.totalWithoutDocuments || 0} (Stored in pending_document_tenders)`);
    console.log(`📄 NIT PDFs Secured to R2:            ${summary.totalPdfsSecured}`);
    console.log(`📦 BOQ ZIPs Secured to R2:            ${summary.totalBoqsSecured}`);
    console.log(`⏩ Skipped (Already Complete in DB):  ${summary.totalSkippedAlreadyComplete}`);
    console.log(`======================================================================\n`);

    // Send Telegram finished notification (if configured)
    try {
      await telegramService.sendCrawlFinished?.({
        totalProcessed: summary.totalIngested,
        pdfsSecured: summary.totalPdfsSecured,
        missingPdfs: 0,
        elapsedSeconds
      });
    } catch {}

  } catch (err) {
    console.error(`\n❌ Error running date ingestion:`, err);
  } finally {
    await closeDB();
  }
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeDB();
  process.exit(1);
});
