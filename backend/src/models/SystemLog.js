/**
 * @file backend/src/models/SystemLog.js
 * @description Persistent system logging schema capturing application events,
 * network errors, scraper metrics, and automated diagnostic recommendations.
 */
import mongoose from 'mongoose';

const systemLogSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    default: 'INFO',
    index: true,
  },
  source: {
    type: String,
    enum: ['API', 'WORKER_SCRAPER', 'DATABASE', 'REDIS', 'CRON', 'SECURITY', 'STORAGE'],
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  stack: {
    type: String,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Exact problem classification and recommended solution for the admin dashboard
  problemCategory: {
    type: String, // e.g. 'REDIS_CONNECTION_FAILURE', 'CAPTCHA_SOLVE_FAILED', 'GHOSTSCRIPT_MISSING', 'NETWORK_TIMEOUT'
    index: true,
  },
  suggestedResolution: {
    title: { type: String },
    actionableSteps: [{ type: String }],
    commandExample: { type: String },
  },
  resolved: {
    type: Boolean,
    default: false,
    index: true,
  },
}, { 
  timestamps: true,
  // TTL index to automatically purge logs older than 30 days to save database space
  expireAfterSeconds: 30 * 24 * 60 * 60
});

// Compound indexes for fast admin querying
systemLogSchema.index({ createdAt: -1, level: 1 });
systemLogSchema.index({ source: 1, createdAt: -1 });

export default mongoose.model('SystemLog', systemLogSchema);
