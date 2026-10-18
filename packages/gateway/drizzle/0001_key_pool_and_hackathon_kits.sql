-- DevAI: personal key pools + hackathon kits.
-- Safe to run more than once (IF NOT EXISTS everywhere); works on Neon (PostgreSQL 13+).
-- Run with:  psql "$DATABASE_URL" -f packages/gateway/drizzle/0001_key_pool_and_hackathon_kits.sql
-- or let Drizzle apply the schema:  npm run db:push

ALTER TABLE providers ADD COLUMN IF NOT EXISTS owner_user_id text;
CREATE INDEX IF NOT EXISTS providers_owner_user_id_idx ON providers (owner_user_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'app';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id text;
CREATE INDEX IF NOT EXISTS projects_owner_user_id_idx ON projects (owner_user_id);

CREATE TABLE IF NOT EXISTS hackathon_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL,
  project_id uuid NOT NULL CONSTRAINT hackathon_kits_project_id_projects_id_fk REFERENCES projects (id),
  name text NOT NULL,
  share_token text NOT NULL,
  request_cap integer,
  token_cap integer,
  max_team_size integer,
  key_count integer NOT NULL DEFAULT 1,
  allowed_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamp NOT NULL,
  status text NOT NULL DEFAULT 'active',
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hackathon_kits_share_token_idx ON hackathon_kits (share_token);
CREATE INDEX IF NOT EXISTS hackathon_kits_owner_user_id_idx ON hackathon_kits (owner_user_id);
CREATE INDEX IF NOT EXISTS hackathon_kits_project_id_idx ON hackathon_kits (project_id);
