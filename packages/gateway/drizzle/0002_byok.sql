-- DevAI: bring-your-own-key (BYOK).
-- No new tables or columns are needed: user-owned providers/keys already use
-- providers.owner_user_id (added in 0001). This migration is OPTIONAL and only adds an index
-- for the per-request lookup "active providers of this owner" (owner_user_id, status).
-- Idempotent (IF NOT EXISTS), changes no data, works on Neon (PostgreSQL 13+).
-- Run with:  psql "$DATABASE_URL" -f packages/gateway/drizzle/0002_byok.sql

CREATE INDEX IF NOT EXISTS providers_owner_status_idx ON providers (owner_user_id, status);

-- Read-only check (optional): shared, admin-managed providers. They keep serving only the
-- admin's own "app" projects and never any user's traffic, so they need no change.
--   SELECT p.id, p.name, p.type, p.status, count(c.id) AS keys
--   FROM providers p LEFT JOIN provider_credentials c ON c.provider_id = p.id
--   WHERE p.owner_user_id IS NULL GROUP BY p.id ORDER BY p.created_at;
