import 'dotenv/config';
import { connectDB, closeDB } from './src/config/db.js';
import Tender from './src/models/Tender.js';

async function check() {
  await connectDB();
  const count = await Tender.countDocuments();
  const withPdf = await Tender.countDocuments({ 'pdfUrls.0': { $exists: true } });
  const withBoq = await Tender.countDocuments({ boqFileUrl: { $ne: null } });
  console.log({ totalTenders: count, withPdf, withBoq });
  const withPdfDocs = await Tender.find({ 'pdfUrls.0': { $exists: true } }).limit(5);
  withPdfDocs.forEach(d => console.log(d.sourceTenderId, d.pdfUrls));
  await closeDB();
}

check().catch(console.error);
