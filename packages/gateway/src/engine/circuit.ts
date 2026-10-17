import { cacheGet, cacheSet } from '../cache/redis.js';

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
  return errorStatus(err) === 429 ? 30 : 60;
}

export function _resetCircuitsForTests() {
  local.clear();
}
