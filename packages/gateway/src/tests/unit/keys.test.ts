import { describe, it, expect } from 'vitest';
import { orderKeys, byPriority, maskSecret, isKeyStrategy } from '../../engine/keys.js';
import { classifyFailure } from '../../engine/circuit.js';
import { resolveRouting, keyStrategyFor } from '../../engine/router.js';

const keys = ['k1', 'k2', 'k3'].map(id => ({ credentialId: id }));
const ids = (xs: { credentialId: string }[]) => xs.map(x => x.credentialId);

describe('key ordering strategies', () => {
  it('failover keeps priority order', () => {
    expect(ids(orderKeys(keys, 'failover'))).toEqual(['k1', 'k2', 'k3']);
  });

  it('admin priority order wins; unlisted keys follow in original order', () => {
    expect(ids(byPriority(keys, ['k3']))).toEqual(['k3', 'k1', 'k2']);
    expect(ids(orderKeys(keys, 'failover', { priority: ['k2', 'k1'] }))).toEqual(['k2', 'k1', 'k3']);
  });

  it('round_robin rotates the start key each request', () => {
    expect(ids(orderKeys(keys, 'round_robin', { counter: 0 }))).toEqual(['k1', 'k2', 'k3']);
    expect(ids(orderKeys(keys, 'round_robin', { counter: 1 }))).toEqual(['k2', 'k3', 'k1']);
    expect(ids(orderKeys(keys, 'round_robin', { counter: 5 }))).toEqual(['k3', 'k1', 'k2']);
  });

  it('round_robin rotates over healthy keys only', () => {
    const cooling = new Set(['k2']);
    expect(ids(orderKeys(keys, 'round_robin', { counter: 1, cooling }))).toEqual(['k3', 'k1', 'k2']);
  });

  it('random shuffles (deterministic with an injected RNG) and covers every key', () => {
    const out = ids(orderKeys(keys, 'random', { random: () => 0 }));
    expect(out).toEqual(['k2', 'k3', 'k1']);
    expect([...out].sort()).toEqual(['k1', 'k2', 'k3']);
  });

  it('least_used picks the key with the fewest requests this window (ties keep priority)', () => {
    expect(ids(orderKeys(keys, 'least_used', { usage: { k1: 5, k2: 1, k3: 1 } }))).toEqual(['k2', 'k3', 'k1']);
  });

  it('every strategy puts cooling-down keys last', () => {
    const cooling = new Set(['k1']);
    for (const s of ['failover', 'round_robin', 'random', 'least_used'] as const) {
      expect(ids(orderKeys(keys, s, { cooling, random: () => 0.5 })).at(-1)).toBe('k1');
    }
  });

  it('validates strategy names and resolves precedence (request > header > app > provider > failover)', () => {
    expect(isKeyStrategy('round_robin')).toBe(true);
    expect(isKeyStrategy('nope')).toBe(false);
    const req = { model: 'auto', messages: [{ role: 'user' as const, content: 'x' }] };
    expect(resolveRouting(req, {}).keyStrategy).toBeUndefined();
    expect(resolveRouting(req, { keyStrategy: 'random' }).keyStrategy).toBe('random');
    expect(resolveRouting(req, { keyStrategy: 'random' }, null, 'least_used').keyStrategy).toBe('least_used');
    expect(resolveRouting({ ...req, devai: { keyStrategy: 'round_robin' } }, {}, null, 'least_used').keyStrategy).toBe('round_robin');
    expect(resolveRouting(req, {}, null, 'bogus').keyStrategy).toBeUndefined();
    expect(keyStrategyFor({ config: { keyStrategy: 'least_used' } })).toBe('least_used');
    expect(keyStrategyFor({ config: {} })).toBe('failover');
    expect(keyStrategyFor({ config: { keyStrategy: 'least_used' } }, 'random')).toBe('random');
  });
});

describe('maskSecret', () => {
  it('shows only the real prefix and last 4', () => {
    expect(maskSecret('AQ.Ab8R-very-long-secret-value-xyz1')).toBe('AQ.A…xyz1');
    expect(maskSecret('abcdefghij')).toBe('ab…ghij');
    expect(maskSecret('')).toBe('••••');
  });
});

describe('classifyFailure (per-key cooldowns)', () => {
  const err = (status: number | undefined, message = 'x', name?: string) => Object.assign(new Error(message), status ? { status } : {}, name ? { name } : {});
  it('429 → this key only, 30s, try next key', () => {
    expect(classifyFailure(err(429, 'Too many requests'))).toMatchObject({ kind: 'rate_limited', scope: 'key', cooldownSec: 30, tryNextKey: true });
  });
  it('429 quota → key cooldown 10 min', () => {
    expect(classifyFailure(err(429, 'You exceeded your current quota'))).toMatchObject({ kind: 'quota', scope: 'key', cooldownSec: 600 });
  });
  it('401/403 and Gemini "API key not valid" (400) → invalid key, 5 min', () => {
    expect(classifyFailure(err(401))).toMatchObject({ kind: 'auth', scope: 'key', cooldownSec: 300 });
    expect(classifyFailure(err(403))).toMatchObject({ kind: 'auth', scope: 'key' });
    expect(classifyFailure(err(400, 'API key not valid. Please pass a valid API key.'))).toMatchObject({ kind: 'auth', scope: 'key' });
  });
  it('5xx / timeout / network → key+model cooldown, try next key', () => {
    expect(classifyFailure(err(503))).toMatchObject({ kind: 'server', scope: 'model', cooldownSec: 60, tryNextKey: true });
    expect(classifyFailure(err(undefined, 'timeout after 50ms', 'TimeoutError'))).toMatchObject({ kind: 'timeout', tryNextKey: true });
    expect(classifyFailure(err(undefined, 'fetch failed'))).toMatchObject({ kind: 'network', tryNextKey: true });
  });
  it('plain 400 → no cooldown and no point trying other keys', () => {
    expect(classifyFailure(err(400, 'Invalid value for temperature'))).toMatchObject({ kind: 'bad_request', scope: 'none', tryNextKey: false });
  });
});

describe('provider retry hints', () => {
  it('uses Retry-After / Google RetryInfo for the cooldown (clamped 5s..1h) and per-model quota scope', async () => {
    const { providerError } = await import('../../providers/sse.js');
    const google = providerError({
      error: {
        message: 'You exceeded your current quota, please check your plan and billing details.',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-2.5-flash' } }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '18005s' },
        ],
      },
    }, 429, 'Google');
    expect(google.retryAfterSec).toBe(18005);
    expect(classifyFailure(google)).toMatchObject({ kind: 'quota', scope: 'model', cooldownSec: 3600, tryNextKey: true });

    const perMinute = providerError({ error: { message: 'Rate limit reached', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12.4s' }] } }, 429, 'Google');
    expect(classifyFailure(perMinute)).toMatchObject({ kind: 'rate_limited', scope: 'key', cooldownSec: 13 });

    const header = providerError({ error: { message: 'slow down' } }, 429, 'OpenAI', '2');
    expect(classifyFailure(header).cooldownSec).toBe(5);
  });
});
