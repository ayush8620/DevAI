import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPaymentSignature, verifySubscriptionSignature, verifyWebhookSignature, hmacSha256Hex } from '../src/lib/billing/signature';
import {
  PLANS, getPlan, isPaidPlan, planAmountPaise, formatInr, isStudentEmail, currentPlanId, razorpayPlanEnvVar, razorpayPlanId,
  configuredPlans, yearlyMonthlyEquivalent, yearlySavingsPercent, renews,
} from '../src/lib/billing/plans';

const SECRET = 'test_secret_not_a_real_key';
const sign = (payload: string, secret = SECRET) => createHmac('sha256', secret).update(payload).digest('hex');

describe('Razorpay payment signature', () => {
  const orderId = 'order_IluGWxBm9U8zJ8';
  const paymentId = 'pay_IluGWxBm9U8zJ9';

  it('accepts HMAC_SHA256(order_id|payment_id, key_secret)', () => {
    const signature = sign(`${orderId}|${paymentId}`);
    expect(verifyPaymentSignature({ orderId, paymentId, signature }, SECRET)).toBe(true);
  });

  it('matches a known HMAC-SHA256 vector', () => {
    // RFC 4231 test case 2
    expect(hmacSha256Hex('what do ya want for nothing?', 'Jefe'))
      .toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('rejects a wrong secret, swapped ids, tampered or empty signatures', () => {
    const signature = sign(`${orderId}|${paymentId}`);
    expect(verifyPaymentSignature({ orderId, paymentId, signature }, 'other_secret')).toBe(false);
    expect(verifyPaymentSignature({ orderId: paymentId, paymentId: orderId, signature }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: signature.replace(/.$/, c => (c === '0' ? '1' : '0')) }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: '' }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: 'short' }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature }, '')).toBe(false);
  });
});

describe('Razorpay subscription signature', () => {
  const paymentId = 'pay_29QQoUBi66xm2f';
  const subscriptionId = 'sub_00000000000001';

  it('accepts HMAC_SHA256(payment_id|subscription_id, key_secret)', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`);
    expect(verifySubscriptionSignature({ paymentId, subscriptionId, signature }, SECRET)).toBe(true);
  });

  it('rejects the order-flow ordering, other secrets and tampering', () => {
    const signature = sign(`${paymentId}|${subscriptionId}`);
    expect(verifySubscriptionSignature({ paymentId: subscriptionId, subscriptionId: paymentId, signature }, SECRET)).toBe(false);
    expect(verifySubscriptionSignature({ paymentId, subscriptionId, signature: sign(`${subscriptionId}|${paymentId}`) }, SECRET)).toBe(false);
    expect(verifySubscriptionSignature({ paymentId, subscriptionId, signature }, 'other')).toBe(false);
    expect(verifySubscriptionSignature({ paymentId, subscriptionId: 'sub_other', signature }, SECRET)).toBe(false);
    expect(verifySubscriptionSignature({ paymentId, subscriptionId, signature: '' }, SECRET)).toBe(false);
    expect(verifySubscriptionSignature({ paymentId, subscriptionId, signature }, '')).toBe(false);
  });
});

describe('Razorpay webhook signature', () => {
  const body = JSON.stringify({ event: 'order.paid', payload: { order: { entity: { id: 'order_1', amount: 49900 } } } });

  it('accepts the signature of the exact raw body', () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a modified body, a missing header or a missing secret', () => {
    const sig = sign(body);
    expect(verifyWebhookSignature(body.replace('49900', '100'), sig, SECRET)).toBe(false);
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 2), sig, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sig, '')).toBe(false);
  });
});

describe('plan pricing', () => {
  it('has the four plans at the agreed prices', () => {
    expect(PLANS.map(p => [p.id, p.priceInr])).toEqual([['free', 0], ['student', 99], ['pro', 499], ['team', 1999]]);
  });

  it('computes amounts in paise from the server config, monthly and yearly', () => {
    expect(planAmountPaise('student')).toBe(9900);
    expect(planAmountPaise('pro')).toBe(49900);
    expect(planAmountPaise('team')).toBe(199900);
    expect(planAmountPaise('student', 'yearly')).toBe(99000);
    expect(planAmountPaise('pro', 'yearly')).toBe(499000);
    expect(planAmountPaise('team', 'yearly')).toBe(1999000);
    expect(() => planAmountPaise('pro', 'weekly' as any)).toThrow();
  });

  it('yearly = 10 months (2 months free, 17% off) with a per-month equivalent', () => {
    for (const p of PLANS.filter(p => p.priceInr)) {
      expect(p.priceInrYearly).toBe(p.priceInr * 10);
      expect(yearlySavingsPercent(p)).toBe(17);
    }
    expect(yearlyMonthlyEquivalent(getPlan('pro')!)).toBe(416);
  });

  it('reads Razorpay plan ids from RAZORPAY_PLAN_ID_* env vars', () => {
    expect(razorpayPlanEnvVar('pro', 'monthly')).toBe('RAZORPAY_PLAN_ID_PRO');
    expect(razorpayPlanEnvVar('team', 'yearly')).toBe('RAZORPAY_PLAN_ID_TEAM_YEARLY');
    const env = { RAZORPAY_PLAN_ID_PRO: ' plan_pro ', RAZORPAY_PLAN_ID_PRO_YEARLY: '' };
    expect(razorpayPlanId('pro', 'monthly', env)).toBe('plan_pro');
    expect(razorpayPlanId('pro', 'yearly', env)).toBe('');
    expect(configuredPlans(env)).toEqual({ student_monthly: false, student_yearly: false, pro_monthly: true, pro_yearly: false, team_monthly: false, team_yearly: false });
  });

  it('refuses free, unknown and non-string plans', () => {
    expect(() => planAmountPaise('free')).toThrow();
    expect(() => planAmountPaise('enterprise')).toThrow();
    expect(() => planAmountPaise({ amount: 1 })).toThrow();
    expect(isPaidPlan('free')).toBe(false);
    expect(getPlan('nope')).toBeUndefined();
  });

  it('limits grow with the price', () => {
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i].priceInr).toBeGreaterThan(PLANS[i - 1].priceInr);
      expect(PLANS[i].limits.requestsPerDay).toBeGreaterThan(PLANS[i - 1].limits.requestsPerDay);
      expect(PLANS[i].limits.projects).toBeGreaterThan(PLANS[i - 1].limits.projects);
    }
    expect(getPlan('student')?.studentOnly).toBe(true);
  });

  it('formats rupees the Indian way', () => {
    expect(formatInr(1999)).toBe('₹1,999');
    expect(formatInr(0)).toBe('₹0');
  });
});

describe('student email check', () => {
  it.each(['a@mit.edu', 'ravi@iitd.ac.in', 'x@cs.du.ac.in', 'Student@College.EDU', 'y@uni.edu.au', 'z@ox.ac.uk'])('accepts %s', e => {
    expect(isStudentEmail(e)).toBe(true);
  });
  it.each(['me@gmail.com', 'edu@gmail.com', 'a@ac.in', 'a@edu.in', 'a@notedu', 'a@x.education', 'bad', '', null, undefined, 'a@x..edu'])('rejects %s', e => {
    expect(isStudentEmail(e as any)).toBe(false);
  });
});

describe('current plan', () => {
  const now = new Date('2026-10-18T08:00:00Z');
  it('is free without a paid, unexpired record', () => {
    expect(currentPlanId(undefined, now)).toBe('free');
    expect(currentPlanId({ plan: 'pro', status: 'active', expiresAt: '2026-10-01T00:00:00Z' }, now)).toBe('free');
    expect(currentPlanId({ plan: 'gold', status: 'active', expiresAt: '2027-01-01T00:00:00Z' } as any, now)).toBe('free');
    expect(currentPlanId({ plan: 'pro', status: 'created', expiresAt: '2027-01-01T00:00:00Z' }, now)).toBe('free');
  });
  it('keeps the paid plan until the period ends, also when cancelled or halted', () => {
    for (const status of ['active', 'pending', 'halted', 'cancelled', 'completed'] as const) {
      expect(currentPlanId({ plan: 'pro', status, expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe('pro');
    }
  });
  it('renews only while active and not cancelled', () => {
    expect(renews({ status: 'active' })).toBe(true);
    expect(renews({ status: 'active', cancelAtPeriodEnd: true })).toBe(false);
    expect(renews({ status: 'halted' })).toBe(false);
    expect(renews({ status: 'cancelled' })).toBe(false);
  });
});

describe('scripts/razorpay-create-plans.mjs', () => {
  it('creates plans at the same prices and env var names as plans.ts', async () => {
    const { PLAN_DEFS, envVarFor } = await import('../../../scripts/razorpay-create-plans.mjs');
    const expected = PLANS.filter(p => p.priceInr).flatMap(p => [
      { plan: p.id, period: 'monthly', amountPaise: p.priceInr * 100 },
      { plan: p.id, period: 'yearly', amountPaise: p.priceInrYearly * 100 },
    ]);
    expect(PLAN_DEFS.map((d: any) => ({ plan: d.plan, period: d.period, amountPaise: d.amountPaise }))).toEqual(expected);
    for (const d of PLAN_DEFS as any[]) expect(envVarFor(d)).toBe(razorpayPlanEnvVar(d.plan, d.period));
  });
});
