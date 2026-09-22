/**
 * @file backend/src/scripts/fixDateAnomalies.js
 * @description Repairs Published Date anomalies in MongoDB Atlas and refreshes tender.json in Cloudflare R2.
 * 
 * Target: Tenders where Published Date got corrupted with the crawl runtime timestamp
 * (e.g. 22-Sep-2026) while the true Document Download / Bid Submission Start Date is in the past.
 * In Indian NIC e-procurement portals, Published Date cannot be later than Document Download Start Date.
 * 
 * Usage:
 *   node src/scripts/fixDateAnomalies.js
 */

import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import { parseISTDate, formatStandardTime, extractDateParts } from '../utils/dateUtils.js';
import { extractDeptCode, formatTenderStorageKey, uploadJsonToR2 } from '../utils/r2Storage.js';

async function fixAnomalies() {
  console.log(`\n======================================================================`);
  console.log(`🛠️ FIXING PUBLISHED DATE ANOMALIES IN MONGODB & R2`);
  console.log(`======================================================================\n`);

  await connectDB();

  const allTenders = await Tender.find({})
    .select('sourceTenderId title departmentCode organisationChain tenderReferenceNumber publishedDateStr publishedDate publishedTime publishedDateOnly documentDownloadStartDateStr documentDownloadStartDate bidSubmissionStartDateStr bidSubmissionStartDate closingDateStr nitDocuments workItemDocuments r2StorageKey')
    .lean();

  const toFix = [];

  for (const t of allTenders) {
    if (!t.publishedDateStr && !t.publishedDate) continue;

    const pubDate = t.publishedDate ? new Date(t.publishedDate) : parseISTDate(t.publishedDateStr);
    const docDate = t.documentDownloadStartDate ? new Date(t.documentDownloadStartDate) : parseISTDate(t.documentDownloadStartDateStr);
    const bidStartDate = t.bidSubmissionStartDate ? new Date(t.bidSubmissionStartDate) : parseISTDate(t.bidSubmissionStartDateStr);

    const refDate = (docDate && docDate.getFullYear() === 2026) ? docDate : ((bidStartDate && bidStartDate.getFullYear() === 2026) ? bidStartDate : null);
    const refDateStr = (docDate && docDate.getFullYear() === 2026) ? t.documentDownloadStartDateStr : ((bidStartDate && bidStartDate.getFullYear() === 2026) ? t.bidSubmissionStartDateStr : null);

    // In NIC eProcurement portals, Published Date cannot be later than Document Download / Bid Submission Start Date
    if (pubDate && refDate && (pubDate.getTime() > refDate.getTime())) {
      toFix.push({
        tender: t,
        refDateStr,
        refDate
      });
    }
  }

  console.log(`🎯 Found ${toFix.length} tender(s) requiring Published Date correction.\n`);

  let fixedCount = 0;
  let r2Count = 0;

  for (let i = 0; i < toFix.length; i++) {
    const { tender, refDateStr } = toFix[i];
    const newPubDate = parseISTDate(refDateStr);
    const newTime = formatStandardTime(refDateStr);
    const newDateOnly = extractDateParts(refDateStr).dateOnly;
    const deptCode = tender.departmentCode || extractDeptCode(tender.sourceTenderId, tender.organisationChain);
    const newFolderKey = formatTenderStorageKey(tender.sourceTenderId, newPubDate, deptCode);

    const updateFields = {
      publishedDate: newPubDate,
      publishedDateStr: refDateStr,
      publishedTime: newTime,
      publishedDateOnly: newDateOnly,
      r2StorageKey: newFolderKey,
      updatedAt: new Date()
    };

    // 1. Update in MongoDB
    const updated = await Tender.findByIdAndUpdate(tender._id, { $set: updateFields }, { returnDocument: 'after' }).lean();
    fixedCount++;

    // 2. Upload refreshed tender.json to Cloudflare R2
    try {
      await uploadJsonToR2({
        jsonData: updated,
        fileName: 'tender.json',
        tenderId: tender.sourceTenderId,
        publishedDate: newPubDate,
        deptCode
      });
      r2Count++;
    } catch (r2Err) {
      console.warn(`   ⚠️ R2 sync skipped for ${tender.sourceTenderId}: ${r2Err.message}`);
    }

    console.log(`[${i + 1}/${toFix.length}] ✅ Corrected ${tender.sourceTenderId}`);
    console.log(`   📅 Published Date: "${tender.publishedDateStr}" ➡️ "${refDateStr}" (${newTime})`);
    console.log(`   🔖 Tender Ref No:  "${tender.tenderReferenceNumber}"`);
    console.log(`   📦 R2 Storage:     "${newFolderKey}"\n`);
  }

  console.log(`======================================================================`);
  console.log(`🎉 Complete! Corrected ${fixedCount} tenders in MongoDB Atlas.`);
  console.log(`☁️ Synced ${r2Count} updated tender.json files to Cloudflare R2.`);
  console.log(`======================================================================\n`);

  await closeDB();
}

fixAnomalies().catch(async (err) => {
  console.error('Fatal error during fix:', err);
  await closeDB();
  process.exit(1);
});
