import app from './app.js';
import { connectDB, closeDB } from './config/db.js';
import { redis } from './config/redis.js';
import { env } from './config/env.js';
import { schedulerService } from './services/scheduler.service.js';
import pino from 'pino';

const logger = pino();

const startServer = async () => {
  try {
    // Connect to external services
    await connectDB();
    
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      // Initialize automated schedules (9AM, 10AM, 1PM, 3PM, 6:30PM & archive retention purge)
      schedulerService.init().catch((err) => {
        logger.error(`Failed to initialize scheduler: ${err.message}`);
      });
    });

    // Graceful Shutdown Logic
    const shutdown = async () => {
      logger.info('SIGTERM/SIGINT received. Shutting down gracefully...');
      
      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await closeDB();
          logger.info('MongoDB connection closed.');
          
          await redis.quit();
          logger.info('Redis connection closed.');
          
          process.exit(0);
        } catch (error) {
          logger.error(`Error during shutdown: ${error.message}`);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error(`Critical error starting server: ${error.message}`);
    process.exit(1);
  }
};

startServer();