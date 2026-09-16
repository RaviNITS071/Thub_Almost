import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useContractorStore = create(
  persist(
    (set) => ({
      profile: {
        name: 'Ravi Shankar',
        contractorId: 'NIT-S-2026',
        jurisdiction: 'Jammu & Kashmir / North Zone',
        affiliation: 'NIT Srinagar, J&K',
        divisionBadge: 'J&K Public Works Division',
        accountAuth: 'Google Verified',
        registrationClass: 'Class A Works',
        portalVerification: 'Active • L1 Compliant',
        status: 'Active',
      },
      updateProfile: (updatedFields) =>
        set((state) => ({
          profile: { ...state.profile, ...updatedFields },
        })),
    }),
    { name: 'tenderhub_contractor_profile' }
  )
);
