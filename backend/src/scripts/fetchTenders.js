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
          savedCount++;
          if (tender.pdfUrls && tender.pdfUrls.length > 0) pdfCount += tender.pdfUrls.length;
          if (tender.boqZipUrl || tender.boqFileUrl) boqCount++;

          console.log(`✅ [${savedCount}/${limit}] Saved to MongoDB & R2: ${tender.sourceTenderId}`);
          console.log(`   📁 Key: ${tender.r2StorageKey}`);
          console.log(`   📄 NIT Docs: ${tender.nitDocuments?.length || 0} | 📦 BOQ ZIP: ${tender.boqZipUrl ? 'Secured (' + (tender.zipFileSizeKb || '?') + ' KB)' : 'None'} | 📊 Status: ${tender.pdfFetchStatus}`);
        } catch (saveErr) {
          console.error(`❌ Error logging tender ${tender.sourceTenderId}: ${saveErr.message}`);
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
