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

-- Minimal auth.identities mirror (FK target for tracker.find_claim_identity_by_discord_id
-- and source for the custom_access_token_hook owned_guilds claim). Schema follows
-- Supabase's auth.identities so migrations that read identity_data->>'...' or
-- filter on provider work identically against local + prod.
CREATE TABLE IF NOT EXISTS auth.identities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    provider_id   TEXT NOT NULL,
    identity_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (provider, provider_id)
);

-- supabase_auth_admin needs USAGE on auth + SELECT on auth.identities so the
-- custom_access_token_hook (SECURITY DEFINER owned by that role) can read
-- identity_data->'owned_guilds' at JWT mint time.
GRANT USAGE  ON SCHEMA auth            TO supabase_auth_admin;
GRANT SELECT ON TABLE  auth.identities TO supabase_auth_admin;

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

-- Grant the auth helpers to the standard Supabase roles so SECURITY
-- DEFINER functions owned by service_role (and called from
-- authenticated/anon proxy paths) can resolve them.
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid()  TO anon, authenticated, service_role;

-- Stub auth.jwt() — returns empty JSON locally
-- Used by vault functions and trigger bypass checks
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$ SELECT '{}'::JSONB; $$;

-- Stub auth.role() — returns 'service_role' locally so trigger
-- bypasses (protect_servers_columns) work during testing
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$ SELECT 'service_role'::TEXT; $$;
