import { describe, it, expect } from 'vitest';
import { parseCouponInput, quoteCoupon, normalizeCode, type CouponRow } from '../../billing/coupons.js';
import { PLAN_PRICES_PAISE, planFromBilling, ACCESS_STATUSES } from '../../billing/plans.js';

const now = new Date('2026-10-18T10:00:00Z');
const row = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: 'c1', code: 'LAUNCH20', kind: 'percent', percentOff: 20, amountOffPaise: null, plans: [], periods: [],
  duration: 'first_cycle', expiresAt: null, maxRedemptions: null, oncePerUser: true, razorpayOfferId: null,
  redemptionCount: 0, status: 'active', ...over,
});

describe('plan prices (gateway mirrors the dashboard plan config)', () => {
  it('matches packages/dashboard/src/lib/billing/plans.ts, monthly and yearly', async () => {
    const dashboardPlans = new URL('../../../../dashboard/src/lib/billing/plans.ts', import.meta.url).href;
    const { PLANS, ACCESS_STATUSES: dash } = await import(/* @vite-ignore */ dashboardPlans) as any;
    for (const p of PLANS.filter((p: any) => p.id !== 'free')) {
      expect(PLAN_PRICES_PAISE[p.id as 'pro'].monthly).toBe(p.priceInr * 100);
      expect(PLAN_PRICES_PAISE[p.id as 'pro'].yearly).toBe(p.priceInrYearly * 100);
    }
    expect([...ACCESS_STATUSES]).toEqual([...dash]);
  });
  it('keeps access for cancelled/halted subscriptions until the period ends', () => {
    for (const status of ['active', 'pending', 'halted', 'cancelled', 'completed', 'authenticated']) {
      expect(planFromBilling({ plan: 'pro', status, expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe('pro');
      expect(planFromBilling({ plan: 'pro', status, expiresAt: '2026-10-01T00:00:00Z' }, now)).toBe('free');
    }
    expect(planFromBilling({ plan: 'pro', status: 'created', expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe('free');
    expect(planFromBilling({ plan: 'pro', status: 'expired', expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe('free');
  });
});

describe('coupon input', () => {
  it('normalises the code and applies defaults', () => {
    const r = parseCouponInput({ code: ' launch20 ', kind: 'percent', percentOff: 20 }, now);
    expect(r.ok && r.value).toMatchObject({ code: 'LAUNCH20', plans: [], periods: [], duration: 'first_cycle', oncePerUser: true, maxRedemptions: null, expiresAt: null });
    expect(normalizeCode('  ab-c_1 ')).toBe('AB-C_1');
  });
  it('rejects bad codes, kinds, percentages and limits', () => {
    const bad = [
      { code: 'a', kind: 'percent', percentOff: 10 },
      { code: 'HAS SPACE', kind: 'percent', percentOff: 10 },
      { code: 'OK1', kind: 'gift', percentOff: 10 },
      { code: 'OK1', kind: 'percent', percentOff: 0 },
      { code: 'OK1', kind: 'percent', percentOff: 100 },
      { code: 'OK1', kind: 'percent', percentOff: 12.5 },
      { code: 'OK1', kind: 'flat', amountOffInr: 0 },
      { code: 'OK1', kind: 'percent', percentOff: 10, plans: ['free'] },
      { code: 'OK1', kind: 'percent', percentOff: 10, periods: ['weekly'] },
      { code: 'OK1', kind: 'percent', percentOff: 10, duration: 'twice' },
      { code: 'OK1', kind: 'percent', percentOff: 10, expiresAt: '2026-10-01T00:00:00Z' },
      { code: 'OK1', kind: 'percent', percentOff: 10, maxRedemptions: 0 },
      { code: 'OK1', kind: 'percent', percentOff: 10, razorpayOfferId: 'nope' },
    ];
    for (const b of bad) expect(parseCouponInput(b, now).ok, JSON.stringify(b)).toBe(false);
  });
  it('a flat code must leave ₹1 on the cheapest plan it covers', () => {
    expect(parseCouponInput({ code: 'FLAT99', kind: 'flat', amountOffInr: 99 }, now).ok).toBe(false); // Student ₹99
    expect(parseCouponInput({ code: 'FLAT98', kind: 'flat', amountOffInr: 98 }, now).ok).toBe(true);
    expect(parseCouponInput({ code: 'PRO200', kind: 'flat', amountOffInr: 200, plans: ['pro', 'team'] }, now).ok).toBe(true);
  });
});

describe('coupon quote', () => {
  it('computes percent and flat discounts in paise', () => {
    expect(quoteCoupon(row(), 'pro', 'monthly', now)).toEqual({ ok: true, basePaise: 49_900, discountPaise: 9_980, finalPaise: 39_920 });
    expect(quoteCoupon(row(), 'team', 'yearly', now)).toMatchObject({ ok: true, basePaise: 1_999_000, finalPaise: 1_599_200 });
    expect(quoteCoupon(row({ kind: 'flat', percentOff: null, amountOffPaise: 10_000 }), 'pro', 'monthly', now)).toMatchObject({ ok: true, discountPaise: 10_000, finalPaise: 39_900 });
  });
  it('refuses unknown, disabled, expired, used-up and out-of-scope codes', () => {
    expect(quoteCoupon(null, 'pro', 'monthly', now)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(quoteCoupon(row({ status: 'disabled' }), 'pro', 'monthly', now)).toMatchObject({ ok: false, reason: 'disabled' });
    expect(quoteCoupon(row({ expiresAt: '2026-10-18T09:59:59Z' }), 'pro', 'monthly', now)).toMatchObject({ ok: false, reason: 'expired' });
    expect(quoteCoupon(row({ maxRedemptions: 5, redemptionCount: 5 }), 'pro', 'monthly', now)).toMatchObject({ ok: false, reason: 'used_up' });
    expect(quoteCoupon(row({ maxRedemptions: 5, redemptionCount: 4 }), 'pro', 'monthly', now).ok).toBe(true);
    expect(quoteCoupon(row({ plans: ['team'] }), 'pro', 'monthly', now)).toMatchObject({ ok: false, reason: 'wrong_plan' });
    expect(quoteCoupon(row({ periods: ['yearly'] }), 'pro', 'monthly', now)).toMatchObject({ ok: false, reason: 'wrong_period' });
    expect(quoteCoupon(row({ kind: 'flat', percentOff: null, amountOffPaise: 9_850 }), 'student', 'monthly', now)).toMatchObject({ ok: false, reason: 'too_low' });
  });
});
