/**
 * @file backend/src/controllers/admin.controller.js
 * @description Controller actions servicing the isolated Admin Dashboard Panel.
 */
import { diagnosticService } from '../services/diagnostic.service.js';
import { schedulerService } from '../services/scheduler.service.js';
import SystemLog from '../models/SystemLog.js';
import SyncJob from '../models/SyncJob.js';
import CronConfig from '../models/CronConfig.js';
import Tender from '../models/Tender.js';

/**
 * Validate admin credentials
 */
export const verifyAdminSession = async (req, res) => {
  return res.status(200).json({
    authenticated: true,
    user: req.adminUser,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Real-time network latency, memory, and services telemetry
 */
export const getTelemetry = async (req, res) => {
  try {
    const telemetry = await diagnosticService.getSystemTelemetry();
    return res.status(200).json(telemetry);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve telemetry', message: err.message });
  }
};

/**
 * Database overview, tender counts, missing PDFs, and sync status
 */
export const getOverview = async (req, res) => {
  try {
    const overview = await diagnosticService.getDatabaseOverview();
    return res.status(200).json(overview);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve overview', message: err.message });
  }
};

/**
 * Intelligent error diagnostics with root-cause analysis and remediation steps
 */
export const getDiagnostics = async (req, res) => {
  try {
    const diagnostics = await diagnosticService.getDiagnosticsAndActiveIssues();
    return res.status(200).json({ issues: diagnostics, count: diagnostics.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate diagnostics', message: err.message });
  }
};

/**
 * Query persistent system logs with pagination & filtering
 */
export const getLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const { level, source, search } = req.query;

    const query = {};
    if (level && level !== 'ALL') query.level = level;
    if (source && source !== 'ALL') query.source = source;
    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    const [logs, total] = await Promise.all([
      SystemLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      SystemLog.countDocuments(query),
    ]);

    return res.status(200).json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch logs', message: err.message });
  }
};

/**
 * Clear or mark logs as resolved
 */
export const resolveLog = async (req, res) => {
  try {
    const { id } = req.params;
    await SystemLog.findByIdAndUpdate(id, { resolved: true });
    return res.status(200).json({ success: true, message: 'Log marked as resolved' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve log', message: err.message });
  }
};

/**
 * Ingestion Run History
 */
export const getSyncHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));

    const [jobs, total] = await Promise.all([
      SyncJob.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      SyncJob.countDocuments(),
    ]);

    return res.status(200).json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch sync history', message: err.message });
  }
};

/**
 * Trigger immediate manual ingestion
 */
export const triggerManualSync = async (req, res) => {
  try {
    const job = await schedulerService.triggerManualSync('Admin');
    return res.status(200).json({
      success: true,
      message: 'Manual data ingestion initiated. Worker dispatched.',
      jobId: job.id,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to dispatch manual sync', message: err.message });
  }
};

/**
 * Trigger dedicated missing PDF recovery pass
 */
export const triggerMissingPdfRecovery = async (req, res) => {
  try {
    const job = await schedulerService.triggerMissingPdfSync('Admin');
    return res.status(200).json({
      success: true,
      message: 'Missing PDF recovery pass dispatched.',
      jobId: job.id,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to trigger PDF recovery', message: err.message });
  }
};

/**
 * Toggle automated cron scheduling permission
 */
export const updateScheduleConfig = async (req, res) => {
  try {
    const { isAutomatedSyncEnabled } = req.body;

    const config = await CronConfig.findOneAndUpdate(
      { configKey: 'GLOBAL_CRON_SETTINGS' },
      { $set: { isAutomatedSyncEnabled: Boolean(isAutomatedSyncEnabled) } },
      { new: true, upsert: true }
    );

    await SystemLog.create({
      level: 'INFO',
      source: 'CRON',
      message: `Admin updated automated ingestion setting: isAutomatedSyncEnabled = ${config.isAutomatedSyncEnabled}`,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      config,
      message: `Automated data scraping ${config.isAutomatedSyncEnabled ? 'ENABLED' : 'PAUSED'}.`,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update schedule config', message: err.message });
  }
};

/**
 * Manually trigger 30-Day Archive Purge
 */
export const purgeExpiredArchive = async (req, res) => {
  try {
    const result = await schedulerService.purgeExpiredArchivedTenders('ADMIN_MANUAL');
    return res.status(200).json({
      success: true,
      message: `Successfully purged ${result.deletedCount} expired archived tenders.`,
      deletedCount: result.deletedCount,
      cutoffDate: result.cutoffDate,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Archive purge failed', message: err.message });
  }
};
