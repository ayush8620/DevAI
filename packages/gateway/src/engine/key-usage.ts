import { redis } from '../cache/redis.js';

/** Window used by the least_used key strategy. */
export const KEY_USAGE_WINDOW_SEC = 60;

const localUse = new Map<string, number>();
const localRR = new Map<string, number>();

function bucket(now = Date.now()) {
  return Math.floor(now / 1000 / KEY_USAGE_WINDOW_SEC);
}

/** Count one request sent with this key in the current window (Redis, with in-memory fallback). */
export async function recordKeyUse(credentialId: string): Promise<void> {
  const k = `keyuse:${credentialId}:${bucket()}`;
  localUse.set(k, (localUse.get(k) ?? 0) + 1);
  if (localUse.size > 5000) localUse.clear();
  try {
    await redis.multi().incr(k).expire(k, KEY_USAGE_WINDOW_SEC * 2).exec();
  } catch { /* in-memory count still works */ }
}

/** Requests per key in the current window. */
export async function getKeyUsage(credentialIds: string[]): Promise<Record<string, number>> {
  const b = bucket();
  const keys = credentialIds.map(id => `keyuse:${id}:${b}`);
  const out: Record<string, number> = {};
  let remote: (string | null)[] = [];
  try { if (keys.length) remote = await redis.mget(...keys); } catch { remote = []; }
  credentialIds.forEach((id, i) => {
    out[id] = Math.max(Number(remote[i]) || 0, localUse.get(keys[i]) ?? 0);
  });
  return out;
}

/** Next round-robin position for a provider (shared across instances via Redis when available). */
export async function nextRoundRobin(providerId: string): Promise<number> {
  const k = `rr:${providerId}`;
  try {
    return (await redis.incr(k)) - 1;
  } catch {
    const n = localRR.get(k) ?? 0;
    localRR.set(k, n + 1);
    return n;
  }
}
