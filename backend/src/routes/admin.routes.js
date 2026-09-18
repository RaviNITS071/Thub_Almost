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
  triggerManualSync,
  triggerMissingPdfRecovery,
  updateScheduleConfig,
  purgeExpiredArchive,
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
router.post('/sync/trigger', triggerManualSync);
router.post('/sync/retry-missing-pdfs', triggerMissingPdfRecovery);
router.post('/sync/schedule-config', updateScheduleConfig);

// 7. Maintenance & Archive Purge
router.post('/maintenance/purge-archive', purgeExpiredArchive);

export default router;
