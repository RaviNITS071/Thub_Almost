/**
 * @file backend/src/services/diagnostic.service.js
 * @description Comprehensive telemetry and diagnostic engine for the Admin Dashboard.
 * Analyzes network latency, database states, worker queue backlogs, and
 * translates raw exceptions into actionable root-cause diagnoses and step-by-step solutions.
 */
import mongoose from 'mongoose';
import os from 'os';
import { redis } from '../config/redis.js';
import { tenderQueue } from '../workers/queue.js';
import Tender from '../models/Tender.js';
import SyncJob from '../models/SyncJob.js';
import SystemLog from '../models/SystemLog.js';
import CronConfig from '../models/CronConfig.js';

export class DiagnosticService {
  /**
   * Evaluates network latency and infrastructure responsiveness
   */
  async getSystemTelemetry() {
    const startMongo = Date.now();
    let mongoLatencyMs = -1;
    let mongoStatus = 'DISCONNECTED';

    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        mongoLatencyMs = Date.now() - startMongo;
        mongoStatus = 'HEALTHY';
      } else {
        mongoStatus = 'CONNECTING_OR_DISCONNECTED';
      }
    } catch (mongoErr) {
      mongoStatus = 'ERROR';
    }

    const startRedis = Date.now();
    let redisLatencyMs = -1;
    let redisStatus = 'DISCONNECTED';

    try {
      const pong = await redis.ping();
      if (pong === 'PONG') {
        redisLatencyMs = Date.now() - startRedis;
        redisStatus = 'HEALTHY';
      }
    } catch (redisErr) {
      redisStatus = 'ERROR';
    }

    // BullMQ Queue Backlog metrics
    let queueWaiting = 0;
    let queueActive = 0;
    let queueFailed = 0;
    try {
      const counts = await tenderQueue.getJobCounts('waiting', 'active', 'failed', 'completed');
      queueWaiting = counts.waiting || 0;
      queueActive = counts.active || 0;
      queueFailed = counts.failed || 0;
    } catch (qErr) {
      // Redis might be offline or queue unreachable
    }

    // Memory & Host Metrics
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      timestamp: new Date().toISOString(),
      status: (mongoStatus === 'HEALTHY' && redisStatus === 'HEALTHY') ? 'OPERATIONAL' : 'DEGRADED',
      latency: {
        mongoDbMs: mongoLatencyMs,
        redisMs: redisLatencyMs,
        overallRating: (mongoLatencyMs < 200 && redisLatencyMs < 100) ? 'OPTIMAL' : 'ELEVATED',
      },
      services: {
        database: { status: mongoStatus, latencyMs: mongoLatencyMs },
        redisCache: { status: redisStatus, latencyMs: redisLatencyMs },
        queue: { waiting: queueWaiting, active: queueActive, failed: queueFailed },
      },
      systemResources: {
        processMemoryMb: Math.round(memUsage.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024)),
        totalSystemMemoryMb: Math.round(totalMem / (1024 * 1024)),
        freeSystemMemoryMb: Math.round(freeMem / (1024 * 1024)),
        cpuCores: os.cpus().length,
        systemUptimeSec: Math.round(os.uptime()),
        processUptimeSec: Math.round(process.uptime()),
      }
    };
  }

  /**
   * Aggregates database counts, missing PDFs, and archive cleanup stats
   */
  async getDatabaseOverview() {
    const now = new Date();
    const cutoff30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalTenders,
      activeTenders,
      archivedTenders,
      expiredTenders,
      expiredArchivedTenders,
      missingPdfCount,
      completedPdfCount,
      lastSyncJob,
      cronConfig
    ] = await Promise.all([
      Tender.countDocuments(),
      Tender.countDocuments({ status: 'ACTIVE', closingDate: { $gte: now } }),
      Tender.countDocuments({ status: 'ARCHIVED' }),
      Tender.countDocuments({ $or: [{ status: 'EXPIRED' }, { closingDate: { $lt: now } }] }),
      Tender.countDocuments({ status: 'ARCHIVED', closingDate: { $lt: cutoff30Days } }),
      Tender.countDocuments({ pdfFetchStatus: 'PENDING', isDocumentAvailable: true }),
      Tender.countDocuments({ pdfFetchStatus: 'COMPLETED' }),
      SyncJob.findOne().sort({ createdAt: -1 }),
      CronConfig.findOne({ configKey: 'GLOBAL_CRON_SETTINGS' }),
    ]);

    return {
      tenders: {
        total: totalTenders,
        active: activeTenders,
        archived: archivedTenders,
        expired: expiredTenders,
        expiredArchivedEligibleForPurge: expiredArchivedTenders,
      },
      documents: {
        completedPdfs: completedPdfCount,
        pendingMissingPdfs: missingPdfCount,
      },
      lastSync: lastSyncJob ? {
        id: lastSyncJob._id,
        status: lastSyncJob.status,
        triggeredBy: lastSyncJob.triggeredBy,
        newTendersFound: lastSyncJob.newTendersFound,
        itemsProcessed: lastSyncJob.itemsProcessed,
        pdfsDownloaded: lastSyncJob.pdfsDownloaded,
        durationMs: lastSyncJob.durationMs,
        createdAt: lastSyncJob.createdAt,
      } : null,
      cronConfig: cronConfig || {
        isAutomatedSyncEnabled: true,
        scheduledSlots: ['09:00', '10:00', '13:00', '15:00', '18:30'],
        lastRunAt: null,
      }
    };
  }

  /**
   * Intelligent Diagnostic Engine: analyzes recent error logs and yields
   * root-cause breakdowns with step-by-step remediation plans.
   */
  async getDiagnosticsAndActiveIssues() {
    // Look back at recent un-dismissed errors
    const recentErrors = await SystemLog.find({ 
      level: { $in: ['ERROR', 'FATAL'] },
      resolved: false
    })
    .sort({ createdAt: -1 })
    .limit(10);

    const diagnosisList = [];

    for (const log of recentErrors) {
      let problem = log.message;
      let title = 'General System Error';
      let steps = ['Check server console logs', 'Verify environment configurations in backend/.env'];
      let cmd = 'npm run dev';

      const lower = (log.message || '').toLowerCase();
      const stack = (log.stack || '').toLowerCase();

      if (lower.includes('redis') || lower.includes('econnrefused 6379') || stack.includes('ioredis')) {
        title = 'Redis Connectivity Breakdown';
        problem = 'The backend or BullMQ worker cannot connect to the configured Redis instance.';
        steps = [
          'Verify that your Redis service (Upstash or local) is currently online.',
          'Verify REDIS_URL in backend/.env includes TLS settings if using cloud provider (e.g., rediss:// instead of redis://).',
          'Test redis connection locally using redis-cli or curl.'
        ];
        cmd = 'redis-cli -u $REDIS_URL ping';
      } else if (lower.includes('ghostscript') || lower.includes('gswin64c') || lower.includes('gs: command not found')) {
        title = 'Ghostscript Compression Binary Not Found';
        problem = 'PDF compression failed because Ghostscript is not installed or not registered in system PATH.';
        steps = [
          'On Windows: Run "choco install ghostscript" or download from https://ghostscript.com/releases/gsdnld.html',
          'On Linux/Docker: Run "apt-get update && apt-get install -y ghostscript"',
          'Verify command by running "gswin64c -v" or "gs -v" in your command prompt'
        ];
        cmd = 'choco install ghostscript / apt-get install -y ghostscript';
      } else if (lower.includes('capsolver') || lower.includes('captcha')) {
        title = 'Captcha Resolution Exception';
        problem = 'Automated captcha solving on JKTenders encountered an error or API quota limit.';
        steps = [
          'Verify that CAPSOLVER_API_KEY is configured in backend/.env and has available credits.',
          'If no API key is provided, verify Tesseract OCR dependencies are installed.',
          'Check if JKTenders has temporarily blocked repetitive requests from this IP.'
        ];
        cmd = 'curl -X POST https://api.capsolver.com/getBalance -H "Content-Type: application/json" -d "{\\"clientKey\\":\\"$CAPSOLVER_API_KEY\\"}"';
      } else if (lower.includes('cloudflare') || lower.includes('r2') || lower.includes('s3')) {
        title = 'Cloudflare R2 Storage Upload Failure';
        problem = 'Documents cannot be uploaded to R2 storage.';
        steps = [
          'Verify R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ACCOUNT_ID in backend/.env.',
          'Ensure the bucket "tenderhub" exists in Cloudflare R2 dashboard.',
          'Ensure CORS rules on the R2 bucket allow PUT/GET operations.'
        ];
        cmd = 'aws s3 ls --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com';
      } else if (lower.includes('mongo') || lower.includes('m000') || lower.includes('buffering timed out')) {
        title = 'MongoDB Atlas Connectivity Issue';
        problem = 'Database queries timed out before establishing a connection with Atlas.';
        steps = [
          'Check Network Access in MongoDB Atlas console: ensure current IP address is whitelisted (or 0.0.0.0/0).',
          'Verify MONGO_URI username and password in backend/.env.',
          'Confirm your internet connection or cloud VPC peering status.'
        ];
        cmd = 'mongosh "$MONGO_URI"';
      }

      diagnosisList.push({
        id: log._id,
        level: log.level,
        source: log.source,
        timestamp: log.createdAt,
        rawMessage: log.message,
        title,
        problemDescription: problem,
        suggestedSteps: steps,
        commandSnippet: cmd,
      });
    }

    return diagnosisList;
  }
}

export const diagnosticService = new DiagnosticService();
