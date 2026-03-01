-- migrate:up

-- ============================================================
-- DISCORDSH — Add service_update_server + proxy_update_server
--
-- Replaces direct authenticated UPDATE access with gated proxy
-- function. Fixes CHECK constraint permission issue where
-- authenticated users couldn't call validation functions
-- (is_safe_text, is_safe_url, etc.) during direct UPDATE.
--
-- Changes:
--   1. Adds service_update_server (service_role only)
--   2. Adds proxy_update_server (authenticated, derives auth.uid())
--   3. Drops authenticated_update_own RLS policy on servers
--   4. Revokes UPDATE from authenticated on servers
--
-- Source of truth:
--   packages/data/sql/schema/discordsh/discordsh_servers.sql
-- Depends on: 20260228000000_discordsh_schema_init
-- ============================================================


-- ===========================================
-- SERVICE FUNCTION: Update server (internal, service_role only)
--
-- Validates ownership, enforces advisory lock, updates only
-- allowed display fields. Server-managed columns (status,
-- counters, owner_id, bumped_at, is_online) are untouched.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_update_server(
    p_owner_id    UUID,
    p_server_id   TEXT,
    p_name        TEXT,
    p_summary     TEXT,
    p_invite_code TEXT,
    p_description TEXT DEFAULT NULL,
    p_icon_url    TEXT DEFAULT NULL,
    p_banner_url  TEXT DEFAULT NULL,
    p_categories  SMALLINT[] DEFAULT '{}',
    p_tags        TEXT[] DEFAULT '{}'
)
RETURNS TABLE(success BOOLEAN, server_id TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_owner UUID;
BEGIN
    -- Validate server_id format (Discord snowflake)
    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid server ID format.'::TEXT;
        RETURN;
    END IF;

    -- Validate invite_code format
    IF p_invite_code IS NULL OR p_invite_code !~ '^[a-zA-Z0-9_-]{2,32}$' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid invite code format.'::TEXT;
        RETURN;
    END IF;

    -- Validate required text fields
    IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 100 THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Name must be 1-100 characters.'::TEXT;
        RETURN;
    END IF;

    IF p_summary IS NULL OR char_length(p_summary) NOT BETWEEN 1 AND 200 THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Summary must be 1-200 characters.'::TEXT;
        RETURN;
    END IF;

    IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Description must be 2000 characters or fewer.'::TEXT;
        RETURN;
    END IF;

    -- Text safety validation
    IF NOT discordsh.is_safe_text(p_name) OR NOT discordsh.is_safe_text(p_summary) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Text contains invalid characters.'::TEXT;
        RETURN;
    END IF;

    IF p_description IS NOT NULL AND NOT discordsh.is_safe_text(p_description) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Description contains invalid characters.'::TEXT;
        RETURN;
    END IF;

    -- URL validation
    IF NOT discordsh.is_safe_url(p_icon_url) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid icon URL.'::TEXT;
        RETURN;
    END IF;

    IF NOT discordsh.is_safe_url(p_banner_url) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid banner URL.'::TEXT;
        RETURN;
    END IF;

    -- Category/tag validation
    IF NOT discordsh.are_valid_categories(p_categories) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid categories.'::TEXT;
        RETURN;
    END IF;

    IF NOT discordsh.are_valid_tags(p_tags) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid tags.'::TEXT;
        RETURN;
    END IF;

    -- Advisory lock on server to prevent concurrent updates
    PERFORM pg_advisory_xact_lock(hashtext('update:' || p_server_id));

    -- Verify server exists and check ownership
    SELECT s.owner_id INTO v_current_owner
    FROM discordsh.servers s
    WHERE s.server_id = p_server_id;

    IF v_current_owner IS NULL THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Server not found.'::TEXT;
        RETURN;
    END IF;

    IF v_current_owner <> p_owner_id THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Not the server owner.'::TEXT;
        RETURN;
    END IF;

    -- Update display fields only (status, counters, owner_id, bumped_at, is_online untouched)
    UPDATE discordsh.servers s
    SET name        = p_name,
        summary     = p_summary,
        invite_code = p_invite_code,
        description = p_description,
        icon_url    = p_icon_url,
        banner_url  = p_banner_url,
        categories  = p_categories,
        tags        = p_tags
    WHERE s.server_id = p_server_id;

    RETURN QUERY SELECT true, p_server_id, 'Server updated.'::TEXT;

EXCEPTION
    WHEN check_violation THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            ('Validation failed: ' || SQLERRM)::TEXT;
    WHEN unique_violation THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            'Invite code already in use by another server.'::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_update_server IS
    'Internal: update server display fields with full validation. Verifies ownership. Called by proxy_update_server.';

REVOKE ALL ON FUNCTION discordsh.service_update_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_update_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    TO service_role;
ALTER FUNCTION discordsh.service_update_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    OWNER TO service_role;


-- ===========================================
-- PROXY FUNCTION: Update server (public, authenticated only)
--
-- Derives user identity from JWT via auth.uid().
-- Prevents ownership spoofing — always uses caller's identity.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.proxy_update_server(
    p_server_id   TEXT,
    p_name        TEXT,
    p_summary     TEXT,
    p_invite_code TEXT,
    p_description TEXT DEFAULT NULL,
    p_icon_url    TEXT DEFAULT NULL,
    p_banner_url  TEXT DEFAULT NULL,
    p_categories  SMALLINT[] DEFAULT '{}',
    p_tags        TEXT[] DEFAULT '{}'
)
RETURNS TABLE(success BOOLEAN, server_id TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Not authenticated.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT * FROM discordsh.service_update_server(
        v_uid, p_server_id, p_name, p_summary, p_invite_code,
        p_description, p_icon_url, p_banner_url, p_categories, p_tags
    );
END;
$$;

COMMENT ON FUNCTION discordsh.proxy_update_server IS
    'Public: update server display fields. Derives owner from JWT. Validates inputs and ownership.';

REVOKE ALL ON FUNCTION discordsh.proxy_update_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION discordsh.proxy_update_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    TO authenticated, service_role;
ALTER FUNCTION discordsh.proxy_update_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    OWNER TO service_role;


-- ===========================================
-- REMOVE DIRECT UPDATE ACCESS
--
-- Drop the authenticated_update_own RLS policy and revoke
-- UPDATE from authenticated. All updates now go through
-- proxy_update_server.
-- ===========================================

DROP POLICY IF EXISTS "authenticated_update_own" ON discordsh.servers;
REVOKE UPDATE ON discordsh.servers FROM authenticated;


-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify new functions exist
    PERFORM 'discordsh.service_update_server(uuid, text, text, text, text, text, text, text, smallint[], text[])'::regprocedure;
    PERFORM 'discordsh.proxy_update_server(text, text, text, text, text, text, text, smallint[], text[])'::regprocedure;

    -- Verify service_role has EXECUTE on both
    IF NOT has_function_privilege('service_role', 'discordsh.service_update_server(uuid, text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.service_update_server';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.proxy_update_server(text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.proxy_update_server';
    END IF;

    -- Verify authenticated CAN execute proxy but NOT service
    IF NOT has_function_privilege('authenticated', 'discordsh.proxy_update_server(text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must have EXECUTE on discordsh.proxy_update_server';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.service_update_server(uuid, text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.service_update_server';
    END IF;

    -- Verify anon CANNOT execute either
    IF has_function_privilege('anon', 'discordsh.proxy_update_server(text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.proxy_update_server';
    END IF;
    IF has_function_privilege('anon', 'discordsh.service_update_server(uuid, text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.service_update_server';
    END IF;

    -- Verify ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_update_server(uuid, text, text, text, text, text, text, text, smallint[], text[])'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_update_server must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.proxy_update_server(text, text, text, text, text, text, text, smallint[], text[])'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.proxy_update_server must be owned by service_role';
    END IF;

    -- Verify authenticated does NOT have UPDATE on servers table
    IF has_table_privilege('authenticated', 'discordsh.servers', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated must NOT have UPDATE on discordsh.servers — use proxy_update_server';
    END IF;

    RAISE NOTICE 'discordsh_update_server: service + proxy functions verified, direct UPDATE removed.';
END;
$$ LANGUAGE plpgsql;


-- migrate:down

DROP FUNCTION IF EXISTS discordsh.proxy_update_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[]);
DROP FUNCTION IF EXISTS discordsh.service_update_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[]);

-- Restore the original authenticated UPDATE access
GRANT UPDATE ON discordsh.servers TO authenticated;

CREATE POLICY "authenticated_update_own" ON discordsh.servers
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
