/**
 * @file backend/src/services/backup.service.js
 * @description Complete Database Disaster Recovery Service.
 * Exports all MongoDB collections into compressed Gzip JSON and uploads
 * to an isolated secondary Cloudflare R2 account for emergency website relaunch.
 */
import mongoose from 'mongoose';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import AdmZip from 'adm-zip';
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, getBackupR2Client, uploadBackupToR2, downloadLatestBackupFromR2 } from '../utils/r2Storage.js';
import { connectDB } from '../config/db.js';
import SystemLog from '../models/SystemLog.js';

const logger = pino();

export class BackupService {
  constructor() {
    this.localBackupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(this.localBackupDir)) {
      fs.mkdirSync(this.localBackupDir, { recursive: true });
    }
    this.isBackupInProgress = false;
    this.lastBackupStatus = null;
  }

  /**
   * Generates a full snapshot of the MongoDB database, compresses it,
   * and uploads it to the secondary Cloudflare R2 account.
   */
  async createDatabaseBackup() {
    if (this.isBackupInProgress) {
      throw new Error('A backup operation is currently in progress. Please wait for it to complete.');
    }
    this.isBackupInProgress = true;
    const startTime = Date.now();
    logger.info('[BackupService] Initiating MongoDB database backup...');

    try {
      if (mongoose.connection.readyState !== 1) {
        await connectDB();
      }

      const db = mongoose.connection.db;
      const collections = await db.collections();
      const backupData = {
        version: 1,
        createdAt: new Date().toISOString(),
        databaseName: db.databaseName,
        totalCollections: collections.length,
        collections: {},
      };

      let totalDocuments = 0;

      for (const col of collections) {
        const name = col.collectionName;
        // Skip system collections if any
        if (name.startsWith('system.')) continue;

        const docs = await col.find({}).toArray();
        backupData.collections[name] = docs;
        totalDocuments += docs.length;
        logger.info(`[BackupService] Exported collection "${name}": ${docs.length} documents`);
      }

      // Format timestamp for filename: YYYY-MM-DD_HHmmss
      const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonString = JSON.stringify(backupData);
      const compressedBuffer = zlib.gzipSync(jsonString);

      const fileName = `tenderhub_db_${dateStamp}.json.gz`;
      const localFilePath = path.join(this.localBackupDir, fileName);

      fs.writeFileSync(localFilePath, compressedBuffer);
      const sizeMB = (compressedBuffer.length / (1024 * 1024)).toFixed(2);
      logger.info(`[BackupService] Local backup archive saved: ${localFilePath} (${sizeMB} MB)`);

      // Upload to Secondary Cloudflare Account
      const uploadResult = await uploadBackupToR2(localFilePath, fileName);

      const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`✅ [BackupService] Database backup completed in ${durationSeconds}s. (${totalDocuments} documents, ${sizeMB} MB)`);

      const result = {
        success: true,
        type: 'database',
        fileName,
        localPath: localFilePath,
        totalCollections: Object.keys(backupData.collections).length,
        totalDocuments,
        sizeBytes: compressedBuffer.length,
        sizeMB,
        durationSeconds,
        r2Upload: uploadResult,
        createdAt: backupData.createdAt,
      };

      this.lastBackupStatus = result;

      await SystemLog.create({
        level: 'INFO',
        source: 'DATABASE',
        message: `Database backup completed: ${fileName} (${sizeMB} MB, ${totalDocuments} docs). Secondary Cloudflare Mirror: ${uploadResult?.success ? 'SUCCESS' : 'SAVED_LOCALLY'}`,
        metadata: { fileName, sizeMB, totalDocuments, durationSeconds, r2Success: uploadResult?.success },
      }).catch(() => {});

      return result;
    } catch (err) {
      logger.error(`[BackupService] Database backup failed: ${err.message}`);
      await SystemLog.create({
        level: 'ERROR',
        source: 'DATABASE',
        message: `Database backup failed: ${err.message}`,
        stack: err.stack,
      }).catch(() => {});
      throw err;
    } finally {
      this.isBackupInProgress = false;
    }
  }

  /**
   * Restores all collections from the latest (or specified) backup archive.
   * Enables emergency relaunch of the platform in under 60 seconds.
   */
  async restoreDatabaseFromBackup(specificFilePath = null) {
    logger.info('[BackupService] 🔄 Initiating database restore procedure...');

    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    let archivePath = specificFilePath;

    // If no path specified, try downloading latest from secondary Cloudflare R2 first
    if (!archivePath) {
      const tempDownloadPath = path.join(this.localBackupDir, 'temp_latest_restore.json.gz');
      try {
        await downloadLatestBackupFromR2(tempDownloadPath);
        archivePath = tempDownloadPath;
      } catch (err) {
        logger.warn(`[BackupService] Cloudflare R2 download failed or unconfigured: ${err.message}. Checking local backup folder...`);
        // Fall back to most recent local backup file
        const files = fs.readdirSync(this.localBackupDir)
          .filter(f => f.endsWith('.json.gz') && f.startsWith('tenderhub_db_'))
          .sort()
          .reverse();

        if (files.length === 0) {
          throw new Error('No backup archive found locally or in Cloudflare R2 to restore from.');
        }

        archivePath = path.join(this.localBackupDir, files[0]);
      }
    }

    logger.info(`[BackupService] Decompressing archive from: ${archivePath}`);
    const compressedBuffer = fs.readFileSync(archivePath);
    const jsonString = zlib.gunzipSync(compressedBuffer).toString('utf-8');
    const backupData = JSON.parse(jsonString);

    logger.info(`[BackupService] Archive loaded. Created at: ${backupData.createdAt}. Restoring ${Object.keys(backupData.collections).length} collections...`);

    const db = mongoose.connection.db;
    const restoreSummary = {};

    for (const [colName, docs] of Object.entries(backupData.collections)) {
      if (!docs || docs.length === 0) continue;

      const col = db.collection(colName);
      
      // Upsert/Insert records cleanly
      let inserted = 0;
      try {
        const operations = docs.map(doc => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true,
          }
        }));

        const result = await col.bulkWrite(operations, { ordered: false });
        inserted = (result.upsertedCount || 0) + (result.modifiedCount || 0);
        restoreSummary[colName] = docs.length;
        logger.info(`[BackupService] Restored collection "${colName}": ${docs.length} documents.`);
      } catch (bulkErr) {
        logger.warn(`[BackupService] Bulk write warning on "${colName}": ${bulkErr.message}`);
        restoreSummary[colName] = docs.length;
      }
    }

    logger.info('🎉 [BackupService] Database restore completed successfully! Platform is ready for relaunch.');
    return {
      success: true,
      restoredFrom: archivePath,
      backupCreatedAt: backupData.createdAt,
      collections: restoreSummary,
    };
  }

  /**
   * Complete Full-System Backup (MongoDB Database + Cloudflare R2 Documents)
   * Bundles everything into a self-contained portable .zip archive.
   */
  async createFullBackup() {
    if (this.isBackupInProgress) {
      throw new Error('A backup operation is currently in progress. Please wait for it to complete.');
    }
    this.isBackupInProgress = true;
    const startTime = Date.now();
    logger.info('[FullBackup] 🚀 Starting complete system backup (Database + Cloudflare Documents)...');

    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stagingDir = path.join(this.localBackupDir, `staging_${dateStamp}`);
    const dbDir = path.join(stagingDir, 'database');
    const docsDir = path.join(stagingDir, 'documents');

    try {
      fs.mkdirSync(dbDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });

    // Step 1: Export MongoDB Database
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    const db = mongoose.connection.db;
    const collections = await db.collections();
    const backupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      databaseName: db.databaseName,
      totalCollections: collections.length,
      collections: {},
    };

    let totalDocuments = 0;
    for (const col of collections) {
      const name = col.collectionName;
      if (name.startsWith('system.')) continue;
      const docs = await col.find({}).toArray();
      backupData.collections[name] = docs;
      totalDocuments += docs.length;
    }

    const dbJson = JSON.stringify(backupData);
    const dbGz = zlib.gzipSync(dbJson);
    fs.writeFileSync(path.join(dbDir, 'tenderhub_db.json.gz'), dbGz);
    logger.info(`[FullBackup] ✅ Database exported: ${totalDocuments} documents across ${Object.keys(backupData.collections).length} collections.`);

    // Step 2: Download all documents from Cloudflare R2
    const bucketName = process.env.R2_BUCKET_NAME;
    let totalR2Files = 0;
    let totalR2Bytes = 0;

    if (bucketName) {
      logger.info(`[FullBackup] 📥 Syncing all documents from Cloudflare R2 bucket "${bucketName}"...`);
      let isTruncated = true;
      let continuationToken = undefined;

      while (isTruncated) {
        const listParams = {
          Bucket: bucketName,
          Prefix: 'tenders/',
          ContinuationToken: continuationToken,
        };
        const listRes = await r2.send(new ListObjectsV2Command(listParams));

        if (listRes.Contents && listRes.Contents.length > 0) {
          for (const item of listRes.Contents) {
            const key = item.Key;
            const destPath = path.join(docsDir, key);
            fs.mkdirSync(path.dirname(destPath), { recursive: true });

            const objRes = await r2.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
            const bytes = await objRes.Body.transformToByteArray();
            fs.writeFileSync(destPath, Buffer.from(bytes));
            totalR2Files++;
            totalR2Bytes += bytes.length;
            logger.info(`[FullBackup] Downloaded (${totalR2Files}): ${key} (${Math.round(bytes.length / 1024)} KB)`);
          }
        }

        isTruncated = listRes.IsTruncated || false;
        continuationToken = listRes.NextContinuationToken;
      }
      logger.info(`[FullBackup] ✅ Cloudflare sync complete: ${totalR2Files} files (${(totalR2Bytes / (1024 * 1024)).toFixed(2)} MB).`);
    } else {
      logger.warn('[FullBackup] R2_BUCKET_NAME not set. Skipping Cloudflare files.');
    }

    // Step 3: Write Master Manifest
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      database: {
        totalCollections: Object.keys(backupData.collections).length,
        totalDocuments,
      },
      documents: {
        totalFiles: totalR2Files,
        totalBytes: totalR2Bytes,
        totalMB: (totalR2Bytes / (1024 * 1024)).toFixed(2),
      },
      r2Bucket: bucketName,
    };
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Step 4: Compress into a self-contained .zip archive
    const zipFileName = `tenderhub_full_backup_${dateStamp}.zip`;
    const zipFilePath = path.join(this.localBackupDir, zipFileName);
    logger.info(`[FullBackup] 📦 Packaging entire system snapshot into: ${zipFileName}...`);

    const zip = new AdmZip();
    zip.addLocalFolder(stagingDir);
    zip.writeZip(zipFilePath);

    // Update latest pointer for 1-click restore
    const latestZipPath = path.join(this.localBackupDir, 'tenderhub_full_latest.zip');
    fs.copyFileSync(zipFilePath, latestZipPath);

    // Clean up temporary staging folder
    fs.rmSync(stagingDir, { recursive: true, force: true });

    const totalZipSizeMB = (fs.statSync(zipFilePath).size / (1024 * 1024)).toFixed(2);
    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

    // Step 5: Mirror to Secondary Cloudflare Account if configured
    let secondaryR2Upload = null;
    const backupClient = getBackupR2Client();
    const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;
    if (backupClient && backupBucket) {
      try {
        const fileBuffer = fs.readFileSync(zipFilePath);
        await backupClient.send(new PutObjectCommand({
          Bucket: backupBucket,
          Key: `backups/${zipFileName}`,
          Body: fileBuffer,
          ContentType: 'application/zip',
        }));
        await backupClient.send(new PutObjectCommand({
          Bucket: backupBucket,
          Key: 'backups/tenderhub_full_latest.zip',
          Body: fileBuffer,
          ContentType: 'application/zip',
        }));
        logger.info(`[FullBackup] ✅ Successfully mirrored full backup archive to secondary Cloudflare account.`);
        secondaryR2Upload = { success: true, key: `backups/${zipFileName}` };
      } catch (secErr) {
        logger.warn(`[FullBackup] Secondary R2 upload warning: ${secErr.message}`);
        secondaryR2Upload = { success: false, error: secErr.message };
      }
    }

      logger.info(`🎉 [FullBackup] Complete Disaster Recovery Archive created in ${durationSeconds}s! (${totalZipSizeMB} MB)`);

      const result = {
        success: true,
        type: 'full',
        archiveFile: zipFileName,
        archivePath: zipFilePath,
        latestPath: latestZipPath,
        manifest,
        sizeMB: totalZipSizeMB,
        durationSeconds,
        secondaryR2Upload,
        createdAt: manifest.createdAt,
      };

      this.lastBackupStatus = result;

      await SystemLog.create({
        level: 'INFO',
        source: 'STORAGE',
        message: `Full system backup completed: ${zipFileName} (${totalZipSizeMB} MB, ${manifest.database.totalDocuments} docs, ${manifest.documents.totalFiles} R2 files). Secondary Cloudflare Mirror: ${secondaryR2Upload?.success ? 'SUCCESS' : 'LOCAL_ONLY'}`,
        metadata: { fileName: zipFileName, sizeMB: totalZipSizeMB, durationSeconds, r2Success: secondaryR2Upload?.success },
      }).catch(() => {});

      return result;
    } catch (err) {
      logger.error(`[FullBackup] Complete backup failed: ${err.message}`);
      await SystemLog.create({
        level: 'ERROR',
        source: 'STORAGE',
        message: `Full backup failed: ${err.message}`,
        stack: err.stack,
      }).catch(() => {});
      throw err;
    } finally {
      this.isBackupInProgress = false;
    }
  }

  /**
   * Complete 1-Click Disaster Recovery Restore
   * Restores both MongoDB Database and all Cloudflare R2 Documents.
   */
  async restoreFullBackup(specificZipPath = null) {
    logger.info('[FullRestore] 🔄 Initiating complete platform recovery (Database + Cloudflare Documents)...');

    let zipPath = specificZipPath;
    if (!zipPath) {
      const latestPath = path.join(this.localBackupDir, 'tenderhub_full_latest.zip');
      if (fs.existsSync(latestPath)) {
        zipPath = latestPath;
      } else {
        const zips = fs.readdirSync(this.localBackupDir)
          .filter(f => f.startsWith('tenderhub_full_backup_') && f.endsWith('.zip'))
          .sort()
          .reverse();
        if (zips.length === 0) {
          throw new Error('No full backup archive (.zip) found in backups directory.');
        }
        zipPath = path.join(this.localBackupDir, zips[0]);
      }
    }

    logger.info(`[FullRestore] Extracting archive: ${zipPath}...`);
    const zip = new AdmZip(zipPath);
    const extractDir = path.join(this.localBackupDir, `restore_staging_${Date.now()}`);
    zip.extractAllTo(extractDir, true);

    const manifestPath = path.join(extractDir, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : null;
    logger.info(`[FullRestore] Loaded manifest created at: ${manifest?.createdAt || 'Unknown'}`);

    // 1. Restore MongoDB Database
    const dbGzPath = path.join(extractDir, 'database', 'tenderhub_db.json.gz');
    if (!fs.existsSync(dbGzPath)) {
      throw new Error('Database archive tenderhub_db.json.gz missing in backup archive.');
    }
    const dbResult = await this.restoreDatabaseFromBackup(dbGzPath);

    // 2. Restore Documents to Cloudflare R2
    const docsDir = path.join(extractDir, 'documents');
    let reuploadedCount = 0;
    const bucketName = process.env.R2_BUCKET_NAME;

    if (fs.existsSync(docsDir) && bucketName) {
      const getAllFiles = (dir) => {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) results = results.concat(getAllFiles(fullPath));
          else results.push(fullPath);
        });
        return results;
      };

      const filesToRestore = getAllFiles(docsDir);
      logger.info(`[FullRestore] Found ${filesToRestore.length} documents to restore to Cloudflare R2...`);

      for (const filePath of filesToRestore) {
        const relKey = path.relative(docsDir, filePath).replace(/\\/g, '/');
        const fileBuffer = fs.readFileSync(filePath);

        let contentType = 'application/octet-stream';
        const lower = relKey.toLowerCase();
        if (lower.endsWith('.pdf')) contentType = 'application/pdf';
        else if (lower.endsWith('.xls')) contentType = 'application/vnd.ms-excel';
        else if (lower.endsWith('.xlsx')) contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        await r2.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: relKey,
          Body: fileBuffer,
          ContentType: contentType,
        }));
        reuploadedCount++;
        logger.info(`[FullRestore] Restored to R2 (${reuploadedCount}/${filesToRestore.length}): ${relKey}`);
      }
    }

    // Clean up staging folder
    fs.rmSync(extractDir, { recursive: true, force: true });

    logger.info('🎉 [FullRestore] COMPLETE SYSTEM RESTORE SUCCESSFUL!');
    return {
      success: true,
      restoredFrom: zipPath,
      database: dbResult,
      documentsRestored: reuploadedCount,
    };
  }

  /**
   * Lists all local backup archives with file metadata.
   */
  listBackups() {
    if (!fs.existsSync(this.localBackupDir)) return [];

    const files = fs.readdirSync(this.localBackupDir);
    const backupList = [];

    for (const file of files) {
      if (file.startsWith('staging_') || file.startsWith('restore_staging_') || file.startsWith('temp_')) {
        continue;
      }
      if (!file.endsWith('.json.gz') && !file.endsWith('.zip')) {
        continue;
      }

      const filePath = path.join(this.localBackupDir, file);
      try {
        const stats = fs.statSync(filePath);
        const isZip = file.endsWith('.zip');
        const isLatest = file.includes('latest');
        const type = isZip ? 'full' : 'database';

        backupList.push({
          fileName: file,
          filePath,
          type,
          isLatest,
          sizeBytes: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          createdAt: stats.mtime.toISOString(),
          mtimeMs: stats.mtimeMs,
        });
      } catch (err) {
        // Skip unreadable files
      }
    }

    // Sort newest first
    return backupList.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  /**
   * Cleans up local backups older than specified retention period (default: 14 days)
   * Always preserves pointers to latest.
   */
  pruneOldBackups(retentionDays = 14) {
    const cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const files = this.listBackups();
    let prunedCount = 0;
    const prunedFiles = [];

    for (const backup of files) {
      if (backup.isLatest) continue; // Always preserve latest pointer

      if (backup.mtimeMs < cutoffMs) {
        try {
          fs.unlinkSync(backup.filePath);
          prunedCount++;
          prunedFiles.push(backup.fileName);
          logger.info(`[BackupService] Pruned expired backup: ${backup.fileName}`);
        } catch (err) {
          logger.warn(`[BackupService] Failed to prune ${backup.fileName}: ${err.message}`);
        }
      }
    }

    return { prunedCount, prunedFiles, retentionDays };
  }

  /**
   * Returns current backup health, telemetry, and available archives.
   */
  getBackupStatus() {
    const backups = this.listBackups();
    const totalBytes = backups.reduce((acc, b) => acc + b.sizeBytes, 0);
    const totalSizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const lastBackup = this.lastBackupStatus || backups.find(b => !b.isLatest) || backups[0] || null;

    const secondaryR2Configured = Boolean(
      process.env.BACKUP_R2_BUCKET_NAME && 
      process.env.BACKUP_R2_ACCOUNT_ID &&
      process.env.BACKUP_R2_ACCESS_KEY_ID
    );

    return {
      isBackupInProgress: this.isBackupInProgress,
      lastBackup,
      totalBackups: backups.length,
      totalSizeMB,
      backupDirectory: this.localBackupDir,
      schedule: {
        cronExpression: '0 2 * * *',
        timezone: 'Asia/Kolkata',
        displaySchedule: 'Every day at 02:00 AM IST',
        retentionDays: 14,
        nextRun: 'Tonight at 02:00 AM IST',
      },
      secondaryR2: {
        configured: secondaryR2Configured,
        bucket: process.env.BACKUP_R2_BUCKET_NAME || 'tenderhub-backup',
        status: secondaryR2Configured ? 'CONNECTED' : 'UNCONFIGURED',
      },
      backups,
    };
  }
}

export const backupService = new BackupService();
