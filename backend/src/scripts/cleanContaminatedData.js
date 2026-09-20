/**
 * @file backend/src/scripts/cleanContaminatedData.js
 * @description Migration script to sanitize `offlineInstruments` and `coversInfo`
 * across all tenders in MongoDB, purging leaked document filenames (.pdf, .xls, tendernotice, boq)
 * and restoring pristine sequential numbering.
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import Tender from '../models/Tender.js';

const VALID_INSTRUMENTS = [
  'demand draft',
  'bank guarantee',
  'bankers cheque',
  'bankers pay order(bpo)',
  'bankers pay order',
  'fixed deposit',
  'saving certificates',
  'cdr (cash deposit)',
  'cdr',
  'fdr',
  'rtgs',
  'neft',
  'treasury challan',
  'challan',
  'post office savings pass book',
  'national savings certificate'
];

function isGenuineInstrument(inst) {
  if (!inst || !inst.instrumentType) return false;
  const raw = String(inst.instrumentType).trim().toLowerCase();
  
  // Reject files, notices, boqs, and covers
  if (/\.(pdf|xls|xlsx|zip|rar|doc|docx)$/i.test(raw)) return false;
  if (/^(tendernotice|notice|nit|boq|corrigendum|tender documents|other document|work item)/i.test(raw)) return false;
  if (raw.includes('tendernotice') || raw.includes('.pdf') || raw.includes('.xls') || raw === 'boq') return false;
  if (raw.includes('prequal') || raw.includes('technical') || raw.includes('finance') || raw.includes('details') || raw.includes('tender reference')) return false;

  return VALID_INSTRUMENTS.some(valid => raw.includes(valid));
}

function isGenuineCover(cover) {
  if (!cover || !cover.coverType) return false;
  const cType = String(cover.coverType).trim().toLowerCase();
  const dType = String(cover.documentType || '').trim().toLowerCase();

  // Reject files, notices, and boqs
  if (/\.(pdf|xls|xlsx|zip|rar|doc|docx)$/i.test(cType) || /\.(pdf|xls|xlsx|zip|rar|doc|docx)$/i.test(dType)) {
    if (!cType.includes('fee') && !cType.includes('prequal') && !cType.includes('technical') && !cType.includes('finance')) {
      return false;
    }
  }
  if (cType.includes('tendernotice') || cType === 'boq' || cType.includes('tender document') || cType.includes('other document')) return false;
  if (dType === 'nit' || dType === 'tender notice' || dType === 'tender document') return false;

  return true;
}

async function runMigration() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB successfully.');

  const tenders = await Tender.find({
    $or: [
      { offlineInstruments: { $exists: true, $ne: [] } },
      { coversInfo: { $exists: true, $ne: [] } }
    ]
  });

  console.log(`Found ${tenders.length} tenders to inspect.`);
  let updatedCount = 0;

  for (const t of tenders) {
    const origInst = t.offlineInstruments || [];
    const origCovers = t.coversInfo || [];

    const cleanedInst = origInst
      .filter(isGenuineInstrument)
      .map((item, idx) => ({
        sNo: idx + 1,
        instrumentType: item.instrumentType
      }));

    const cleanedCovers = origCovers
      .filter(isGenuineCover)
      .map((item, idx) => ({
        coverNo: idx + 1,
        coverType: item.coverType,
        documentType: item.documentType,
        description: item.description || ''
      }));

    const instChanged = JSON.stringify(origInst.map(i => i.instrumentType)) !== JSON.stringify(cleanedInst.map(i => i.instrumentType));
    const coversChanged = JSON.stringify(origCovers.map(c => c.coverType)) !== JSON.stringify(cleanedCovers.map(c => c.coverType));

    if (instChanged || coversChanged) {
      t.offlineInstruments = cleanedInst;
      t.coversInfo = cleanedCovers;
      await t.save();
      updatedCount++;
    }
  }

  console.log(`Migration complete! Sanitized ${updatedCount} tenders in database.`);
  await mongoose.disconnect();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
