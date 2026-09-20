import 'dotenv/config';
import { JKTenderAdapter } from '../services/adapters/JKTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function run() {
  const limit = parseInt(process.argv[2], 10) || 10;
  const syncMode = 'DEPARTMENT'; // Strictly fetch from "Tenders by Organisation"
  console.log(`\n======================================================`);
  console.log(`🚀 Starting JKTenders Scraper for ${limit} Tenders`);
  console.log(`📌 Source: Tenders by Organisation (FrontEndTendersByOrganisation)`);
  console.log(`📌 Primary Key: tenders/{tenderId}_{publishedDate}/`);
  console.log(`📌 Documents: .pdf (NIT Document) & direct .zip (BOQ & Work Package)`);
  console.log(`📌 .zip archives are streamed directly to Cloudflare R2 without local extraction`);
  console.log(`======================================================\n`);

  await connectDB();
  const adapter = new JKTenderAdapter();

  try {
    let savedCount = 0;
    let boqCount = 0;
    let pdfCount = 0;

    const result = await adapter.fetchList(1, { syncMode: 'DEPARTMENT', limit }, async (batch) => {
      for (const tender of batch) {
        try {
          const normalized = adapter.normalize(tender);

          const existing = await Tender.findOne({
            sourcePortal: normalized.sourcePortal,
            sourceTenderId: normalized.sourceTenderId
          }).lean();

          if (existing) {
            // Merge nitDocuments without duplicates
            const existingNit = existing.nitDocuments || [];
            const newNit = normalized.nitDocuments || [];
            const mergedNit = [...existingNit];
            for (const doc of newNit) {
              if (!mergedNit.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                mergedNit.push(doc);
              }
            }
            normalized.nitDocuments = mergedNit;

            // Merge pdfUrls
            const existingPdfs = existing.pdfUrls || [];
            const newPdfs = normalized.pdfUrls || [];
            normalized.pdfUrls = Array.from(new Set([...existingPdfs, ...newPdfs]));

            // Merge workItemDocuments without duplicates
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
            if (!normalized.boqZipUrl && existing.boqZipUrl) {
              normalized.boqZipUrl = existing.boqZipUrl;
              normalized.zipFileName = existing.zipFileName;
              normalized.zipFileSizeKb = existing.zipFileSizeKb;
            }
          }

          await Tender.findOneAndUpdate(
            { sourcePortal: normalized.sourcePortal, sourceTenderId: normalized.sourceTenderId },
            { $set: normalized },
            { upsert: true, returnDocument: 'after' }
          );
          savedCount++;
          if (normalized.pdfUrls && normalized.pdfUrls.length > 0) pdfCount += normalized.pdfUrls.length;
          if (normalized.boqZipUrl || normalized.boqFileUrl) boqCount++;

          console.log(`✅ [${savedCount}/${limit}] Saved: ${normalized.sourceTenderId}`);
          console.log(`   📁 Key: ${normalized.r2StorageKey}`);
          console.log(`   📄 NIT Docs: ${normalized.nitDocuments?.length || 0} | 📦 BOQ ZIP: ${normalized.boqZipUrl ? 'Secured (' + (normalized.zipFileSizeKb || '?') + ' KB)' : 'None'} | 📊 Status: ${normalized.pdfFetchStatus}`);
        } catch (saveErr) {
          console.error(`❌ Error saving tender ${tender.sourceTenderId}: ${saveErr.message}`);
        }
      }
    });

    console.log('\n======================================================');
    console.log('🎉 INGESTION RUN COMPLETED');
    console.log(`Total Tenders Saved: ${savedCount}`);
    console.log(`Total PDFs Uploaded: ${pdfCount}`);
    console.log(`Total BOQ XLS Uploaded: ${boqCount}`);
    console.log('======================================================\n');

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ Ingestion run failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
