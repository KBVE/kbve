-- ============================================================
-- DISCORDSH LIST SERVERS — Paginated server directory listing
--
-- Two functions:
--   service_list_servers  — internal, service_role only
--   proxy_list_servers    — public proxy in public schema
--
-- Security:
--   - service_list_servers: SECURITY INVOKER, search_path='',
--     owned by service_role, no access for anon/authenticated
--     (runs under caller context — proxy elevates, service executes)
--   - proxy_list_servers: SECURITY DEFINER, search_path='',
--     owned by service_role, service_role only (no anon/authenticated)
--   - Edge function calls proxy with service_role key, caches result
--   - proxy is the only call surface and the single privilege boundary
--
-- Sort modes: votes (default), members, newest, bumped
-- Category filter: optional SMALLINT matching ANY(categories)
-- Pagination: LIMIT/OFFSET with clamped inputs (1-50 per page)
-- Tie-breaking: created_at DESC, server_id DESC for stable ordering
--
-- Depends on: discordsh_servers.sql (discordsh.servers table + indexes)
-- ============================================================

BEGIN;

-- ===========================================
-- SERVICE FUNCTION: List servers (internal)
--
-- Paginated, sortable, filterable server directory query.
-- Called only by proxy_list_servers.
-- Input validation: sort normalized to lowercase, unknown sorts
-- default to 'votes', limit clamped to 1-50.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_list_servers(
    p_limit     INT       DEFAULT 24,
    p_page      INT       DEFAULT 1,
    p_sort      TEXT      DEFAULT 'votes',
    p_category  SMALLINT  DEFAULT NULL
)
RETURNS TABLE (
    server_id    TEXT,
    name         TEXT,
    summary      TEXT,
    icon_url     TEXT,
    banner_url   TEXT,
    invite_code  TEXT,
    categories   SMALLINT[],
    tags         TEXT[],
    vote_count   BIGINT,
    member_count BIGINT,
    is_online    BOOLEAN,
    total_count  BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_offset INT;
    v_total  BIGINT;
BEGIN
    -- Clamp inputs
    p_limit := LEAST(GREATEST(p_limit, 1), 50);
    p_page  := LEAST(GREATEST(p_page, 1), 10000);
    v_offset := (p_page - 1) * p_limit;

    -- Normalize and validate sort
    p_sort := lower(coalesce(p_sort, 'votes'));
    IF p_sort NOT IN ('votes', 'members', 'newest', 'bumped') THEN
        p_sort := 'votes';
    END IF;

    -- Count total matching rows (status = 1 = active)
    IF p_category IS NOT NULL THEN
        SELECT count(*)
          INTO v_total
          FROM discordsh.servers s
         WHERE s.status = 1
           AND p_category = ANY(s.categories);
    ELSE
        SELECT count(*)
          INTO v_total
          FROM discordsh.servers s
         WHERE s.status = 1;
    END IF;

    RETURN QUERY
    SELECT
        s.server_id,
        s.name,
        s.summary,
        s.icon_url,
        s.banner_url,
        s.invite_code,
        s.categories,
        s.tags,
        s.vote_count,
        s.member_count,
        s.is_online,
        v_total AS total_count
    FROM discordsh.servers s
    WHERE s.status = 1
      AND (p_category IS NULL OR p_category = ANY(s.categories))
    ORDER BY
        CASE WHEN p_sort = 'votes'   THEN s.vote_count   END DESC NULLS LAST,
        CASE WHEN p_sort = 'members' THEN s.member_count  END DESC NULLS LAST,
        CASE WHEN p_sort = 'newest'  THEN s.created_at    END DESC NULLS LAST,
        CASE WHEN p_sort = 'bumped'  THEN s.bumped_at     END DESC NULLS LAST,
        s.created_at DESC,
        s.server_id DESC
    LIMIT p_limit
    OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION discordsh.service_list_servers IS
    'Internal: paginated server listing with sort + category filter. Called by proxy_list_servers.';

REVOKE ALL ON FUNCTION discordsh.service_list_servers(INT, INT, TEXT, SMALLINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_list_servers(INT, INT, TEXT, SMALLINT) TO service_role;
ALTER FUNCTION discordsh.service_list_servers(INT, INT, TEXT, SMALLINT) OWNER TO service_role;

-- ===========================================
-- PROXY FUNCTION: List servers (public)
--
-- Thin wrapper that delegates to discordsh.service_list_servers.
-- service_role only — edge function calls this with service key and caches.
-- ===========================================

CREATE OR REPLACE FUNCTION public.proxy_list_servers(
    p_limit     INT       DEFAULT 24,
    p_page      INT       DEFAULT 1,
    p_sort      TEXT      DEFAULT 'votes',
    p_category  SMALLINT  DEFAULT NULL
)
RETURNS TABLE (
    server_id    TEXT,
    name         TEXT,
    summary      TEXT,
    icon_url     TEXT,
    banner_url   TEXT,
    invite_code  TEXT,
    categories   SMALLINT[],
    tags         TEXT[],
    vote_count   BIGINT,
    member_count BIGINT,
    is_online    BOOLEAN,
    total_count  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT *
      FROM discordsh.service_list_servers(p_limit, p_page, p_sort, p_category);
END;
$$;

COMMENT ON FUNCTION public.proxy_list_servers IS
    'Public: paginated server directory listing. Delegates to discordsh.service_list_servers.';

REVOKE ALL ON FUNCTION public.proxy_list_servers(INT, INT, TEXT, SMALLINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_list_servers(INT, INT, TEXT, SMALLINT) TO service_role;
ALTER FUNCTION public.proxy_list_servers(INT, INT, TEXT, SMALLINT) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify functions exist
    PERFORM 'discordsh.service_list_servers(int, int, text, smallint)'::regprocedure;
    PERFORM 'public.proxy_list_servers(int, int, text, smallint)'::regprocedure;

    -- Verify service function is locked down
    IF has_function_privilege('anon', 'discordsh.service_list_servers(int, int, text, smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on discordsh.service_list_servers';
    END IF;

    IF has_function_privilege('authenticated', 'discordsh.service_list_servers(int, int, text, smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on discordsh.service_list_servers';
    END IF;

    -- Verify proxy is NOT accessible to anon or authenticated (service_role only)
    IF has_function_privilege('anon', 'public.proxy_list_servers(int, int, text, smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on public.proxy_list_servers';
    END IF;

    IF has_function_privilege('authenticated', 'public.proxy_list_servers(int, int, text, smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on public.proxy_list_servers';
    END IF;

    -- Verify ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_list_servers(int, int, text, smallint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_list_servers must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'public.proxy_list_servers(int, int, text, smallint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'public.proxy_list_servers must be owned by service_role';
    END IF;

    RAISE NOTICE 'discordsh_list_servers.sql: service + proxy functions verified successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
