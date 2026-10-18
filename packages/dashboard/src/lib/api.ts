import { getToken } from '@clerk/nextjs';
import { clerkEnabled } from './clerk';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// No admin key is hardcoded. When Clerk sign-in is configured the dashboard sends the
// signed-in user's Clerk session token, and the gateway checks it against ADMIN_EMAILS /
// ADMIN_USER_IDS. The admin key saved on the Settings page (this browser only) is a
// fallback. NEXT_PUBLIC_ADMIN_API_KEY is for local development only: it is embedded in
// the client bundle, so never set it on a public deploy.
export const DEFAULT_ADMIN_KEY = '';

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

/** The current Clerk session token, or null (signed out, Clerk not configured, server side). */
export async function getSessionToken(): Promise<string | null> {
  if (!clerkEnabled || typeof window === 'undefined') return null;
  // Right after a sign-in redirect the session can take a moment to become active.
  // /dashboard is only reachable with a session (middleware), so retry briefly there.
  const attempts = window.location.pathname.startsWith('/dashboard') ? 4 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const token = await getToken();
      if (token) return token;
    } catch {
      return null; // Clerk failed to load: fall back to the saved admin key
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 250 * (i + 1)));
  }
  return null;
}

/** Bearer tokens to try, in order: the Clerk session, then the saved admin key. */
async function credentialCandidates(): Promise<string[]> {
  const out: string[] = [];
  const session = await getSessionToken();
  if (session) out.push(session);
  const adminKey = getAdminKey();
  if (adminKey && !out.includes(adminKey)) out.push(adminKey);
  return out.length ? out : [''];
}

const fetchApi = async (path: string, options?: RequestInit) => {
  const url = `${API_URL}${path}`;
  const candidates = await credentialCandidates();

  try {
    let response: Response | undefined;
    for (let i = 0; i < candidates.length; i++) {
      const token = candidates[i];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options?.headers as Record<string, string> || {})
      };
      response = await fetch(url, { ...options, headers });
      // Signed in but not an allowed admin (or the session expired): try the saved admin key.
      if ((response.status === 401 || response.status === 403) && i < candidates.length - 1) continue;
      break;
    }

    if (!response!.ok) {
      const body = await response!.json().catch(() => ({}));
      throw new Error(body?.error?.message || `API Error: ${response!.status} ${response!.statusText}`);
    }

    return response!.json();
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Gateway is not reachable. Is it running on ' + API_URL + '?');
    }
    throw err;
  }
};

/** /user/* endpoints: the signed-in user's own data. Only the Clerk session is sent (no admin key). */
const fetchUser = async (path: string, options?: RequestInit) => {
  const token = await getSessionToken();
  if (!token) throw new Error('Sign in to use this page.');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers as Record<string, string> || {}) },
    });
  } catch {
    throw new Error('Gateway is not reachable. Is it running on ' + API_URL + '?');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.error?.message || `API Error: ${response.status}`) as Error & { type?: string };
    err.type = body?.error?.type;
    throw err;
  }
  return body;
};

export const userApi = {
  // Your provider keys (bring your own key)
  getPool: () => fetchUser('/user/pool').then(r => r.data),
  addPoolKey: (data: { provider: string; name?: string; apiKey: string; defaultModel?: string; quotaLimit?: number | null }) =>
    fetchUser('/user/pool/keys', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data),
  updatePoolKey: (id: string, data: { enabled?: boolean; name?: string }) =>
    fetchUser(`/user/pool/keys/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data),
  deletePoolKey: (id: string) => fetchUser(`/user/pool/keys/${id}`, { method: 'DELETE' }).then(r => r.data),
  setPoolStrategy: (keyStrategy: string) =>
    fetchUser('/user/pool/strategy', { method: 'PUT', body: JSON.stringify({ keyStrategy }) }).then(r => r.data),
  createPoolApiKey: (name: string) => fetchUser('/user/pool/api-keys', { method: 'POST', body: JSON.stringify({ name }) }).then(r => r.data),
  revokePoolApiKey: (id: string) => fetchUser(`/user/pool/api-keys/${id}`, { method: 'DELETE' }).then(r => r.data),
  // Per-user key health (cheap authenticated call per key, no tokens)
  testPoolKey: (id: string) => fetchUser(`/user/pool/keys/${id}/test`, { method: 'POST' }).then(r => r.data),
  checkPoolHealth: () => fetchUser('/user/pool/health', { method: 'POST' }).then(r => r.data),

  // Hackathon kits
  getKits: () => fetchUser('/user/kits').then(r => r.data),
  createKit: (data: Record<string, unknown>) => fetchUser('/user/kits', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data),
  revokeKit: (id: string) => fetchUser(`/user/kits/${id}/revoke`, { method: 'POST' }).then(r => r.data),
};

/** Public kit page data (no auth). */
export const getPublicKit = (token: string) =>
  fetch(`${API_URL}/public/kits/${encodeURIComponent(token)}`).then(async r => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error?.message || 'Kit not found');
    return body.data;
  });

export const api = {
  // Who the gateway thinks we are (Clerk user or admin key)
  getMe: () => fetchApi('/admin/me').then(r => r.data || r),

  // Promo codes (admin)
  getCoupons: () => fetchApi('/admin/coupons').then(r => r.data || r),
  createCoupon: (data: Record<string, unknown>) =>
    fetchApi('/admin/coupons', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateCoupon: (id: string, data: { status?: 'active' | 'disabled'; expiresAt?: string | null; maxRedemptions?: number | null }) =>
    fetchApi(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),

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