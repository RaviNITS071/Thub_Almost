import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function check() {
  await connectDB();

  const total = await Tender.countDocuments({ sourcePortal: 'JK_TENDERS' });
  console.log('Total tenders in DB:', total);

  const sample = await Tender.find({ sourcePortal: 'JK_TENDERS' })
    .select('sourceTenderId publishedDate publishedDateStr publishedTime publishedDateOnly closingDateStr createdAt updatedAt')
    .sort({ _id: -1 })
    .limit(10)
    .lean();
  console.log('Latest 10 tenders in DB:');
  console.log(JSON.stringify(sample, null, 2));

  // Find tenders where publishedDateStr has different formats or look like today's/yesterday's fetch time
  const sampleRdd = await Tender.find({ sourcePortal: 'JK_TENDERS', organisationChain: { $regex: /Rural Development/i } })
    .select('sourceTenderId publishedDate publishedDateStr publishedTime publishedDateOnly closingDateStr createdAt')
    .sort({ _id: -1 })
    .limit(10)
    .lean();

  console.log('Sample RDD tenders:');
  console.log(JSON.stringify(sampleRdd, null, 2));

  // Count how many have publishedDateStr vs not
  const withPublishedDateStr = await Tender.countDocuments({ sourcePortal: 'JK_TENDERS', publishedDateStr: { $exists: true, $ne: null } });
  const withoutPublishedDateStr = await Tender.countDocuments({ sourcePortal: 'JK_TENDERS', $or: [{ publishedDateStr: null }, { publishedDateStr: { $exists: false } }] });

  console.log({ withPublishedDateStr, withoutPublishedDateStr });

  // Let's inspect a few where publishedDate might look suspicious
  const allDatesSample = await Tender.find({ sourcePortal: 'JK_TENDERS' })
    .select('sourceTenderId publishedDate publishedDateStr publishedTime publishedDateOnly createdAt')
    .limit(20)
    .lean();
  console.log('Random 20 tenders date fields:');
  allDatesSample.forEach(t => {
    console.log(`${t.sourceTenderId} | pubDate: ${t.publishedDate?.toISOString?.() || t.publishedDate} | pubStr: "${t.publishedDateStr}" | pubTime: "${t.publishedTime}" | pubOnly: "${t.publishedDateOnly}" | created: ${t.createdAt?.toISOString?.()}`);
  });

  await closeDB();
}

check().catch(console.error);
