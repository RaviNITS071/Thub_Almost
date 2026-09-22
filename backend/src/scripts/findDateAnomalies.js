import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function investigate() {
  await connectDB();

  // Find tenders where publishedDate is close to createdAt (within 10 minutes)
  const allTenders = await Tender.find({ sourcePortal: 'JK_TENDERS' })
    .select('sourceTenderId publishedDate publishedDateStr publishedTime publishedDateOnly createdAt updatedAt organisationChain')
    .lean();

  console.log(`Total tenders: ${allTenders.length}`);

  let closeToCreated = [];
  let noPublishedStr = [];
  let publishedDateNull = [];

  for (const t of allTenders) {
    if (!t.publishedDate) {
      publishedDateNull.push(t);
      continue;
    }
    if (!t.publishedDateStr) {
      noPublishedStr.push(t);
    }
    if (t.createdAt) {
      const diffMs = Math.abs(new Date(t.publishedDate).getTime() - new Date(t.createdAt).getTime());
      if (diffMs < 10 * 60 * 1000) { // within 10 minutes
        closeToCreated.push(t);
      }
    }
  }

  console.log(`Tenders where publishedDate is within 10m of createdAt: ${closeToCreated.length}`);
  console.log(`Tenders with NO publishedDateStr: ${noPublishedStr.length}`);
  console.log(`Tenders with publishedDate null: ${publishedDateNull.length}`);

  if (closeToCreated.length > 0) {
    console.log('Sample close to createdAt:');
    closeToCreated.slice(0, 10).forEach(t => {
      console.log(`ID: ${t.sourceTenderId} | pubDate: ${t.publishedDate} | pubStr: "${t.publishedDateStr}" | created: ${t.createdAt} | org: ${t.organisationChain?.split('||')[0]}`);
    });
  }

  if (noPublishedStr.length > 0) {
    console.log('Sample NO publishedDateStr:');
    noPublishedStr.slice(0, 10).forEach(t => {
      console.log(`ID: ${t.sourceTenderId} | pubDate: ${t.publishedDate} | pubStr: "${t.publishedDateStr}" | created: ${t.createdAt} | org: ${t.organisationChain?.split('||')[0]}`);
    });
  }

  // Let's also check if there are tenders where publishedDate is recent (e.g. today 22-Sep or yesterday 21-Sep)
  const sep21_22 = allTenders.filter(t => {
    const d = new Date(t.publishedDate);
    return d.getFullYear() === 2026 && d.getMonth() === 8 && (d.getDate() === 21 || d.getDate() === 22);
  });
  console.log(`Tenders with publishedDate on 21-Sep or 22-Sep: ${sep21_22.length}`);
  if (sep21_22.length > 0) {
    console.log('Sample 21/22 Sep:');
    sep21_22.slice(0, 10).forEach(t => {
      console.log(`ID: ${t.sourceTenderId} | pubDate: ${t.publishedDate?.toISOString()} | pubStr: "${t.publishedDateStr}" | pubTime: "${t.publishedTime}" | created: ${t.createdAt?.toISOString()}`);
    });
  }

  const dateAgg = await Tender.aggregate([
    { $match: { sourcePortal: 'JK_TENDERS' } },
    { $group: { _id: '$publishedDateOnly', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('Top 25 publishedDateOnly counts:');
  console.log(dateAgg.slice(0, 25));

  // Check how many have null publishedDateOnly
  const nullPubOnly = await Tender.countDocuments({
    sourcePortal: 'JK_TENDERS',
    $or: [{ publishedDateOnly: null }, { publishedDateOnly: { $exists: false } }]
  });
  console.log('Null or missing publishedDateOnly count:', nullPubOnly);

  // Check 2026_RDPR_323722_35
  const sampleT = await Tender.findOne({ sourceTenderId: '2026_RDPR_323722_35' }).lean();
  console.log('Details of 2026_RDPR_323722_35:', {
    sourceTenderId: sampleT?.sourceTenderId,
    publishedDate: sampleT?.publishedDate,
    publishedDateStr: sampleT?.publishedDateStr,
    publishedTime: sampleT?.publishedTime,
    publishedDateOnly: sampleT?.publishedDateOnly,
    documentDownloadStartDateStr: sampleT?.documentDownloadStartDateStr,
    bidSubmissionStartDateStr: sampleT?.bidSubmissionStartDateStr,
    createdAt: sampleT?.createdAt,
    updatedAt: sampleT?.updatedAt
  });

  await closeDB();
}

investigate().catch(console.error);
