import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkCrawlDates() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tenderhub');
  const Tender = mongoose.model('Tender', new mongoose.Schema({}, { strict: false }));

  const all = await Tender.find({ publishedDate: { $ne: null }, createdAt: { $ne: null } })
    .select('sourceTenderId publishedDate createdAt documentDownloadStartDate')
    .lean();

  let crawlTimeCount = 0;
  const sampleCrawlDates = [];
  for (const t of all) {
    const pub = new Date(t.publishedDate).getTime();
    const created = new Date(t.createdAt).getTime();
    if (Math.abs(pub - created) < 30000) {
      crawlTimeCount++;
      if (sampleCrawlDates.length < 5) sampleCrawlDates.push(t);
    }
  }

  console.log('Total tenders checked:', all.length);
  console.log('Tenders where publishedDate is equal/close to createdAt (crawl time):', crawlTimeCount);
  console.log('Sample tenders with crawl time:', sampleCrawlDates);
  await mongoose.disconnect();
}
checkCrawlDates();
