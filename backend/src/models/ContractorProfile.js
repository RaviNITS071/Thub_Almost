import mongoose from 'mongoose';

const contractorProfileSchema = new mongoose.Schema({
  contractorId: { type: String, default: 'NIT-S-2026', index: true },
  name: { type: String, required: true, default: 'Ravi Shankar' },
  jurisdiction: { type: String, default: 'Jammu & Kashmir / North Zone' },
  affiliation: { type: String, default: 'NIT Srinagar, J&K' },
  divisionBadge: { type: String, default: 'J&K Public Works Division' },
  accountAuth: { type: String, default: 'Google Verified' },
  registrationClass: { type: String, default: 'Class A Works' },
  portalVerification: { type: String, default: 'Active • L1 Compliant' },
  status: { type: String, default: 'Active' },
  preferences: {
    targetSectors: { type: [String], default: [] },
    preferredLocations: { type: [String], default: [] },
    minTenderValue: { type: Number, default: 0 },
    preferEmdExemption: { type: Boolean, default: false },
    isConfigured: { type: Boolean, default: false },
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: false },
  savedTenders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tender' }],
}, { timestamps: true });

export default mongoose.model('ContractorProfile', contractorProfileSchema);
