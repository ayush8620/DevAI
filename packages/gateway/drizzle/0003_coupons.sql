-- DevAI: promo codes for paid plans (Razorpay subscriptions).
-- Idempotent (IF NOT EXISTS everywhere), adds two tables and changes no existing data.
-- Works on Neon (PostgreSQL 13+; gen_random_uuid() is built in from 13).
-- Run with:  psql "$DATABASE_URL" -f packages/gateway/drizzle/0003_coupons.sql
-- No codes are created here. Admins create them on /dashboard/coupons.

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  kind text NOT NULL,
  percent_off integer,
  amount_off_paise integer,
  plans jsonb NOT NULL DEFAULT '[]'::jsonb,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration text NOT NULL DEFAULT 'first_cycle',
  expires_at timestamp,
  max_redemptions integer,
  once_per_user boolean NOT NULL DEFAULT true,
  razorpay_offer_id text,
  redemption_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  note text,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_idx ON coupons (code);

DO $$ BEGIN
  ALTER TABLE coupons ADD CONSTRAINT coupons_kind_check CHECK (
    (kind = 'percent' AND percent_off BETWEEN 1 AND 90 AND amount_off_paise IS NULL)
    OR (kind = 'flat' AND amount_off_paise >= 100 AND percent_off IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE coupons ADD CONSTRAINT coupons_count_check CHECK (
    redemption_count >= 0 AND (max_redemptions IS NULL OR max_redemptions >= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL CONSTRAINT coupon_redemptions_coupon_id_coupons_id_fk REFERENCES coupons (id),
  user_id text NOT NULL,
  user_once_key text,
  plan text NOT NULL,
  period text NOT NULL,
  discount_paise integer NOT NULL,
  subscription_id text,
  status text NOT NULL DEFAULT 'reserved',
  reserved_until timestamp,
  confirmed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_id_idx ON coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON coupon_redemptions (user_id);
-- One live (reserved or confirmed) redemption per user on once-per-user codes.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_once_idx ON coupon_redemptions (coupon_id, user_once_key)
  WHERE user_once_key IS NOT NULL AND status IN ('reserved', 'confirmed');

-- Read-only check (optional):
--   SELECT code, kind, percent_off, amount_off_paise, duration, redemption_count, max_redemptions, status FROM coupons;
