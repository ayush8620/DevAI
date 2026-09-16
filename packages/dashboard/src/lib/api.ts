export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Default key matching gateway .env for zero-config out-of-the-box local development
export const DEFAULT_ADMIN_KEY = 'dvai_admin_c8f2e9a1b4d7f0e3c6a9d2b5e8f1a4c7d0e3b6a9f2c5d8';

export function getAdminKey(): string {
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('dvai_admin_key');
    if (customKey && customKey.trim()) return customKey.trim();
  }
  return process.env.NEXT_PUBLIC_ADMIN_API_KEY || DEFAULT_ADMIN_KEY;
}

export function setAdminKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem('dvai_admin_key', key.trim());
    } else {
      localStorage.removeItem('dvai_admin_key');
    }
  }
}

const fetchApi = async (path: string, options?: RequestInit) => {
  const url = `${API_URL}${path}`;
  const token = getAdminKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {})
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error?.message || `API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Gateway is not reachable. Is it running on ' + API_URL + '?');
    }
    throw err;
  }
};

export const api = {
  // Analytics
  getOverview: () => fetchApi('/admin/analytics/overview').then(r => r.data || r),
  getRecentRequests: () => fetchApi('/admin/analytics/recent-requests').then(r => r.data || r),
  getAnalyticsByProvider: (period?: string) => fetchApi(`/admin/analytics/by-provider${period ? `?period=${period}` : ''}`).then(r => r.data || r),
  getAnalyticsByModel: (period?: string) => fetchApi(`/admin/analytics/by-model${period ? `?period=${period}` : ''}`).then(r => r.data || r),
  getAnalyticsByProject: (period?: string) => fetchApi(`/admin/analytics/by-project${period ? `?period=${period}` : ''}`).then(r => r.data || r),

  // Providers
  getProviders: () => fetchApi('/admin/providers').then(r => r.data || r),
  createProvider: (data: { type: string; name: string; baseUrl?: string }) =>
    fetchApi('/admin/providers', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateProvider: (id: string, data: Record<string, unknown>) =>
    fetchApi(`/admin/providers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteProvider: (id: string) =>
    fetchApi(`/admin/providers/${id}`, { method: 'DELETE' }).then(r => r.data || r),
  testProvider: (id: string) =>
    fetchApi(`/admin/providers/${id}/test`, { method: 'POST' }).then(r => r.data || r),

  // Provider Models
  getProviderModels: (providerId: string) =>
    fetchApi(`/admin/providers/${providerId}/models`).then(r => r.data || r),
  addProviderModel: (providerId: string, data: { modelId: string; displayName?: string }) =>
    fetchApi(`/admin/providers/${providerId}/models`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteProviderModel: (providerId: string, modelId: string) =>
    fetchApi(`/admin/providers/${providerId}/models/${modelId}`, { method: 'DELETE' }).then(r => r.data || r),
  syncProviderModels: (providerId: string) =>
    fetchApi(`/admin/providers/${providerId}/sync-models`, { method: 'POST' }).then(r => r.data || r),

  // Credentials (routed under /admin/credentials)
  getCredentials: (providerId: string) =>
    fetchApi(`/admin/credentials/provider/${providerId}`).then(r => r.data || r),
  createCredential: (providerId: string, data: { name: string; apiKey: string; quotaLimit?: number }) =>
    fetchApi(`/admin/credentials/provider/${providerId}`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateCredential: (id: string, data: { enabled?: boolean; name?: string }) =>
    fetchApi(`/admin/credentials/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteCredential: (id: string) =>
    fetchApi(`/admin/credentials/${id}`, { method: 'DELETE' }).then(r => r.data || r),
  testCredential: (id: string) =>
    fetchApi(`/admin/credentials/${id}/test`, { method: 'POST' }).then(r => r.data || r),

  // Projects
  getProjects: () => fetchApi('/admin/projects').then(r => r.data || r),
  createProject: (data: { name: string; description?: string }) =>
    fetchApi('/admin/projects', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateProject: (id: string, data: Record<string, unknown>) =>
    fetchApi(`/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteProject: (id: string) =>
    fetchApi(`/admin/projects/${id}`, { method: 'DELETE' }).then(r => r.data || r),

  // API Keys (routed under /admin/api-keys)
  getApiKeys: (projectId: string) =>
    fetchApi(`/admin/api-keys/project/${projectId}`).then(r => r.data || r),
  createApiKey: (projectId: string, data: { name: string }) =>
    fetchApi(`/admin/api-keys/project/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  deleteApiKey: (id: string) =>
    fetchApi(`/admin/api-keys/${id}`, { method: 'DELETE' }).then(r => r.data || r),

  // Audit
  getAuditLogs: (filters?: { limit?: number }) =>
    fetchApi(`/admin/audit-logs${filters?.limit ? `?limit=${filters.limit}` : ''}`),

  // Health (public, no auth needed)
  getHealth: () => fetch(`${API_URL}/v1/health`).then(r => r.json()).catch(() => ({ status: 'unreachable' })),
};