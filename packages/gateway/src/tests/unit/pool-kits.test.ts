import { describe, it, expect } from 'vitest';
import { PLAN_LIMITS, planFromBilling, limitsFor, canAddPooledKey } from '../../billing/plans.js';
import { checkKitAccess, reserveKitRequest, releaseKitRequest, addKitTokens, kitUsage, counterTtlSec, type KitCounterStore, type KitRow } from '../../engine/kit-limits.js';
import { computePoolStats, keyHealthState, isRateLimitError } from '../../engine/pool-stats.js';
import { parseKitInput, kitStatus, KIT_LIMITS } from '../../routes/user/kits.js';

function memoryStore(): KitCounterStore & { data: Map<string, number> } {
  const data = new Map<string, number>();
  return {
    data,
    async get(k) { return data.get(k) ?? 0; },
    async incrBy(k, by) { const n = (data.get(k) ?? 0) + by; data.set(k, n); return n; },
  };
}

const future = () => new Date(Date.now() + 3600_000);
const kit = (over: Partial<KitRow> = {}): KitRow => ({
  id: 'kit-1', name: 'HackDay', status: 'active', expiresAt: future(), requestCap: 3, tokenCap: null, allowedModels: [], ...over,
});

describe('plan limits (gateway mirrors the dashboard plan config)', () => {
  it('matches packages/dashboard/src/lib/billing/plans.ts', async () => {
    // Loaded by path at runtime: the dashboard is outside this package's TypeScript rootDir.
    const dashboardPlans = new URL('../../../../dashboard/src/lib/billing/plans.ts', import.meta.url).href;
    const { PLANS } = await import(/* @vite-ignore */ dashboardPlans) as { PLANS: { id: keyof typeof PLAN_LIMITS; limits: { pooledKeys: number | null; kits: boolean } }[] };
    expect(PLANS.length).toBe(4);
    for (const p of PLANS) {
      expect(PLAN_LIMITS[p.id].pooledKeys).toBe(p.limits.pooledKeys);
      expect(PLAN_LIMITS[p.id].kits).toBe(p.limits.kits);
    }
  });
  it('Free = 2 pooled keys, Student = 10, Pro/Team unlimited; only Team has kits', () => {
    expect(PLAN_LIMITS.free.pooledKeys).toBe(2);
    expect(PLAN_LIMITS.student.pooledKeys).toBe(10);
    expect(PLAN_LIMITS.pro.pooledKeys).toBeNull();
    expect(PLAN_LIMITS.team.pooledKeys).toBeNull();
    expect(Object.entries(PLAN_LIMITS).filter(([, l]) => l.kits).map(([id]) => id)).toEqual(['team']);
  });
  it('reads the plan from Clerk billing metadata, Free when missing or expired', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    expect(planFromBilling(undefined, now)).toBe('free');
    expect(planFromBilling({ plan: 'student', status: 'active', expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe('student');
    expect(planFromBilling({ plan: 'team', status: 'active', expiresAt: '2026-10-01T00:00:00Z' }, now)).toBe('free');
    expect(planFromBilling({ plan: 'gold', status: 'active', expiresAt: '2027-01-01T00:00:00Z' }, now)).toBe('free');
  });
  it('enforces the pooled key count; admins get Team limits', () => {
    expect(canAddPooledKey(PLAN_LIMITS.free, 1)).toBe(true);
    expect(canAddPooledKey(PLAN_LIMITS.free, 2)).toBe(false);
    expect(canAddPooledKey(PLAN_LIMITS.student, 9)).toBe(true);
    expect(canAddPooledKey(PLAN_LIMITS.student, 10)).toBe(false);
    expect(canAddPooledKey(PLAN_LIMITS.pro, 500)).toBe(true);
    expect(limitsFor('free', true).kits).toBe(true);
  });
});

describe('hackathon kit access', () => {
  it('rejects revoked and expired kits with clear errors', () => {
    const r = checkKitAccess(kit({ status: 'revoked' }), 'gemini-2.5-flash');
    expect(r).toMatchObject({ ok: false, status: 403, type: 'kit_revoked' });
    const e = checkKitAccess(kit({ expiresAt: new Date(Date.now() - 1000) }), 'gemini-2.5-flash');
    expect(e).toMatchObject({ ok: false, status: 403, type: 'kit_expired' });
  });
  it('enforces the allowed model list and maps "auto" to the first allowed model', () => {
    const k = kit({ allowedModels: ['gemini-2.5-flash', 'llama-3.1-8b-instant'] });
    expect(checkKitAccess(k, 'gpt-4o')).toMatchObject({ ok: false, status: 400, type: 'kit_model_not_allowed' });
    expect(checkKitAccess(k, 'Gemini-2.5-Flash')).toEqual({ ok: true, model: 'Gemini-2.5-Flash' });
    expect(checkKitAccess(k, 'auto')).toEqual({ ok: true, model: 'gemini-2.5-flash' });
    expect(checkKitAccess(kit(), 'anything')).toEqual({ ok: true, model: 'anything' });
  });
});

describe('hackathon kit caps (counters)', () => {
  it('allows exactly requestCap requests, then 429 kit_request_cap_reached', async () => {
    const store = memoryStore();
    const k = kit({ requestCap: 3 });
    for (let i = 0; i < 3; i++) expect((await reserveKitRequest(k, store)).ok).toBe(true);
    expect(await reserveKitRequest(k, store)).toMatchObject({ ok: false, status: 429, type: 'kit_request_cap_reached' });
    // the rejected attempt is not counted
    expect((await kitUsage(k, store)).requests).toBe(3);
    expect((await kitUsage(k, store)).requestsRemaining).toBe(0);
  });
  it('does not overshoot under concurrency', async () => {
    const store = memoryStore();
    const k = kit({ requestCap: 5 });
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveKitRequest(k, store)));
    expect(results.filter(r => r.ok).length).toBe(5);
  });
  it('releases a request that never reached a provider', async () => {
    const store = memoryStore();
    const k = kit({ requestCap: 1 });
    await reserveKitRequest(k, store);
    await releaseKitRequest(k, store);
    expect((await reserveKitRequest(k, store)).ok).toBe(true);
  });
  it('blocks new requests once the token cap is used', async () => {
    const store = memoryStore();
    const k = kit({ requestCap: null, tokenCap: 1000 });
    expect((await reserveKitRequest(k, store)).ok).toBe(true);
    await addKitTokens(k, 999, store);
    expect((await reserveKitRequest(k, store)).ok).toBe(true);
    await addKitTokens(k, 5, store);
    expect(await reserveKitRequest(k, store)).toMatchObject({ ok: false, status: 429, type: 'kit_token_cap_reached' });
    expect((await kitUsage(k, store)).tokensRemaining).toBe(0);
  });
  it('keeps counters for a week after expiry', () => {
    const now = Date.now();
    expect(counterTtlSec({ expiresAt: new Date(now + 3600_000) }, now)).toBe(3600 + 7 * 86400);
    expect(counterTtlSec({ expiresAt: new Date(now - 3600_000) }, now)).toBe(7 * 86400);
  });
});

describe('kit input validation', () => {
  const now = new Date('2026-10-18T08:00:00Z');
  const ok = { name: 'Hack Day 3', expiresAt: '2026-10-19T18:00:00+05:30', requestCap: 500, maxTeamSize: 4 };
  it('accepts a valid kit and defaults keyCount to the team size', () => {
    const r = parseKitInput({ ...ok, allowedModels: 'gemini-2.5-flash, gemini-2.5-flash ,llama-3.1-8b-instant' }, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.keyCount).toBe(4);
      expect(r.value.allowedModels).toEqual(['gemini-2.5-flash', 'llama-3.1-8b-instant']);
      expect(r.value.expiresAt.toISOString()).toBe('2026-10-19T12:30:00.000Z');
    }
  });
  it.each([
    [{ ...ok, name: '' }, 'name'],
    [{ ...ok, expiresAt: 'tomorrow' }, 'expiresAt'],
    [{ ...ok, expiresAt: '2026-10-18T07:00:00Z' }, 'future'],
    [{ ...ok, expiresAt: '2027-01-01T00:00:00Z' }, `${KIT_LIMITS.maxDays} days`],
    [{ ...ok, requestCap: undefined }, 'requestCap or a tokenCap'],
    [{ ...ok, requestCap: -5 }, 'requestCap'],
    [{ ...ok, keyCount: 5 }, 'maxTeamSize'],
    [{ ...ok, maxTeamSize: undefined, keyCount: 51 }, 'keyCount'],
  ])('rejects %j', (body, msg) => {
    const r = parseKitInput(body, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(msg);
  });
  it('derives the status', () => {
    expect(kitStatus({ status: 'revoked', expiresAt: future() })).toBe('revoked');
    expect(kitStatus({ status: 'active', expiresAt: new Date(Date.now() - 1) })).toBe('expired');
    expect(kitStatus({ status: 'active', expiresAt: future() })).toBe('active');
  });
});

describe('pool stats ("free quota stretched")', () => {
  const t = '2026-10-18T08:00:00Z';
  it('counts successes per key, absorbed rate limits and the stretch factor', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ credentialId: 'a', status: 200, totalTokens: 10, error: null, createdAt: t })),
      ...Array.from({ length: 4 }, () => ({ credentialId: 'b', status: 200, totalTokens: 5, error: null, createdAt: t })),
      { credentialId: 'a', status: 502, totalTokens: 0, error: 'rate_limited: Google 429 RESOURCE_EXHAUSTED', createdAt: t },
      { credentialId: 'b', status: 502, totalTokens: 0, error: 'server: 500 internal', createdAt: t },
      { credentialId: null, status: 200, totalTokens: 3, error: null, createdAt: t },
    ];
    const s = computePoolStats(rows);
    expect(s.served).toBe(10);
    expect(s.tokens).toBe(80);
    expect(s.rateLimitsAbsorbed).toBe(1);
    expect(s.stretchFactor).toBe(1.7); // 10 answers vs 6 from the busiest key
    expect(s.activeKeys).toBe(2);
    expect(s.perKey.a).toMatchObject({ requests: 7, successes: 6, rateLimited: 1, errors: 0 });
    expect(s.perKey.b).toMatchObject({ requests: 5, successes: 4, errors: 1 });
  });
  it('is 1x with no traffic', () => {
    expect(computePoolStats([]).stretchFactor).toBe(1);
  });
  it('recognises rate limit errors', () => {
    expect(isRateLimitError('429 Too Many Requests')).toBe(true);
    expect(isRateLimitError('quota exceeded')).toBe(true);
    expect(isRateLimitError('400 bad request')).toBe(false);
  });
  it('derives per-key health', () => {
    const base = { enabled: true, status: 'active', quotaLimit: null, quotaUsed: 0, cooldownUntil: null, used: true };
    expect(keyHealthState(base)).toBe('healthy');
    expect(keyHealthState({ ...base, used: false })).toBe('unused');
    expect(keyHealthState({ ...base, enabled: false })).toBe('disabled');
    expect(keyHealthState({ ...base, quotaLimit: 100, quotaUsed: 100 })).toBe('quota_exhausted');
    expect(keyHealthState({ ...base, cooldownUntil: Date.now() + 10_000 })).toBe('cooling_down');
    expect(keyHealthState({ ...base, cooldownUntil: Date.now() - 10_000 })).toBe('healthy');
    expect(keyHealthState({ ...base, status: 'error' })).toBe('error');
  });
});
