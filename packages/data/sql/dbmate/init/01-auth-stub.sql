-- ============================================================
-- Minimal auth schema stub for local migration testing.
--
-- The mc schema references auth.users(id) via foreign keys
-- and auth.uid() in proxy functions. This stub provides just
-- enough for the mc migration to succeed locally.
--
-- In production, the full auth schema is managed by Supabase.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users table (FK target for mc.auth, mc.player, mc.container)
CREATE TABLE IF NOT EXISTS auth.users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stub auth.uid() — returns NULL locally (proxy functions won't work,
-- but the migration DDL will succeed)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$ SELECT NULL::UUID; $$;
