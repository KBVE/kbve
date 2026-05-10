-- ============================================================
-- MC AUTH — Link Supabase users to Minecraft player UUIDs
-- with in-game verification code flow.
--
-- Flow:
--   1. Authenticated user calls proxy_request_link(mc_uuid)
--   2. System generates a 6-digit code, stores bcrypt hash, returns plaintext
--   3. Player joins the MC server and enters /verify <code>
--   4. MC server (service_role) calls service_verify_link(mc_uuid, code)
--   5. On match: status is flipped to VERIFIED, hash is cleared
--
-- Security:
--   - Verification codes are bcrypt-hashed (pgcrypto), never stored plaintext
--   - 10-minute code TTL (code_expires_at)
--   - Max 5 attempts per code; 15-minute lockout after exceeded (locked_until)
--   - Verified links cannot be overwritten; must explicitly unlink first
--   - Advisory locks serialize concurrent requests per mc_uuid
--
-- Status bitflags:
--   0x0000  UNVERIFIED (pending)
--   0x0001  VERIFIED   (code accepted in-game)
--   0x0002  SUSPENDED  (admin-suspended linking)
--   0x0004  BANNED     (permanent ban from linking)
-- ============================================================

BEGIN;

-- pgcrypto for bcrypt hashing of verification codes.
-- Pin to `extensions` schema so SECURITY DEFINER functions with empty
-- search_path can call extensions.crypt() / extensions.gen_salt() / extensions.gen_random_bytes().
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- service_role owns the SECURITY DEFINER functions below; grant USAGE so it
-- can resolve `extensions.crypt(...)` / `extensions.gen_salt(...)` /
-- `extensions.gen_random_bytes(...)`. Idempotent on Supabase prod.
GRANT USAGE ON SCHEMA extensions TO service_role;

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

    -- Minecraft UUID (stored undashed lowercase 32 hex chars)
    mc_uuid TEXT NOT NULL,

    -- Bitwise status flags (see header)
    status INTEGER NOT NULL DEFAULT 0,

    -- Bcrypt hash of the 6-digit verification code (NULL = no pending verification)
    verification_code_hash TEXT,

    -- Code TTL: code is invalid after this timestamp
    code_expires_at TIMESTAMPTZ,

    -- Brute-force protection
    verify_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- MC UUID format: 32 lowercase hex characters (no dashes)
    CONSTRAINT mc_uuid_format_chk
        CHECK (mc_uuid ~ '^[a-f0-9]{32}$'),

    -- If there's a hash, there must be an expiry
    CONSTRAINT code_expires_chk
        CHECK (verification_code_hash IS NULL OR code_expires_at IS NOT NULL),

    -- Attempts counter must be non-negative
    CONSTRAINT verify_attempts_chk
        CHECK (verify_attempts >= 0)
);

-- One MC UUID can only be linked to one Supabase user
CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_auth_mc_uuid
    ON mc.auth (mc_uuid);

-- Fast lookup of pending verifications by MC UUID
CREATE INDEX IF NOT EXISTS idx_mc_auth_pending_verification
    ON mc.auth (mc_uuid)
    WHERE verification_code_hash IS NOT NULL;

COMMENT ON TABLE mc.auth IS
    'Links Supabase auth.users to Minecraft player UUIDs with in-game verification.';
COMMENT ON COLUMN mc.auth.user_id IS
    'Primary key — 1:1 mapping to Supabase auth.users.id.';
COMMENT ON COLUMN mc.auth.mc_uuid IS
    'Minecraft player UUID, stored as 32 lowercase hex chars (no dashes).';
COMMENT ON COLUMN mc.auth.status IS
    'Bitwise status flags: 0x0=unverified, 0x1=verified, 0x2=suspended, 0x4=banned.';
COMMENT ON COLUMN mc.auth.verification_code_hash IS
    'Bcrypt hash of 6-digit verification code. NULL = no pending verification.';
COMMENT ON COLUMN mc.auth.code_expires_at IS
    'Verification code expiry. Code is invalid after this timestamp.';
COMMENT ON COLUMN mc.auth.verify_attempts IS
    'Failed verification attempts for current code. Resets on new code or successful verify.';
COMMENT ON COLUMN mc.auth.locked_until IS
    'Temporary lockout timestamp after too many failed attempts. NULL = not locked.';

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

REVOKE ALL ON FUNCTION mc.trg_auth_updated_at()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.trg_auth_updated_at()
    TO service_role;
ALTER FUNCTION mc.trg_auth_updated_at() OWNER TO service_role;

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
ALTER FUNCTION mc.normalize_mc_uuid(TEXT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Request MC link (creates pending verification)
--
-- Generates a 6-digit code, stores its bcrypt hash, sets 10-min TTL.
-- Blocks if user already has a VERIFIED link (must unlink first).
-- Raises clean exception if MC UUID is already linked to another user.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_request_link(
    p_user_id UUID,
    p_mc_uuid TEXT
)
RETURNS INTEGER  -- returns the generated verification code (plaintext, not stored)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid         TEXT;
    v_code            INTEGER;
    v_existing_status INTEGER;
    v_now             TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null'
            USING ERRCODE = '22004';
    END IF;

    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    -- Serialize by both Minecraft UUID and app user.
    -- Prevents same-user concurrent request races and same-MC-UUID races.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_mc_uuid, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 1));

    -- Block re-linking if user already has a VERIFIED link
    SELECT status INTO v_existing_status
    FROM mc.auth
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_existing_status IS NOT NULL AND (v_existing_status & 1) = 1 THEN
        RAISE EXCEPTION 'Account already has a verified Minecraft link. Unlink first.'
            USING ERRCODE = '23505';
    END IF;

    -- Refuse link requests from suspended/banned rows.
    -- Bits 2 and 4 are SUSPENDED/BANNED; matches verify guard: (status & 6) = 0.
    IF v_existing_status IS NOT NULL AND (v_existing_status & 6) <> 0 THEN
        RAISE EXCEPTION 'Account is not allowed to request a Minecraft link.'
            USING ERRCODE = '42501';
    END IF;

    -- Block if MC UUID is already linked to a different user
    IF EXISTS (
        SELECT 1 FROM mc.auth
        WHERE mc_uuid = v_mc_uuid
          AND user_id <> p_user_id
    ) THEN
        RAISE EXCEPTION 'Minecraft UUID already linked to another account'
            USING ERRCODE = '23505';
    END IF;

    -- Cryptographically stronger 6-digit code than random(); generates 100000..999999.
    v_code := (
        100000
        + (
            (
                'x' || substr(
                    encode(extensions.gen_random_bytes(4), 'hex'),
                    1,
                    8
                )
            )::bit(32)::BIGINT % 900000
        )
    )::INTEGER;

    -- Upsert: if user already has an unverified row, reset with new hashed code.
    -- pgcrypto lives in `extensions`; explicit qualifier required because search_path = ''.
    INSERT INTO mc.auth (
        user_id, mc_uuid, status,
        verification_code_hash, code_expires_at,
        verify_attempts, locked_until
    )
    VALUES (
        p_user_id, v_mc_uuid, 0,
        extensions.crypt(v_code::TEXT, extensions.gen_salt('bf')),
        v_now + INTERVAL '10 minutes',
        0, NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
        mc_uuid                = EXCLUDED.mc_uuid,
        status                 = 0,
        verification_code_hash = EXCLUDED.verification_code_hash,
        code_expires_at        = EXCLUDED.code_expires_at,
        verify_attempts        = 0,
        locked_until           = NULL;

    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_request_link(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_request_link(UUID, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_request_link(UUID, TEXT) OWNER TO service_role;
COMMENT ON FUNCTION mc.service_request_link(UUID, TEXT) IS
    'Service-only RPC. Creates or refreshes an unverified Minecraft link request and returns a six-digit verification code. Uses schema-qualified pgcrypto calls because search_path is empty.';

-- ===========================================
-- SERVICE FUNCTION: Verify MC link (called by MC server)
--
-- Checks: not expired, not locked, increments attempts on failure,
-- locks for 15 min after 5 failed attempts.
-- Matches code via bcrypt comparison (never sees plaintext in DB).
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
    v_mc_uuid  TEXT;
    v_user_id  UUID;
    v_hash     TEXT;
    v_expires  TIMESTAMPTZ;
    v_attempts INTEGER;
    v_locked   TIMESTAMPTZ;
    v_now      TIMESTAMPTZ := statement_timestamp();
BEGIN
    -- Reject obviously invalid codes before any DB hit.
    IF p_code IS NULL OR p_code < 100000 OR p_code > 999999 THEN
        RETURN NULL;
    END IF;

    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    -- Lock the row for update to prevent concurrent verify races
    SELECT
        user_id,
        verification_code_hash,
        code_expires_at,
        COALESCE(verify_attempts, 0),
        locked_until
    INTO
        v_user_id,
        v_hash,
        v_expires,
        v_attempts,
        v_locked
    FROM mc.auth
    WHERE mc_uuid = v_mc_uuid
      AND verification_code_hash IS NOT NULL
      AND (status & 6) = 0  -- not suspended (0x2) or banned (0x4)
    FOR UPDATE;

    -- No pending verification for this MC UUID
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Check lockout
    IF v_locked IS NOT NULL AND v_locked > v_now THEN
        RETURN NULL;
    END IF;

    -- Treat NULL or past expiry as expired; clear pending state and refuse.
    IF v_expires IS NULL OR v_expires < v_now THEN
        UPDATE mc.auth
        SET verification_code_hash = NULL,
            code_expires_at        = NULL,
            verify_attempts        = 0,
            locked_until           = NULL
        WHERE user_id = v_user_id
          AND mc_uuid = v_mc_uuid;
        RETURN NULL;
    END IF;

    -- Compare code against stored bcrypt hash. pgcrypto must be schema-qualified
    -- because this function runs with search_path = ''.
    IF v_hash = extensions.crypt(p_code::TEXT, v_hash) THEN
        -- Correct code: mark as verified, clear hash and attempts
        UPDATE mc.auth
        SET status                 = (status | 1),
            verification_code_hash = NULL,
            code_expires_at        = NULL,
            verify_attempts        = 0,
            locked_until           = NULL
        WHERE user_id = v_user_id
          AND mc_uuid = v_mc_uuid;

        RETURN v_user_id;
    END IF;

    -- Wrong code: increment attempts, lock after 5 in a single UPDATE.
    UPDATE mc.auth
    SET verify_attempts = v_attempts + 1,
        locked_until    = CASE
            WHEN v_attempts + 1 >= 5 THEN v_now + INTERVAL '15 minutes'
            ELSE locked_until
        END
    WHERE user_id = v_user_id
      AND mc_uuid = v_mc_uuid;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_verify_link(TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_verify_link(TEXT, INTEGER)
    TO service_role;
ALTER FUNCTION mc.service_verify_link(TEXT, INTEGER) OWNER TO service_role;
COMMENT ON FUNCTION mc.service_verify_link(TEXT, INTEGER) IS
    'Service-only RPC. Verifies a Minecraft link code, rate-limits failed attempts, clears expired codes, and marks the link verified on success. Uses schema-qualified pgcrypto calls because search_path is empty.';

-- ===========================================
-- SERVICE FUNCTION: Unlink MC account
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_unlink(
    p_user_id UUID
)
RETURNS BOOLEAN  -- true if a link row was unlinked or removed
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows INTEGER;
BEGIN
    -- Preserve suspended/banned rows so moderation flags survive an unlink.
    -- Strip the VERIFIED bit and clear any pending verification state.
    UPDATE mc.auth
    SET status                 = status & ~1,
        verification_code_hash = NULL,
        code_expires_at        = NULL,
        verify_attempts        = 0,
        locked_until           = NULL
    WHERE user_id = p_user_id
      AND (status & 6) <> 0;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
        RETURN TRUE;
    END IF;

    -- Otherwise the row carries no moderation state; safe to drop entirely.
    DELETE FROM mc.auth
    WHERE user_id = p_user_id
      AND (status & 6) = 0;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_unlink(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_unlink(UUID)
    TO service_role;
ALTER FUNCTION mc.service_unlink(UUID) OWNER TO service_role;
COMMENT ON FUNCTION mc.service_unlink(UUID) IS
    'Service-only RPC. Removes a Minecraft link. Preserves rows with SUSPENDED/BANNED flags so moderation state survives unlink; cleanly drops un-moderated rows.';

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
RETURNS INTEGER  -- returns verification code (plaintext, for display to user)
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
-- (Never exposes verification_code_hash)
-- ===========================================

-- Note: RETURNS TABLE shape change requires DROP first; CREATE OR REPLACE
-- cannot alter declared output columns.
DROP FUNCTION IF EXISTS mc.proxy_get_link_status();

CREATE FUNCTION mc.proxy_get_link_status()
RETURNS TABLE (
    mc_uuid          TEXT,
    status           INTEGER,
    is_verified      BOOLEAN,
    is_pending       BOOLEAN,
    code_expires_at  TIMESTAMPTZ,
    locked_until     TIMESTAMPTZ,
    verify_attempts  INTEGER,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_now     TIMESTAMPTZ := statement_timestamp();
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
        a.verification_code_hash IS NOT NULL
            AND a.code_expires_at > v_now
            AND (a.locked_until IS NULL OR a.locked_until <= v_now),
        a.code_expires_at,
        a.locked_until,
        a.verify_attempts,
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
COMMENT ON FUNCTION mc.proxy_get_link_status() IS
    'Authenticated RPC. Returns the caller''s Minecraft link status including lockout/expiry/attempt counters for UI feedback. Never exposes the verification code hash.';

-- ===========================================
-- PROXY FUNCTION: Authenticated user unlinks MC account
-- ===========================================

CREATE OR REPLACE FUNCTION mc.proxy_unlink()
RETURNS BOOLEAN
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

    RETURN mc.service_unlink(v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION mc.proxy_unlink()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_unlink()
    TO authenticated, service_role;
ALTER FUNCTION mc.proxy_unlink() OWNER TO service_role;

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

    -- Verify pgcrypto extension is available
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) THEN
        RAISE EXCEPTION 'pgcrypto extension is required but not installed';
    END IF;

    -- Verify service functions exist
    PERFORM 'mc.service_request_link(uuid, text)'::regprocedure;
    PERFORM 'mc.service_verify_link(text, integer)'::regprocedure;
    PERFORM 'mc.service_get_user_by_mc_uuid(text)'::regprocedure;
    PERFORM 'mc.service_unlink(uuid)'::regprocedure;

    -- Verify proxy functions exist
    PERFORM 'mc.proxy_request_link(text)'::regprocedure;
    PERFORM 'mc.proxy_get_link_status()'::regprocedure;
    PERFORM 'mc.proxy_unlink()'::regprocedure;

    -- Verify service_role can execute service functions
    IF NOT has_function_privilege('service_role', 'mc.service_request_link(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_request_link';
    END IF;

    IF NOT has_function_privilege('service_role', 'mc.service_verify_link(text, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_verify_link';
    END IF;

    IF NOT has_function_privilege('service_role', 'mc.service_unlink(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_unlink';
    END IF;

    -- Verify anon CANNOT execute any service or helper functions
    IF has_function_privilege('anon', 'mc.service_request_link(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_request_link';
    END IF;

    IF has_function_privilege('anon', 'mc.service_verify_link(text, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_verify_link';
    END IF;

    IF has_function_privilege('anon', 'mc.service_unlink(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_unlink';
    END IF;

    IF has_function_privilege('anon', 'mc.service_get_user_by_mc_uuid(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_get_user_by_mc_uuid';
    END IF;

    IF has_function_privilege('anon', 'mc.normalize_mc_uuid(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.normalize_mc_uuid';
    END IF;

    -- Verify authenticated CANNOT execute service functions directly
    IF has_function_privilege('authenticated', 'mc.service_request_link(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_request_link';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_verify_link(text, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_verify_link';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_get_user_by_mc_uuid(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_get_user_by_mc_uuid';
    END IF;

    -- Verify proxy functions are callable by authenticated
    IF NOT has_function_privilege('authenticated', 'mc.proxy_request_link(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must have execute on mc.proxy_request_link';
    END IF;

    IF NOT has_function_privilege('authenticated', 'mc.proxy_get_link_status()', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must have execute on mc.proxy_get_link_status';
    END IF;

    IF NOT has_function_privilege('authenticated', 'mc.proxy_unlink()', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must have execute on mc.proxy_unlink';
    END IF;

    -- Verify ALL function ownership is service_role
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_request_link(uuid, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_request_link must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_verify_link(text, integer)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_verify_link must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_unlink(uuid)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_unlink must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_get_user_by_mc_uuid(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_get_user_by_mc_uuid must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.proxy_request_link(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.proxy_request_link must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.proxy_get_link_status()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.proxy_get_link_status must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.proxy_unlink()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.proxy_unlink must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.normalize_mc_uuid(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.normalize_mc_uuid must be owned by service_role';
    END IF;

    RAISE NOTICE 'mc.auth schema setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
