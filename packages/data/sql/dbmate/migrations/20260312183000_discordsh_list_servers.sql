-- migrate:up

-- ---------------------------------------------------------------------------
-- discordsh_list_servers — Paginated server listing with sort + filter
--
-- Called via Supabase RPC from the discordsh edge function.
-- Uses the existing composite indexes on discordsh.servers for each sort mode.
-- ---------------------------------------------------------------------------

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
SECURITY DEFINER
SET search_path = discordsh, public
AS $$
DECLARE
    v_offset INT;
    v_total  BIGINT;
BEGIN
    -- Clamp inputs
    p_limit := LEAST(GREATEST(p_limit, 1), 50);
    p_page  := GREATEST(p_page, 1);
    v_offset := (p_page - 1) * p_limit;

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
        CASE WHEN p_sort = 'newest'  THEN extract(epoch FROM s.created_at) END DESC NULLS LAST,
        CASE WHEN p_sort = 'bumped'  THEN extract(epoch FROM s.bumped_at)  END DESC NULLS LAST,
        s.created_at DESC
    LIMIT p_limit
    OFFSET v_offset;
END;
$$;

-- Proxy function exposed via PostgREST (authenticated users)
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
SET search_path = discordsh, public
AS $$
BEGIN
    RETURN QUERY
    SELECT *
      FROM discordsh.service_list_servers(p_limit, p_page, p_sort, p_category);
END;
$$;

-- Grant to authenticated + anon (public listing is read-only)
GRANT EXECUTE ON FUNCTION public.proxy_list_servers(INT, INT, TEXT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_list_servers(INT, INT, TEXT, SMALLINT) TO anon;

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_list_servers(INT, INT, TEXT, SMALLINT);
DROP FUNCTION IF EXISTS discordsh.service_list_servers(INT, INT, TEXT, SMALLINT);
