/**
 * @file backend/src/scripts/fetchPendingDocTenders.js
 * @description Standalone command-line runner to fetch documents for tenders stored in
 * the 'pending_document_tenders' collection once their document download start date has arrived.
 * 
 * Usage:
 *   # Fetch all pending tenders ready for download now:
 *   node src/scripts/fetchPendingDocTenders.js
 * 
 *   # Force check ALL pending tenders (even if download date is future):
 *   node src/scripts/fetchPendingDocTenders.js --all
 * 
 *   # Check a specific tender:
 *   node src/scripts/fetchPendingDocTenders.js --id "2026_SWCD_325683_1"
 * 
 *   # Limit batch size:
 *   node src/scripts/fetchPendingDocTenders.js --limit 20
 */

import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import { JKTenderDateAdapter } from '../services/adapters/JKTenderDateAdapter.js';
import { telegramService } from '../services/telegram.service.js';

async function main() {
  const args = process.argv.slice(2);

  let limit = 50;
  let forceAll = false;
  let specificId = null;
  let isHeadless = true;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--limit' || a === '-l') && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (a === '--all' || a === '-a') {
      forceAll = true;
    } else if ((a === '--id' || a === '-t') && args[i + 1]) {
      specificId = args[i + 1];
      i++;
    } else if (a === '--headed') {
      isHeadless = false;
    } else if (a === '--headless' && args[i + 1] === 'false') {
      isHeadless = false;
      i++;
    }
  }

  const startTime = Date.now();

  console.log(`\n======================================================================`);
  console.log(`🚀 JKTENDERS PENDING DOCUMENTS RECOVERY RUNNER`);
  console.log(`======================================================================`);
  console.log(`🎯 Mode:              ${forceAll ? 'CHECK ALL PENDING' : 'READY TO DOWNLOAD ONLY'}`);
  console.log(`📋 Max Limit:         ${limit}`);
  console.log(`🌐 Headless:          ${isHeadless}`);
  if (specificId) console.log(`🎯 Specific Tender:   ${specificId}`);
  console.log(`======================================================================\n`);

  await connectDB();

  try {
    await telegramService.sendCrawlStarted?.({
      mode: `PENDING DOCUMENTS RECOVERY`,
      targetLimit: specificId ? `Tender: ${specificId}` : `Limit: ${limit}`
    });
  } catch {}

  const adapter = new JKTenderDateAdapter();

  const handleInterrupt = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Closing browser and cleaning up...`);
    await adapter.closeBrowser().catch(() => {});
    await closeDB();
    process.exit(0);
  };
  process.once('SIGINT', () => handleInterrupt('SIGINT'));
  process.once('SIGTERM', () => handleInterrupt('SIGTERM'));

  try {
    const summary = await adapter.fetchPendingDocuments({
      limit,
      headless: isHeadless,
      all: forceAll,
      id: specificId
    });

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const elapsedMinutes = (elapsedSeconds / 60).toFixed(1);

    console.log(`\n======================================================================`);
    console.log(`🏁 RECOVERY RUN FINISHED`);
    console.log(`======================================================================`);
    console.log(`⏱️ Duration:                          ${elapsedSeconds}s (~${elapsedMinutes} min)`);
    console.log(`📋 Total Checked:                     ${summary.totalChecked}`);
    console.log(`🎉 Documents Recovered & Saved:       ${summary.recoveredCount}`);
    console.log(`⏳ Still Pending (Awaiting Release):  ${summary.stillPendingCount}`);
    console.log(`📄 NIT PDFs Secured to R2:            ${summary.totalPdfsSecured}`);
    console.log(`📦 BOQ ZIPs Secured to R2:            ${summary.totalBoqsSecured}`);
    console.log(`🔐 Captchas Encountered / Solved:     ${summary.totalCaptchaAttempts || 0} / ${summary.totalCaptchaSuccess || 0}`);
    console.log(`======================================================================\n`);

    try {
      await telegramService.sendCrawlFinished?.({
        totalProcessed: summary.recoveredCount,
        pdfsSecured: summary.totalPdfsSecured,
        missingPdfs: summary.stillPendingCount,
        elapsedSeconds
      });
    } catch {}

  } catch (err) {
    console.error(`\n❌ Error running pending document recovery:`, err);
  } finally {
    await closeDB();
  }
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeDB();
  process.exit(1);
});
