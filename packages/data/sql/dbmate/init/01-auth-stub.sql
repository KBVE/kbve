-- ============================================================
-- Minimal auth schema stub for local migration smoke.
--
-- Kilobase image extends supabase/postgres but does NOT run GoTrue
-- in the smoke stack. GoTrue is what creates the auth schema +
-- auth.users / auth.identities / auth.uid()-style helpers in a real
-- Supabase deployment. Postgres-alone has no auth schema, so any
-- migration that references auth.users (mc.auth FK, profile.username
-- FK, etc.) or calls auth.uid() in a SECURITY DEFINER body would
-- fail without this stub.
--
-- The stub is intentionally SHALLOW:
--   * Only the shape KBVE migrations actually read.
--   * IF NOT EXISTS / OR REPLACE so re-running the script
--     (volume kept, repeat smoke) doesn't error.
--
-- Tested earlier this turn: deleting this file breaks
-- 04-profile-stub.sql with "schema auth does not exist".
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users (FK target for mc.auth / mc.player / mc.container,
-- profile.username, profile.discord_bootstrap_cache, wallet.*, etc.)
CREATE TABLE IF NOT EXISTS auth.users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Minimal auth.identities (FK-free pointer to auth.users for
-- profile.service_get_discord_provider_id which reads provider_id
-- where provider='discord'). Matches the column subset KBVE code
-- queries; ignores fields we never read locally.
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

-- Stub auth.uid() — reads request.jwt.claims (matches Supabase auth's
-- behaviour closely enough for proxy-function tests that set the GUC
-- via `SET LOCAL request.jwt.claims = '{"role":...,"sub":...}'`.
-- Returns NULL when no claims are set (matches anon callers).
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT NULLIF(
        COALESCE(
            current_setting('request.jwt.claim.sub', true),
            (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'sub'
        ),
        ''
    )::UUID;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$ SELECT '{}'::JSONB; $$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$ SELECT 'service_role'::TEXT; $$;
