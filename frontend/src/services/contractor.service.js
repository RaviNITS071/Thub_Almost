import { api } from './api';

export const contractorService = {
  /**
   * Fetch contractor profile credentials from backend MongoDB
   */
  getProfile: async () => {
    const res = await api.get('/contractor/profile');
    return res.data?.data;
  },

  /**
   * Persist contractor credentials to backend MongoDB
   */
  updateProfile: async (profileData) => {
    const res = await api.put('/contractor/profile', profileData);
    return res.data?.data;
  },

  /**
   * Fetch filter preferences from backend MongoDB
   */
  getPreferences: async () => {
    const res = await api.get('/contractor/preferences');
    return res.data?.data;
  },

  /**
   * Persist filter preferences to backend MongoDB
   */
  updatePreferences: async (preferenceData) => {
    const res = await api.put('/contractor/preferences', preferenceData);
    return res.data?.data;
  },

  /**
   * Fetch saved tenders for the active contractor from MongoDB
   */
  getSavedTenders: async () => {
    const res = await api.get('/contractor/saved-tenders');
    return res.data?.data || [];
  },

  /**
   * Toggle bookmark for a tender in the active contractor's MongoDB profile
   */
  toggleSavedTender: async (tenderId) => {
    const res = await api.post('/contractor/saved-tenders/toggle', { tenderId });
    return res.data;
  },

  /**
   * Synchronize local guest bookmarks with contractor account upon login
   */
  syncSavedTenders: async (tenderIds) => {
    const res = await api.post('/contractor/saved-tenders/sync', { tenderIds });
    return res.data?.data || [];
  },
};
