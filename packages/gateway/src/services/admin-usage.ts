import { and, count, desc, eq, gte, inArray, isNotNull, max, sql, sum } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, providers, providerCredentials, usageRecords, apiKeys, hackathonKits } from '../db/schema/index.js';
import { errorRate } from '../billing/admin.js';

/** Drizzle queries behind the admin panel (gateway-wide usage, per-user usage, pool and kits). */

const DAY = 86_400_000;
const isError = sql`(${usageRecords.status} >= 400 OR ${usageRecords.error} IS NOT NULL)`;

export interface UsageWindow { requests: number; tokens: number; errors: number; errorRate: number; avgLatencyMs: number }

function toWindow(r: any): UsageWindow {
  const requests = Number(r?.requests) || 0;
  const errors = Number(r?.errors) || 0;
  return { requests, tokens: Number(r?.tokens) || 0, errors, errorRate: errorRate(requests, errors), avgLatencyMs: Number(r?.avgLatencyMs) || 0 };
}

const windowCols = {
  requests: count(),
  tokens: sum(usageRecords.totalTokens),
  errors: sql<number>`count(*) FILTER (WHERE ${isError})`,
  avgLatencyMs: sql<number>`COALESCE(AVG(${usageRecords.latencyMs}), 0)::int`,
};

export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Gateway-wide usage since a time (optionally only the given projects). */
export async function usageSince(since: Date, projectIds?: string[]): Promise<UsageWindow> {
  if (projectIds && !projectIds.length) return toWindow(null);
  const [r] = await db.select(windowCols).from(usageRecords)
    .where(and(gte(usageRecords.createdAt, since), projectIds ? inArray(usageRecords.projectId, projectIds) : undefined));
  return toWindow(r);
}

export interface DayPoint { date: string; requests: number; tokens: number; errors: number }

/** One point per day for the last `days` days, oldest first (days without traffic are zero). */
export async function usageByDay(days: number, projectIds?: string[]): Promise<DayPoint[]> {
  if (projectIds && !projectIds.length) projectIds = ['00000000-0000-0000-0000-000000000000'];
  const scope = projectIds ? sql`AND u.project_id IN (${sql.join(projectIds.map(id => sql`${id}::uuid`), sql`, `)})` : sql``;
  const res = await db.execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
           count(u.id)::int AS requests,
           COALESCE(sum(u.total_tokens), 0)::bigint AS tokens,
           (count(u.id) FILTER (WHERE u.status >= 400 OR u.error IS NOT NULL))::int AS errors
    FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') AS d(day)
    LEFT JOIN usage_records u ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day' ${scope}
    GROUP BY d.day ORDER BY d.day`);
  const rows = ((res as any).rows ?? res) as any[];
  return rows.map(r => ({ date: String(r.date), requests: Number(r.requests) || 0, tokens: Number(r.tokens) || 0, errors: Number(r.errors) || 0 }));
}

/** Usage per provider with names (user-owned providers are grouped by type). */
export async function usageByProvider(since: Date, projectIds?: string[]) {
  if (projectIds && !projectIds.length) return [];
  const rows = await db.select({
    providerId: usageRecords.providerId,
    providerName: providers.name,
    providerType: providers.type,
    shared: sql<boolean>`${providers.ownerUserId} IS NULL`,
    requestCount: count(),
    totalTokens: sum(usageRecords.totalTokens),
    errors: sql<number>`count(*) FILTER (WHERE ${isError})`,
  }).from(usageRecords)
    .leftJoin(providers, eq(providers.id, usageRecords.providerId))
    .where(and(gte(usageRecords.createdAt, since), projectIds ? inArray(usageRecords.projectId, projectIds) : undefined))
    .groupBy(usageRecords.providerId, providers.name, providers.type, providers.ownerUserId);
  // Many users add their own "Gemini" provider: merge user-owned rows by name.
  const merged = new Map<string, { key: string; name: string; type: string | null; shared: boolean; requestCount: number; totalTokens: number; errors: number }>();
  for (const r of rows) {
    const key = r.providerId == null ? 'none' : r.shared ? `shared:${r.providerId}` : `byok:${r.providerName ?? r.providerType}`;
    const cur = merged.get(key) ?? { key, name: r.providerId == null ? 'No provider (cache or rejected)' : (r.providerName ?? 'Deleted provider'), type: r.providerType ?? null, shared: Boolean(r.shared) && r.providerId != null, requestCount: 0, totalTokens: 0, errors: 0 };
    cur.requestCount += Number(r.requestCount) || 0;
    cur.totalTokens += Number(r.totalTokens) || 0;
    cur.errors += Number(r.errors) || 0;
    merged.set(key, cur);
  }
  return [...merged.values()].sort((a, b) => b.requestCount - a.requestCount);
}

export async function usageByModel(since: Date, projectIds?: string[]) {
  if (projectIds && !projectIds.length) return [];
  const rows = await db.select({
    model: usageRecords.model,
    requestCount: count(),
    totalTokens: sum(usageRecords.totalTokens),
    errors: sql<number>`count(*) FILTER (WHERE ${isError})`,
  }).from(usageRecords)
    .where(and(gte(usageRecords.createdAt, since), projectIds ? inArray(usageRecords.projectId, projectIds) : undefined))
    .groupBy(usageRecords.model)
    .orderBy(desc(count()))
    .limit(25);
  return rows.map(r => ({ model: r.model ?? 'unknown', requestCount: Number(r.requestCount) || 0, totalTokens: Number(r.totalTokens) || 0, errors: Number(r.errors) || 0 }));
}

/** Heaviest users by requests (pool + kit projects are attributed to their owner). */
export async function topUsers(since: Date, limit: number) {
  const rows = await db.select({
    userId: projects.ownerUserId,
    requests: count(),
    tokens: sum(usageRecords.totalTokens),
    errors: sql<number>`count(*) FILTER (WHERE ${isError})`,
  }).from(usageRecords)
    .innerJoin(projects, eq(projects.id, usageRecords.projectId))
    .where(and(gte(usageRecords.createdAt, since), isNotNull(projects.ownerUserId)))
    .groupBy(projects.ownerUserId)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.map(r => ({ userId: r.userId!, requests: Number(r.requests) || 0, tokens: Number(r.tokens) || 0, errors: Number(r.errors) || 0 }));
}

/** Requests in the window and the last request time, per user. */
export async function perUserActivity(userIds: string[], since: Date) {
  const out = new Map<string, { requests: number; lastRequestAt: string | null }>();
  if (!userIds.length) return out;
  const rows = await db.select({
    userId: projects.ownerUserId,
    requests: sql<number>`count(*) FILTER (WHERE ${usageRecords.createdAt} >= ${since})`,
    last: max(usageRecords.createdAt),
  }).from(usageRecords)
    .innerJoin(projects, eq(projects.id, usageRecords.projectId))
    .where(inArray(projects.ownerUserId, userIds))
    .groupBy(projects.ownerUserId);
  for (const r of rows) out.set(r.userId!, { requests: Number(r.requests) || 0, lastRequestAt: r.last ? new Date(r.last as any).toISOString() : null });
  return out;
}

/** Number of BYOK provider keys per user (revoked/deleted ones excluded). */
export async function byokKeyCounts(userIds: string[]) {
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  const rows = await db.select({ userId: providers.ownerUserId, n: count() })
    .from(providerCredentials)
    .innerJoin(providers, eq(providers.id, providerCredentials.providerId))
    .where(and(inArray(providers.ownerUserId, userIds), sql`COALESCE(${providerCredentials.status}, 'active') <> 'revoked'`))
    .groupBy(providers.ownerUserId);
  for (const r of rows) out.set(r.userId!, Number(r.n) || 0);
  return out;
}

export async function projectIdsOf(userId: string): Promise<string[]> {
  return (await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerUserId, userId))).map(p => p.id);
}

/** Counts for the key pool & kits page. */
export async function poolCounts(now: Date = new Date()) {
  const [keys] = await db.select({
    total: count(),
    active: sql<number>`count(*) FILTER (WHERE ${providerCredentials.enabled} = true AND COALESCE(${providerCredentials.status}, 'active') NOT IN ('disabled', 'revoked'))`,
    disabled: sql<number>`count(*) FILTER (WHERE ${providerCredentials.enabled} = false AND COALESCE(${providerCredentials.status}, 'active') <> 'revoked')`,
    revoked: sql<number>`count(*) FILTER (WHERE ${providerCredentials.status} = 'revoked')`,
    owners: sql<number>`count(DISTINCT ${providers.ownerUserId})`,
  }).from(providerCredentials)
    .innerJoin(providers, eq(providers.id, providerCredentials.providerId))
    .where(isNotNull(providers.ownerUserId));
  const [poolApiKeys] = await db.select({
    total: count(),
    active: sql<number>`count(*) FILTER (WHERE ${apiKeys.status} = 'active')`,
  }).from(apiKeys).innerJoin(projects, eq(projects.id, apiKeys.projectId)).where(eq(projects.kind, 'pool'));
  const [kits] = await db.select({
    total: count(),
    active: sql<number>`count(*) FILTER (WHERE ${hackathonKits.status} = 'active' AND ${hackathonKits.expiresAt} > ${now})`,
    expired: sql<number>`count(*) FILTER (WHERE ${hackathonKits.status} = 'active' AND ${hackathonKits.expiresAt} <= ${now})`,
    revoked: sql<number>`count(*) FILTER (WHERE ${hackathonKits.status} = 'revoked')`,
    keys: sql<number>`COALESCE(sum(${hackathonKits.keyCount}), 0)::int`,
  }).from(hackathonKits);
  const n = (v: unknown) => Number(v) || 0;
  return {
    providerKeys: { total: n(keys?.total), active: n(keys?.active), disabled: n(keys?.disabled), revoked: n(keys?.revoked), owners: n(keys?.owners) },
    poolApiKeys: { total: n(poolApiKeys?.total), active: n(poolApiKeys?.active) },
    kits: { total: n(kits?.total), active: n(kits?.active), expired: n(kits?.expired), revoked: n(kits?.revoked), keys: n(kits?.keys) },
  };
}

/** Pool provider keys with the most traffic in the last `days` days (abuse review). */
export async function busiestPoolKeys(days: number, limit: number) {
  const since = new Date(Date.now() - days * DAY);
  const requests = sql<number>`(SELECT count(*) FROM ${usageRecords} WHERE ${usageRecords.credentialId} = ${providerCredentials.id} AND ${usageRecords.createdAt} >= ${since})::int`;
  const rows = await db.select({
    id: providerCredentials.id,
    name: providerCredentials.name,
    encryptedKey: providerCredentials.encryptedKey,
    iv: providerCredentials.iv,
    authTag: providerCredentials.authTag,
    enabled: providerCredentials.enabled,
    status: providerCredentials.status,
    lastError: providerCredentials.lastError,
    createdAt: providerCredentials.createdAt,
    ownerUserId: providers.ownerUserId,
    providerName: providers.name,
    requests,
    errors: sql<number>`(SELECT count(*) FROM ${usageRecords} WHERE ${usageRecords.credentialId} = ${providerCredentials.id} AND ${usageRecords.createdAt} >= ${since} AND (${usageRecords.status} >= 400 OR ${usageRecords.error} IS NOT NULL))::int`,
  }).from(providerCredentials)
    .innerJoin(providers, eq(providers.id, providerCredentials.providerId))
    .where(isNotNull(providers.ownerUserId))
    .orderBy(desc(requests), desc(providerCredentials.createdAt))
    .limit(limit);
  return rows;
}
