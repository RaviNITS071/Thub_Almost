import { JKTenderAdapter } from '../src/services/adapters/JKTenderAdapter.js';
import { JKTenderDateAdapter } from '../src/services/adapters/JKTenderDateAdapter.js';
import { formatTenderStorageKey, extractDeptCode } from '../src/utils/r2Storage.js';

console.log('🧪 Running Adapter Parity & Schema Test...');

// 1. Adapter Instantiation
const adapter = new JKTenderAdapter();
const dateAdapter = new JKTenderDateAdapter();
console.log('✅ JKTenderAdapter and JKTenderDateAdapter instantiated successfully.');

// 2. Required Methods on JKTenderAdapter
const requiredMethods = [
  'fetchList',
  'crawlByDepartment',
  'crawlLatestActiveTenders',
  'scrapeTenderDetailAndPdfInPage',
  'scrapeDetailAndDocuments',
  'saveTenderAndUploadR2',
  'processDownloadedPdf',
  'processDownloadedZip',
  'resolveDocumentDownloadCaptcha',
  'normalize',
  'navigateBackFromTenderDetails',
  'ensureOnOrganisationTenderList'
];

for (const m of requiredMethods) {
  if (typeof adapter[m] !== 'function') {
    throw new Error(`Missing expected method on JKTenderAdapter: ${m}`);
  }
}
console.log(`✅ All ${requiredMethods.length} required methods verified on JKTenderAdapter.`);

// 3. Storage Key & Dept Code Canonical Rules
const dept = extractDeptCode('2026_APD_324494_4', 'Agriculture Production Department');
if (dept !== 'APD') throw new Error(`Expected APD, got ${dept}`);

const key = formatTenderStorageKey('2026_APD_324494_4', '20-Sep-2026 10:00 AM', dept);
if (!key.startsWith('APD/2026_APD_324494_4_2026-09-20')) {
  throw new Error(`Unexpected storage key: ${key}`);
}
console.log(`✅ Canonical R2 Storage Key verified: ${key}`);

// 4. Schema Normalization
const mockRaw = {
  sourceTenderId: '2026_APD_324494_4',
  title: 'Procurement of High Yield Seeds',
  organisationChain: 'Agriculture Production Department||Directorate of Agriculture Kashmir',
  publishedDate: '20-Sep-2026 10:00 AM',
  publishedDateStr: '20-Sep-2026 10:00 AM',
  isMultiTender: true,
  baseTenderId: '2026_APD_324494',
  relatedTenderIds: ['2026_APD_324494_1'],
  otherImportantDocuments: [
    { sNo: 1, category: 'Certificates', subCategory: 'GST Registration', description: 'GST cert', format: 'PDF' }
  ],
  offlineInstruments: [
    { sNo: 1, instrumentType: 'Demand Draft' }
  ],
  coversInfo: [
    { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: 'Fee docs', documentType: '.pdf' }
  ]
};

const normalized = adapter.normalize(mockRaw);
if (!normalized.otherImportantDocuments || normalized.otherImportantDocuments.length !== 1) {
  throw new Error('normalize() failed to preserve otherImportantDocuments');
}
if (!normalized.isMultiTender || normalized.baseTenderId !== '2026_APD_324494') {
  throw new Error('normalize() failed to preserve multi-tender fields');
}
console.log('✅ normalize() schema integrity confirmed.');

console.log('🎉 ALL INTEGRITY CHECKS PASSED!');
