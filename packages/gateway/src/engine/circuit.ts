import { cacheGet, cacheSet, cacheDel, redis } from '../cache/redis.js';

/**
 * Simple circuit breaker per credential+model. After a failure that indicates the
 * provider is down (5xx, 429, timeout, network, auth), the target is skipped for a
 * cooldown period. State lives in memory and is mirrored to Redis (if available)
 * so other gateway instances skip it too.
 */
export interface CircuitStore {
  isOpen(key: string): Promise<boolean>;
  trip(key: string, cooldownSec: number): Promise<void>;
}

const local = new Map<string, number>();

export const circuitStore: CircuitStore = {
  async isOpen(key) {
    const until = local.get(key);
    if (until && until > Date.now()) return true;
    if (until) local.delete(key);
    return (await cacheGet(`circuit:${key}`)) !== null;
  },
  async trip(key, cooldownSec) {
    local.set(key, Date.now() + cooldownSec * 1000);
    await cacheSet(`circuit:${key}`, '1', cooldownSec);
  },
};

export function errorStatus(err: any): number | null {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.statusCode === 'number') return err.statusCode;
  return null;
}

/** Errors that mean "this provider/model is unavailable right now". */
export function shouldTripCircuit(err: any): boolean {
  const status = errorStatus(err);
  if (status === null) return true; // timeout / network / unknown
  if (/api key|unauthori[sz]ed|permission/i.test(String(err?.message))) return true; // bad credential
  return status >= 500 || status === 429 || status === 401 || status === 403;
}

/** Cooldown in seconds: rate limits get a shorter cooldown. */
export function cooldownFor(err: any): number {
  return classifyFailure(err).cooldownSec || 60;
}

export type FailureKind = 'rate_limited' | 'auth' | 'quota' | 'server' | 'timeout' | 'network' | 'bad_request';

export interface FailureClass {
  kind: FailureKind;
  /** 'key' = only this API key is bad (other keys of the provider may work); 'model' = this key+model; 'none' = don't trip */
  scope: 'key' | 'model' | 'none';
  cooldownSec: number;
  /** Should the same request be retried with another key of the same provider? */
  tryNextKey: boolean;
}

const AUTH_RE = /api[ _-]?key|unauthori[sz]ed|permission|invalid.*(key|token)|forbidden/i;
const QUOTA_RE = /quota|billing|credit|exceeded your|resource[_ ]exhausted|insufficient/i;

/**
 * Classify a provider error for per-key failover:
 *  429 → key cooldown 30s (or the provider's Retry-After / RetryInfo, 5s..1h)
 *  401/403/invalid key → key cooldown 5 min · quota/billing → key cooldown 10 min (or the provider's hint)
 *  per-model quotas (Google) → only this key+model cools down
 *  5xx / timeout / network → key+model cooldown 60s (still try the next key)
 *  other 4xx (bad request) → no cooldown, don't retry other keys (they would fail the same way)
 */
export function classifyFailure(err: any): FailureClass {
  const status = errorStatus(err);
  const msg = String(err?.message ?? '');
  const timeout = err?.name === 'TimeoutError' || /timeout/i.test(msg);
  // Provider-supplied wait (Retry-After / Google RetryInfo), clamped to 5s..1h so keys are re-tried at least hourly
  const hint = typeof err?.retryAfterSec === 'number' && Number.isFinite(err.retryAfterSec)
    ? Math.min(Math.max(Math.ceil(err.retryAfterSec), 5), 3600) : undefined;
  // Google quotas are often per model: then only this key+model cools down, other models keep working
  const limitScope: 'key' | 'model' = err?.limitScope === 'model' ? 'model' : 'key';
  if (status === 429) {
    const quota = /quota|billing|credit/i.test(msg);
    if (quota) return { kind: 'quota', scope: limitScope, cooldownSec: hint ?? 600, tryNextKey: true };
    return { kind: 'rate_limited', scope: limitScope, cooldownSec: hint ?? 30, tryNextKey: true };
  }
  if (status === 401 || status === 403 || ((status === 400 || status === null) && AUTH_RE.test(msg) && !timeout)) {
    return { kind: 'auth', scope: 'key', cooldownSec: 300, tryNextKey: true };
  }
  if (status === 402 || (status !== null && status < 500 && QUOTA_RE.test(msg))) {
    return { kind: 'quota', scope: limitScope, cooldownSec: hint ?? 600, tryNextKey: true };
  }
  if (status === null) {
    return timeout
      ? { kind: 'timeout', scope: 'model', cooldownSec: 60, tryNextKey: true }
      : { kind: 'network', scope: 'model', cooldownSec: 60, tryNextKey: true };
  }
  if (status >= 500) return { kind: 'server', scope: 'model', cooldownSec: hint ?? 60, tryNextKey: true };
  return { kind: 'bad_request', scope: 'none', cooldownSec: 0, tryNextKey: false };
}

/** Seconds left on a local cooldown (0 if none); Redis is checked by isOpen. */
export function localCooldownLeft(key: string): number {
  const until = local.get(key);
  return until && until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

/** Clear every cooldown of one API key (after a successful manual test). */
export async function clearKeyCooldown(credentialId: string): Promise<void> {
  for (const k of [...local.keys()]) if (k === `key:${credentialId}` || k.startsWith(`${credentialId}:`)) local.delete(k);
  await cacheDel(`circuit:key:${credentialId}`);
}

/** Seconds left on a key-level cooldown, checking Redis too. */
export async function keyCooldownLeft(credentialId: string): Promise<number> {
  const localLeft = localCooldownLeft(`key:${credentialId}`);
  if (localLeft) return localLeft;
  try {
    const ttl = await redis.ttl(`circuit:key:${credentialId}`);
    return ttl > 0 ? ttl : 0;
  } catch { return 0; }
}

export function _resetCircuitsForTests() {
  local.clear();
}
