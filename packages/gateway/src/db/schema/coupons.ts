import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Promo codes for DevAI paid plans. Created by gateway admins on /dashboard/coupons.
 * redemption_count counts reserved + confirmed redemptions and is changed only by single
 * atomic statements (see services/coupons.ts), so max_redemptions cannot be exceeded.
 */
export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Upper-case, A-Z 0-9 _ - */
  code: text('code').notNull(),
  kind: text('kind').notNull().$type<'percent' | 'flat'>(),
  percentOff: integer('percent_off'),
  amountOffPaise: integer('amount_off_paise'),
  /** Empty = every paid plan */
  plans: jsonb('plans').notNull().default([]).$type<string[]>(),
  /** Empty = monthly and yearly */
  periods: jsonb('periods').notNull().default([]).$type<string[]>(),
  duration: text('duration').notNull().default('first_cycle').$type<'first_cycle' | 'forever'>(),
  expiresAt: timestamp('expires_at'),
  maxRedemptions: integer('max_redemptions'),
  oncePerUser: boolean('once_per_user').notNull().default(true),
  /** Optional Razorpay offer (created in the Razorpay dashboard) that applies this discount */
  razorpayOfferId: text('razorpay_offer_id'),
  redemptionCount: integer('redemption_count').notNull().default(0),
  status: text('status').notNull().default('active').$type<'active' | 'disabled'>(),
  note: text('note'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  codeIdx: uniqueIndex('coupons_code_idx').on(t.code),
}));

export const couponRedemptions = pgTable('coupon_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  couponId: uuid('coupon_id').references(() => coupons.id).notNull(),
  userId: text('user_id').notNull(),
  /** = user_id when the coupon is once-per-user, else NULL (drives the unique index) */
  userOnceKey: text('user_once_key'),
  plan: text('plan').notNull(),
  period: text('period').notNull(),
  discountPaise: integer('discount_paise').notNull(),
  subscriptionId: text('subscription_id'),
  status: text('status').notNull().default('reserved').$type<'reserved' | 'confirmed' | 'released'>(),
  reservedUntil: timestamp('reserved_until'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  couponIdx: index('coupon_redemptions_coupon_id_idx').on(t.couponId),
  userIdx: index('coupon_redemptions_user_id_idx').on(t.userId),
  onceIdx: uniqueIndex('coupon_redemptions_once_idx').on(t.couponId, t.userOnceKey)
    .where(sql`user_once_key IS NOT NULL AND status IN ('reserved', 'confirmed')`),
}));
