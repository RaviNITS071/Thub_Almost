/**
 * @file backend/src/scripts/migrateDeptKeys.js
 * @description Migration utility to backfill department code (dept.code) into existing
 * MongoDB tenders and reorganize Cloudflare R2 objects under canonical department prefixes:
 * tenders/{deptCode}/{tenderId}_{publishedDate}/
 * Also uploads self-describing tender.json metadata package for each tender.
 */
import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import { 
  r2, 
  getBackupR2Client, 
  extractDeptCode, 
  formatTenderStorageKey, 
  uploadJsonToR2 
} from '../utils/r2Storage.js';
import { 
  ListObjectsV2Command, 
  CopyObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';

async function runMigration() {
  console.log('\n======================================================');
  console.log('🚀 Initiating Department Canonical Key & Self-Describing Package Migration');
  console.log('📌 Target Structure: tenders/{deptCode}/{tenderId}_{publishedDate}/');
  console.log('📄 Includes: Notice PDF + BOQ XLS + tender.json (Self-Describing Package)');
  console.log('======================================================\n');

  await connectDB();

  const bucketName = process.env.R2_BUCKET_NAME;
  const backupClient = getBackupR2Client();
  const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;

  const tenders = await Tender.find({});
  console.log(`Found ${tenders.length} tender(s) in MongoDB to inspect.\n`);

  let migratedMongoCount = 0;
  let r2ObjectsMoved = 0;
  let tenderJsonUploaded = 0;

  for (let i = 0; i < tenders.length; i++) {
    const tender = tenders[i];
    const tenderId = tender.sourceTenderId;
    const publishedDate = tender.publishedDate;

    // 1. Resolve department code
    const deptCode = extractDeptCode(tenderId, tender.organisationChain, tender.departmentCode);
    const deptName = tender.departmentName || (tender.organisationChain ? tender.organisationChain.split('||')[0].trim() : 'Agriculture Production Department');
    const newFolderKey = formatTenderStorageKey(tenderId, publishedDate, deptCode);
    const oldFolderKey = tender.r2StorageKey;

    console.log(`[${i + 1}/${tenders.length}] Tender: ${tenderId} -> Dept: ${deptCode} | Key: ${newFolderKey}`);

    // 2. Check if Cloudflare R2 objects need reorganization
    if (bucketName && oldFolderKey && !oldFolderKey.includes('/')) {
      const oldPrefix = `tenders/${oldFolderKey}/`;
      const newPrefix = `tenders/${newFolderKey}/`;

      if (oldPrefix !== newPrefix) {
        try {
          const listRes = await r2.send(new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: oldPrefix,
          }));

          if (listRes.Contents && listRes.Contents.length > 0) {
            for (const item of listRes.Contents) {
              const fileName = item.Key.split('/').pop();
              const destKey = `${newPrefix}${fileName}`;

              // Copy to new key in primary R2
              await r2.send(new CopyObjectCommand({
                Bucket: bucketName,
                CopySource: `${bucketName}/${item.Key}`,
                Key: destKey,
              }));

              // Delete old key
              await r2.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: item.Key,
              }));

              r2ObjectsMoved++;
              console.log(`   📦 Moved R2: ${item.Key} -> ${destKey}`);

              // Also copy/move in secondary backup R2 if configured
              if (backupClient && backupBucket) {
                try {
                  await backupClient.send(new CopyObjectCommand({
                    Bucket: backupBucket,
                    CopySource: `${backupBucket}/${item.Key}`,
                    Key: destKey,
                  }));
                  await backupClient.send(new DeleteObjectCommand({
                    Bucket: backupBucket,
                    Key: item.Key,
                  }));
                } catch {
                  // Ignore secondary copy error
                }
              }
            }
          }
        } catch (r2Err) {
          console.warn(`   ⚠️ R2 move warning for ${tenderId}:`, r2Err.message);
        }
      }
    }

    // 3. Update MongoDB document with new department code and URLs
    const updateFields = {
      departmentCode: deptCode,
      departmentName: deptName,
      r2StorageKey: newFolderKey,
    };

    // Update pdfUrls
    if (tender.pdfUrls && tender.pdfUrls.length > 0) {
      updateFields.pdfUrls = tender.pdfUrls.map(url => {
        if (!url) return url;
        if (url.includes(`tenders/${deptCode}/`)) return url;
        return url.replace('tenders/', `tenders/${deptCode}/`);
      });
    }

    // Update boqFileUrl
    if (tender.boqFileUrl) {
      if (!tender.boqFileUrl.includes(`tenders/${deptCode}/`)) {
        updateFields.boqFileUrl = tender.boqFileUrl.replace('tenders/', `tenders/${deptCode}/`);
      }
    }

    // Update nitDocuments and workItemDocuments URLs
    if (tender.nitDocuments && tender.nitDocuments.length > 0) {
      updateFields.nitDocuments = tender.nitDocuments.map(doc => ({
        ...doc.toObject ? doc.toObject() : doc,
        fileUrl: doc.fileUrl ? doc.fileUrl.replace('tenders/', `tenders/${deptCode}/`) : doc.fileUrl,
      }));
    }

    if (tender.workItemDocuments && tender.workItemDocuments.length > 0) {
      updateFields.workItemDocuments = tender.workItemDocuments.map(doc => ({
        ...doc.toObject ? doc.toObject() : doc,
        fileUrl: doc.fileUrl ? doc.fileUrl.replace('tenders/', `tenders/${deptCode}/`) : doc.fileUrl,
      }));
    }

    const updatedDoc = await Tender.findByIdAndUpdate(tender._id, { $set: updateFields }, { new: true });
    migratedMongoCount++;

    // 4. Upload self-describing tender.json package to Cloudflare R2
    if (bucketName) {
      try {
        await uploadJsonToR2({
          jsonData: updatedDoc.toObject(),
          fileName: 'tender.json',
          tenderId,
          publishedDate,
          deptCode,
        });
        tenderJsonUploaded++;
      } catch (jsonErr) {
        console.warn(`   ⚠️ tender.json upload warning:`, jsonErr.message);
      }
    }
  }

  console.log('\n======================================================');
  console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
  console.log(`🗄️ MongoDB Records Updated: ${migratedMongoCount}`);
  console.log(`☁️ Cloudflare R2 Objects Reorganized: ${r2ObjectsMoved}`);
  console.log(`📄 Self-Describing tender.json Packages Created: ${tenderJsonUploaded}`);
  console.log('======================================================\n');

  await closeDB();
  process.exit(0);
}

runMigration().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
