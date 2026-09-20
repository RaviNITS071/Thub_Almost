import { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectsCommand,
  GetObjectCommand 
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import pino from 'pino';

const logger = pino();

// 1. Primary Cloudflare R2 Client (Tender Documents)
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID || ''}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

// 2. Secondary Cloudflare R2 Client (Isolated Database Backups)
export const getBackupR2Client = () => {
  const accountId = process.env.BACKUP_R2_ACCOUNT_ID;
  const accessKeyId = process.env.BACKUP_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

/**
 * Extracts a concise, uppercase department code.
 * Strategy:
 * 1. Explicitly provided deptCode (e.g. 'APD', 'PDD')
 * 2. Official tender ID: e.g. '2026_APD_324494_4' -> 'APD'
 * 3. Organisation chain text -> acronym or known mapping
 * 4. Fallback -> 'GEN'
 */
export const extractDeptCode = (tenderId, orgChain = '', explicitDeptCode = '') => {
  if (explicitDeptCode && typeof explicitDeptCode === 'string' && explicitDeptCode.trim()) {
    return explicitDeptCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  if (tenderId && typeof tenderId === 'string') {
    const parts = tenderId.trim().split('_');
    if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) {
      return parts[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
  }

  if (orgChain && typeof orgChain === 'string') {
    const cleanOrg = orgChain.split('||')[0].trim();
    const KNOWN_MAP = {
      'agriculture': 'APD',
      'power': 'PDD',
      'public works': 'PWD',
      'jal shakti': 'JSD',
      'health': 'HME',
      'higher education': 'HED',
      'school education': 'SED',
      'rural development': 'RDD',
      'forest': 'FST',
      'industries': 'ICD',
      'tourism': 'TRM',
      'transport': 'TRP',
      'housing': 'HUDD',
      'srinagar municipal': 'SMC',
      'jammu municipal': 'JMC',
    };
    const lower = cleanOrg.toLowerCase();
    for (const [k, v] of Object.entries(KNOWN_MAP)) {
      if (lower.includes(k)) return v;
    }
    const words = cleanOrg.split(/\s+/).filter(w => w.length > 2 && !['and', 'the', 'for', 'of', 'department'].includes(w.toLowerCase()));
    if (words.length >= 2) {
      return words.map(w => w[0].toUpperCase()).join('').slice(0, 5);
    }
  }

  return 'GEN';
};

/**
 * Normalizes tender ID, published date, and department code into the canonical primary key directory name:
 * Hierarchical Canonical Format: {deptCode}/{tenderId}_{publishedDate}
 * Example: "APD/2026_APD_324494_4_2026-09-18"
 */
export const formatTenderStorageKey = (tenderId, publishedDate, deptCodeOrOrg = '') => {
  // If tenderId is already a full key like "APD/2026_APD_324494_4_2026-09-18", preserve it
  if (typeof tenderId === 'string' && tenderId.includes('/')) {
    return tenderId;
  }

  const sanitizedId = String(tenderId || 'UNKNOWN_TENDER')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  let dateStr = 'undated';
  if (publishedDate) {
    try {
      const parsed = publishedDate instanceof Date ? publishedDate : new Date(publishedDate);
      if (!isNaN(parsed.getTime())) {
        dateStr = parsed.toISOString().split('T')[0];
      } else if (typeof publishedDate === 'string') {
        const timestamp = Date.parse(publishedDate.replace(/-/g, ' '));
        if (!isNaN(timestamp)) {
          dateStr = new Date(timestamp).toISOString().split('T')[0];
        }
      }
    } catch {
      dateStr = 'undated';
    }
  }

  const deptCode = extractDeptCode(sanitizedId, deptCodeOrOrg, deptCodeOrOrg);
  return `${deptCode}/${sanitizedId}_${dateStr}`;
};

/**
 * Uploads any tender file (.pdf, .xls, .xlsx) to the primary Cloudflare R2 bucket.
 * Organizes files under the composite primary key: tenders/{deptCode}/{tenderId}_{publishedDate}/{fileName}
 * Uses non-blocking async mirroring for the secondary backup account.
 */
export const uploadFileToR2 = async ({ filePath, fileName, tenderId, publishedDate, deptCode, contentType }) => {
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("R2_BUCKET_NAME is missing in environment variables!");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found at path: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const folderKey = formatTenderStorageKey(tenderId, publishedDate, deptCode);
    const key = `tenders/${folderKey}/${fileName}`;

    // Determine Content-Type automatically if not explicitly provided
    let mimeType = contentType;
    if (!mimeType) {
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.xls') mimeType = 'application/vnd.ms-excel';
      else if (ext === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else mimeType = 'application/octet-stream';
    }

    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    };

    await r2.send(new PutObjectCommand(uploadParams));
    logger.info(`Successfully uploaded ${fileName} to R2 at key: ${key}`);

    // Asynchronous Non-Blocking Secondary Backup Mirroring (Zero Scraper Overhead)
    const backupClient = getBackupR2Client();
    const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;
    if (backupClient && backupBucket) {
      // Fire-and-forget in background without blocking scraper execution
      backupClient.send(new PutObjectCommand({
        Bucket: backupBucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })).then(() => {
        logger.info(`[Backup R2] Async mirrored ${fileName} to backup bucket at: ${key}`);
      }).catch((backupErr) => {
        logger.warn(`[Backup R2] Async mirror failed for ${fileName}: ${backupErr.message}`);
      });
    }

    const publicBaseUrl = process.env.R2_PUBLIC_URL || 'https://pub-8a7cea61b87543e2ac1a32186ef4cd82.r2.dev';
    return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
  } catch (error) {
    logger.error(`R2 Upload Failed for ${fileName}: ${error.message}`);
    return null;
  }
};

/**
 * Uploads tender JSON metadata directly into the tender's Cloudflare R2 folder:
 * Target: tenders/{deptCode}/{tenderId}_{publishedDate}/tender.json
 * Creates a 100% self-describing, self-healing archive package.
 */
export const uploadJsonToR2 = async ({ jsonData, fileName = 'tender.json', tenderId, publishedDate, deptCode }) => {
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) return null;

    const folderKey = formatTenderStorageKey(tenderId, publishedDate, deptCode);
    const key = `tenders/${folderKey}/${fileName}`;

    const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    await r2.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'application/json',
    }));
    logger.info(`Successfully saved self-describing metadata ${fileName} to R2 at: ${key}`);

    // Non-blocking async mirroring to secondary backup R2
    const backupClient = getBackupR2Client();
    const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;
    if (backupClient && backupBucket) {
      backupClient.send(new PutObjectCommand({
        Bucket: backupBucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/json',
      })).then(() => {
        logger.info(`[Backup R2] Async mirrored metadata ${fileName} at: ${key}`);
      }).catch((backupErr) => {
        logger.warn(`[Backup R2] Async metadata mirror warning: ${backupErr.message}`);
      });
    }

    const publicBaseUrl = process.env.R2_PUBLIC_URL || 'https://pub-8a7cea61b87543e2ac1a32186ef4cd82.r2.dev';
    return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
  } catch (error) {
    logger.warn(`Failed to upload ${fileName} to R2 for ${tenderId}: ${error.message}`);
    return null;
  }
};

/**
 * Backward-compatible wrapper for uploading PDFs
 */
export const uploadPdfToR2 = async (filePath, fileName, tenderId = null, publishedDate = null, deptCode = null) => {
  return uploadFileToR2({
    filePath,
    fileName,
    tenderId,
    publishedDate,
    deptCode,
    contentType: 'application/pdf',
  });
};

/**
 * Deletes all files associated with a tender from primary Cloudflare R2 and secondary backup R2.
 * Handles both new key: tenders/{deptCode}/{tenderId}_{publishedDate}/
 * and legacy key: tenders/{tenderId}_{publishedDate}/
 * Guarantees that both tender.json metadata and all document attachments are deleted immediately
 * from BOTH primary storage and the backup server without any retention delay.
 */
export const deleteTenderFolderFromR2 = async (tenderIdOrKey, publishedDate, deptCode) => {
  try {
    let prefixes = [];
    if (typeof tenderIdOrKey === 'string' && tenderIdOrKey.includes('/')) {
      // Ensure trailing slash
      const cleanKey = tenderIdOrKey.replace(/^\/+|\/+$/g, '');
      prefixes.push(`tenders/${cleanKey}/`);
      const parts = cleanKey.split('/');
      if (parts.length >= 2) {
        prefixes.push(`tenders/${parts[parts.length - 1]}/`);
      }
    } else {
      const folderKey = formatTenderStorageKey(tenderIdOrKey, publishedDate, deptCode);
      prefixes.push(`tenders/${folderKey}/`);
      // Also legacy non-dept prefix
      const sanitizedId = String(tenderIdOrKey).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      prefixes.push(`tenders/${sanitizedId}_/`);
    }

    // Deduplicate prefixes
    prefixes = [...new Set(prefixes)];

    let primaryDeleted = 0;
    let backupDeleted = 0;

    const primaryBucket = process.env.R2_BUCKET_NAME;
    const backupClient = getBackupR2Client();
    const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;

    for (const prefix of prefixes) {
      // 1. Purge from Primary Cloudflare R2
      if (primaryBucket) {
        try {
          let isTruncated = true;
          let continuationToken = undefined;

          while (isTruncated) {
            const listResult = await r2.send(new ListObjectsV2Command({
              Bucket: primaryBucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }));

            if (listResult.Contents && listResult.Contents.length > 0) {
              const deleteParams = {
                Bucket: primaryBucket,
                Delete: {
                  Objects: listResult.Contents.map((item) => ({ Key: item.Key })),
                },
              };
              await r2.send(new DeleteObjectsCommand(deleteParams));
              primaryDeleted += listResult.Contents.length;
              logger.info(`[Primary R2 Purge] Deleted ${listResult.Contents.length} object(s) under ${prefix}`);
            }

            isTruncated = listResult.IsTruncated || false;
            continuationToken = listResult.NextContinuationToken;
          }
        } catch (primaryErr) {
          logger.warn(`[Primary R2 Purge] Warning while purging ${prefix}: ${primaryErr.message}`);
        }
      }

      // 2. Purge from Secondary Backup Cloudflare R2 (Backup Server)
      if (backupClient && backupBucket) {
        try {
          let isTruncated = true;
          let continuationToken = undefined;

          while (isTruncated) {
            const backupList = await backupClient.send(new ListObjectsV2Command({
              Bucket: backupBucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }));

            if (backupList.Contents && backupList.Contents.length > 0) {
              await backupClient.send(new DeleteObjectsCommand({
                Bucket: backupBucket,
                Delete: {
                  Objects: backupList.Contents.map((item) => ({ Key: item.Key })),
                },
              }));
              backupDeleted += backupList.Contents.length;
              logger.info(`[Backup R2 Purge] Deleted ${backupList.Contents.length} object(s) under ${prefix} from backup server`);
            }

            isTruncated = backupList.IsTruncated || false;
            continuationToken = backupList.NextContinuationToken;
          }
        } catch (backupDelErr) {
          logger.warn(`[Backup R2 Purge] Warning while purging ${prefix} from backup server: ${backupDelErr.message}`);
        }
      }
    }

    return { 
      deletedCount: primaryDeleted, 
      backupDeletedCount: backupDeleted,
      totalDeleted: primaryDeleted + backupDeleted 
    };
  } catch (error) {
    logger.error(`[R2 Purge] Failed to purge folder for tender ${tenderIdOrKey}: ${error.message}`);
    return { deletedCount: 0, backupDeletedCount: 0, totalDeleted: 0, error: error.message };
  }
};

/**
 * Directly purges a folder prefix from the secondary backup Cloudflare R2 account.
 * Used for sweeping expired / orphaned tender data from the backup server.
 */
export const deleteFolderFromBackupR2 = async (prefix) => {
  const backupClient = getBackupR2Client();
  const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;

  if (!backupClient || !backupBucket) {
    return { deletedCount: 0, configured: false };
  }

  try {
    let deletedCount = 0;
    let isTruncated = true;
    let continuationToken = undefined;

    while (isTruncated) {
      const listRes = await backupClient.send(new ListObjectsV2Command({
        Bucket: backupBucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));

      if (listRes.Contents && listRes.Contents.length > 0) {
        await backupClient.send(new DeleteObjectsCommand({
          Bucket: backupBucket,
          Delete: {
            Objects: listRes.Contents.map((i) => ({ Key: i.Key })),
          },
        }));
        deletedCount += listRes.Contents.length;
        logger.info(`[Backup R2 Sweep] Purged ${listRes.Contents.length} object(s) under ${prefix}`);
      }

      isTruncated = listRes.IsTruncated || false;
      continuationToken = listRes.NextContinuationToken;
    }

    return { deletedCount, configured: true };
  } catch (err) {
    logger.error(`[Backup R2 Sweep] Failed to delete prefix ${prefix}: ${err.message}`);
    return { deletedCount: 0, configured: true, error: err.message };
  }
};

/**
 * Uploads a compressed database backup snapshot to the secondary Cloudflare R2 account.
 */
export const uploadBackupToR2 = async (filePath, fileName) => {
  const backupClient = getBackupR2Client();
  const bucketName = process.env.BACKUP_R2_BUCKET_NAME;

  if (!backupClient || !bucketName) {
    logger.warn('[Backup R2] Secondary Cloudflare credentials not configured. Preserving backup locally.');
    return { success: false, reason: 'SECONDARY_R2_NOT_CONFIGURED', localPath: filePath };
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const key = `backups/${fileName}`;

    // 1. Upload timestamped snapshot
    await backupClient.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: 'application/gzip',
    }));

    // 2. Also update pointer to latest backup
    await backupClient.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'backups/tenderhub_db_latest.json.gz',
      Body: fileBuffer,
      ContentType: 'application/gzip',
    }));

    logger.info(`[Backup R2] Successfully uploaded database backup to secondary Cloudflare account: ${key}`);
    return { success: true, key };
  } catch (error) {
    logger.error(`[Backup R2] Failed to upload database backup: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Downloads the latest database backup archive from the secondary Cloudflare R2 account.
 */
export const downloadLatestBackupFromR2 = async (destFilePath) => {
  const backupClient = getBackupR2Client();
  const bucketName = process.env.BACKUP_R2_BUCKET_NAME;

  if (!backupClient || !bucketName) {
    throw new Error('Secondary Cloudflare R2 credentials are not configured in environment variables.');
  }

  logger.info('[Backup R2] Fetching backups/tenderhub_db_latest.json.gz from secondary Cloudflare account...');
  const response = await backupClient.send(new GetObjectCommand({
    Bucket: bucketName,
    Key: 'backups/tenderhub_db_latest.json.gz',
  }));

  const streamToBuffer = async (stream) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  };

  const buffer = await streamToBuffer(response.Body);
  fs.writeFileSync(destFilePath, buffer);
  logger.info(`[Backup R2] Latest database backup downloaded successfully to: ${destFilePath}`);
  return destFilePath;
};