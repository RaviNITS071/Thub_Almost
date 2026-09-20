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
  getLiveSyncStatus: () => request('/sync/live-status'),
  triggerManualSync: (options = {}) => 
    request('/sync/trigger', { 
      method: 'POST', 
      body: JSON.stringify(options) 
    }),
  stopActiveSync: () => request('/sync/stop', { method: 'POST' }),
  resetCrawlCheckpoint: () => request('/sync/checkpoint/reset', { method: 'POST' }),
  triggerMissingPdfRecovery: () => request('/sync/retry-missing-pdfs', { method: 'POST' }),
  updateScheduleConfig: (isAutomatedSyncEnabled) => 
    request('/sync/schedule-config', {
      method: 'POST',
      body: JSON.stringify({ isAutomatedSyncEnabled }),
    }),
  purgeExpiredArchive: () => request('/maintenance/purge-archive', { method: 'POST' }),
  purgeExpiredTenders: () => request('/maintenance/purge-expired', { method: 'POST' }),
  getBackupStatus: () => request('/backup/status'),
  triggerBackup: (type = 'database') => 
    request('/backup/trigger', {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  syncMirror: () => request('/backup/sync-mirror', { method: 'POST' }),
  downloadBackupFile: async (fileName) => {
    const adminKey = getStoredAdminKey();
    const response = await fetch(`${BASE_URL}/backup/download/${encodeURIComponent(fileName)}`, {
      headers: { 'x-admin-key': adminKey },
    });
    if (!response.ok) {
      throw new Error(`Failed to download backup archive: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },
  downloadDisasterRecoveryGuide: async () => {
    const adminKey = getStoredAdminKey();
    const response = await fetch(`${BASE_URL}/backup/disaster-recovery-guide`, {
      headers: { 'x-admin-key': adminKey },
    });
    if (!response.ok) {
      throw new Error(`Failed to download disaster recovery manual: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TenderHub_Disaster_Recovery_and_Backup_Manual.pdf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },
  downloadDeploymentGuide: async () => {
    const adminKey = getStoredAdminKey();
    const response = await fetch(`${BASE_URL}/backup/deployment-guide`, {
      headers: { 'x-admin-key': adminKey },
    });
    if (!response.ok) {
      throw new Error(`Failed to download deployment manual: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TenderHub_Production_Deployment_Manual.pdf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },
  downloadFutureConfigGuide: async () => {
    const adminKey = getStoredAdminKey();
    const response = await fetch(`${BASE_URL}/backup/future-config-guide`, {
      headers: { 'x-admin-key': adminKey },
    });
    if (!response.ok) {
      throw new Error(`Failed to download future configuration manual: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TenderHub_Future_Configurations_Render_and_Failover.pdf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },
};

