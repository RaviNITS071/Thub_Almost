import 'dotenv/config';
import { JKTenderAdapter } from '../services/adapters/JKTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import SyncJob from '../models/SyncJob.js';
import { telegramService } from '../services/telegram.service.js';
import fs from 'fs';
import path from 'path';

const CHECKPOINT_FILE = path.join(process.cwd(), '.crawl_checkpoint.json');

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      if (data && data.status === 'IN_PROGRESS') {
        return data;
      }
    }
  } catch (e) {
    // If corrupt, ignore
  }
  return null;
}

function saveCheckpoint(data) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('⚠️ Could not save checkpoint to disk:', e.message);
  }
}

function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }
  } catch (e) {}
}

async function run() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isReset = args.some(a => a === '--reset' || a === '--fresh');
  const numericArg = args.find(a => /^\d+$/.test(a));
  const limit = numericArg ? parseInt(numericArg, 10) : 50000;

  let orgFilter = null;
  let excludeOrgFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org' && args[i + 1]) {
      orgFilter = args[i + 1];
    } else if (args[i] === '--exclude-org' && args[i + 1]) {
      excludeOrgFilter = args[i + 1];
    }
  }

  if (isReset) {
    clearCheckpoint();
    console.log(`\n🔄 [RESET] Cleared previous checkpoint. Starting fresh from Organisation #1.`);
  }

  if (orgFilter) {
    console.log(`🎯 [FILTER] Only processing organisations matching: "${orgFilter}"`);
  }
  if (excludeOrgFilter) {
    console.log(`🚫 [EXCLUDE] Excluding organisations matching: "${excludeOrgFilter}"`);
  }

  let checkpoint = isReset ? null : loadCheckpoint();
  let resumeFrom = null;

  console.log(`\n======================================================================`);
  console.log(`🚀 [COMMAND 1] FULL INITIAL CRAWL: ALL ACTIVE TENDERS`);
  console.log(`======================================================================`);
  console.log(`📌 Source: Tenders by Organisation (FrontEndTendersByOrganisation)`);
  console.log(`📌 Target Limit: ${limit === 50000 ? 'UNLIMITED (All Active Tenders)' : limit}`);
  console.log(`📌 Deduplication: ENABLED (Skips completed tenders)`);

  if (checkpoint) {
    resumeFrom = {
      orgIndex: checkpoint.orgIndex || 0,
      orgName: checkpoint.orgName || '',
      orgPageNum: checkpoint.orgPageNum || 1,
      lastTenderId: checkpoint.lastTenderId || null
    };
    console.log(`🔄 RESUME DETECTED! Resuming interrupted crawl:`);
    console.log(`   🏛️ Organisation: "${checkpoint.orgName}" (Index: ${(checkpoint.orgIndex || 0) + 1})`);
    console.log(`   📄 Page: ${checkpoint.orgPageNum || 1}`);
    console.log(`   🎯 Last Processed Tender: ${checkpoint.lastTenderId || 'None'}`);
    console.log(`   📊 Previously Processed: ${checkpoint.totalProcessed || 0} tenders`);
    console.log(`   📅 Interrupted At: ${checkpoint.updatedAt || 'N/A'}`);
    console.log(`👉 (To restart from beginning instead, run: npm run scrape:all -- --reset)`);
  } else {
    console.log(`📌 Mode: Starting from Organisation #1`);
  }
  console.log(`======================================================================\n`);

  // Send Telegram crawl started update
  await telegramService.sendCrawlStarted({
    mode: 'FULL',
    targetLimit: limit === 50000 ? 'All Active Tenders (~6,000)' : limit,
    resumed: Boolean(checkpoint),
    resumeDetails: checkpoint
  });

  await connectDB();
  const adapter = new JKTenderAdapter();

  let syncJob = null;
  let savedCount = 0;
  let skippedCount = 0;
  let boqCount = 0;
  let pdfCount = 0;
  let missingPdfCount = 0;
  let lastCheckpointState = null;
  let isCrawlComplete = false;
  let consecutiveErrors = 0;
  const MAX_RETRY_ATTEMPTS = 50;

  // Handle Ctrl+C gracefully
  const handleInterrupt = async (signal) => {
    console.log(`\n⚠️ [${signal}] Process explicitly interrupted by user. Checkpoint is saved at .crawl_checkpoint.json`);
    console.log(`👉 You can resume anytime simply by running: npm run scrape:all\n`);
    await telegramService.sendCrawlError({
      mode: 'FULL',
      error: `Interrupted by ${signal}`,
      checkpointSaved: true,
      lastOrg: lastCheckpointState?.orgName || checkpoint?.orgName || ''
    });
    if (syncJob) {
      await SyncJob.findByIdAndUpdate(syncJob._id, {
        status: 'failed',
        durationMs: Date.now() - startTime,
        errorMessage: `Interrupted by ${signal}`
      }).catch(() => {});
    }
    await closeDB().catch(() => {});
    process.exit(0);
  };

  process.once('SIGINT', () => handleInterrupt('SIGINT'));
  process.once('SIGTERM', () => handleInterrupt('SIGTERM'));

  while (!isCrawlComplete && consecutiveErrors < MAX_RETRY_ATTEMPTS) {
    let adapter = new JKTenderAdapter();

    try {
      // Reload the latest checkpoint state from disk
      checkpoint = loadCheckpoint();
      if (checkpoint) {
        resumeFrom = {
          orgIndex: checkpoint.orgIndex || 0,
          orgName: checkpoint.orgName || '',
          orgPageNum: checkpoint.orgPageNum || 1,
          lastTenderId: checkpoint.lastTenderId || null
        };
        console.log(`\n🔄 [AUTO-RESUME] Resuming crawl from "${checkpoint.orgName}" (Index: ${(checkpoint.orgIndex || 0) + 1}, Page: ${checkpoint.orgPageNum || 1})...`);
      }

      syncJob = await SyncJob.create({
        sourcePortal: 'JK_TENDERS',
        status: 'running',
        triggeredBy: 'ADMIN_MANUAL',
        itemsProcessed: (checkpoint?.totalProcessed || 0) + savedCount + skippedCount
      }).catch(() => null);

      const result = await adapter.fetchList(1, {
        syncMode: 'DEPARTMENT',
        limit,
        countSkippedTowardsLimit: false,
        resumeFrom,
        orgFilter,
        excludeOrgFilter,
        onCheckpoint: async (cp) => {
          lastCheckpointState = {
            mode: 'DEPARTMENT',
            orgIndex: cp.orgIndex,
            orgName: cp.orgName,
            orgPageNum: cp.orgPageNum,
            lastTenderId: cp.lastTenderId,
            totalProcessed: (checkpoint?.totalProcessed || 0) + savedCount,
            status: cp.status,
            updatedAt: new Date().toISOString()
          };

          if (cp.status === 'COMPLETED') {
            clearCheckpoint();
          } else {
            saveCheckpoint(lastCheckpointState);
          }

          // Reset consecutive errors upon successful checkpoint progression
          consecutiveErrors = 0;

          // Send periodic Telegram progress ping (throttled)
          telegramService.sendCrawlProgress({
            mode: 'FULL',
            orgName: cp.orgName,
            orgIndex: cp.orgIndex,
            totalOrgs: cp.totalOrgs,
            savedCount,
            skippedCount,
            pdfCount,
            boqCount,
            elapsedSeconds: Math.floor((Date.now() - startTime) / 1000)
          });

          if (syncJob) {
            await SyncJob.findByIdAndUpdate(syncJob._id, {
              itemsProcessed: (checkpoint?.totalProcessed || 0) + savedCount + skippedCount,
              newTendersFound: (checkpoint?.totalProcessed || 0) + savedCount,
              pdfsDownloaded: pdfCount,
              missingPdfCount
            }).catch(() => {});
          }
        },
        shouldSkipTender: async (sourceTenderId) => {
          try {
            const existing = await Tender.findOne({
              sourcePortal: 'JK_TENDERS',
              sourceTenderId
            }).select('pdfFetchStatus boqZipUrl boqFetchStatus publishedDateStr isDocumentAvailable').lean();

            // Strict check: tender is complete ONLY if metadata has new schema AND documents are secured
            if (
              existing &&
              existing.publishedDateStr &&
              (existing.pdfFetchStatus === 'COMPLETED' || existing.isDocumentAvailable === false) &&
              (existing.boqZipUrl || existing.boqFetchStatus === 'COMPLETED' || existing.boqFetchStatus === 'NOT_AVAILABLE' || existing.isDocumentAvailable === false)
            ) {
              skippedCount++;
              return true;
            }
            return false;
          } catch (e) {
            return false;
          }
        }
      }, async (batch) => {
        for (const tender of batch) {
          try {
            const normalized = adapter.normalize(tender);

            const existing = await Tender.findOne({
              sourcePortal: normalized.sourcePortal,
              sourceTenderId: normalized.sourceTenderId
            }).lean();

            if (existing) {
              // Merge nitDocuments without duplicates
              const existingNit = existing.nitDocuments || [];
              const newNit = normalized.nitDocuments || [];
              const mergedNit = [...existingNit];
              for (const doc of newNit) {
                if (!mergedNit.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                  mergedNit.push(doc);
                }
              }
              normalized.nitDocuments = mergedNit;

              // Merge pdfUrls without duplicates
              const existingPdfs = existing.pdfUrls || [];
              const newPdfs = normalized.pdfUrls || [];
              normalized.pdfUrls = Array.from(new Set([...existingPdfs, ...newPdfs]));

              // Merge workItemDocuments without duplicates
              const existingWork = existing.workItemDocuments || [];
              const newWork = normalized.workItemDocuments || [];
              const mergedWork = [...existingWork];
              for (const doc of newWork) {
                if (!mergedWork.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                  mergedWork.push(doc);
                }
              }
              normalized.workItemDocuments = mergedWork;

              if (!normalized.boqFileUrl && existing.boqFileUrl) {
                normalized.boqFileUrl = existing.boqFileUrl;
              }
              if (!normalized.boqZipUrl && existing.boqZipUrl) {
                normalized.boqZipUrl = existing.boqZipUrl;
                normalized.zipFileName = existing.zipFileName;
                normalized.zipFileSizeKb = existing.zipFileSizeKb;
              }
            }

            await Tender.findOneAndUpdate(
              { sourcePortal: normalized.sourcePortal, sourceTenderId: normalized.sourceTenderId },
              { $set: normalized },
              { upsert: true, returnDocument: 'after' }
            );

            savedCount++;
            if (normalized.pdfUrls && normalized.pdfUrls.length > 0) pdfCount += normalized.pdfUrls.length;
            if (normalized.boqZipUrl || normalized.boqFileUrl) boqCount++;
            if (normalized.pdfFetchStatus === 'PENDING') missingPdfCount++;

            console.log(`✅ [Saved: ${savedCount} | Skipped: ${skippedCount}] ${normalized.sourceTenderId} (${normalized.departmentCode || 'GEN'})`);
            console.log(`   📁 Key: ${normalized.r2StorageKey}`);
            console.log(`   📄 NIT Docs: ${normalized.nitDocuments?.length || 0} | 📦 BOQ ZIP: ${normalized.boqZipUrl ? 'Secured (' + (normalized.zipFileSizeKb || '?') + ' KB)' : 'None'} | 📊 Status: ${normalized.pdfFetchStatus}`);
          } catch (saveErr) {
            console.error(`❌ Error saving tender ${tender.sourceTenderId}: ${saveErr.message}`);
          }
        }
      });

      const durationMs = Date.now() - startTime;
      clearCheckpoint(); // Clean finish
      isCrawlComplete = true;

      if (syncJob) {
        await SyncJob.findByIdAndUpdate(syncJob._id, {
          status: 'completed',
          itemsProcessed: (checkpoint?.totalProcessed || 0) + savedCount + skippedCount,
          newTendersFound: (checkpoint?.totalProcessed || 0) + savedCount,
          pdfsDownloaded: pdfCount,
          missingPdfCount,
          durationMs
        }).catch(() => {});
      }

      // Send Telegram Crawl Completed Notification
      await telegramService.sendCrawlCompleted({
        mode: 'FULL',
        savedCount,
        skippedCount,
        pdfCount,
        boqCount,
        missingPdfCount,
        durationMs
      });

      console.log(`\n======================================================================`);
      console.log(`🎉 [COMMAND 1] FULL ACTIVE TENDERS CRAWL FINISHED`);
      console.log(`======================================================================`);
      console.log(`📊 Tenders Newly Saved / Updated: ${savedCount}`);
      console.log(`⏩ Tenders Skipped (Already Completed): ${skippedCount}`);
      console.log(`📄 PDFs Uploaded to R2: ${pdfCount}`);
      console.log(`📦 BOQ Archives Uploaded to R2: ${boqCount}`);
      console.log(`⏱️ Duration: ${Math.round(durationMs / 1000)}s`);
      console.log(`======================================================================\n`);

      await closeDB();
      process.exit(0);

    } catch (err) {
      consecutiveErrors++;
      const waitSeconds = Math.min(consecutiveErrors * 5, 30);
      console.error(`\n⚠️ [AUTO-HEALING] Error encountered: ${err.message}`);

      if (lastCheckpointState) {
        saveCheckpoint(lastCheckpointState);
        console.log(`💾 Checkpoint preserved at .crawl_checkpoint.json`);
      }

      console.log(`🔄 [AUTO-HEALING] Cooling down for ${waitSeconds}s and automatically resuming in the cloud... (Attempt ${consecutiveErrors}/${MAX_RETRY_ATTEMPTS})\n`);

      // Send Telegram self-healing update
      await telegramService.sendMessage(
        `🛠️ <b>TenderHub Auto-Healing Engine</b>\n\n` +
        `⚠️ <b>Transient Portal Error:</b> <code>${(err.message || 'Unknown error').slice(0, 150)}</code>\n` +
        `🏛️ <b>At Org:</b> <code>${lastCheckpointState?.orgName || checkpoint?.orgName || 'N/A'}</code>\n` +
        `💾 <b>Checkpoint:</b> Preserved safely.\n` +
        `🔄 <b>Action:</b> Cooling down for ${waitSeconds}s and automatically resuming (Attempt ${consecutiveErrors}/${MAX_RETRY_ATTEMPTS})...`
      ).catch(() => {});

      if (syncJob) {
        await SyncJob.findByIdAndUpdate(syncJob._id, {
          status: 'retrying',
          errorMessage: err.message
        }).catch(() => {});
      }

      // Cool down before auto-resuming
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }
  }

  // If MAX_RETRY_ATTEMPTS exceeded
  if (!isCrawlComplete) {
    console.error(`❌ Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached. Exiting.`);
    await telegramService.sendCrawlError({
      mode: 'FULL',
      error: `Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded.`,
      checkpointSaved: true,
      lastOrg: lastCheckpointState?.orgName || ''
    });
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
