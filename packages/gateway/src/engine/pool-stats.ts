/**
 * "Free quota stretched": how much further a pool of keys went than one key alone.
 * Built from usage_records rows of the pool project (one row per provider call).
 */
export interface UsageRow {
  credentialId: string | null;
  status: number | null;
  totalTokens: number | null;
  error: string | null;
  createdAt: Date | string | null;
}

export interface KeyStats {
  requests: number;
  successes: number;
  tokens: number;
  rateLimited: number;
  errors: number;
  lastUsedAt: string | null;
}

export interface PoolStats {
  /** Successful answers served by the pool */
  served: number;
  tokens: number;
  /** 429 / quota errors that were absorbed by switching to another key */
  rateLimitsAbsorbed: number;
  /** served / (successes of the busiest single key): 1 = no stretch */
  stretchFactor: number;
  /** Keys that answered at least once */
  activeKeys: number;
  perKey: Record<string, KeyStats>;
}

const RATE_RE = /429|rate.?limit|quota|resource.?exhausted|too many requests/i;

export function isRateLimitError(error: string | null | undefined): boolean {
  return Boolean(error && RATE_RE.test(error));
}

export function computePoolStats(rows: UsageRow[]): PoolStats {
  const perKey: Record<string, KeyStats> = {};
  let served = 0, tokens = 0, rateLimitsAbsorbed = 0;
  for (const r of rows) {
    if (!r.credentialId) continue;
    const k = perKey[r.credentialId] ??= { requests: 0, successes: 0, tokens: 0, rateLimited: 0, errors: 0, lastUsedAt: null };
    k.requests++;
    const ok = r.status !== null && r.status < 400;
    if (ok) { k.successes++; served++; }
    else if (isRateLimitError(r.error)) { k.rateLimited++; rateLimitsAbsorbed++; }
    else k.errors++;
    k.tokens += r.totalTokens || 0;
    tokens += r.totalTokens || 0;
    const at = r.createdAt ? new Date(r.createdAt).toISOString() : null;
    if (at && (!k.lastUsedAt || at > k.lastUsedAt)) k.lastUsedAt = at;
  }
  const busiest = Math.max(0, ...Object.values(perKey).map(k => k.successes));
  return {
    served,
    tokens,
    rateLimitsAbsorbed,
    stretchFactor: busiest > 0 ? Math.round((served / busiest) * 10) / 10 : 1,
    activeKeys: Object.values(perKey).filter(k => k.successes > 0).length,
    perKey,
  };
}

export type KeyHealthState = 'healthy' | 'cooling_down' | 'error' | 'disabled' | 'quota_exhausted' | 'unused';

/** Health shown per pooled key: disabled > quota > live cooldown > last test error > unused/healthy. */
export function keyHealthState(k: {
  enabled: boolean | null; status: string | null; quotaLimit: number | null; quotaUsed: number | null;
  cooldownUntil: number | null; used: boolean;
}, now = Date.now()): KeyHealthState {
  if (k.enabled === false || k.status === 'disabled' || k.status === 'revoked') return 'disabled';
  if (k.quotaLimit && (k.quotaUsed ?? 0) >= k.quotaLimit) return 'quota_exhausted';
  if (k.cooldownUntil && k.cooldownUntil > now) return 'cooling_down';
  if (k.status === 'error') return 'error';
  return k.used ? 'healthy' : 'unused';
}
