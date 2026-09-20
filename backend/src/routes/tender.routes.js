import express from 'express';
import {
  getTenders,
  getTenderStats, // Imported the newly created stats controller
  getTenderById,
  downloadTenderZip,
  triggerAiAnalysis
} from '../controllers/tender.controller.js';

const router = express.Router();

/**
 * @route GET /api/tenders
 * Fetch a paginated list of all tenders.
 */
router.get('/', getTenders);

/**
 * @route GET /api/tenders/stats
 * Fetch real-time aggregated statistics for the dashboard.
 * 
 * CRITICAL ROUTE ORDERING: This static route MUST be placed BEFORE the 
 * dynamic '/:id' route. Otherwise, Express will mistakenly treat the word 
 * "stats" as a document ID and pass it to getTenderById, causing a database error.
 */
router.get('/stats', getTenderStats);

/**
 * @route GET /api/tenders/:id/zip
 * Stream the ZIP archive directly with CORS headers to avoid client browser CORS blocks.
 */
router.get('/:id/zip', downloadTenderZip);

/**
 * @route GET /api/tenders/:id
 * Fetch a single tender document by its unique MongoDB ObjectId.
 */
router.get('/:id', getTenderById);

/**
 * @route POST /api/tenders/:id/analyze
 * Trigger the background AI worker to process a specific tender.
 */
router.post('/:id/analyze', triggerAiAnalysis);

export default router;