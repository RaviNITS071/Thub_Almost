/**
 * @file backend/src/routes/contractor.routes.js
 * @description Routes for accessing and updating contractor profiles, preferences,
 * and saved tenders stored in MongoDB with contractor-level data scoping.
 */
import { Router } from 'express';
import {
  getContractorProfile,
  updateContractorProfile,
  getContractorPreferences,
  updateContractorPreferences,
  getSavedTenders,
  toggleSavedTender,
  syncSavedTenders,
} from '../controllers/contractor.controller.js';
import { optionalAuth, verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

// Profile & Preferences (supports authenticated contractor with guest fallback)
router.get('/profile', optionalAuth, getContractorProfile);
router.put('/profile', optionalAuth, updateContractorProfile);
router.get('/preferences', optionalAuth, getContractorPreferences);
router.put('/preferences', optionalAuth, updateContractorPreferences);

// Contractor-scoped Saved Tenders (Bookmarks)
router.get('/saved-tenders', optionalAuth, getSavedTenders);
router.post('/saved-tenders/toggle', verifyToken, toggleSavedTender);
router.post('/saved-tenders/sync', verifyToken, syncSavedTenders);

export default router;
