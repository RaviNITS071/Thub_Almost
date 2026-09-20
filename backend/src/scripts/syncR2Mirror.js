/**
 * @file backend/src/scripts/syncR2Mirror.js
 * @description Synchronizes all document files (.pdf, .xls, .xlsx, tender.json)
 * from the Primary Cloudflare R2 bucket to the Secondary Backup Cloudflare R2 bucket.
 * Creates an exact 1:1 replica of the document storage tree.
 */
import 'dotenv/config';
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, getBackupR2Client } from '../utils/r2Storage.js';

export async function syncR2Buckets() {
  const primaryBucket = process.env.R2_BUCKET_NAME;
  const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;
  const backupClient = getBackupR2Client();

  if (!primaryBucket || !backupBucket || !backupClient) {
    throw new Error('Primary or Secondary Cloudflare R2 credentials are not configured in .env');
  }

  console.log('\n======================================================');
  console.log('🔄 Initiating Cloudflare R2 Cross-Account Document Sync...');
  console.log(`📍 Primary Source:   ${primaryBucket}`);
  console.log(`☁️  Secondary Target: ${backupBucket}`);
  console.log('======================================================\n');

  // Step 1: List all existing keys in Secondary Bucket to avoid duplicate uploads
  console.log('🔍 Scanning existing objects in secondary backup bucket...');
  const existingBackupKeys = new Set();
  let isBackupTruncated = true;
  let backupContinuationToken = undefined;

  while (isBackupTruncated) {
    const listRes = await backupClient.send(new ListObjectsV2Command({
      Bucket: backupBucket,
      ContinuationToken: backupContinuationToken,
    }));

    if (listRes.Contents) {
      for (const item of listRes.Contents) {
        existingBackupKeys.add(item.Key);
      }
    }

    isBackupTruncated = listRes.IsTruncated || false;
    backupContinuationToken = listRes.NextContinuationToken;
  }
  console.log(`✅ Secondary bucket currently contains ${existingBackupKeys.size} object(s).`);

  // Step 2: Scan Primary Bucket and sync missing files
  console.log('\n📥 Scanning primary bucket and replicating missing documents...');
  const primaryKeys = new Set();
  let isPrimaryTruncated = true;
  let primaryContinuationToken = undefined;
  let syncedCount = 0;
  let skippedCount = 0;
  let totalBytesSynced = 0;

  while (isPrimaryTruncated) {
    const listRes = await r2.send(new ListObjectsV2Command({
      Bucket: primaryBucket,
      Prefix: 'tenders/',
      ContinuationToken: primaryContinuationToken,
    }));

    if (listRes.Contents) {
      for (const item of listRes.Contents) {
        const key = item.Key;
        primaryKeys.add(key);

        // If already in backup bucket, skip to conserve time and operations
        if (existingBackupKeys.has(key)) {
          skippedCount++;
          continue;
        }

        try {
          // Determine content type
          let contentType = 'application/octet-stream';
          const lower = key.toLowerCase();
          if (lower.endsWith('.pdf')) contentType = 'application/pdf';
          else if (lower.endsWith('.xls')) contentType = 'application/vnd.ms-excel';
          else if (lower.endsWith('.xlsx')) contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else if (lower.endsWith('.json')) contentType = 'application/json';

          // Download from primary
          const getRes = await r2.send(new GetObjectCommand({
            Bucket: primaryBucket,
            Key: key,
          }));
          const bytes = await getRes.Body.transformToByteArray();

          // Upload to secondary
          await backupClient.send(new PutObjectCommand({
            Bucket: backupBucket,
            Key: key,
            Body: Buffer.from(bytes),
            ContentType: contentType,
          }));

          syncedCount++;
          totalBytesSynced += bytes.length;
          const sizeKb = (bytes.length / 1024).toFixed(1);
          console.log(`[Synced ${syncedCount}] ✅ ${key} (${sizeKb} KB) -> Mirrored to ${backupBucket}`);
        } catch (err) {
          console.error(`❌ Failed to sync ${key}: ${err.message}`);
        }
      }
    }

    isPrimaryTruncated = listRes.IsTruncated || false;
    primaryContinuationToken = listRes.NextContinuationToken;
  }

  // Step 3: Prune Expired/Deleted Tenders from Secondary Backup Bucket (Zero Retention)
  console.log('\n🧹 Pruning expired or deleted tender documents from secondary backup bucket...');
  const keysToPrune = [];
  for (const backupKey of existingBackupKeys) {
    // Only prune tender documents, not database snapshots under backups/
    if (backupKey.startsWith('tenders/') && !primaryKeys.has(backupKey)) {
      keysToPrune.push({ Key: backupKey });
    }
  }

  let prunedCount = 0;
  if (keysToPrune.length > 0) {
    console.log(`🗑️  Found ${keysToPrune.length} expired/deleted file(s) in backup server to prune.`);
    // Delete in chunks of 1000 (S3 DeleteObjects limit)
    for (let i = 0; i < keysToPrune.length; i += 1000) {
      const chunk = keysToPrune.slice(i, i + 1000);
      await backupClient.send(new DeleteObjectsCommand({
        Bucket: backupBucket,
        Delete: { Objects: chunk },
      }));
      prunedCount += chunk.length;
    }
    console.log(`✅ Pruned ${prunedCount} expired tender file(s) from secondary backup bucket.`);
  } else {
    console.log('✅ Backup bucket contains zero orphaned/expired files.');
  }

  const totalMb = (totalBytesSynced / (1024 * 1024)).toFixed(2);
  console.log('\n======================================================');
  console.log('🎉 CLOUDFLARE R2 DOCUMENT MIRRORING & PURGE COMPLETED!');
  console.log(`📄 Newly Replicated: ${syncedCount} file(s) (${totalMb} MB)`);
  console.log(`⏭️  Already In Sync:   ${skippedCount} file(s)`);
  console.log(`🗑️  Expired Pruned:    ${prunedCount} file(s) from Backup Server`);
  console.log('======================================================\n');

  return {
    success: true,
    syncedCount,
    skippedCount,
    prunedCount,
    totalMb,
  };
}

// Run standalone if executed directly via node
const isMain = process.argv[1] && process.argv[1].endsWith('syncR2Mirror.js');
if (isMain) {
  syncR2Buckets()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal sync error:', err);
      process.exit(1);
    });
}
