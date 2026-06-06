-- migrate:up
SET search_path = public, pg_catalog;

-- gh.issue_event has no server_id column — it's keyed by (owner, repo, number)
-- and the per-guild routing happens in the bot via vault allowlist. To compute
-- guild-scoped event stats from the dashboard, the gh-admin edge function
-- fetches the guild's allowlist (github_repos:<guild>) via bot_get_guild_token,
-- then passes the owner/repo pairs into these RPCs. Both functions filter by
-- that array so a caller cannot read or requeue events for a repo the guild
-- does not control.

CREATE OR REPLACE FUNCTION gh.service_get_guild_event_stats(
    p_repos TEXT[]
)
RETURNS TABLE (
    last_delivered_at      TIMESTAMPTZ,
    last_recorded_at       TIMESTAMPTZ,
    pending_count          BIGINT,
    in_flight_count        BIGINT,
    delivered_count        BIGINT,
    failed_count           BIGINT,
    oldest_pending_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = gh, pg_temp
AS $$
DECLARE
    v_repos TEXT[];
BEGIN
    IF p_repos IS NULL OR array_length(p_repos, 1) IS NULL THEN
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
                            0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT,
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    v_repos := ARRAY(SELECT lower(btrim(r)) FROM unnest(p_repos) AS r
                     WHERE r ~ '^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$');
    IF array_length(v_repos, 1) IS NULL THEN
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
                            0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT,
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        MAX(e.delivered_at)                                         AS last_delivered_at,
        MAX(e.created_at)                                           AS last_recorded_at,
        COUNT(*) FILTER (WHERE e.delivery_state = 0)                AS pending_count,
        COUNT(*) FILTER (WHERE e.delivery_state = 1)                AS in_flight_count,
        COUNT(*) FILTER (WHERE e.delivery_state = 2)                AS delivered_count,
        COUNT(*) FILTER (WHERE e.delivery_state = 3)                AS failed_count,
        MIN(e.created_at) FILTER (WHERE e.delivery_state = 0)       AS oldest_pending_at
    FROM gh.issue_event e
    WHERE (lower(e.owner) || '/' || lower(e.repo)) = ANY(v_repos);
END;
$$;

ALTER FUNCTION gh.service_get_guild_event_stats(TEXT[]) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_get_guild_event_stats(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_get_guild_event_stats(TEXT[]) TO service_role;

COMMENT ON FUNCTION gh.service_get_guild_event_stats(TEXT[]) IS
    'Aggregate gh.issue_event counts + last-delivery timestamps for the supplied owner/repo allowlist. Service_role only; call from gh-admin edge after fetching the guild allowlist from vault.';


CREATE OR REPLACE FUNCTION gh.service_get_recent_failed_events(
    p_repos TEXT[],
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id                BIGINT,
    owner             TEXT,
    repo              TEXT,
    number            INT,
    event_type        TEXT,
    actor             TEXT,
    delivery_attempts INT,
    last_error        TEXT,
    created_at        TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = gh, pg_temp
AS $$
DECLARE
    v_repos TEXT[];
    v_limit INT;
BEGIN
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
    IF p_repos IS NULL OR array_length(p_repos, 1) IS NULL THEN
        RETURN;
    END IF;
    v_repos := ARRAY(SELECT lower(btrim(r)) FROM unnest(p_repos) AS r
                     WHERE r ~ '^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$');
    IF array_length(v_repos, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        e.id, e.owner, e.repo, e.number, e.event_type, e.actor,
        e.delivery_attempts, e.last_error, e.created_at, e.updated_at
    FROM gh.issue_event e
    WHERE (lower(e.owner) || '/' || lower(e.repo)) = ANY(v_repos)
      AND e.delivery_state = 3
    ORDER BY e.updated_at DESC
    LIMIT v_limit;
END;
$$;

ALTER FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) TO service_role;

COMMENT ON FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) IS
    'Failed-event tail filtered by allowlist for dashboard requeue UI. Service_role only.';


CREATE OR REPLACE FUNCTION gh.service_requeue_event(
    p_repos    TEXT[],
    p_event_id BIGINT
)
RETURNS TABLE (
    id                BIGINT,
    delivery_state    SMALLINT,
    delivery_attempts INT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = gh, pg_temp
AS $$
DECLARE
    v_repos TEXT[];
BEGIN
    IF p_event_id IS NULL OR p_event_id <= 0 THEN
        RAISE EXCEPTION 'p_event_id must be > 0';
    END IF;
    IF p_repos IS NULL OR array_length(p_repos, 1) IS NULL THEN
        RAISE EXCEPTION 'p_repos must contain at least one owner/repo entry';
    END IF;
    v_repos := ARRAY(SELECT lower(btrim(r)) FROM unnest(p_repos) AS r
                     WHERE r ~ '^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$');
    IF array_length(v_repos, 1) IS NULL THEN
        RAISE EXCEPTION 'p_repos contained no valid owner/repo entries';
    END IF;

    RETURN QUERY
    UPDATE gh.issue_event e
    SET delivery_state    = 0,
        claim_token       = NULL,
        claimed_at        = NULL,
        delivered_at      = NULL,
        delivery_attempts = 0,
        last_error        = NULL,
        updated_at        = now()
    WHERE e.id = p_event_id
      AND (lower(e.owner) || '/' || lower(e.repo)) = ANY(v_repos)
    RETURNING e.id, e.delivery_state, e.delivery_attempts;
END;
$$;

ALTER FUNCTION gh.service_requeue_event(TEXT[], BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT) TO service_role;

COMMENT ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT) IS
    'Reset a single gh.issue_event row back to pending. Filters by allowlist so a guild cannot requeue another guild''s repo events. service_role only.';


-- migrate:down
DROP FUNCTION IF EXISTS gh.service_requeue_event(TEXT[], BIGINT);
DROP FUNCTION IF EXISTS gh.service_get_recent_failed_events(TEXT[], INT);
DROP FUNCTION IF EXISTS gh.service_get_guild_event_stats(TEXT[]);
