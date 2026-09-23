import { Worker } from 'bullmq';
import pino from 'pino';
import { env } from '../config/env.js';
import { JKTenderDateAdapter } from '../services/adapters/JKTenderDateAdapter.js';
import SyncJob from '../models/SyncJob.js';
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

export const tenderSyncWorker = new Worker('TenderQueue', async (job) => {
  const startTime = Date.now();
  logger.info(`Processing Tender Sync Job: ${job.name} (ID: ${job.id})`);

  const adapter = new JKTenderDateAdapter();
  const triggeredBy = job.data?.triggeredBy || 'CRON_SCHEDULE';

  const syncRecord = await SyncJob.create({ 
    sourcePortal: adapter.portalName,
    triggeredBy,
    status: 'running',
  });

  // Dedicated Job: Retry Missing Documents Only
  if (job.name === 'retry-missing-pdfs') {
    try {
      logger.info(`[Worker] Running pending documents recovery job...`);
      const result = await adapter.fetchPendingDocuments({ limit: 50, headless: true });

      syncRecord.status = 'completed';
      syncRecord.pdfsDownloaded = result.totalPdfsSecured || 0;
      syncRecord.itemsProcessed = result.totalChecked || 0;
      syncRecord.durationMs = Date.now() - startTime;
      await syncRecord.save();

      await SystemLog.create({
        level: 'INFO',
        source: 'WORKER_SCRAPER',
        message: `Missing documents recovery job completed: recovered ${result.recoveredCount || 0} tender document packages.`,
        metadata: { durationMs: syncRecord.durationMs }
      }).catch(() => {});

      return { recovered: result.recoveredCount || 0 };
    } catch (err) {
      syncRecord.status = 'failed';
      syncRecord.errorMessage = err.message;
      syncRecord.durationMs = Date.now() - startTime;
      await syncRecord.save();
      throw err;
    }
  }

  // Standard Job: Daily Incremental Ingestion via JKTenderDateAdapter
  try {
    const limit = job.data?.limit || 100;
    logger.info(`[Worker] Running daily tender crawl for today's active tenders (Target limit: ${limit})...`);
    const crawlSummary = await adapter.fetchTendersByDate({
      targetDate: 'today',
      limit,
      headless: true
    });

    syncRecord.status = 'completed';
    syncRecord.itemsProcessed = crawlSummary.totalIngested || 0;
    syncRecord.newTendersFound = crawlSummary.totalWithDocuments || 0;
    syncRecord.pdfsDownloaded = crawlSummary.totalPdfsSecured || 0;
    syncRecord.missingPdfCount = crawlSummary.totalWithoutDocuments || 0;
    syncRecord.durationMs = Date.now() - startTime;
    await syncRecord.save();

    logger.info(`✅ Sync complete. Ingested: ${crawlSummary.totalIngested}, Documents Secured: ${crawlSummary.totalWithDocuments}, PDFs: ${crawlSummary.totalPdfsSecured}`);

    await SystemLog.create({
      level: 'INFO',
      source: 'WORKER_SCRAPER',
      message: `Daily tender ingestion completed (${triggeredBy}): ${crawlSummary.totalIngested} tenders ingested, ${crawlSummary.totalPdfsSecured} PDFs secured.`,
      metadata: { durationMs: syncRecord.durationMs, itemsProcessed: syncRecord.itemsProcessed }
    }).catch(() => {});

    return crawlSummary;

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