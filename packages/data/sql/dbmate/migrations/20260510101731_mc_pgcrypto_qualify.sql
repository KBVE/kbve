-- migrate:up

-- Qualify pgcrypto calls in mc.service_request_link / mc.service_verify_link.
-- Both functions run with SET search_path = '', so pgcrypto must be schema-qualified.
-- Also harden verification-code generation, locking, validation, and update targeting.

-- service_role owns these SECURITY DEFINER functions, so it needs USAGE on
-- the `extensions` schema where pgcrypto lives. Idempotent — Supabase prod
-- already grants this, but make the migration self-sufficient for fresh DBs.
GRANT USAGE ON SCHEMA extensions TO service_role;

CREATE OR REPLACE FUNCTION mc.service_request_link(
    p_user_id UUID,
    p_mc_uuid TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
    v_code INTEGER;
    v_existing_status INTEGER;
    v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null'
            USING ERRCODE = '22004';
    END IF;

    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    -- Serialize by both Minecraft UUID and app user.
    -- This prevents same-user concurrent request races and same-MC-UUID races.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_mc_uuid, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 1));

    SELECT status
    INTO v_existing_status
    FROM mc.auth
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_existing_status IS NOT NULL AND (v_existing_status & 1) = 1 THEN
        RAISE EXCEPTION 'Account already has a verified Minecraft link. Unlink first.'
            USING ERRCODE = '23505';
    END IF;

    -- Refuse link requests from suspended/banned rows.
    -- Assumes bits 2 and 4 are SUSPENDED/BANNED, matching verify guard: (status & 6) = 0.
    IF v_existing_status IS NOT NULL AND (v_existing_status & 6) <> 0 THEN
        RAISE EXCEPTION 'Account is not allowed to request a Minecraft link.'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM mc.auth
        WHERE mc_uuid = v_mc_uuid
          AND user_id <> p_user_id
    ) THEN
        RAISE EXCEPTION 'Minecraft UUID already linked to another account'
            USING ERRCODE = '23505';
    END IF;

    -- Cryptographically stronger 6-digit code than random().
    -- Generates 100000..999999.
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

    INSERT INTO mc.auth (
        user_id,
        mc_uuid,
        status,
        verification_code_hash,
        code_expires_at,
        verify_attempts,
        locked_until
    )
    VALUES (
        p_user_id,
        v_mc_uuid,
        0,
        extensions.crypt(v_code::TEXT, extensions.gen_salt('bf')),
        v_now + INTERVAL '10 minutes',
        0,
        NULL
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        mc_uuid = EXCLUDED.mc_uuid,
        status = 0,
        verification_code_hash = EXCLUDED.verification_code_hash,
        code_expires_at = EXCLUDED.code_expires_at,
        verify_attempts = 0,
        locked_until = NULL;

    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION mc.service_verify_link(
    p_mc_uuid TEXT,
    p_code INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
    v_user_id UUID;
    v_hash TEXT;
    v_expires TIMESTAMPTZ;
    v_attempts INTEGER;
    v_locked TIMESTAMPTZ;
    v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF p_code IS NULL OR p_code < 100000 OR p_code > 999999 THEN
        RETURN NULL;
    END IF;

    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

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
      AND (status & 6) = 0
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_locked IS NOT NULL AND v_locked > v_now THEN
        RETURN NULL;
    END IF;

    IF v_expires IS NULL OR v_expires < v_now THEN
        UPDATE mc.auth
        SET
            verification_code_hash = NULL,
            code_expires_at = NULL,
            verify_attempts = 0,
            locked_until = NULL
        WHERE user_id = v_user_id
          AND mc_uuid = v_mc_uuid;

        RETURN NULL;
    END IF;

    IF v_hash = extensions.crypt(p_code::TEXT, v_hash) THEN
        UPDATE mc.auth
        SET
            status = (status | 1),
            verification_code_hash = NULL,
            code_expires_at = NULL,
            verify_attempts = 0,
            locked_until = NULL
        WHERE user_id = v_user_id
          AND mc_uuid = v_mc_uuid;

        RETURN v_user_id;
    END IF;

    UPDATE mc.auth
    SET
        verify_attempts = v_attempts + 1,
        locked_until = CASE
            WHEN v_attempts + 1 >= 5 THEN v_now + INTERVAL '15 minutes'
            ELSE locked_until
        END
    WHERE user_id = v_user_id
      AND mc_uuid = v_mc_uuid;

    RETURN NULL;
END;
$$;

ALTER FUNCTION mc.service_request_link(UUID, TEXT) OWNER TO service_role;
ALTER FUNCTION mc.service_verify_link(TEXT, INTEGER) OWNER TO service_role;

REVOKE ALL ON FUNCTION mc.service_request_link(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mc.service_verify_link(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION mc.service_request_link(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION mc.service_verify_link(TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION mc.service_request_link(UUID, TEXT) IS
    'Service-only RPC. Creates or refreshes an unverified Minecraft link request and returns a six-digit verification code. Uses schema-qualified pgcrypto calls because search_path is empty.';

COMMENT ON FUNCTION mc.service_verify_link(TEXT, INTEGER) IS
    'Service-only RPC. Verifies a Minecraft link code, rate-limits failed attempts, clears expired codes, and marks the link verified on success. Uses schema-qualified pgcrypto calls because search_path is empty.';

-- Preserve suspended/banned moderation state on unlink.
-- A clean (unmoderated) row is deleted; a moderated row is unlinked but kept
-- so the SUSPENDED/BANNED flags continue to gate future link attempts.

CREATE OR REPLACE FUNCTION mc.service_unlink(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows INTEGER;
BEGIN
    UPDATE mc.auth
    SET
        status                 = status & ~1,
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

    DELETE FROM mc.auth
    WHERE user_id = p_user_id
      AND (status & 6) = 0;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION mc.service_unlink(UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION mc.service_unlink(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_unlink(UUID) TO service_role;

COMMENT ON FUNCTION mc.service_unlink(UUID) IS
    'Service-only RPC. Removes a Minecraft link. Preserves rows with SUSPENDED/BANNED flags so moderation state survives unlink; cleanly drops un-moderated rows.';

-- Expand status payload so the frontend can render lockout / expiry state.
-- DROP first because RETURNS TABLE shape changes; CREATE OR REPLACE cannot alter columns.

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

ALTER FUNCTION mc.proxy_get_link_status() OWNER TO service_role;
REVOKE ALL ON FUNCTION mc.proxy_get_link_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_get_link_status() TO authenticated, service_role;

COMMENT ON FUNCTION mc.proxy_get_link_status() IS
    'Authenticated RPC. Returns the caller''s Minecraft link status including lockout/expiry/attempt counters for UI feedback. Never exposes the verification code hash.';

-- migrate:down

-- Restore prior unqualified pgcrypto calls.
-- Note: this is intentionally broken on Supabase prod when search_path = '' and pgcrypto lives in extensions.

CREATE OR REPLACE FUNCTION mc.service_request_link(
    p_user_id UUID,
    p_mc_uuid TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
    v_code INTEGER;
    v_existing_status INTEGER;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    PERFORM pg_advisory_xact_lock(hashtext(v_mc_uuid));

    SELECT status
    INTO v_existing_status
    FROM mc.auth
    WHERE user_id = p_user_id;

    IF v_existing_status IS NOT NULL AND (v_existing_status & 1) = 1 THEN
        RAISE EXCEPTION 'Account already has a verified Minecraft link. Unlink first.'
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM mc.auth
        WHERE mc_uuid = v_mc_uuid
          AND user_id <> p_user_id
    ) THEN
        RAISE EXCEPTION 'Minecraft UUID already linked to another account'
            USING ERRCODE = '23505';
    END IF;

    v_code := floor(random() * 900000 + 100000)::INTEGER;

    INSERT INTO mc.auth (
        user_id,
        mc_uuid,
        status,
        verification_code_hash,
        code_expires_at,
        verify_attempts,
        locked_until
    )
    VALUES (
        p_user_id,
        v_mc_uuid,
        0,
        crypt(v_code::TEXT, gen_salt('bf')),
        NOW() + INTERVAL '10 minutes',
        0,
        NULL
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        mc_uuid = EXCLUDED.mc_uuid,
        status = 0,
        verification_code_hash = EXCLUDED.verification_code_hash,
        code_expires_at = EXCLUDED.code_expires_at,
        verify_attempts = 0,
        locked_until = NULL;

    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION mc.service_verify_link(
    p_mc_uuid TEXT,
    p_code INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_mc_uuid TEXT;
    v_user_id UUID;
    v_hash TEXT;
    v_expires TIMESTAMPTZ;
    v_attempts INTEGER;
    v_locked TIMESTAMPTZ;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);

    SELECT
        user_id,
        verification_code_hash,
        code_expires_at,
        verify_attempts,
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
      AND (status & 6) = 0
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_locked IS NOT NULL AND v_locked > NOW() THEN
        RETURN NULL;
    END IF;

    IF v_expires IS NOT NULL AND v_expires < NOW() THEN
        UPDATE mc.auth
        SET
            verification_code_hash = NULL,
            code_expires_at = NULL,
            verify_attempts = 0,
            locked_until = NULL
        WHERE user_id = v_user_id;

        RETURN NULL;
    END IF;

    IF v_hash = crypt(p_code::TEXT, v_hash) THEN
        UPDATE mc.auth
        SET
            status = (status | 1),
            verification_code_hash = NULL,
            code_expires_at = NULL,
            verify_attempts = 0,
            locked_until = NULL
        WHERE user_id = v_user_id;

        RETURN v_user_id;
    END IF;

    IF v_attempts + 1 >= 5 THEN
        UPDATE mc.auth
        SET
            verify_attempts = verify_attempts + 1,
            locked_until = NOW() + INTERVAL '15 minutes'
        WHERE user_id = v_user_id;
    ELSE
        UPDATE mc.auth
        SET verify_attempts = verify_attempts + 1
        WHERE user_id = v_user_id;
    END IF;

    RETURN NULL;
END;
$$;

ALTER FUNCTION mc.service_request_link(UUID, TEXT) OWNER TO service_role;
ALTER FUNCTION mc.service_verify_link(TEXT, INTEGER) OWNER TO service_role;

REVOKE ALL ON FUNCTION mc.service_request_link(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mc.service_verify_link(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION mc.service_request_link(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION mc.service_verify_link(TEXT, INTEGER) TO service_role;

-- Restore service_unlink to plain DELETE behavior.

CREATE OR REPLACE FUNCTION mc.service_unlink(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM mc.auth WHERE user_id = p_user_id;
    RETURN FOUND;
END;
$$;

ALTER FUNCTION mc.service_unlink(UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION mc.service_unlink(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_unlink(UUID) TO service_role;

-- Restore proxy_get_link_status to original return shape.

DROP FUNCTION IF EXISTS mc.proxy_get_link_status();

CREATE FUNCTION mc.proxy_get_link_status()
RETURNS TABLE (
    mc_uuid     TEXT,
    status      INTEGER,
    is_verified BOOLEAN,
    is_pending  BOOLEAN,
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ
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
        a.verification_code_hash IS NOT NULL
            AND a.code_expires_at > NOW()
            AND (a.locked_until IS NULL OR a.locked_until <= NOW()),
        a.created_at,
        a.updated_at
    FROM mc.auth AS a
    WHERE a.user_id = v_user_id;
END;
$$;

ALTER FUNCTION mc.proxy_get_link_status() OWNER TO service_role;
REVOKE ALL ON FUNCTION mc.proxy_get_link_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_get_link_status() TO authenticated, service_role;
