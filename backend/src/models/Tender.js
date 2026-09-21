import mongoose from 'mongoose';

const tenderSchema = new mongoose.Schema({
  // --- Core Identification ---
  sourcePortal: { type: String, required: true, default: 'JK_TENDERS' },
  sourceTenderId: { type: String, required: true, index: true }, // e.g. 2026_APD_321986_1
  detailsUrl: { type: String },

  // --- Basic Details ---
  departmentCode: { type: String, index: true }, // e.g. APD, PDD, PWD
  departmentName: { type: String, index: true }, // e.g. Agriculture Production Department
  organisationChain: { type: String, index: true }, // Filter key for Home Page
  tenderReferenceNumber: { type: String },
  withdrawalAllowed: { type: String },
  tenderType: { type: String },
  formOfContract: { type: String },
  tenderCategory: { type: String, index: true },
  noOfCovers: { type: Number },
  generalTechnicalEvaluationAllowed: { type: String },
  itemWiseTechnicalEvaluationAllowed: { type: String },
  paymentMode: { type: String },
  isMultiCurrencyAllowedForBOQ: { type: String },
  isMultiCurrencyAllowedForFee: { type: String },
  allowTwoStageBidding: { type: String },

  // --- Payment Instruments (Offline Instruments) ---
  offlineInstruments: [{
    sNo: { type: Number },
    instrumentType: { type: String } // e.g. Bank Guarantee, Fixed deposit, CDR
  }],

  // --- Covers Information ---
  coversInfo: [{
    coverNo: { type: Number },
    coverType: { type: String },
    description: { type: String },
    documentType: { type: String }
  }],

  // --- Fee & EMD Details ---
  tenderFee: { type: Number, default: 0 },
  feePayableTo: { type: String },
  feePayableAt: { type: String },
  tenderFeeExemptionAllowed: { type: String },
  
  emdAmount: { type: Number, default: 0 },
  emdExemptionAllowed: { type: String },
  emdFeeType: { type: String },
  emdPercentage: { type: String },
  emdPayableTo: { type: String },
  emdPayableAt: { type: String },

  // --- Work Item Details ---
  title: { type: String, required: true },
  workDescription: { type: String },
  ndaPreQualification: { type: String },
  independentExternalMonitorRemarks: { type: String },
  estimatedValue: { type: Number }, // Tender Value in ₹
  productCategory: { type: String },
  subCategory: { type: String },
  contractType: { type: String },
  bidValidityDays: { type: Number },
  periodOfWorkDays: { type: Number },
  location: { type: String },
  pincode: { type: String },
  preBidMeetingPlace: { type: String },
  preBidMeetingAddress: { type: String },
  preBidMeetingDate: { type: Date },
  bidOpeningPlace: { type: String },
  shouldAllowNDATender: { type: String },
  allowPreferentialBidder: { type: String },
  tendererClass: { type: String },

  // --- Critical Dates (Both raw portal string, formatted standard time, and parsed Date for IST accuracy) ---
  publishedDate: { type: Date },
  publishedDateStr: { type: String }, // e.g. "19-Sep-2026 06:30 PM"
  publishedTime: { type: String },    // e.g. "6:30 PM"
  publishedDateOnly: { type: String },// e.g. "19-Sep-2026"
  bidOpeningDate: { type: Date },
  bidOpeningDateStr: { type: String },
  bidOpeningTime: { type: String },
  documentDownloadStartDate: { type: Date },
  documentDownloadStartDateStr: { type: String },
  documentDownloadStartTime: { type: String },
  documentDownloadEndDate: { type: Date },
  documentDownloadEndDateStr: { type: String },
  documentDownloadEndTime: { type: String },
  clarificationStartDate: { type: Date },
  clarificationStartDateStr: { type: String },
  clarificationEndDate: { type: Date },
  clarificationEndDateStr: { type: String },
  bidSubmissionStartDate: { type: Date },
  bidSubmissionStartDateStr: { type: String },
  bidSubmissionStartTime: { type: String },
  bidSubmissionEndDate: { type: Date },
  bidSubmissionEndDateStr: { type: String },
  bidSubmissionEndTime: { type: String },
  closingDate: { type: Date, index: true },
  closingDateStr: { type: String },
  closingTime: { type: String },

  // --- Documents & Storage (Cloudflare R2 mapped) ---
  isDocumentAvailable: { type: Boolean, default: true },
  pdfFetchStatus: { 
    type: String, 
    enum: ['COMPLETED', 'PENDING', 'NOT_AVAILABLE', 'FAILED'], 
    default: 'PENDING',
    index: true 
  },
  pdfRetryCount: { type: Number, default: 0 },
  nitDocuments: [{
    sNo: { type: Number },
    documentName: { type: String },
    description: { type: String },
    documentSizeKb: { type: Number },
    fileUrl: { type: String } // R2 URL
  }],
  workItemDocuments: [{
    sNo: { type: Number },
    documentType: { type: String }, // e.g. BOQ, Other Document
    documentName: { type: String },
    description: { type: String },
    documentSizeKb: { type: Number },
    fileUrl: { type: String } // R2 URL
  }],
  pdfUrls: [{ type: String }], // Consolidated array for quick frontend linking
  boqFileUrl: { type: String }, // Backwards compatibility / direct file URL
  boqZipUrl: { type: String }, // Direct Cloudflare R2 URL to the uploaded .zip archive
  zipFileName: { type: String }, // Original .zip filename
  zipFileSizeKb: { type: Number }, // Size of .zip file in KB
  r2StorageKey: { type: String, index: true }, // Composite folder key: {departmentCode}/{sourceTenderId}_{publishedDate}
  boqFetchStatus: { 
    type: String, 
    enum: ['COMPLETED', 'PENDING', 'NOT_AVAILABLE', 'FAILED'], 
    default: 'PENDING',
    index: true 
  },

  // --- Tender Inviting Authority ---
  invitingAuthorityName: { type: String },
  invitingAuthorityAddress: { type: String },

  status: { type: String, default: 'ACTIVE', index: true },
  archivedAt: { type: Date, index: true }
}, { timestamps: true });

// Indexes for fast filtering, deduplication, and retention management
tenderSchema.index({ sourcePortal: 1, sourceTenderId: 1 }, { unique: true });
tenderSchema.index({ departmentCode: 1, closingDate: 1 });
tenderSchema.index({ organisationChain: 1, closingDate: 1 });
tenderSchema.index({ status: 1, closingDate: 1 });
tenderSchema.index({ pdfFetchStatus: 1, closingDate: 1 });
tenderSchema.index({ publishedDate: -1, createdAt: -1 });

export default mongoose.model('Tender', tenderSchema);