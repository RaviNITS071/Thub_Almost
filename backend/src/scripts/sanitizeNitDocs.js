import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function sanitize() {
  await connectDB();
  console.log('Fetching tenders to inspect nitDocuments...');
  const tenders = await Tender.find({ 'nitDocuments.0': { $exists: true } }, { nitDocuments: 1 }).lean();
  console.log(`Inspecting ${tenders.length} tenders...`);

  const ops = [];
  for (const t of tenders) {
    const originalCount = (t.nitDocuments || []).length;
    const valid = (t.nitDocuments || []).filter(d => {
      const name = d.documentName || '';
      const isDoc = /\.(pdf|doc|docx)$/i.test(name) || name.toLowerCase().includes('tendernotice');
      const isNoise = name.includes('Search') || name.includes('Result') || /^\d{1,2}-[a-zA-Z]{3}-\d{4}$/.test(name) || name.includes('Fee/PreQual') || name.includes('Finance') || name === 'BOQ' || name === 'Other Document';
      return isDoc && !isNoise;
    });

    if (valid.length !== originalCount) {
      ops.push({
        updateOne: {
          filter: { _id: t._id },
          update: { $set: { nitDocuments: valid } }
        }
      });
    }
  }

  console.log(`Found ${ops.length} tenders to sanitize.`);
  if (ops.length > 0) {
    const res = await Tender.bulkWrite(ops);
    console.log(`✅ Successfully sanitized ${res.modifiedCount} tenders!`);
  } else {
    console.log('✅ All nitDocuments are already clean!');
  }

  await closeDB();
  process.exit(0);
}

sanitize().catch(console.error);
