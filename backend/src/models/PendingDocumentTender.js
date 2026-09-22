/**
 * @file backend/src/models/PendingDocumentTender.js
 * @description Dedicated MongoDB model for tenders where documents (NIT PDFs / BOQ)
 * are not yet published on the portal (e.g. document download start date is scheduled
 * in the future or not yet available). Stored in a separate collection: 'pending_document_tenders'.
 */

import mongoose from 'mongoose';

const pendingDocumentTenderSchema = new mongoose.Schema({
  sourcePortal: { type: String, required: true, default: 'JK_TENDERS' },
  sourceTenderId: { type: String, required: true, unique: true, index: true },
  tenderReferenceNumber: { type: String, index: true },
  title: { type: String, required: true },
  organisationChain: { type: String, index: true },
  departmentName: { type: String, index: true },
  departmentCode: { type: String, index: true },
  tenderCategory: { type: String },
  estimatedValue: { type: Number, default: 0 },

  // Critical Dates
  publishedDateStr: { type: String },
  publishedDate: { type: Date, index: true },
  publishedTime: { type: String },

  documentDownloadStartDateStr: { type: String },
  documentDownloadStartDate: { type: Date, index: true },
  documentDownloadEndDateStr: { type: String },
  documentDownloadEndDate: { type: Date },

  bidSubmissionStartDateStr: { type: String },
  bidSubmissionStartDate: { type: Date },
  bidSubmissionEndDateStr: { type: String },
  bidSubmissionEndDate: { type: Date },
  bidOpeningDateStr: { type: String },
  bidOpeningDate: { type: Date },

  // Document state on portal
  hasDownloadLinks: { type: Boolean, default: false },
  downloadLinkUrl: { type: String },
  portalTenderUrl: { type: String },
  reason: { type: String }, // e.g. "Document download date is not begun yet (Starts: 23-Sep-2026 10:00 AM)"

  // Lifecycle status
  status: {
    type: String,
    enum: ['AWAITING_DOWNLOAD_DATE', 'READY_TO_DOWNLOAD', 'DOWNLOADED', 'EXPIRED'],
    default: 'AWAITING_DOWNLOAD_DATE',
    index: true
  },
  
  attemptCount: { type: Number, default: 0 },
  lastCheckedAt: { type: Date, default: Date.now },
  downloadedAt: { type: Date },
  errorMessage: { type: String }
}, {
  timestamps: true,
  collection: 'pending_document_tenders'
});

// Helper virtual to check if download start date has arrived
pendingDocumentTenderSchema.virtual('isReadyToDownload').get(function() {
  if (!this.documentDownloadStartDate) return true;
  return new Date() >= this.documentDownloadStartDate;
});

const PendingDocumentTender = mongoose.model('PendingDocumentTender', pendingDocumentTenderSchema);

export default PendingDocumentTender;
