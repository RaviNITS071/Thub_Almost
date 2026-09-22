import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import JKTenderMetadataAdapter from '../services/adapters/JKTenderMetadataAdapter.js';

async function testSingleTender() {
  await connectDB();
  const targetId = '2026_RDPR_324703_22';
  const existing = await Tender.findOne({ sourceTenderId: targetId }).lean();
  if (!existing) {
    console.error(`Tender ${targetId} not found in DB!`);
    await closeDB();
    return;
  }

  console.log(`\n📌 BEFORE ENRICHMENT:`);
  console.log({
    sourceTenderId: existing.sourceTenderId,
    publishedDateStr: existing.publishedDateStr,
    publishedTime: existing.publishedTime,
    bidSubmissionStartDateStr: existing.bidSubmissionStartDateStr,
    bidSubmissionEndDateStr: existing.bidSubmissionEndDateStr,
    closingDateStr: existing.closingDateStr,
    closingTime: existing.closingTime,
    r2StorageKey: existing.r2StorageKey
  });

  const adapter = new JKTenderMetadataAdapter();
  const page = await adapter.initBrowser();

  console.log(`\n🌐 Navigating to RDD on portal to open ${targetId}...`);
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded' });
  const rddRow = page.locator("table#table tr[id^='informal']").filter({ hasText: 'Rural Development' }).first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
    rddRow.locator("td:nth-child(3) a").first().click()
  ]);

  // Find and click the tender
  const link = page.locator("table.list_table tr[id^='informal']").filter({ hasText: targetId }).locator("td:nth-child(5) a, a").first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
    link.click()
  ]);

  console.log(`🔍 Extracting metadata from page...`);
  const rawDetails = await adapter.extractDetailsFromPage(page, { sourceTenderId: targetId });
  console.log(`📋 Extracted rawDetails dates:`, {
    publishedDateStr: rawDetails.publishedDateStr,
    documentDownloadStartDateStr: rawDetails.documentDownloadStartDateStr,
    documentDownloadEndDateStr: rawDetails.documentDownloadEndDateStr,
    bidSubmissionStartDateStr: rawDetails.bidSubmissionStartDateStr,
    bidSubmissionEndDateStr: rawDetails.bidSubmissionEndDateStr,
    closingDateStr: rawDetails.closingDateStr
  });

  console.log(`💾 Updating MongoDB and uploading tender.json to Cloudflare R2...`);
  const updated = await adapter.updateTenderAndUploadR2(rawDetails, existing);

  console.log(`\n🎉 AFTER ENRICHMENT (From MongoDB):`);
  console.log({
    sourceTenderId: updated.sourceTenderId,
    publishedDateStr: updated.publishedDateStr,
    publishedTime: updated.publishedTime,
    bidSubmissionStartDateStr: updated.bidSubmissionStartDateStr,
    bidSubmissionEndDateStr: updated.bidSubmissionEndDateStr,
    closingDateStr: updated.closingDateStr,
    closingTime: updated.closingTime,
    r2StorageKey: updated.r2StorageKey
  });

  await adapter.closeBrowser();
  await closeDB();
}

testSingleTender().catch(console.error);
