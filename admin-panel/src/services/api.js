/**
 * @file admin-panel/src/services/api.js
 * @description Administrative API client communicating with backend /api/v1/admin endpoints.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1/admin';

export function getStoredAdminKey() {
  return sessionStorage.getItem('TENDERHUB_ADMIN_KEY') || localStorage.getItem('TENDERHUB_ADMIN_KEY') || '';
}

export function setStoredAdminKey(key, persist = false) {
  sessionStorage.setItem('TENDERHUB_ADMIN_KEY', key);
  if (persist) {
    localStorage.setItem('TENDERHUB_ADMIN_KEY', key);
  } else {
    localStorage.removeItem('TENDERHUB_ADMIN_KEY');
  }
}

export function clearStoredAdminKey() {
  sessionStorage.removeItem('TENDERHUB_ADMIN_KEY');
  localStorage.removeItem('TENDERHUB_ADMIN_KEY');
}

async function request(endpoint, options = {}) {
  const adminKey = options.adminKey || getStoredAdminKey();

  const headers = {
    'Content-Type': 'application/json',
    'x-admin-key': adminKey,
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearStoredAdminKey();
    const error = new Error('UNAUTHORIZED_ADMIN');
    error.status = 401;
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }

  return data;
}

export const adminApi = {
  verify: (key) => request('/verify', { adminKey: key }),
  getTelemetry: () => request('/telemetry'),
  getOverview: () => request('/overview'),
  getDiagnostics: () => request('/diagnostics'),
  getLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/logs?${query}`);
  },
  resolveLog: (id) => request(`/logs/${id}/resolve`, { method: 'POST' }),
  getSyncHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sync/history?${query}`);
  },
  triggerManualSync: () => request('/sync/trigger', { method: 'POST' }),
  triggerMissingPdfRecovery: () => request('/sync/retry-missing-pdfs', { method: 'POST' }),
  updateScheduleConfig: (isAutomatedSyncEnabled) => 
    request('/sync/schedule-config', {
      method: 'POST',
      body: JSON.stringify({ isAutomatedSyncEnabled }),
    }),
  purgeExpiredArchive: () => request('/maintenance/purge-archive', { method: 'POST' }),
};
