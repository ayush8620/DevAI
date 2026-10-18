import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPaymentSignature, verifyWebhookSignature, hmacSha256Hex } from '../src/lib/billing/signature';
import {
  PLANS, getPlan, isPaidPlan, planAmountPaise, formatInr, isStudentEmail, currentPlanId, nextExpiry, BILLING_PERIOD_DAYS,
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

  it('computes order amounts in paise from the server config', () => {
    expect(planAmountPaise('student')).toBe(9900);
    expect(planAmountPaise('pro')).toBe(49900);
    expect(planAmountPaise('team')).toBe(199900);
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
  it('is free without an active, unexpired record', () => {
    expect(currentPlanId(undefined, now)).toBe('free');
    expect(currentPlanId({ plan: 'pro', status: 'active', expiresAt: '2026-10-01T00:00:00Z' }, now)).toBe('free');
    expect(currentPlanId({ plan: 'gold', status: 'active', expiresAt: '2027-01-01T00:00:00Z' }, now)).toBe('free');
  });
  it('returns the paid plan while it is active', () => {
    expect(currentPlanId({ plan: 'pro', status: 'active', expiresAt: '2026-11-01T00:00:00Z' }, now)).toBe('pro');
  });
  it('adds 30 days from now, or from the current expiry when renewing early', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(nextExpiry(undefined, now).getTime()).toBe(now.getTime() + BILLING_PERIOD_DAYS * day);
    const exp = new Date(now.getTime() + 5 * day);
    expect(nextExpiry({ expiresAt: exp.toISOString() }, now).getTime()).toBe(exp.getTime() + BILLING_PERIOD_DAYS * day);
  });
});
