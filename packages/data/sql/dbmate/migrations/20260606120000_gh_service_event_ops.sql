-- migrate:up
SET search_path = public, pg_catalog;

-- gh.issue_event has no server_id column — it is keyed by (owner, repo, number)
-- and the per-guild routing happens in the bot via vault allowlist. To compute
-- guild-scoped event stats from the dashboard, the gh-admin edge function
-- fetches the guild's allowlist (github_repos:<guild>) via bot_get_guild_token,
-- then passes the owner/repo pairs into these RPCs. All three functions filter
-- by repo_key so a caller cannot read or requeue events for a repo the guild
-- does not control.

-- Generated, stored repo_key — lowercase "owner/repo". Lets us use plain
-- equality + IN lookups against an ordinary btree instead of forcing the
-- planner to recompute (lower(owner)||'/'||lower(repo)) per row.

ALTER TABLE gh.issue_event
    ADD COLUMN IF NOT EXISTS repo_key TEXT
    GENERATED ALWAYS AS (lower(owner) || '/' || lower(repo)) STORED;

-- Composite index covering the stats aggregate path.
CREATE INDEX IF NOT EXISTS gh_issue_event_repo_key_state_updated_id_idx
    ON gh.issue_event (repo_key, delivery_state, updated_at DESC, id DESC);

-- Partial index for failed-event tail (delivery_state = 3).
CREATE INDEX IF NOT EXISTS gh_issue_event_failed_repo_key_updated_id_idx
    ON gh.issue_event (repo_key, updated_at DESC, id DESC)
    WHERE delivery_state = 3;


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
ROWS 1
COST 100
AS $$
DECLARE
    v_repos TEXT[];
BEGIN
    IF COALESCE(cardinality(p_repos), 0) = 0 THEN
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
                            0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT,
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    v_repos := ARRAY(
        SELECT DISTINCT lower(btrim(r))
        FROM unnest(p_repos) AS r
        WHERE lower(btrim(r)) ~ '^[a-z0-9._-]{1,100}/[a-z0-9._-]{1,100}$'
    );

    IF COALESCE(cardinality(v_repos), 0) = 0 THEN
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
                            0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT,
                            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF cardinality(v_repos) > 100 THEN
        RAISE EXCEPTION 'p_repos cannot contain more than 100 entries'
            USING ERRCODE = 'GH006';
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
    WHERE e.repo_key = ANY(v_repos);
END;
$$;

ALTER FUNCTION gh.service_get_guild_event_stats(TEXT[]) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_get_guild_event_stats(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_get_guild_event_stats(TEXT[]) TO service_role;

COMMENT ON FUNCTION gh.service_get_guild_event_stats(TEXT[]) IS
    'Aggregate gh.issue_event counts + last-delivery timestamps for the supplied owner/repo allowlist. Filters via repo_key generated column. Service_role only; call from gh-admin edge after fetching the guild allowlist from vault.';


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
ROWS 10
COST 100
AS $$
DECLARE
    v_repos TEXT[];
    v_limit INT;
BEGIN
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);

    IF COALESCE(cardinality(p_repos), 0) = 0 THEN
        RETURN;
    END IF;

    v_repos := ARRAY(
        SELECT DISTINCT lower(btrim(r))
        FROM unnest(p_repos) AS r
        WHERE lower(btrim(r)) ~ '^[a-z0-9._-]{1,100}/[a-z0-9._-]{1,100}$'
    );

    IF COALESCE(cardinality(v_repos), 0) = 0 THEN
        RETURN;
    END IF;

    IF cardinality(v_repos) > 100 THEN
        RAISE EXCEPTION 'p_repos cannot contain more than 100 entries'
            USING ERRCODE = 'GH006';
    END IF;

    RETURN QUERY
    SELECT
        e.id, e.owner, e.repo, e.number, e.event_type, e.actor,
        e.delivery_attempts, e.last_error, e.created_at, e.updated_at
    FROM gh.issue_event e
    WHERE e.repo_key = ANY(v_repos)
      AND e.delivery_state = 3
    ORDER BY e.updated_at DESC, e.id DESC
    LIMIT v_limit;
END;
$$;

ALTER FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) TO service_role;

COMMENT ON FUNCTION gh.service_get_recent_failed_events(TEXT[], INT) IS
    'Failed-event tail (delivery_state=3) filtered by allowlist for dashboard requeue UI. Service_role only.';


-- Requeue ONLY failed events. Preserves delivery_attempts so we keep
-- operational history. Resets claim_token + claimed_at + delivered_at +
-- last_error so the bot's claim sweep treats it as fresh. Raises on miss
-- so the dashboard can distinguish "no such event in this guild's scope"
-- from success.

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
ROWS 1
COST 50
AS $$
DECLARE
    v_repos TEXT[];
BEGIN
    PERFORM set_config('lock_timeout', '2s', true);
    PERFORM set_config('statement_timeout', '10s', true);

    IF p_event_id IS NULL OR p_event_id <= 0 THEN
        RAISE EXCEPTION 'p_event_id must be > 0'
            USING ERRCODE = 'GH001';
    END IF;

    IF COALESCE(cardinality(p_repos), 0) = 0 THEN
        RAISE EXCEPTION 'p_repos must contain at least one owner/repo entry'
            USING ERRCODE = 'GH002';
    END IF;

    v_repos := ARRAY(
        SELECT DISTINCT lower(btrim(r))
        FROM unnest(p_repos) AS r
        WHERE lower(btrim(r)) ~ '^[a-z0-9._-]{1,100}/[a-z0-9._-]{1,100}$'
    );

    IF COALESCE(cardinality(v_repos), 0) = 0 THEN
        RAISE EXCEPTION 'p_repos contained no valid owner/repo entries'
            USING ERRCODE = 'GH003';
    END IF;

    IF cardinality(v_repos) > 100 THEN
        RAISE EXCEPTION 'p_repos cannot contain more than 100 entries'
            USING ERRCODE = 'GH006';
    END IF;

    RETURN QUERY
    UPDATE gh.issue_event e
    SET delivery_state    = 0,
        claim_token       = NULL,
        claimed_at        = NULL,
        delivered_at      = NULL,
        last_error        = NULL,
        updated_at        = now()
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
      AND e.delivery_state = 3
    RETURNING e.id, e.delivery_state, e.delivery_attempts;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'event not found, not in this guild''s allowlist, or not in failed state'
            USING ERRCODE = 'GH004';
    END IF;
END;
$$;

ALTER FUNCTION gh.service_requeue_event(TEXT[], BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT) TO service_role;

COMMENT ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT) IS
    'Reset a single failed gh.issue_event row back to pending so gh_sync claims it again. Allowlist-scoped (cross-guild safe), failed-only (cannot replay delivered events), preserves delivery_attempts. Raises GH001/GH002/GH003/GH004/GH006 with custom SQLSTATEs. service_role only.';


-- migrate:down
DROP FUNCTION IF EXISTS gh.service_requeue_event(TEXT[], BIGINT);
DROP FUNCTION IF EXISTS gh.service_get_recent_failed_events(TEXT[], INT);
DROP FUNCTION IF EXISTS gh.service_get_guild_event_stats(TEXT[]);

DROP INDEX IF EXISTS gh.gh_issue_event_failed_repo_key_updated_id_idx;
DROP INDEX IF EXISTS gh.gh_issue_event_repo_key_state_updated_id_idx;

ALTER TABLE gh.issue_event DROP COLUMN IF EXISTS repo_key;
