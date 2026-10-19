/**
 * Admin panel API (/admin/* on the gateway). Only the /admin pages import this. The gateway
 * accepts the Clerk session of an allowlisted admin (ADMIN_EMAILS / ADMIN_USER_IDS) or the
 * ADMIN_API_KEY saved in this browser (System page), and answers 403 to everyone else.
 */
import { fetchAdmin, getGatewayHealth } from './api';

const qs = (params: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const post = (path: string, body?: unknown) => fetchAdmin(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export type Period = 'today' | 'week' | 'month';

/** New admin panel endpoints (overview, users, subscriptions, pool, usage, audit, system). */
export const panelApi = {
  getOverview: () => fetchAdmin('/admin/overview').then(r => r.data),
  getUsers: (p: { q?: string; page?: number; limit?: number }) => fetchAdmin(`/admin/users${qs(p)}`),
  getUser: (id: string) => fetchAdmin(`/admin/users/${encodeURIComponent(id)}`).then(r => r.data),
  changePlan: (id: string, body: { plan: string; period?: string; days?: number; note?: string; force?: boolean }) =>
    post(`/admin/users/${encodeURIComponent(id)}/plan`, body).then(r => r.data),
  suspendUser: (id: string, reason?: string) => post(`/admin/users/${encodeURIComponent(id)}/suspend`, { reason }).then(r => r.data),
  unsuspendUser: (id: string) => post(`/admin/users/${encodeURIComponent(id)}/unsuspend`).then(r => r.data),
  getSubscriptions: (p: { status?: string; plan?: string; source?: string; page?: number; limit?: number }) => fetchAdmin(`/admin/subscriptions${qs(p)}`),
  getUsageByDay: (days: number) => fetchAdmin(`/admin/analytics/by-day${qs({ days })}`).then(r => r.data),
  getUsageByModel: (period: Period) => fetchAdmin(`/admin/analytics/by-model${qs({ period })}`).then(r => r.data),
  getUsageByProvider: (period: Period) => fetchAdmin(`/admin/analytics/by-provider${qs({ period })}`).then(r => r.data),
  getTopUsers: (period: Period, limit = 10) => fetchAdmin(`/admin/analytics/top-users${qs({ period, limit })}`).then(r => r.data),
  getPool: (days = 7) => fetchAdmin(`/admin/pool${qs({ days })}`).then(r => r.data),
  revokePoolKey: (id: string, reason?: string) => post(`/admin/pool/keys/${id}/revoke`, { reason }).then(r => r.data),
  revokePoolApiKey: (id: string, reason?: string) => post(`/admin/pool/api-keys/${id}/revoke`, { reason }).then(r => r.data),
  revokeKit: (id: string, reason?: string) => post(`/admin/pool/kits/${id}/revoke`, { reason }).then(r => r.data),
  getAudit: (p: { actor?: string; action?: string; resourceType?: string; resourceId?: string; q?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    fetchAdmin(`/admin/audit-logs${qs(p)}`),
  getAuditFacets: () => fetchAdmin('/admin/audit-logs/facets').then(r => r.data as { actions: string[]; resourceTypes: string[] }),
  getProviderHealth: () => fetchAdmin('/admin/providers/health').then(r => r.data),
  getSystem: () => fetchAdmin('/admin/system').then(r => r.data),
  getHealth: getGatewayHealth,
};

/** Existing admin endpoints (shared providers, projects, coupons, analytics), moved from lib/api.ts. */
export const adminApi = {
  // Who the gateway thinks we are (Clerk user or admin key)
  getMe: () => fetchAdmin('/admin/me').then(r => r.data || r),

  // Promo codes (admin)
  getCoupons: () => fetchAdmin('/admin/coupons').then(r => r.data || r),
  createCoupon: (data: Record<string, unknown>) =>
    fetchAdmin('/admin/coupons', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateCoupon: (id: string, data: { status?: 'active' | 'disabled'; expiresAt?: string | null; maxRedemptions?: number | null }) =>
    fetchAdmin(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),

  // Analytics
  getOverview: () => fetchAdmin('/admin/analytics/overview').then(r => r.data || r),
  getRecentRequests: () => fetchAdmin('/admin/analytics/recent-requests').then(r => r.data || r),
  getAnalyticsByProvider: (period?: string) => fetchAdmin(`/admin/analytics/by-provider${period ? `?period=${period}` : ''}`).then(r => r.data || r),
  getAnalyticsByModel: (period?: string) => fetchAdmin(`/admin/analytics/by-model${period ? `?period=${period}` : ''}`).then(r => r.data || r),
  getAnalyticsByProject: (period?: string) => fetchAdmin(`/admin/analytics/by-project${period ? `?period=${period}` : ''}`).then(r => r.data || r),

  // Providers
  getProviders: () => fetchAdmin('/admin/providers').then(r => r.data || r),
  createProvider: (data: { type: string; name: string; baseUrl?: string }) =>
    fetchAdmin('/admin/providers', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateProvider: (id: string, data: Record<string, unknown>) =>
    fetchAdmin(`/admin/providers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteProvider: (id: string) =>
    fetchAdmin(`/admin/providers/${id}`, { method: 'DELETE' }).then(r => r.data || r),
  testProvider: (id: string) =>
    fetchAdmin(`/admin/providers/${id}/test`, { method: 'POST' }).then(r => r.data || r),

  // Provider Models
  getProviderModels: (providerId: string) =>
    fetchAdmin(`/admin/providers/${providerId}/models`).then(r => r.data || r),
  addProviderModel: (providerId: string, data: { modelId: string; displayName?: string }) =>
    fetchAdmin(`/admin/providers/${providerId}/models`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteProviderModel: (providerId: string, modelId: string) =>
    fetchAdmin(`/admin/providers/${providerId}/models/${modelId}`, { method: 'DELETE' }).then(r => r.data || r),
  syncProviderModels: (providerId: string) =>
    fetchAdmin(`/admin/providers/${providerId}/sync-models`, { method: 'POST' }).then(r => r.data || r),

  // Credentials (routed under /admin/credentials)
  getCredentials: (providerId: string) =>
    fetchAdmin(`/admin/credentials/provider/${providerId}`).then(r => r.data || r),
  createCredential: (providerId: string, data: { name: string; apiKey: string; quotaLimit?: number }) =>
    fetchAdmin(`/admin/credentials/provider/${providerId}`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateCredential: (id: string, data: { enabled?: boolean; name?: string }) =>
    fetchAdmin(`/admin/credentials/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteCredential: (id: string) =>
    fetchAdmin(`/admin/credentials/${id}`, { method: 'DELETE' }).then(r => r.data || r),
  testCredential: (id: string) =>
    fetchAdmin(`/admin/credentials/${id}/test`, { method: 'POST' }).then(r => r.data || r),

  // Projects
  getProjects: () => fetchAdmin('/admin/projects').then(r => r.data || r),
  createProject: (data: { name: string; description?: string }) =>
    fetchAdmin('/admin/projects', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data || r),
  updateProject: (id: string, data: Record<string, unknown>) =>
    fetchAdmin(`/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.data || r),
  deleteProject: (id: string) =>
    fetchAdmin(`/admin/projects/${id}`, { method: 'DELETE' }).then(r => r.data || r),

  // API Keys (routed under /admin/api-keys)
  getApiKeys: (projectId: string) =>
    fetchAdmin(`/admin/api-keys/project/${projectId}`).then(r => r.data || r),
  createApiKey: (projectId: string, data: { name: string }) =>
    fetchAdmin(`/admin/api-keys/project/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  deleteApiKey: (id: string) =>
    fetchAdmin(`/admin/api-keys/${id}`, { method: 'DELETE' }).then(r => r.data || r),

  // Audit
  getAuditLogs: (filters?: { limit?: number }) =>
    fetchAdmin(`/admin/audit-logs${filters?.limit ? `?limit=${filters.limit}` : ''}`),

  // Health (public, no auth needed)
  getHealth: getGatewayHealth,
};