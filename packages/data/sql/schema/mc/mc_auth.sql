-- ============================================================
-- MC AUTH — Link Supabase users to Minecraft player UUIDs
-- with in-game verification code flow.
--
-- Flow:
--   1. Authenticated user calls proxy_request_mc_link(mc_uuid)
--   2. System generates a 6-digit verification code, inserts pending row
--   3. Player joins the MC server and enters /verify <code>
--   4. MC server (service_role) calls service_verify_mc_link(mc_uuid, code)
--   5. On match: status is flipped to VERIFIED, code is cleared
--
-- Status bitflags:
--   0x0000  UNVERIFIED (pending)
--   0x0001  VERIFIED   (code accepted in-game)
--   0x0002  SUSPENDED  (admin-suspended linking)
--   0x0004  BANNED     (permanent ban from linking)
-- ============================================================

BEGIN;

-- ===========================================
-- SCHEMA
-- ===========================================

CREATE SCHEMA IF NOT EXISTS mc;
ALTER SCHEMA mc OWNER TO postgres;

GRANT USAGE ON SCHEMA mc TO service_role;
REVOKE ALL ON SCHEMA mc FROM PUBLIC;
REVOKE ALL ON SCHEMA mc FROM anon, authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA mc TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mc TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA mc TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    GRANT ALL ON FUNCTIONS TO service_role;

-- ===========================================
-- TABLE: mc.auth
-- ===========================================

CREATE TABLE IF NOT EXISTS mc.auth (
    -- 1:1 with auth.users; each Supabase account links to at most one MC UUID
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    -- Minecraft UUID (dashed or undashed, stored undashed lowercase 32 hex chars)
    mc_uuid TEXT NOT NULL,

    -- Bitwise status flags (see header)
    status INTEGER NOT NULL DEFAULT 0,

    -- Verification code: 0 = no pending verification / already verified
    -- Non-zero 6-digit integer = pending in-game verification
    verification_code INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- MC UUID format: 32 lowercase hex characters (no dashes)
    CONSTRAINT mc_uuid_format_chk
        CHECK (mc_uuid ~ '^[a-f0-9]{32}$'),

    -- Verification code is either 0 (none) or a 6-digit number
    CONSTRAINT verification_code_range_chk
        CHECK (verification_code = 0 OR verification_code BETWEEN 100000 AND 999999)
);

-- One MC UUID can only be linked to one Supabase user
CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_auth_mc_uuid
    ON mc.auth (mc_uuid);

-- Fast lookup of pending verifications by MC UUID
CREATE INDEX IF NOT EXISTS idx_mc_auth_pending_verification
    ON mc.auth (mc_uuid)
    WHERE verification_code != 0;

COMMENT ON TABLE mc.auth IS
    'Links Supabase auth.users to Minecraft player UUIDs with in-game verification.';
COMMENT ON COLUMN mc.auth.user_id IS
    'Primary key — 1:1 mapping to Supabase auth.users.id.';
COMMENT ON COLUMN mc.auth.mc_uuid IS
    'Minecraft player UUID, stored as 32 lowercase hex chars (no dashes).';
COMMENT ON COLUMN mc.auth.status IS
    'Bitwise status flags: 0x0=unverified, 0x1=verified, 0x2=suspended, 0x4=banned.';
COMMENT ON COLUMN mc.auth.verification_code IS
    '6-digit code for in-game verification. 0 = no pending verification.';

-- ===========================================
-- RLS (LOCKED DOWN)
-- ===========================================

ALTER TABLE mc.auth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON mc.auth;

CREATE POLICY "service_role_full_access"
    ON mc.auth
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- No anon/authenticated policies: direct table access denied
REVOKE ALL ON ALL TABLES IN SCHEMA mc
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mc
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mc
    FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ===========================================
-- TRIGGER: auto-update updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION mc.trg_auth_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mc_auth_updated_at ON mc.auth;

CREATE TRIGGER trg_mc_auth_updated_at
BEFORE UPDATE ON mc.auth
FOR EACH ROW
EXECUTE FUNCTION mc.trg_auth_updated_at();

-- ===========================================
-- HELPER: strip dashes from MC UUID input
-- ===========================================

CREATE OR REPLACE FUNCTION mc.normalize_mc_uuid(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    IF p_input IS NULL THEN
        RAISE EXCEPTION 'MC UUID cannot be NULL'
            USING ERRCODE = '22004';
    END IF;

    -- Strip dashes and lowercase
    v_clean := lower(replace(p_input, '-', ''));

    IF v_clean !~ '^[a-f0-9]{32}$' THEN
        RAISE EXCEPTION 'Invalid Minecraft UUID format: %', p_input
            USING ERRCODE = '22023';
    END IF;

    RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION mc.normalize_mc_uuid(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.normalize_mc_uuid(TEXT)
    TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Request MC link (creates pending verification)
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_request_link(
    p_user_id UUID,
    p_mc_uuid TEXT
)
RETURNS INTEGER  -- returns the generated verification code
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
    v_code    INTEGER;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    -- Generate a random 6-digit code
    v_code := floor(random() * 900000 + 100000)::INTEGER;

    -- Upsert: if user already has a row, reset to pending with new code
    INSERT INTO mc.auth (user_id, mc_uuid, status, verification_code)
    VALUES (p_user_id, v_mc_uuid, 0, v_code)
    ON CONFLICT (user_id) DO UPDATE SET
        mc_uuid           = EXCLUDED.mc_uuid,
        status            = 0,
        verification_code = EXCLUDED.verification_code;

    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_request_link(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_request_link(UUID, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_request_link(UUID, TEXT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Verify MC link (called by MC server)
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_verify_link(
    p_mc_uuid TEXT,
    p_code    INTEGER
)
RETURNS UUID  -- returns the user_id on success, NULL on failure
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
    v_user_id UUID;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    -- Find pending row matching this MC UUID and code
    SELECT user_id INTO v_user_id
    FROM mc.auth
    WHERE mc_uuid           = v_mc_uuid
      AND verification_code = p_code
      AND verification_code != 0
      AND (status & 6) = 0;  -- not suspended (0x2) or banned (0x4)

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Mark as verified: set bit 0x1, clear verification code
    UPDATE mc.auth
    SET status            = (status | 1),
        verification_code = 0
    WHERE user_id = v_user_id;

    RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_verify_link(TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_verify_link(TEXT, INTEGER)
    TO service_role;
ALTER FUNCTION mc.service_verify_link(TEXT, INTEGER) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Lookup user_id by MC UUID
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_get_user_by_mc_uuid(
    p_mc_uuid TEXT
)
RETURNS TABLE (
    user_id           UUID,
    mc_uuid           TEXT,
    status            INTEGER,
    is_verified       BOOLEAN,
    created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    RETURN QUERY
    SELECT
        a.user_id,
        a.mc_uuid,
        a.status,
        (a.status & 1) = 1,
        a.created_at
    FROM mc.auth AS a
    WHERE a.mc_uuid = v_mc_uuid;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_get_user_by_mc_uuid(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_get_user_by_mc_uuid(TEXT)
    TO service_role;
ALTER FUNCTION mc.service_get_user_by_mc_uuid(TEXT) OWNER TO service_role;

-- ===========================================
-- PROXY FUNCTION: Authenticated user requests link
-- ===========================================

CREATE OR REPLACE FUNCTION mc.proxy_request_link(
    p_mc_uuid TEXT
)
RETURNS INTEGER  -- returns verification code
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_code    INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated'
            USING ERRCODE = '28000';
    END IF;

    v_code := mc.service_request_link(v_user_id, p_mc_uuid);
    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION mc.proxy_request_link(TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_request_link(TEXT)
    TO authenticated, service_role;
ALTER FUNCTION mc.proxy_request_link(TEXT) OWNER TO service_role;

-- ===========================================
-- PROXY FUNCTION: Authenticated user checks own link status
-- ===========================================

CREATE OR REPLACE FUNCTION mc.proxy_get_link_status()
RETURNS TABLE (
    mc_uuid      TEXT,
    status       INTEGER,
    is_verified  BOOLEAN,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated'
            USING ERRCODE = '28000';
    END IF;

    RETURN QUERY
    SELECT
        a.mc_uuid,
        a.status,
        (a.status & 1) = 1,
        a.created_at,
        a.updated_at
    FROM mc.auth AS a
    WHERE a.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.proxy_get_link_status()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_get_link_status()
    TO authenticated, service_role;
ALTER FUNCTION mc.proxy_get_link_status() OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    schema_ok BOOLEAN;
    table_ok  BOOLEAN;
BEGIN
    PERFORM set_config('search_path', '', true);

    SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'mc'
    ) INTO schema_ok;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'mc' AND table_name = 'auth'
    ) INTO table_ok;

    IF NOT schema_ok OR NOT table_ok THEN
        RAISE EXCEPTION 'mc.auth setup failed — schema: %, table: %', schema_ok, table_ok;
    END IF;

    -- Verify service functions exist
    PERFORM 'mc.service_request_link(uuid, text)'::regprocedure;
    PERFORM 'mc.service_verify_link(text, integer)'::regprocedure;
    PERFORM 'mc.service_get_user_by_mc_uuid(text)'::regprocedure;

    -- Verify proxy functions exist
    PERFORM 'mc.proxy_request_link(text)'::regprocedure;
    PERFORM 'mc.proxy_get_link_status()'::regprocedure;

    -- Verify service_role can execute
    IF NOT has_function_privilege('service_role', 'mc.service_request_link(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_request_link';
    END IF;

    IF NOT has_function_privilege('service_role', 'mc.service_verify_link(text, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_verify_link';
    END IF;

    RAISE NOTICE 'mc.auth schema setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
