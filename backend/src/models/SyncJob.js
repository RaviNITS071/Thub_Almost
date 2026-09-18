import mongoose from 'mongoose';

const syncJobSchema = new mongoose.Schema({
  sourcePortal: { type: String, required: true, index: true, default: 'JK_TENDERS' },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running', index: true },
  triggeredBy: { type: String, enum: ['ADMIN_MANUAL', 'CRON_SCHEDULE'], default: 'CRON_SCHEDULE' },
  itemsProcessed: { type: Number, default: 0 },
  newTendersFound: { type: Number, default: 0 },
  updatedTenders: { type: Number, default: 0 },
  pdfsDownloaded: { type: Number, default: 0 },
  missingPdfCount: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  errorMessage: { type: String }
}, { timestamps: true });

syncJobSchema.index({ createdAt: -1 });

export default mongoose.model('SyncJob', syncJobSchema);