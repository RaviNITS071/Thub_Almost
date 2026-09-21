import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function findTender() {
  await connectDB();
  
  // Find tenders with download start on 14 Sept and opening on 28 Sept
  const dStartMin = new Date('2026-09-14T00:00:00+05:30');
  const dStartMax = new Date('2026-09-14T23:59:59+05:30');
  
  const bOpenMin = new Date('2026-09-28T00:00:00+05:30');
  const bOpenMax = new Date('2026-09-28T23:59:59+05:30');

  const matches = await Tender.find({
    documentDownloadStartDate: { $gte: dStartMin, $lte: dStartMax },
    bidOpeningDate: { $gte: bOpenMin, $lte: bOpenMax }
  }).lean();

  console.log(`Found ${matches.length} matching tenders:`);
  for (const m of matches) {
    console.log({
      id: m.sourceTenderId,
      title: m.title?.substring(0, 40),
      publishedDate: m.publishedDate,
      publishedDateIST: m.publishedDate ? m.publishedDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      downloadStartDateIST: m.documentDownloadStartDate ? m.documentDownloadStartDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      downloadEndDateIST: m.documentDownloadEndDate ? m.documentDownloadEndDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      bidStartIST: m.bidSubmissionStartDate ? m.bidSubmissionStartDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      bidEndIST: m.bidSubmissionEndDate ? m.bidSubmissionEndDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      bidOpeningIST: m.bidOpeningDate ? m.bidOpeningDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      createdAtIST: m.createdAt ? m.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      updatedAtIST: m.updatedAt ? m.updatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
    });
  }

  // Also search for any tender with publishedDate on 21 Sept 2026 around 07:10 PM (19:10 IST)
  const pMin = new Date('2026-09-21T19:00:00+05:30');
  const pMax = new Date('2026-09-21T19:20:00+05:30');
  const pMatches = await Tender.find({
    $or: [
      { publishedDate: { $gte: pMin, $lte: pMax } },
      { createdAt: { $gte: pMin, $lte: pMax } }
    ]
  }).lean();

  console.log(`\nFound ${pMatches.length} tenders around 21 Sept 07:10 PM:`);
  for (const p of pMatches) {
    console.log({
      id: p.sourceTenderId,
      publishedDateIST: p.publishedDate ? p.publishedDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      createdAtIST: p.createdAt ? p.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
    });
  }

  await closeDB();
}

findTender().catch(console.error);
