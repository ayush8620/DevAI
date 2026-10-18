import { redis } from '../cache/redis.js';

/**
 * Hackathon kit enforcement: expiry, revocation, allowed models, a request cap and a
 * token ("spend") cap. Counters live in Redis (shared by all gateway instances) with an
 * in-memory fallback, under kit:<id>:requests and kit:<id>:tokens.
 */
export interface KitRow {
  id: string;
  name: string;
  status: string;
  expiresAt: Date | string;
  requestCap: number | null;
  tokenCap: number | null;
  allowedModels: string[] | null;
}

export interface KitCounterStore {
  get(key: string): Promise<number>;
  incrBy(key: string, by: number, ttlSec: number): Promise<number>;
}

const local = new Map<string, number>();

export const kitCounterStore: KitCounterStore = {
  async get(key) {
    try {
      const v = await redis.get(key);
      if (v !== null) return Number(v) || 0;
    } catch { /* fall back to memory */ }
    return local.get(key) ?? 0;
  },
  async incrBy(key, by, ttlSec) {
    const mem = (local.get(key) ?? 0) + by;
    local.set(key, mem);
    try {
      const res = await redis.multi().incrby(key, by).expire(key, ttlSec).exec();
      const n = Number(res?.[0]?.[1]);
      if (Number.isFinite(n)) return n;
    } catch { /* memory only */ }
    return mem;
  },
};

export const kitKeys = (id: string) => ({ requests: `kit:${id}:requests`, tokens: `kit:${id}:tokens` });

/** Counters are kept for a week after the kit expires, so the kit page still shows final usage. */
export function counterTtlSec(kit: Pick<KitRow, 'expiresAt'>, now = Date.now()): number {
  const left = Math.ceil((new Date(kit.expiresAt).getTime() - now) / 1000);
  return Math.max(left, 0) + 7 * 24 * 3600;
}

export type KitDenial = { status: 400 | 403 | 429; type: string; message: string };

/** Static checks (no counters): revoked, expired, model allow-list. Returns the model to use. */
export function checkKitAccess(kit: KitRow, model: string, now: Date = new Date()): { ok: true; model: string } | ({ ok: false } & KitDenial) {
  if (kit.status !== 'active') {
    return { ok: false, status: 403, type: 'kit_revoked', message: `The hackathon kit "${kit.name}" was revoked by its owner.` };
  }
  const exp = new Date(kit.expiresAt);
  if (!(exp.getTime() > now.getTime())) {
    return { ok: false, status: 403, type: 'kit_expired', message: `The hackathon kit "${kit.name}" expired at ${exp.toISOString()}.` };
  }
  const allowed = (kit.allowedModels ?? []).filter(Boolean);
  if (allowed.length) {
    if (!model || model === 'auto') return { ok: true, model: allowed[0] };
    if (!allowed.some(m => m.toLowerCase() === model.toLowerCase())) {
      return { ok: false, status: 400, type: 'kit_model_not_allowed', message: `Model "${model}" is not allowed in this kit. Allowed: ${allowed.join(', ')}.` };
    }
  }
  return { ok: true, model };
}

/**
 * Reserve one request against the caps. The request counter is incremented first and
 * rolled back if that went over the cap, so concurrent requests cannot overshoot.
 */
export async function reserveKitRequest(kit: KitRow, store: KitCounterStore = kitCounterStore, now = Date.now()): Promise<{ ok: true } | ({ ok: false } & KitDenial)> {
  const k = kitKeys(kit.id);
  const ttl = counterTtlSec(kit, now);
  if (kit.tokenCap !== null && kit.tokenCap !== undefined) {
    const used = await store.get(k.tokens);
    if (used >= kit.tokenCap) {
      return { ok: false, status: 429, type: 'kit_token_cap_reached', message: `This kit has used its token cap (${kit.tokenCap.toLocaleString('en-US')} tokens).` };
    }
  }
  if (kit.requestCap !== null && kit.requestCap !== undefined) {
    const n = await store.incrBy(k.requests, 1, ttl);
    if (n > kit.requestCap) {
      await store.incrBy(k.requests, -1, ttl);
      return { ok: false, status: 429, type: 'kit_request_cap_reached', message: `This kit has used all ${kit.requestCap.toLocaleString('en-US')} requests.` };
    }
  } else {
    await store.incrBy(k.requests, 1, ttl);
  }
  return { ok: true };
}

/** Give back a reserved request that never reached a provider (routing error). */
export async function releaseKitRequest(kit: KitRow, store: KitCounterStore = kitCounterStore) {
  await store.incrBy(kitKeys(kit.id).requests, -1, counterTtlSec(kit));
}

export async function addKitTokens(kit: KitRow, tokens: number, store: KitCounterStore = kitCounterStore) {
  if (tokens > 0) await store.incrBy(kitKeys(kit.id).tokens, Math.round(tokens), counterTtlSec(kit));
}

export async function kitUsage(kit: KitRow, store: KitCounterStore = kitCounterStore) {
  const k = kitKeys(kit.id);
  const [requests, tokens] = await Promise.all([store.get(k.requests), store.get(k.tokens)]);
  return {
    requests,
    tokens,
    requestsRemaining: kit.requestCap == null ? null : Math.max(kit.requestCap - requests, 0),
    tokensRemaining: kit.tokenCap == null ? null : Math.max(kit.tokenCap - tokens, 0),
  };
}
