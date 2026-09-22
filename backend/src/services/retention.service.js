/**
 * @file backend/src/services/retention.service.js
 * @description Automatic Purging Service for Expired Tenders.
 * Purges expired tenders from both MongoDB Atlas, Primary Cloudflare R2,
 * and Secondary Backup Cloudflare R2 simultaneously with zero retention delay (no 14-day stay).
 */
import Tender from '../models/Tender.js';
import SystemLog from '../models/SystemLog.js';
import { 
  deleteTenderFolderFromR2, 
  deleteFolderFromBackupR2, 
  getBackupR2Client 
} from '../utils/r2Storage.js';
import { connectDB } from '../config/db.js';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import pino from 'pino';

const logger = pino();

export class RetentionService {
  /**
   * Evaluates all tenders against current Indian Standard Time.
   * Marks status as 'EXPIRED' if current time is greater than closing date and time.
   */
  async markExpiredTenders() {
    const now = new Date();
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    const result = await Tender.updateMany(
      {
        closingDate: { $lt: now },
        status: { $ne: 'EXPIRED' }
      },
      { $set: { status: 'EXPIRED' } }
    );

    if (result.modifiedCount > 0) {
      logger.info(`[RetentionService] 🏷️ Marked ${result.modifiedCount} tender(s) as EXPIRED (Current time > closing date & time).`);
    }
    return result.modifiedCount;
  }

  /**
   * Purges all expired tenders (closingDate < now or status === 'EXPIRED')
   * from MongoDB, Primary Cloudflare R2, and Secondary Backup Cloudflare R2.
   * Ensures that expired tender data (both JSON metadata and documents)
   * is deleted immediately with NO 14-day stay in the backup server.
   */
  async purgeExpiredTenders(triggeredBy = 'MANUAL') {
    const now = new Date();
    logger.info(`[RetentionService] 🧹 Starting purge of expired tenders (Closing Date < ${now.toISOString()})...`);

    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    // Mark any newly expired tenders first
    await this.markExpiredTenders().catch(() => {});

    const filter = {
      $or: [
        { closingDate: { $lt: now } },
        { status: 'EXPIRED' }
      ]
    };

    const expiredTenders = await Tender.find(filter, {
      _id: 1,
      sourceTenderId: 1,
      publishedDate: 1,
      closingDate: 1,
      r2StorageKey: 1,
      departmentCode: 1,
      organisationChain: 1,
      title: 1,
    });

    const totalFound = expiredTenders.length;
    logger.info(`[RetentionService] Identified ${totalFound} expired tender(s) in MongoDB to purge.`);

    let purgedMongoCount = 0;
    let totalPrimaryFilesDeleted = 0;
    let totalBackupFilesDeleted = 0;
    const errors = [];

    for (const tender of expiredTenders) {
      try {
        // 1. Delete associated folder from Cloudflare R2 (Primary AND Backup Server)
        const storageKey = tender.r2StorageKey || tender.sourceTenderId;
        const dept = tender.departmentCode || tender.organisationChain;
        const r2Result = await deleteTenderFolderFromR2(storageKey, tender.publishedDate, dept);

        totalPrimaryFilesDeleted += (r2Result?.deletedCount || 0);
        totalBackupFilesDeleted += (r2Result?.backupDeletedCount || 0);

        // 2. Delete document from MongoDB
        await Tender.deleteOne({ _id: tender._id });
        purgedMongoCount++;

        logger.info(`[RetentionService] Purged expired tender ${tender.sourceTenderId} (Files removed -> Primary R2: ${r2Result?.deletedCount || 0}, Backup R2: ${r2Result?.backupDeletedCount || 0})`);
      } catch (err) {
        logger.error(`[RetentionService] Error purging tender ${tender.sourceTenderId}: ${err.message}`);
        errors.push({ tenderId: tender.sourceTenderId, error: err.message });
      }
    }

    // 3. Backup Server Sweep: Clean any orphaned or expired tender data directly on the backup server
    let backupSweepResult = { sweptFoldersCount: 0, sweptFilesCount: 0 };
    try {
      backupSweepResult = await this.purgeExpiredFromBackupServer(now);
      totalBackupFilesDeleted += backupSweepResult.sweptFilesCount;
      if (backupSweepResult.sweptFoldersCount > 0) {
        logger.info(`[RetentionService] Backup server sweep purged ${backupSweepResult.sweptFoldersCount} expired folder(s) (${backupSweepResult.sweptFilesCount} files).`);
      }
    } catch (sweepErr) {
      logger.warn(`[RetentionService] Backup server sweep warning: ${sweepErr.message}`);
    }

    const totalR2FilesDeleted = totalPrimaryFilesDeleted + totalBackupFilesDeleted;

    // 4. Log audit entry to SystemLog
    await SystemLog.create({
      level: 'INFO',
      source: 'DATABASE',
      message: `Expired Tenders Purge: Removed ${purgedMongoCount} tender(s) from MongoDB, ${totalPrimaryFilesDeleted} file(s) from Primary R2, and ${totalBackupFilesDeleted} file(s) from Secondary Backup R2. Triggered by ${triggeredBy}. (Zero retention delay).`,
      metadata: {
        purgedMongoCount,
        totalPrimaryFilesDeleted,
        totalBackupFilesDeleted,
        backupSweptFolders: backupSweepResult.sweptFoldersCount,
        triggeredBy,
      },
    }).catch(() => {});

    logger.info(`✅ [RetentionService] Purge complete! Removed ${purgedMongoCount}/${totalFound} tenders from MongoDB, ${totalPrimaryFilesDeleted} files from Primary R2, and ${totalBackupFilesDeleted} files from Secondary Backup R2.`);

    return {
      success: true,
      totalFound,
      purgedCount: purgedMongoCount,
      primaryFilesDeleted: totalPrimaryFilesDeleted,
      backupFilesDeleted: totalBackupFilesDeleted,
      totalR2FilesDeleted,
      backupSweptFolders: backupSweepResult.sweptFoldersCount,
      errors,
    };
  }

  /**
   * Sweeps the secondary backup Cloudflare R2 bucket for any tender folders
   * where tender data has expired (closingDate < now or marked EXPIRED / removed from MongoDB).
   * Ensures that expired JSON and documents never linger in backup storage for 14 days.
   */
  async purgeExpiredFromBackupServer(cutoffDate = new Date()) {
    const backupClient = getBackupR2Client();
    const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;

    if (!backupClient || !backupBucket) {
      return { sweptFoldersCount: 0, sweptFilesCount: 0 };
    }

    logger.info('[RetentionService] 🔍 Scanning Secondary Backup R2 for expired tender folders...');
    let sweptFoldersCount = 0;
    let sweptFilesCount = 0;

    try {
      // Step 1: List all tender.json files in the backup bucket
      let isTruncated = true;
      let continuationToken = undefined;
      const tenderJsonKeys = [];

      while (isTruncated) {
        const listRes = await backupClient.send(new ListObjectsV2Command({
          Bucket: backupBucket,
          Prefix: 'tenders/',
          ContinuationToken: continuationToken,
        }));

        if (listRes.Contents) {
          for (const item of listRes.Contents) {
            if (item.Key.endsWith('/tender.json') || item.Key.endsWith('tender.json')) {
              tenderJsonKeys.push(item.Key);
            }
          }
        }

        isTruncated = listRes.IsTruncated || false;
        continuationToken = listRes.NextContinuationToken;
      }

      logger.info(`[RetentionService] Found ${tenderJsonKeys.length} tender metadata file(s) in backup server to audit.`);

      // Step 2: For each tender.json, inspect its closingDate
      for (const jsonKey of tenderJsonKeys) {
        try {
          const folderPrefix = jsonKey.substring(0, jsonKey.lastIndexOf('/') + 1);

          const getRes = await backupClient.send(new GetObjectCommand({
            Bucket: backupBucket,
            Key: jsonKey,
          }));
          const bytes = await getRes.Body.transformToByteArray();
          const jsonText = Buffer.from(bytes).toString('utf-8');
          const tenderData = JSON.parse(jsonText);

          const rawClosing = tenderData.closingDate || tenderData.ClosingDate || tenderData.tenderClosingDate;
          let isExpired = false;

          if (rawClosing) {
            const closingTime = new Date(rawClosing).getTime();
            if (!isNaN(closingTime) && closingTime < cutoffDate.getTime()) {
              isExpired = true;
            }
          }

          // If closingDate in tender.json is expired, or if status is EXPIRED
          if (isExpired || tenderData.status === 'EXPIRED') {
            logger.info(`[RetentionService] Expired tender detected in backup server: ${folderPrefix} (Closing: ${rawClosing}). Purging...`);
            const delRes = await deleteFolderFromBackupR2(folderPrefix);
            sweptFoldersCount++;
            sweptFilesCount += delRes.deletedCount;
          }
        } catch (readErr) {
          logger.warn(`[RetentionService] Could not audit ${jsonKey} on backup server: ${readErr.message}`);
        }
      }

      return { sweptFoldersCount, sweptFilesCount };
    } catch (err) {
      logger.error(`[RetentionService] Backup server sweep error: ${err.message}`);
      return { sweptFoldersCount, sweptFilesCount, error: err.message };
    }
  }
}

export const retentionService = new RetentionService();
