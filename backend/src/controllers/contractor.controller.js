/**
 * @file backend/src/controllers/contractor.controller.js
 * @description Controller managing persistent database storage for contractor profiles,
 * alert preferences, and contractor-scoped saved tenders (bookmarks) in MongoDB.
 */
import mongoose from 'mongoose';
import ContractorProfile from '../models/ContractorProfile.js';
import Tender from '../models/Tender.js';
import User from '../models/User.js';

/**
 * Helper: Find or initialize a contractor profile for a given user.
 * If user is not authenticated, returns or creates a global fallback profile.
 */
const getOrCreateContractorProfile = async (userId) => {
  if (!userId) {
    let fallback = await ContractorProfile.findOne({ userId: null });
    if (!fallback) {
      fallback = await ContractorProfile.create({
        name: 'Guest Contractor',
        contractorId: 'NIT-GUEST',
        jurisdiction: 'Jammu & Kashmir / North Zone',
        affiliation: 'NIT Srinagar, J&K',
        divisionBadge: 'J&K Public Works Division',
        accountAuth: 'Unverified Guest',
        registrationClass: 'Class A Works',
        portalVerification: 'Active • L1 Compliant',
        status: 'Active',
        preferences: {
          targetSectors: [],
          preferredLocations: [],
          minTenderValue: 0,
          preferEmdExemption: false,
          isConfigured: false,
        },
        savedTenders: [],
      });
    }
    return fallback;
  }

  // 1. Search for profile already bound to this user
  let profile = await ContractorProfile.findOne({ userId });
  if (profile) return profile;

  // 2. Check for an unbound legacy profile to claim
  const unlinkedLegacy = await ContractorProfile.findOne({ userId: null });
  if (unlinkedLegacy) {
    unlinkedLegacy.userId = userId;
    await unlinkedLegacy.save();
    return unlinkedLegacy;
  }

  // 3. Create a personalized contractor profile for this user
  const user = await User.findById(userId);
  profile = await ContractorProfile.create({
    userId,
    name: user?.name || user?.firstName || 'Contractor',
    contractorId: `NIT-${userId.toString().slice(-4).toUpperCase()}`,
    jurisdiction: 'Jammu & Kashmir / North Zone',
    affiliation: 'NIT Srinagar, J&K',
    divisionBadge: 'J&K Public Works Division',
    accountAuth: user?.providers?.google ? 'Google Verified' : 'OTP Verified',
    registrationClass: 'Class A Works',
    portalVerification: 'Active • L1 Compliant',
    status: 'Active',
    preferences: {
      targetSectors: [],
      preferredLocations: [],
      minTenderValue: 0,
      preferEmdExemption: false,
      isConfigured: false,
    },
    savedTenders: [],
  });

  return profile;
};

/**
 * Get contractor profile details from MongoDB for the active contractor.
 * @route GET /api/v1/contractor/profile
 */
export const getContractorProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const profile = await getOrCreateContractorProfile(userId);

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update contractor credentials in MongoDB for the active contractor.
 * @route PUT /api/v1/contractor/profile
 */
export const updateContractorProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const {
      name,
      contractorId,
      jurisdiction,
      affiliation,
      divisionBadge,
      accountAuth,
      registrationClass,
      portalVerification,
      status,
    } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (contractorId !== undefined) updateFields.contractorId = contractorId;
    if (jurisdiction !== undefined) updateFields.jurisdiction = jurisdiction;
    if (affiliation !== undefined) updateFields.affiliation = affiliation;
    if (divisionBadge !== undefined) updateFields.divisionBadge = divisionBadge;
    if (accountAuth !== undefined) updateFields.accountAuth = accountAuth;
    if (registrationClass !== undefined) updateFields.registrationClass = registrationClass;
    if (portalVerification !== undefined) updateFields.portalVerification = portalVerification;
    if (status !== undefined) updateFields.status = status;

    const query = userId ? { userId } : { userId: null };
    const updatedProfile = await ContractorProfile.findOneAndUpdate(
      query,
      { $set: updateFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Contractor profile updated successfully in database',
      data: updatedProfile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get filter preferences from MongoDB for the active contractor.
 * @route GET /api/v1/contractor/preferences
 */
export const getContractorPreferences = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const profile = await getOrCreateContractorProfile(userId);

    return res.status(200).json({
      success: true,
      data: profile.preferences || {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update filter preferences in MongoDB for the active contractor.
 * @route PUT /api/v1/contractor/preferences
 */
export const updateContractorPreferences = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const {
      targetSectors,
      preferredLocations,
      minTenderValue,
      preferEmdExemption,
      isConfigured = true,
    } = req.body;

    const prefUpdates = {
      isConfigured: Boolean(isConfigured),
    };
    if (targetSectors !== undefined) prefUpdates.targetSectors = targetSectors;
    if (preferredLocations !== undefined) prefUpdates.preferredLocations = preferredLocations;
    if (minTenderValue !== undefined) prefUpdates.minTenderValue = Number(minTenderValue) || 0;
    if (preferEmdExemption !== undefined) prefUpdates.preferEmdExemption = Boolean(preferEmdExemption);

    const query = userId ? { userId } : { userId: null };
    const updatedProfile = await ContractorProfile.findOneAndUpdate(
      query,
      { $set: { preferences: prefUpdates } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Preferences updated successfully in database',
      data: updatedProfile.preferences,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get populated saved tenders for the authenticated contractor.
 * @route GET /api/v1/contractor/saved-tenders
 */
export const getSavedTenders = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const profile = await getOrCreateContractorProfile(userId);
    await profile.populate({
      path: 'savedTenders',
      select: '-__v',
    });

    return res.status(200).json({
      success: true,
      count: profile.savedTenders?.length || 0,
      data: profile.savedTenders || [],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Atomically toggle (add or remove) a saved tender for the authenticated contractor.
 * @route POST /api/v1/contractor/saved-tenders/toggle
 */
export const toggleSavedTender = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        error: 'Please sign in to save tenders to your contractor account.',
      });
    }

    const { tenderId } = req.body;
    if (!tenderId) {
      return res.status(400).json({ error: 'Tender ID is required' });
    }

    // Resolve tender by MongoDB _id or sourceTenderId
    let tender = null;
    if (mongoose.Types.ObjectId.isValid(tenderId)) {
      tender = await Tender.findById(tenderId);
    }
    if (!tender) {
      tender = await Tender.findOne({ sourceTenderId: tenderId });
    }
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const profile = await getOrCreateContractorProfile(userId);
    const existingIndex = profile.savedTenders.findIndex(
      (savedId) => savedId.toString() === tender._id.toString()
    );

    let isBookmarked = false;
    if (existingIndex >= 0) {
      profile.savedTenders.splice(existingIndex, 1);
      isBookmarked = false;
    } else {
      profile.savedTenders.unshift(tender._id);
      isBookmarked = true;
    }
    await profile.save();

    await profile.populate({
      path: 'savedTenders',
      select: '-__v',
    });

    return res.status(200).json({
      success: true,
      isBookmarked,
      count: profile.savedTenders.length,
      data: profile.savedTenders,
      message: isBookmarked ? 'Tender bookmarked successfully' : 'Tender removed from bookmarks',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Batch-synchronize guest bookmarks into the contractor's account upon login.
 * @route POST /api/v1/contractor/saved-tenders/sync
 */
export const syncSavedTenders = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { tenderIds } = req.body;
    const profile = await getOrCreateContractorProfile(userId);

    if (Array.isArray(tenderIds) && tenderIds.length > 0) {
      const matchingTenders = await Tender.find({
        $or: [
          { _id: { $in: tenderIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) } },
          { sourceTenderId: { $in: tenderIds } },
        ],
      });

      const newIds = matchingTenders.map((t) => t._id.toString());
      const currentSet = new Set(profile.savedTenders.map((id) => id.toString()));

      let modified = false;
      newIds.forEach((idStr) => {
        if (!currentSet.has(idStr)) {
          profile.savedTenders.push(new mongoose.Types.ObjectId(idStr));
          currentSet.add(idStr);
          modified = true;
        }
      });

      if (modified) {
        await profile.save();
      }
    }

    await profile.populate({
      path: 'savedTenders',
      select: '-__v',
    });

    return res.status(200).json({
      success: true,
      count: profile.savedTenders.length,
      data: profile.savedTenders,
    });
  } catch (error) {
    next(error);
  }
};
