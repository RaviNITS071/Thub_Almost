/**
 * @file backend/src/routes/admin.routes.js
 * @description Administrative API routes providing system telemetry,
 * intelligent error diagnostics, manual/cron ingestion controls, and archive maintenance.
 */
import express from 'express';
import { adminAuth } from '../middleware/adminAuth.middleware.js';
import {
  verifyAdminSession,
  getTelemetry,
  getOverview,
  getDiagnostics,
  getLogs,
  resolveLog,
  getSyncHistory,
  getLiveSyncStatus,
  triggerManualSync,
  stopActiveSync,
  resetCrawlCheckpoint,
  triggerMissingPdfRecovery,
  updateScheduleConfig,
  purgeExpiredArchive,
  purgeExpiredTendersNow,
  getBackupStatus,
  triggerBackup,
  downloadBackupArchive,
  downloadDisasterRecoveryGuide,
  downloadDeploymentGuide,
  downloadFutureConfigGuide,
  triggerMirrorSync,
} from '../controllers/admin.controller.js';

const router = express.Router();

// All routes are strictly guarded by adminAuth
router.use(adminAuth);

// 1. Session verification
router.get('/verify', verifyAdminSession);

// 2. Telemetry & Latency
router.get('/telemetry', getTelemetry);

// 3. Database & System Overview
router.get('/overview', getOverview);

// 4. Intelligent Diagnostics & Problem Resolution Guide
router.get('/diagnostics', getDiagnostics);

// 5. System Logs
router.get('/logs', getLogs);
router.post('/logs/:id/resolve', resolveLog);

// 6. Ingestion Management & Historical Metrics
router.get('/sync/history', getSyncHistory);
router.get('/sync/live-status', getLiveSyncStatus);
router.post('/sync/trigger', triggerManualSync);
router.post('/sync/stop', stopActiveSync);
router.post('/sync/checkpoint/reset', resetCrawlCheckpoint);
router.post('/sync/retry-missing-pdfs', triggerMissingPdfRecovery);
router.post('/sync/schedule-config', updateScheduleConfig);

// 7. Maintenance & Archive Purge
router.post('/maintenance/purge-archive', purgeExpiredArchive);
router.post('/maintenance/purge-expired', purgeExpiredTendersNow);

// 8. Disaster Recovery & Automated Daily Backup
router.get('/backup/status', getBackupStatus);
router.post('/backup/trigger', triggerBackup);
router.post('/backup/sync-mirror', triggerMirrorSync);
router.get('/backup/download/:fileName', downloadBackupArchive);
router.get('/backup/disaster-recovery-guide', downloadDisasterRecoveryGuide);
router.get('/backup/deployment-guide', downloadDeploymentGuide);
router.get('/backup/future-config-guide', downloadFutureConfigGuide);

export default router;
