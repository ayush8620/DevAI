import { describe, it, expect } from 'vitest';
import {
  billingSource, clampInt, compBilling, errorRate, isRecurring, monthlyPaise, parsePlanChange, subscriptionRow, summarizeSubscriptions,
} from '../../billing/admin.js';
import { planFromBilling } from '../../billing/plans.js';
import { buildInfo } from '../../routes/admin/system.js';
import { parsePeriod, periodStart } from '../../routes/admin/_util.js';
import { isMissingTable } from '../../services/accounts.js';

const now = new Date('2026-10-19T06:00:00Z');
const future = '2026-11-19T06:00:00Z';
const past = '2026-09-01T00:00:00Z';
const rzp = (plan: string, period: string, extra: Record<string, unknown> = {}) =>
  ({ plan, period, status: 'active', expiresAt: future, subscriptionId: `sub_${plan}_${period}`, ...extra });

describe('admin billing helpers', () => {
  it('classifies billing records', () => {
    expect(billingSource(null)).toBe('none');
    expect(billingSource({ plan: 'free' })).toBe('none');
    expect(billingSource(rzp('pro', 'monthly'))).toBe('razorpay');
    expect(billingSource({ plan: 'pro', status: 'active', expiresAt: future })).toBe('legacy');
    expect(billingSource({ plan: 'team', status: 'active', expiresAt: future, source: 'comp' })).toBe('comp');
  });

  it('only renewing, unexpired Razorpay subscriptions count as recurring', () => {
    expect(isRecurring(rzp('pro', 'monthly'), now)).toBe(true);
    expect(isRecurring(rzp('pro', 'monthly', { cancelAtPeriodEnd: true }), now)).toBe(false);
    expect(isRecurring(rzp('pro', 'monthly', { status: 'halted' }), now)).toBe(false);
    expect(isRecurring(rzp('pro', 'monthly', { expiresAt: past }), now)).toBe(false);
    expect(isRecurring({ plan: 'team', status: 'active', expiresAt: future, source: 'comp' }, now)).toBe(false);
  });

  it('summarises plans and estimates MRR (yearly / 12, comps excluded)', () => {
    const s = summarizeSubscriptions([
      { billing: rzp('pro', 'monthly') },
      { billing: rzp('student', 'yearly') },
      { billing: rzp('team', 'monthly', { cancelAtPeriodEnd: true }) },
      { billing: { plan: 'team', period: 'monthly', status: 'active', expiresAt: future, source: 'comp' } },
      { billing: rzp('pro', 'monthly', { expiresAt: past }) },
      { billing: null },
    ], now);
    expect(s.active).toBe(4);
    expect(s.byPlan).toEqual({ student: 1, pro: 1, team: 2 });
    expect(s.bySource).toEqual({ razorpay: 3, comp: 1, legacy: 0 });
    expect(s.recurring).toBe(2);
    expect(s.mrrPaise).toBe(49_900 + Math.round(99_000 / 12));
    expect(monthlyPaise('team', 'yearly')).toBe(Math.round(1_999_000 / 12));
  });

  it('subscription rows mark lapsed records as expired', () => {
    expect(subscriptionRow(null)).toBeNull();
    const r = subscriptionRow(rzp('pro', 'monthly', { expiresAt: past }), now)!;
    expect(r.status).toBe('expired');
    expect(r.effectivePlan).toBe('free');
    expect(subscriptionRow(rzp('pro', 'yearly', { coupon: { code: 'X10', duration: 'forever' } }), now)).toMatchObject({ status: 'active', period: 'yearly', renews: true, coupon: 'X10' });
  });
});

describe('manual plan change (comp)', () => {
  it('validates input with sensible defaults', () => {
    expect(parsePlanChange({ plan: 'gold' }).ok).toBe(false);
    expect(parsePlanChange({ plan: 'pro', period: 'weekly' }).ok).toBe(false);
    expect(parsePlanChange({ plan: 'pro', days: 0 }).ok).toBe(false);
    expect(parsePlanChange({ plan: 'pro', days: 1.5 }).ok).toBe(false);
    expect(parsePlanChange({ plan: 'pro' })).toEqual({ ok: true, value: { plan: 'pro', period: 'monthly', days: 30, note: null, force: false } });
    expect(parsePlanChange({ plan: 'team', period: 'yearly', note: '  sponsor  ', force: true })).toEqual({ ok: true, value: { plan: 'team', period: 'yearly', days: 365, note: 'sponsor', force: true } });
  });

  it('builds a record the gateway and the dashboard read as the paid plan, without a subscription to cancel', () => {
    const b = compBilling({ plan: 'student', period: 'monthly', days: 10, note: null, force: false }, 'admin@x.dev', now);
    expect(planFromBilling(b, now)).toBe('student');
    expect(planFromBilling(b, new Date(now.getTime() + 11 * 86_400_000))).toBe('free');
    expect(b).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, source: 'comp', compedBy: 'admin@x.dev' });
    expect('subscriptionId' in b).toBe(false);
    expect(isRecurring(b, now)).toBe(false);
  });
});

describe('admin route utilities', () => {
  it('error rate, periods and clamping', () => {
    expect(errorRate(0, 0)).toBe(0);
    expect(errorRate(3, 1)).toBe(33.33);
    expect(parsePeriod('month')).toBe('month');
    expect(parsePeriod('decade')).toBe('week');
    expect(periodStart('week', now).getTime()).toBe(now.getTime() - 7 * 86_400_000);
    expect(clampInt('500', 25, 1, 100)).toBe(100);
    expect(clampInt('abc', 25, 1, 100)).toBe(25);
    expect(clampInt('-3', 25, 1, 100)).toBe(1);
  });

  it('build info prefers the Render commit', () => {
    expect(buildInfo({ RENDER_GIT_COMMIT: 'abc123', RENDER_GIT_BRANCH: 'main', NODE_ENV: 'production' } as any)).toMatchObject({ commit: 'abc123', branch: 'main', env: 'production' });
    expect(buildInfo({} as any).commit).toBeNull();
  });

  it('detects a missing user_accounts table (migration not run yet)', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true);
    expect(isMissingTable({ cause: { code: '42P01' } })).toBe(true);
    expect(isMissingTable({ message: 'relation "user_accounts" does not exist' })).toBe(true);
    expect(isMissingTable({ code: '23505' })).toBe(false);
  });
});
