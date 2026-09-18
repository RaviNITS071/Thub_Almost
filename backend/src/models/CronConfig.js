/**
 * @file backend/src/models/CronConfig.js
 * @description Stores administrative configuration for scheduled scraping cycles,
 * permission toggles, and retention policies.
 */
import mongoose from 'mongoose';

const cronConfigSchema = new mongoose.Schema({
  configKey: {
    type: String,
    required: true,
    unique: true,
    default: 'GLOBAL_CRON_SETTINGS',
  },
  // Master toggle: Admin can enable or disable automated scraping at any time
  isAutomatedSyncEnabled: {
    type: Boolean,
    default: true,
  },
  // Designated automated scraping times in 24-hr format (IST)
  scheduledSlots: {
    type: [String],
    default: ['09:00', '10:00', '13:00', '15:00', '18:30'],
  },
  // Enable automated 30-day archive deletion
  isArchivePurgeEnabled: {
    type: Boolean,
    default: true,
  },
  archiveRetentionDays: {
    type: Number,
    default: 30,
  },
  lastRunAt: {
    type: Date,
  },
  lastRunStatus: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'RUNNING', 'IDLE'],
    default: 'IDLE',
  },
  lastRunDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  lastPurgedAt: {
    type: Date,
  },
  lastPurgedCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

export default mongoose.model('CronConfig', cronConfigSchema);
