import { Worker } from 'bullmq';
import pino from 'pino';
import { env } from '../config/env.js';
import { JKTenderAdapter } from '../services/adapters/JKTenderAdapter.js';
import SyncJob from '../models/SyncJob.js';
import Tender from '../models/Tender.js';
import SystemLog from '../models/SystemLog.js';

const logger = pino();
const redisUrl = new URL(env.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  tls: { rejectUnauthorized: false },
  family: 4
};

/**
 * Real-time saving logic for MongoDB with metadata preservation
 */
async function saveDetailedTendersToDatabase(pageData, adapter) {
  if (!pageData || pageData.length === 0) return { newCount: 0, updatedCount: 0 };

  let newCount = 0;
  let updatedCount = 0;

  const savePromises = pageData.map(async (raw) => {
    try {
      const normalized = adapter.normalize(raw);
      const updateFields = { ...normalized };

      // Safeguard: If current scrape has no PDFs, check if existing tender in DB already has them
      if (!normalized.pdfUrls || normalized.pdfUrls.length === 0) {
        const existingTender = await Tender.findOne(
          { sourcePortal: normalized.sourcePortal, sourceTenderId: normalized.sourceTenderId },
          { pdfUrls: 1, nitDocuments: 1, pdfFetchStatus: 1 }
        );
        if (existingTender && existingTender.pdfUrls && existingTender.pdfUrls.length > 0) {
          delete updateFields.pdfUrls;
          delete updateFields.nitDocuments;
          updateFields.pdfFetchStatus = 'COMPLETED';
        }
      }

      const result = await Tender.findOneAndUpdate(
        { 
          sourcePortal: normalized.sourcePortal, 
          sourceTenderId: normalized.sourceTenderId 
        },
        { 
          $set: updateFields 
        },
        { 
          upsert: true, 
          returnDocument: 'after', 
          setDefaultsOnInsert: true, 
          includeResultMetadata: true 
        }
      );

      if (result.lastErrorObject && !result.lastErrorObject.updatedExisting) {
        newCount++;
        logger.info(`[Worker] Inserted new tender: ${normalized.sourceTenderId} (PDFs: ${normalized.pdfUrls?.length || 0})`);
      } else {
        updatedCount++;
        logger.info(`[Worker] Synchronized existing tender: ${normalized.sourceTenderId} (PDFs: ${normalized.pdfUrls?.length || 0})`);
      }
    } catch (err) {
      logger.error(`Error saving tender ${raw.sourceTenderId}: ${err.message}`);
    }
  });

  await Promise.all(savePromises);
  return { newCount, updatedCount };
}

export const tenderSyncWorker = new Worker('TenderQueue', async (job) => {
  const startTime = Date.now();
  logger.info(`Processing Tender Sync Job: ${job.name} (ID: ${job.id})`);

  const adapter = new JKTenderAdapter();
  const triggeredBy = job.data?.triggeredBy || 'CRON_SCHEDULE';

  const syncRecord = await SyncJob.create({ 
    sourcePortal: adapter.portalName,
    triggeredBy,
    status: 'running',
  });

  // Dedicated Job: Retry Missing PDFs Only
  if (job.name === 'retry-missing-pdfs') {
    try {
      const pendingTenders = await Tender.find({
        pdfFetchStatus: 'PENDING',
        isDocumentAvailable: true,
        closingDate: { $gt: new Date() }
      }).limit(50);

      logger.info(`[Worker] Found ${pendingTenders.length} pending tenders needing PDF recovery.`);
      const result = await adapter.retryMissingPdfs(pendingTenders);

      syncRecord.status = 'completed';
      syncRecord.pdfsDownloaded = result.updatedCount;
      syncRecord.durationMs = Date.now() - startTime;
      await syncRecord.save();

      await SystemLog.create({
        level: 'INFO',
        source: 'WORKER_SCRAPER',
        message: `Missing PDF recovery job completed: recovered ${result.updatedCount} tender documents.`,
        metadata: { durationMs: syncRecord.durationMs }
      }).catch(() => {});

      return { recovered: result.updatedCount };
    } catch (err) {
      syncRecord.status = 'failed';
      syncRecord.errorMessage = err.message;
      syncRecord.durationMs = Date.now() - startTime;
      await syncRecord.save();
      throw err;
    }
  }

  // Standard Job: Fetch Latest Tenders & Recover Missing
  let totalNew = 0;
  let totalUpdated = 0;

  const savePageToDb = async (pageData) => {
    const { newCount, updatedCount } = await saveDetailedTendersToDatabase(pageData, adapter);
    totalNew += newCount;
    totalUpdated += updatedCount;
  };

  try {
    const crawlStats = await adapter.fetchList(1, { syncMode: 'LATEST', limit: 100 }, savePageToDb);

    // Auto-recovery pass: Also retry up to 15 pending missing PDFs
    try {
      const missingToRetry = await Tender.find({
        pdfFetchStatus: 'PENDING',
        isDocumentAvailable: true,
        closingDate: { $gt: new Date() }
      }).limit(15);

      if (missingToRetry.length > 0) {
        logger.info(`[Worker] Running secondary pass for ${missingToRetry.length} missing PDFs...`);
        const retryResult = await adapter.retryMissingPdfs(missingToRetry);
        crawlStats.pdfsSecured = (crawlStats.pdfsSecured || 0) + (retryResult.updatedCount || 0);
      }
    } catch (retryErr) {
      logger.warn(`[Worker] Secondary missing PDF pass warning: ${retryErr.message}`);
    }

    syncRecord.status = 'completed';
    syncRecord.itemsProcessed = crawlStats.totalProcessed || (totalNew + totalUpdated);
    syncRecord.newTendersFound = totalNew;
    syncRecord.updatedTenders = totalUpdated;
    syncRecord.pdfsDownloaded = crawlStats.pdfsSecured || 0;
    syncRecord.missingPdfCount = crawlStats.missingPdfs || 0;
    syncRecord.durationMs = Date.now() - startTime;
    await syncRecord.save();

    logger.info(`✅ Sync complete. Processed: ${syncRecord.itemsProcessed}, New: ${totalNew}, Updated: ${totalUpdated}, PDFs: ${syncRecord.pdfsDownloaded}`);

    await SystemLog.create({
      level: 'INFO',
      source: 'WORKER_SCRAPER',
      message: `Tender ingestion completed (${triggeredBy}): ${totalNew} new tenders, ${totalUpdated} refreshed, ${syncRecord.pdfsDownloaded} PDFs secured.`,
      metadata: { durationMs: syncRecord.durationMs, itemsProcessed: syncRecord.itemsProcessed }
    }).catch(() => {});

  } catch (error) {
    logger.error(`Sync Job Failed: ${error.message}`);
    syncRecord.status = 'failed';
    syncRecord.errorMessage = error.message;
    syncRecord.durationMs = Date.now() - startTime;
    await syncRecord.save();

    await SystemLog.create({
      level: 'ERROR',
      source: 'WORKER_SCRAPER',
      message: `Tender ingestion failed (${triggeredBy}): ${error.message}`,
      stack: error.stack,
      metadata: { durationMs: syncRecord.durationMs }
    }).catch(() => {});

    throw error;
  }
}, { 
  connection, 
  lockDuration: 600000,   // 10 minutes lock duration
  maxStalledCount: 3 
});