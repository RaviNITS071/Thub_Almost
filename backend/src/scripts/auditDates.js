import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function auditAllDates() {
  await connectDB();

  const tenders = await Tender.find({ sourcePortal: 'JK_TENDERS' })
    .select('sourceTenderId publishedDate publishedDateStr publishedTime publishedDateOnly bidSubmissionStartDateStr documentDownloadStartDateStr createdAt updatedAt')
    .lean();

  console.log(`Total Tenders in DB: ${tenders.length}`);

  let anomalies = [];
  let correctCount = 0;
  let missingPubStr = 0;
  let sameAsCreated = 0;
  let pubDateAfterBidStart = 0;

  for (const t of tenders) {
    if (!t.publishedDateStr) {
      missingPubStr++;
      anomalies.push({ id: t.sourceTenderId, reason: 'Missing publishedDateStr', t });
      continue;
    }

    // Check if publishedDate is within 15 minutes of createdAt
    if (t.createdAt) {
      const diffMs = Math.abs(new Date(t.publishedDate).getTime() - new Date(t.createdAt).getTime());
      if (diffMs < 15 * 60 * 1000) {
        sameAsCreated++;
        anomalies.push({ id: t.sourceTenderId, reason: 'PublishedDate matches Scrape/Created time', t });
        continue;
      }
    }

    // Check if publishedDate is AFTER bidSubmissionStartDate (logically impossible in tender portals)
    if (t.bidSubmissionStartDateStr) {
      const pubD = new Date(t.publishedDate);
      // parse bid start
      const parts = t.bidSubmissionStartDateStr.match(/^(\d{1,2})[-/]([a-zA-Z]{3}|\d{1,2})[-/](\d{4})/);
      if (parts) {
        // if publishedDate is > 1 day after bidSubmissionStartDate, that's an anomaly!
        // (normally published date is <= bid submission start date)
        const bidStartD = new Date(t.bidSubmissionStartDateStr.replace(/-/g, ' '));
        if (!isNaN(bidStartD.getTime()) && pubD.getTime() - bidStartD.getTime() > 24 * 60 * 60 * 1000) {
          pubDateAfterBidStart++;
          anomalies.push({ id: t.sourceTenderId, reason: 'PublishedDate is days AFTER bidSubmissionStartDate', t });
          continue;
        }
      }
    }

    correctCount++;
  }

  console.log(`\n--- AUDIT SUMMARY ---`);
  console.log(`✅ Correct Tenders: ${correctCount}`);
  console.log(`⚠️ Total Anomalies: ${anomalies.length}`);
  console.log(`   - Published date matches scrape time: ${sameAsCreated}`);
  console.log(`   - Published date is after bid start date: ${pubDateAfterBidStart}`);
  console.log(`   - Missing publishedDateStr: ${missingPubStr}`);

  console.log(`\nDetailed inspection of the 18 scraping-time tenders:`);
  const scrapeTimeTenders = anomalies.filter(a => a.reason === 'PublishedDate matches Scrape/Created time');
  scrapeTimeTenders.forEach(a => {
    console.log(`ID: ${a.id} | pubStr: "${a.t.publishedDateStr}" | docDownloadStartStr: "${a.t.documentDownloadStartDateStr}" | bidSubStartStr: "${a.t.bidSubmissionStartDateStr}"`);
  });

  await closeDB();
}

auditAllDates().catch(console.error);
