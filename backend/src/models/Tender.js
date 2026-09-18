import mongoose from 'mongoose';

const tenderSchema = new mongoose.Schema({
  // --- Core Identification ---
  sourcePortal: { type: String, required: true, default: 'JK_TENDERS' },
  sourceTenderId: { type: String, required: true, index: true }, // e.g. 2026_APD_321986_1
  detailsUrl: { type: String },

  // --- Basic Details ---
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

  // --- Critical Dates ---
  publishedDate: { type: Date },
  bidOpeningDate: { type: Date },
  documentDownloadStartDate: { type: Date },
  documentDownloadEndDate: { type: Date },
  clarificationStartDate: { type: String },
  clarificationEndDate: { type: String },
  bidSubmissionStartDate: { type: Date },
  bidSubmissionEndDate: { type: Date },
  closingDate: { type: Date, index: true },

  
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
    documentName: { type: String },
    description: { type: String },
    documentSizeKb: { type: Number },
    fileUrl: { type: String } // R2 URL
  }],
  workItemDocuments: [{
    documentType: { type: String }, // e.g. BOQ
    documentName: { type: String },
    description: { type: String },
    documentSizeKb: { type: Number },
    fileUrl: { type: String } // R2 URL
  }],
  pdfUrls: [{ type: String }], // Consolidated array for quick frontend linking

  // --- Tender Inviting Authority ---
  invitingAuthorityName: { type: String },
  invitingAuthorityAddress: { type: String },

  status: { type: String, default: 'ACTIVE', index: true },
  archivedAt: { type: Date, index: true }
}, { timestamps: true });

// Indexes for fast filtering, deduplication, and retention management
tenderSchema.index({ sourcePortal: 1, sourceTenderId: 1 }, { unique: true });
tenderSchema.index({ organisationChain: 1, closingDate: 1 });
tenderSchema.index({ status: 1, closingDate: 1 });
tenderSchema.index({ pdfFetchStatus: 1, closingDate: 1 });

export default mongoose.model('Tender', tenderSchema);