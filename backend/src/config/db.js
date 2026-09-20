import mongoose from 'mongoose';
import pino from 'pino';
import { env } from './env.js';

const logger = pino();

export let activeMongoUri = null;
export let isUsingSecondaryDb = false;

export const connectDB = async () => {
  // Listen to connection events
  mongoose.connection.on('connected', () => {
    logger.info(`MongoDB connected successfully [${isUsingSecondaryDb ? 'SECONDARY FALLBACK DB' : 'PRIMARY DB'}]`);
  });
  mongoose.connection.on('error', (err) => logger.error(`MongoDB connection error: ${err.message}`));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  const primaryUri = env.MONGO_URI;

  try {
    logger.info('[Database] Connecting to Primary MongoDB cluster...');
    activeMongoUri = primaryUri;
    isUsingSecondaryDb = false;
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 8000,
    });
  } catch (primaryError) {
    logger.error(`❌ Primary MongoDB Connection Failed: ${primaryError.message}`);
    
    // =========================================================================
    // FUTURE CONFIGURATION NOTE:
    // Automatic failover to Secondary Server is intentionally DISABLED for now.
    // Reason: Awaiting upgrade to a Render paid service plan.
    // Once a paid plan on Render is active, the switching logic will be re-enabled.
    // Documented in: docs/TenderHub_Future_Configurations_Render_and_Failover.pdf
    // =========================================================================
    logger.warn('ℹ️ Automated failover to Secondary Server is DISABLED (Marked as Future Configuration pending Render paid plan).');
    process.exit(1);
  }
};

export const closeDB = async () => {
  await mongoose.connection.close();
};