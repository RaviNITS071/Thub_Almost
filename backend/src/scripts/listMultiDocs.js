import 'dotenv/config';
import mongoose from 'mongoose';

async function list() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.db.collection('tenders');
  
  const multi = await collection.find({
    $or: [
      { 'nitDocuments.1': { $exists: true } },
      { 'workItemDocuments.1': { $exists: true } }
    ]
  }).project({
    _id: 1,
    sourceTenderId: 1,
    tenderReferenceNumber: 1,
    nitDocsCount: { $size: { $ifNull: ['$nitDocuments', []] } },
    workDocsCount: { $size: { $ifNull: ['$workItemDocuments', []] } }
  }).toArray();

  console.log(`Found ${multi.length} multi-document tenders:`);
  multi.forEach(m => {
    console.log(`- http://localhost:5173/tenders/${m._id} | Ref: ${m.tenderReferenceNumber} | NIT: ${m.nitDocsCount} | Work: ${m.workDocsCount}`);
  });

  await mongoose.disconnect();
}

list().catch(console.error);
