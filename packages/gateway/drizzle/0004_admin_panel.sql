-- DevAI: admin panel (/admin in the dashboard).
-- Adds one table, user_accounts, that stores the gateway-side status of a Clerk user
-- (active or suspended). Users themselves stay in Clerk, so there is no users table to alter.
-- Also adds two read-only indexes that make the admin usage pages cheap.
-- Idempotent (IF NOT EXISTS / duplicate_object guards), changes no existing data.
-- Works on Neon (PostgreSQL 13+).
-- Run with:  psql "$DATABASE_URL" -f packages/gateway/drizzle/0004_admin_panel.sql
-- Until it is run the gateway keeps working: suspension checks treat everyone as active and
-- the suspend action answers 503 with a hint to run this file.

CREATE TABLE IF NOT EXISTS user_accounts (
  user_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  suspended_reason text,
  suspended_at timestamp,
  suspended_by text,
  note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_accounts_status_idx ON user_accounts (status);

DO $$ BEGIN
  ALTER TABLE user_accounts ADD CONSTRAINT user_accounts_status_check CHECK (status IN ('active', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin usage pages: per-project time ranges and per-day error counts.
CREATE INDEX IF NOT EXISTS usage_records_project_created_idx ON usage_records (project_id, created_at);
CREATE INDEX IF NOT EXISTS audit_logs_resource_id_idx ON audit_logs (resource_id);

-- Read-only check (optional):
--   SELECT user_id, status, suspended_reason, suspended_at, suspended_by FROM user_accounts ORDER BY updated_at DESC;
