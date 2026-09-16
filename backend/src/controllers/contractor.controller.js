/**
 * @file backend/src/controllers/contractor.controller.js
 * @description Controller managing persistent database storage for contractor profile & alert preferences.
 */
import ContractorProfile from '../models/ContractorProfile.js';

/**
 * Get contractor profile details from MongoDB.
 * If no record exists yet, initializes a default record.
 */
export const getContractorProfile = async (req, res, next) => {
  try {
    let profile = await ContractorProfile.findOne();

    if (!profile) {
      profile = await ContractorProfile.create({
        name: 'Ravi Shankar',
        contractorId: 'NIT-S-2026',
        jurisdiction: 'Jammu & Kashmir / North Zone',
        affiliation: 'NIT Srinagar, J&K',
        divisionBadge: 'J&K Public Works Division',
        accountAuth: 'Google Verified',
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
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update or upsert contractor credentials in MongoDB.
 */
export const updateContractorProfile = async (req, res, next) => {
  try {
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

    const updatedProfile = await ContractorProfile.findOneAndUpdate(
      {},
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
 * Get filter preferences from MongoDB.
 */
export const getContractorPreferences = async (req, res, next) => {
  try {
    let profile = await ContractorProfile.findOne();

    if (!profile) {
      profile = await ContractorProfile.create({});
    }

    return res.status(200).json({
      success: true,
      data: profile.preferences || {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update filter preferences in MongoDB.
 */
export const updateContractorPreferences = async (req, res, next) => {
  try {
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

    const updatedProfile = await ContractorProfile.findOneAndUpdate(
      {},
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
