import 'dotenv/config';
import { JKTenderAdapter } from '../services/adapters/JKTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function run() {
  const limit = parseInt(process.argv[2], 10) || 15;
  const syncMode = process.argv[3] || 'DEPARTMENT';

  console.log('\n======================================================');
  console.log(`🚀 RELAUNCHING SCRAPER: COMPLETE MULTI-DOCUMENT INGESTION`);
  console.log(`📌 Target Limit: ${limit} Tenders (Mode: ${syncMode})`);
  console.log(`📌 Automated OCR Captcha: Active (Tesseract.js Engine)`);
  console.log(`📌 Documents: All Tender Notices & Corrigenda + All Zip Files`);
  console.log(`📌 Cloud Storage: Uploading 100% of files to Cloudflare R2`);
  console.log(`📌 Database: Deduplicating & Merging all documents in MongoDB`);
  console.log('======================================================\n');

  await connectDB();
  const adapter = new JKTenderAdapter();

  try {
    let savedCount = 0;
    let totalNitDocs = 0;
    let totalWorkDocs = 0;

    await adapter.fetchList(1, { syncMode, limit }, async (batch) => {
      for (const rawTender of batch) {
        try {
          const normalized = adapter.normalize(rawTender);

          // Find existing tender to merge documents without dropping any past files
          const existing = await Tender.findOne({
            sourcePortal: normalized.sourcePortal,
            sourceTenderId: normalized.sourceTenderId
          }).lean();

          if (existing) {
            // 1. Merge NIT documents
            const existingNit = existing.nitDocuments || [];
            const newNit = normalized.nitDocuments || [];
            const mergedNit = [...existingNit];
            for (const doc of newNit) {
              if (!mergedNit.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                mergedNit.push(doc);
              }
            }
            normalized.nitDocuments = mergedNit;

            // 2. Merge PDF URLs
            const existingPdfs = existing.pdfUrls || [];
            const newPdfs = normalized.pdfUrls || [];
            normalized.pdfUrls = Array.from(new Set([...existingPdfs, ...newPdfs]));

            // 3. Merge Work Item documents (Zip files)
            const existingWork = existing.workItemDocuments || [];
            const newWork = normalized.workItemDocuments || [];
            const mergedWork = [...existingWork];
            for (const doc of newWork) {
              if (!mergedWork.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                mergedWork.push(doc);
              }
            }
            normalized.workItemDocuments = mergedWork;

            if (!normalized.boqFileUrl && existing.boqFileUrl) {
              normalized.boqFileUrl = existing.boqFileUrl;
            }
          }

          normalized.pdfFetchStatus = (normalized.nitDocuments && normalized.nitDocuments.length > 0) ? 'COMPLETED' : normalized.pdfFetchStatus;
          normalized.boqFetchStatus = (normalized.boqFileUrl || (normalized.workItemDocuments && normalized.workItemDocuments.length > 0)) ? 'COMPLETED' : 'NOT_AVAILABLE';

          await Tender.findOneAndUpdate(
            { sourcePortal: normalized.sourcePortal, sourceTenderId: normalized.sourceTenderId },
            { $set: normalized },
            { upsert: true, returnDocument: 'after' }
          );

          savedCount++;
          const nitCount = normalized.nitDocuments?.length || 0;
          const workCount = normalized.workItemDocuments?.length || 0;
          totalNitDocs += nitCount;
          totalWorkDocs += workCount;

          console.log(`\n✅ [${savedCount}/${limit}] Ingested Tender: ${normalized.sourceTenderId}`);
          console.log(`   🏷️  Title: ${normalized.title?.slice(0, 50)}...`);
          console.log(`   📄 NIT Notices (${nitCount}): ${normalized.nitDocuments?.map(d => d.documentName).join(', ') || 'None'}`);
          console.log(`   📦 Work Item Docs (${workCount}): ${normalized.workItemDocuments?.map(d => d.documentName).join(', ') || 'None'}`);
          console.log(`   📊 BOQ Status: ${normalized.boqFetchStatus}`);
          console.log(`   📁 Primary Key: ${normalized.r2StorageKey}`);
        } catch (saveErr) {
          console.error(`❌ Error saving tender ${rawTender.sourceTenderId}: ${saveErr.message}`);
        }
      }
    });

    console.log('\n======================================================');
    console.log('🎉 COMPLETE INGESTION RUN FINISHED!');
    console.log(`Total Tenders Saved: ${savedCount}`);
    console.log(`Total NIT Documents Secured: ${totalNitDocs}`);
    console.log(`Total Work Item Documents Extracted & Saved: ${totalWorkDocs}`);
    console.log('======================================================\n');

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ Ingestion run encountered critical error:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
