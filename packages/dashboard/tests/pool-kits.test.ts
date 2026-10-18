import { describe, it, expect } from 'vitest';
import { timeLeft } from '../src/lib/kits';
import { PLANS, getPlan } from '../src/lib/billing/plans';

describe('kit timeLeft', () => {
  const now = Date.UTC(2026, 9, 18, 10, 0, 0);
  it('formats days, hours and minutes', () => {
    expect(timeLeft(new Date(now + 3 * 86_400_000).toISOString(), now)).toBe('3 days left');
    expect(timeLeft(new Date(now + 5 * 3_600_000 + 30 * 60_000).toISOString(), now)).toBe('5h 30m left');
    expect(timeLeft(new Date(now + 10 * 60_000).toISOString(), now)).toBe('10 min left');
    expect(timeLeft(new Date(now - 1000).toISOString(), now)).toBe('ended');
  });
});

describe('pool and kit plan limits', () => {
  it('Free 2, Student 10, Pro/Team unlimited pooled keys', () => {
    expect(PLANS.map(p => [p.id, p.limits.pooledKeys])).toEqual([['free', 2], ['student', 10], ['pro', null], ['team', null]]);
  });
  it('only Team includes hackathon kits, and says so in its features', () => {
    expect(PLANS.filter(p => p.limits.kits).map(p => p.id)).toEqual(['team']);
    expect(getPlan('team')!.features.join(' ')).toMatch(/Hackathon kits/);
  });
});
