/**
 * @file backend/src/controllers/admin.controller.js
 * @description Controller actions servicing the isolated Admin Dashboard Panel.
 */
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { diagnosticService } from '../services/diagnostic.service.js';
import { schedulerService } from '../services/scheduler.service.js';
import { backupService } from '../services/backup.service.js';
import { retentionService } from '../services/retention.service.js';
import { syncR2Buckets } from '../scripts/syncR2Mirror.js';
import SystemLog from '../models/SystemLog.js';
import SyncJob from '../models/SyncJob.js';
import CronConfig from '../models/CronConfig.js';
import Tender from '../models/Tender.js';
import PendingDocumentTender from '../models/PendingDocumentTender.js';

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

let activeCrawlerProcess = null;

/**
 * Trigger immediate manual ingestion (supports mode: 'ALL' | 'LATEST', limit, reset)
 */
export const triggerManualSync = async (req, res) => {
  try {
    const { mode = 'LATEST', limit = 100, reset = false } = req.body || {};

    // Check if a sync job is already actively running
    const existingRunning = await SyncJob.findOne({ status: 'running' }).lean();
    if (existingRunning || activeCrawlerProcess) {
      return res.status(400).json({
        error: 'A scraper job is already running in the background.',
        jobId: existingRunning?._id,
      });
    }

    const scriptPath = mode === 'ALL'
      ? path.join(process.cwd(), 'src/scripts/fetchAllActiveTenders.js')
      : path.join(process.cwd(), 'src/scripts/fetchLatestDailyTenders.js');

    const args = [scriptPath, String(limit)];
    if (reset) args.push('--reset');

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, SCRAPER_HEADLESS: process.env.SCRAPER_HEADLESS || 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeCrawlerProcess = child;

    child.stdout.on('data', async (data) => {
      const text = data.toString().trim();
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.includes('✅') || line.includes('🏛️') || line.includes('⏩') || line.includes('👉') || line.includes('🎉') || line.includes('🚀') || line.includes('🛑') || line.includes('📊')) {
          await SystemLog.create({
            level: 'INFO',
            source: 'WORKER_SCRAPER',
            message: line
          }).catch(() => {});
        }
      }
    });

    child.stderr.on('data', async (data) => {
      const text = data.toString().trim();
      if (text) {
        await SystemLog.create({
          level: 'WARN',
          source: 'WORKER_SCRAPER',
          message: text.substring(0, 300)
        }).catch(() => {});
      }
    });

    child.on('close', (code) => {
      activeCrawlerProcess = null;
    });

    return res.status(200).json({
      success: true,
      message: `${mode === 'ALL' ? 'Full Active Tenders' : 'Daily Latest Tenders'} crawl started in background.`,
      mode,
      limit,
      pid: child.pid
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to dispatch manual sync', message: err.message });
  }
};

/**
 * Stop actively running crawler process
 */
export const stopActiveSync = async (req, res) => {
  try {
    if (activeCrawlerProcess) {
      activeCrawlerProcess.kill('SIGINT');
      activeCrawlerProcess = null;
    }
    await SyncJob.updateMany({ status: 'running' }, { status: 'failed', errorMessage: 'Stopped manually by Admin' });
    await SystemLog.create({
      level: 'WARN',
      source: 'WORKER_SCRAPER',
      message: 'Crawl process stopped manually by Admin.'
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Active crawl stopped.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stop sync', message: err.message });
  }
};

/**
 * Get real-time sync progress, active job status, checkpoint, and live logs
 */
export const getLiveSyncStatus = async (req, res) => {
  try {
    const runningJob = await SyncJob.findOne({ status: 'running' }).sort({ createdAt: -1 }).lean();

    let checkpoint = null;
    const checkpointPath = path.join(process.cwd(), '.crawl_checkpoint.json');
    if (fs.existsSync(checkpointPath)) {
      try {
        checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
      } catch (e) {}
    }

    const logs = await SystemLog.find({
      source: 'WORKER_SCRAPER'
    })
    .sort({ createdAt: -1 })
    .limit(35)
    .lean();

    const isRunning = !!runningJob || !!activeCrawlerProcess;

    return res.status(200).json({
      isRunning,
      activeJob: runningJob || (activeCrawlerProcess ? { status: 'running' } : null),
      checkpoint,
      logs: logs.reverse()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get live sync status', message: err.message });
  }
};

/**
 * Reset crawler checkpoint file
 */
export const resetCrawlCheckpoint = async (req, res) => {
  try {
    const checkpointPath = path.join(process.cwd(), '.crawl_checkpoint.json');
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }
    await SystemLog.create({
      level: 'INFO',
      source: 'WORKER_SCRAPER',
      message: 'Admin manually reset crawl checkpoint.'
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Checkpoint reset successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset checkpoint', message: err.message });
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

/**
 * Manually trigger immediate Expired Tenders Purge across MongoDB, Primary R2 & Backup Server
 */
export const purgeExpiredTendersNow = async (req, res) => {
  try {
    const adminUser = req.adminUser?.email || 'ADMIN_MANUAL';
    const result = await retentionService.purgeExpiredTenders(adminUser);
    return res.status(200).json({
      success: true,
      message: `Purge completed: removed ${result.purgedCount} tender(s) from MongoDB, ${result.primaryFilesDeleted} file(s) from Primary R2, and ${result.backupFilesDeleted} file(s) from Backup Server.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Expired tenders purge failed', message: err.message });
  }
};

/**
 * Telemetry and list of backups for the Admin Panel
 */
export const getBackupStatus = async (req, res) => {
  try {
    const status = backupService.getBackupStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve backup telemetry', message: err.message });
  }
};

/**
 * On-demand backup trigger from the Admin Panel
 * Body: { type: 'database' | 'full' }
 */
export const triggerBackup = async (req, res) => {
  try {
    const type = req.body.type || 'database';
    let result;

    if (type === 'full') {
      result = await backupService.createFullBackup();
    } else {
      result = await backupService.createDatabaseBackup();
    }

    return res.status(200).json({
      success: true,
      message: `Backup (${type}) completed successfully.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Backup execution failed',
      message: err.message,
    });
  }
};

/**
 * Securely stream and download a backup archive from disk
 */
export const downloadBackupArchive = async (req, res) => {
  try {
    const fileName = path.basename(req.params.fileName);
    const filePath = path.join(backupService.localBackupDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found on server disk.' });
    }

    const contentType = fileName.endsWith('.zip') ? 'application/zip' : 'application/gzip';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream backup archive', message: err.message });
  }
};

/**
 * Download the Disaster Recovery & Backup Instruction PDF manual
 */
export const downloadDisasterRecoveryGuide = async (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../docs/TenderHub_Disaster_Recovery_and_Backup_Manual.pdf'),
      path.resolve(process.cwd(), 'docs/TenderHub_Disaster_Recovery_and_Backup_Manual.pdf'),
      path.resolve(process.cwd(), 'backups/TenderHub_Disaster_Recovery_and_Backup_Manual.pdf'),
    ];

    const targetPath = candidates.find(p => fs.existsSync(p));

    if (!targetPath) {
      return res.status(404).json({ error: 'Disaster recovery guide PDF has not been generated yet.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TenderHub_Disaster_Recovery_and_Backup_Manual.pdf"');

    const stream = fs.createReadStream(targetPath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream guide PDF', message: err.message });
  }
};

/**
 * Download the Production Deployment & Operations PDF manual
 */
export const downloadDeploymentGuide = async (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../docs/TenderHub_Production_Deployment_Manual.pdf'),
      path.resolve(process.cwd(), 'docs/TenderHub_Production_Deployment_Manual.pdf'),
      path.resolve(process.cwd(), 'backups/TenderHub_Production_Deployment_Manual.pdf'),
    ];

    const targetPath = candidates.find(p => fs.existsSync(p));

    if (!targetPath) {
      return res.status(404).json({ error: 'Deployment manual PDF has not been generated yet.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TenderHub_Production_Deployment_Manual.pdf"');

    const stream = fs.createReadStream(targetPath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream deployment manual', message: err.message });
  }
};

/**
 * Download the Future Configurations & Render Upgrade Manual PDF
 */
export const downloadFutureConfigGuide = async (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../docs/TenderHub_Future_Configurations_Render_and_Failover.pdf'),
      path.resolve(process.cwd(), 'docs/TenderHub_Future_Configurations_Render_and_Failover.pdf'),
      path.resolve(process.cwd(), 'backups/TenderHub_Future_Configurations_Render_and_Failover.pdf'),
    ];

    const targetPath = candidates.find(p => fs.existsSync(p));

    if (!targetPath) {
      return res.status(404).json({ error: 'Future configurations guide PDF has not been generated yet.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TenderHub_Future_Configurations_Render_and_Failover.pdf"');

    const stream = fs.createReadStream(targetPath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream future configuration manual', message: err.message });
  }
};


/**
 * Trigger Cloudflare R2 Document Mirror Synchronization
 */
export const triggerMirrorSync = async (req, res) => {
  try {
    const result = await syncR2Buckets();
    return res.status(200).json({
      success: true,
      message: `Mirror synchronization complete. Replicated ${result.syncedCount} missing document(s) (${result.totalMb} MB). ${result.skippedCount} already in sync.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Mirror synchronization failed', message: err.message });
  }
};

/**
 * Get overview metrics for pending document tenders
 */
export const getPendingDocsOverview = async (req, res) => {
  try {
    const now = new Date();
    const totalPending = await PendingDocumentTender.countDocuments({ status: { $ne: 'DOWNLOADED' } });
    const readyToDownload = await PendingDocumentTender.countDocuments({
      status: { $in: ['AWAITING_DOWNLOAD_DATE', 'READY_TO_DOWNLOAD'] },
      $or: [
        { documentDownloadStartDate: { $lte: now } },
        { documentDownloadStartDate: null },
        { status: 'READY_TO_DOWNLOAD' }
      ]
    });
    const downloaded = await PendingDocumentTender.countDocuments({ status: 'DOWNLOADED' });
    const upcoming = await PendingDocumentTender.find({
      status: 'AWAITING_DOWNLOAD_DATE',
      documentDownloadStartDate: { $gt: now }
    })
    .sort({ documentDownloadStartDate: 1 })
    .limit(10)
    .lean();

    return res.status(200).json({
      success: true,
      totalPending,
      readyToDownload,
      downloaded,
      upcoming
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get pending docs overview', message: err.message });
  }
};

/**
 * Trigger background worker to fetch documents for pending document tenders
 */
export const triggerPendingDocsFetch = async (req, res) => {
  try {
    const { limit = 50, all = false } = req.body || {};

    if (activeCrawlerProcess) {
      return res.status(400).json({
        error: 'Another crawl or sync process is already actively running.'
      });
    }

    const scriptPath = path.join(process.cwd(), 'src/scripts/fetchPendingDocTenders.js');
    const args = [scriptPath, '--limit', String(limit)];
    if (all) args.push('--all');

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, SCRAPER_HEADLESS: process.env.SCRAPER_HEADLESS || 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeCrawlerProcess = child;

    child.stdout.on('data', async (data) => {
      const text = data.toString().trim();
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.includes('✅') || line.includes('🎉') || line.includes('🏛️') || line.includes('👉') || line.includes('⏳') || line.includes('🚀') || line.includes('🏁') || line.includes('📋') || line.includes('🔐')) {
          await SystemLog.create({
            level: 'INFO',
            source: 'WORKER_SCRAPER',
            message: line
          }).catch(() => {});
        }
      }
    });

    child.stderr.on('data', async (data) => {
      const text = data.toString().trim();
      if (text) {
        await SystemLog.create({
          level: 'WARN',
          source: 'WORKER_SCRAPER',
          message: text.substring(0, 300)
        }).catch(() => {});
      }
    });

    child.on('close', () => {
      activeCrawlerProcess = null;
    });

    return res.status(200).json({
      success: true,
      message: 'Pending documents recovery crawl started in background.',
      pid: child.pid
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to dispatch pending docs recovery', message: err.message });
  }
};


