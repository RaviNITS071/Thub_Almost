import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.db.collection('tenders');
  
  const total = await collection.countDocuments();
  const completedPdfs = await collection.countDocuments({ pdfFetchStatus: 'COMPLETED' });
  const pendingPdfs = await collection.countDocuments({ pdfFetchStatus: 'PENDING' });
  const pendingBoq = await collection.countDocuments({ boqFetchStatus: 'PENDING' });
  const hasWorkDocs = await collection.countDocuments({ 'workItemDocuments.0': { $exists: true } });
  const hasNitDocs = await collection.countDocuments({ 'nitDocuments.0': { $exists: true } });
  const multiNitDocs = await collection.countDocuments({ 'nitDocuments.1': { $exists: true } });
  const multiWorkDocs = await collection.countDocuments({ 'workItemDocuments.1': { $exists: true } });

  console.log({
    totalTenders: total,
    withNitDocuments: hasNitDocs,
    withMultiNotices: multiNitDocs,
    withWorkItemDocuments: hasWorkDocs,
    withMultiWorkDocuments: multiWorkDocs,
    completedPdfs,
    pendingPdfs,
    pendingBoq
  });

  await mongoose.disconnect();
}

main().catch(console.error);
