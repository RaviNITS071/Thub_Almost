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
};
