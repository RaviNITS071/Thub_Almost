/**
 * @file backend/src/routes/contractor.routes.js
 * @description Routes for accessing and updating contractor profile & preferences stored in MongoDB.
 */
import { Router } from 'express';
import {
  getContractorProfile,
  updateContractorProfile,
  getContractorPreferences,
  updateContractorPreferences,
} from '../controllers/contractor.controller.js';

const router = Router();

router.get('/profile', getContractorProfile);
router.put('/profile', updateContractorProfile);
router.get('/preferences', getContractorPreferences);
router.put('/preferences', updateContractorPreferences);

export default router;
