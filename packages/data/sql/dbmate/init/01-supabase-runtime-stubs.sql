-- ============================================================
-- Supabase RUNTIME-service stubs for postgres-only smoke.
--
-- supabase/postgres image's bundled migrate.sh creates the auth
-- schema + auth.users / refresh_tokens / instances / audit_log_entries /
-- schema_migrations at initdb. It does NOT create auth.identities —
-- that table is GoTrue's, normally added at runtime when the GoTrue
-- service boots and applies its own migrations against the auth
-- schema.
--
-- Smoke runs postgres alone, no GoTrue. Migrations that touch
-- auth.identities (profile.service_get_discord_provider_id and
-- friends) would error with "relation auth.identities does not
-- exist" without this minimal stub.
--
-- Only stub what RUNTIME services would have created. Do NOT stub
-- anything supabase/postgres already provides — overriding those
-- via CREATE OR REPLACE silently clobbers real prod-parity behaviour.
-- ============================================================

-- Minimal auth.identities (FK to auth.users, matches the column subset
-- KBVE code queries; ignores everything we never read locally).
CREATE TABLE IF NOT EXISTS auth.identities (
    id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id   TEXT NOT NULL,
    provider      TEXT NOT NULL,
    identity_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON auth.identities(user_id);
