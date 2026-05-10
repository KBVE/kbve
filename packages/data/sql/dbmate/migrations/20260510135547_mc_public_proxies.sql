-- migrate:up

-- Public proxy wrappers for the mc.* auth RPCs.
-- PostgREST exposes only the schemas listed in PGRST_DB_SCHEMAS; the `mc`
-- schema is intentionally not exposed, so edge-function `supabase.rpc(...)`
-- calls 404 unless we publish thin wrappers in `public`. Pattern matches
-- public.proxy_list_servers (discordsh) — every wrapper is SECURITY DEFINER,
-- search_path = '', and delegates to a single mc.* implementation.

-- ---------------------------------------------------------------------------
-- public.proxy_request_link — authenticated user requests a link code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proxy_request_link(
    p_mc_uuid TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_mc_uuid IS NULL OR btrim(p_mc_uuid) = '' THEN
        RAISE EXCEPTION 'mc_uuid cannot be empty'
            USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_request_link(p_mc_uuid);
END;
$$;

COMMENT ON FUNCTION public.proxy_request_link(TEXT) IS
    'Public wrapper for mc.proxy_request_link. Authenticated callers only; mc schema is not exposed via PostgREST.';

REVOKE ALL ON FUNCTION public.proxy_request_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_request_link(TEXT) TO authenticated, service_role;
ALTER FUNCTION public.proxy_request_link(TEXT) OWNER TO service_role;

-- ---------------------------------------------------------------------------
-- public.proxy_get_link_status — authenticated user reads own link state
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proxy_get_link_status()
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
BEGIN
    RETURN QUERY
    SELECT *
      FROM mc.proxy_get_link_status();
END;
$$;

COMMENT ON FUNCTION public.proxy_get_link_status() IS
    'Public wrapper for mc.proxy_get_link_status. Returns the caller''s Minecraft link state including expiry/lockout/attempt counters.';

REVOKE ALL ON FUNCTION public.proxy_get_link_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_get_link_status() TO authenticated, service_role;
ALTER FUNCTION public.proxy_get_link_status() OWNER TO service_role;

-- ---------------------------------------------------------------------------
-- public.proxy_unlink — authenticated user unlinks own MC account
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proxy_unlink()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN mc.proxy_unlink();
END;
$$;

COMMENT ON FUNCTION public.proxy_unlink() IS
    'Public wrapper for mc.proxy_unlink. Authenticated callers only; preserves SUSPENDED/BANNED moderation state.';

REVOKE ALL ON FUNCTION public.proxy_unlink() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_unlink() TO authenticated, service_role;
ALTER FUNCTION public.proxy_unlink() OWNER TO service_role;

-- ---------------------------------------------------------------------------
-- public.service_verify_link — MC server (service_role) verifies a code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_verify_link(
    p_mc_uuid TEXT,
    p_code    INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_mc_uuid IS NULL OR btrim(p_mc_uuid) = '' THEN
        RAISE EXCEPTION 'mc_uuid cannot be empty'
            USING ERRCODE = '22004';
    END IF;
    IF p_code IS NULL OR p_code < 100000 OR p_code > 999999 THEN
        RETURN NULL;
    END IF;
    RETURN mc.service_verify_link(p_mc_uuid, p_code);
END;
$$;

COMMENT ON FUNCTION public.service_verify_link(TEXT, INTEGER) IS
    'Public wrapper for mc.service_verify_link. service_role only; returns user_id on successful code verification, NULL otherwise.';

REVOKE ALL ON FUNCTION public.service_verify_link(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_verify_link(TEXT, INTEGER) TO service_role;
ALTER FUNCTION public.service_verify_link(TEXT, INTEGER) OWNER TO service_role;

-- ---------------------------------------------------------------------------
-- public.service_get_user_by_mc_uuid — MC server lookup by MC UUID
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_get_user_by_mc_uuid(
    p_mc_uuid TEXT
)
RETURNS TABLE (
    user_id     UUID,
    mc_uuid     TEXT,
    status      INTEGER,
    is_verified BOOLEAN,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_mc_uuid IS NULL OR btrim(p_mc_uuid) = '' THEN
        RAISE EXCEPTION 'mc_uuid cannot be empty'
            USING ERRCODE = '22004';
    END IF;
    RETURN QUERY
    SELECT *
      FROM mc.service_get_user_by_mc_uuid(p_mc_uuid);
END;
$$;

COMMENT ON FUNCTION public.service_get_user_by_mc_uuid(TEXT) IS
    'Public wrapper for mc.service_get_user_by_mc_uuid. service_role only; returns Supabase user_id linked to the supplied MC UUID.';

REVOKE ALL ON FUNCTION public.service_get_user_by_mc_uuid(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_user_by_mc_uuid(TEXT) TO service_role;
ALTER FUNCTION public.service_get_user_by_mc_uuid(TEXT) OWNER TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_request_link(TEXT);
DROP FUNCTION IF EXISTS public.proxy_get_link_status();
DROP FUNCTION IF EXISTS public.proxy_unlink();
DROP FUNCTION IF EXISTS public.service_verify_link(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.service_get_user_by_mc_uuid(TEXT);
