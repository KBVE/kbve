-- ============================================================================
-- GH RPCs — webhook ingest (upsert_issue, record_event), read-side helpers
--           (get_issue, list_open_issues), Discord-thread linker
--           (set_discord_thread), lease-based worker loop
--           (claim_undelivered_events, mark_event_delivered,
--           mark_event_failed), operational stats (event_queue_stats).
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260523033933_gh_issue_cache_init.sql).
-- Hand-authored review surface — do not run directly; promote changes
-- into a new dbmate migration when ready. Depends on gh_core.sql.
--
-- All functions are SECURITY DEFINER, owned by service_role, reachable
-- only by service_role (PUBLIC/anon/authenticated revoked from each).
-- ============================================================================

-- ============================================================================
-- gh.upsert_issue
--   Called by the gh-webhook edge function on every issues / issue_comment /
--   pull_request{,_review,_review_comment} delivery. Atomic upsert keyed on
--   (owner, repo, number).
--
--   Stale-write protection: every mutable field is gated on
--   EXCLUDED.github_updated_at >= gh.issue.github_updated_at, so an
--   out-of-order webhook with an older updated_at cannot regress newer
--   state. github_updated_at itself uses GREATEST. github_created_at is
--   omitted from the SET so the first-insert value is preserved as
--   immutable. github_node_id update is also gated by the freshness
--   predicate.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.upsert_issue(
    p_owner             TEXT,
    p_repo              TEXT,
    p_number            INT,
    p_title             TEXT,
    p_state             TEXT,
    p_body              TEXT,
    p_labels            JSONB,
    p_assignees         JSONB,
    p_author            TEXT,
    p_html_url          TEXT,
    p_is_pull_request   BOOLEAN,
    p_github_node_id    TEXT,
    p_github_created_at TIMESTAMPTZ,
    p_github_updated_at TIMESTAMPTZ,
    p_closed_at         TIMESTAMPTZ
)
RETURNS gh.issue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row gh.issue;
BEGIN
    INSERT INTO gh.issue (
        owner, repo, number,
        title, state, body, labels, assignees, author, html_url,
        is_pull_request, github_node_id,
        github_created_at, github_updated_at, closed_at, synced_at
    )
    VALUES (
        p_owner, p_repo, p_number,
        p_title, p_state, p_body,
        COALESCE(p_labels, '[]'::jsonb),
        COALESCE(p_assignees, '[]'::jsonb),
        p_author, p_html_url,
        p_is_pull_request, p_github_node_id,
        p_github_created_at, p_github_updated_at, p_closed_at, now()
    )
    ON CONFLICT (owner, repo, number) DO UPDATE
        SET title             = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.title ELSE gh.issue.title END,
            state             = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.state ELSE gh.issue.state END,
            body              = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.body ELSE gh.issue.body END,
            labels            = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.labels ELSE gh.issue.labels END,
            assignees         = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.assignees ELSE gh.issue.assignees END,
            author            = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.author ELSE gh.issue.author END,
            html_url          = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.html_url ELSE gh.issue.html_url END,
            is_pull_request   = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.is_pull_request ELSE gh.issue.is_pull_request END,
            closed_at         = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN EXCLUDED.closed_at ELSE gh.issue.closed_at END,
            github_node_id    = CASE WHEN EXCLUDED.github_updated_at >= gh.issue.github_updated_at
                                     THEN COALESCE(EXCLUDED.github_node_id, gh.issue.github_node_id)
                                     ELSE gh.issue.github_node_id END,
            github_updated_at = GREATEST(gh.issue.github_updated_at, EXCLUDED.github_updated_at),
            synced_at         = now()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

ALTER FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) OWNER TO service_role;

REVOKE ALL ON FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Atomic upsert from the gh-webhook edge function. All mutable fields are gated on EXCLUDED.github_updated_at >= existing.github_updated_at so out-of-order or stale webhook deliveries cannot regress newer state. github_updated_at itself uses GREATEST; github_created_at is preserved as immutable (omitted from UPDATE SET).';

-- ============================================================================
-- gh.set_discord_thread
--   Links a Discord forum thread to a mirrored issue. Idempotent for the
--   same thread_id. Refuses to remap an issue already linked to a
--   different thread (raises unique_violation). Locks the row FOR UPDATE
--   to serialize concurrent bot shards.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.set_discord_thread(
    p_owner       TEXT,
    p_repo        TEXT,
    p_number      INT,
    p_guild_id    BIGINT,
    p_channel_id  BIGINT,
    p_thread_id   BIGINT
)
RETURNS gh.issue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row     gh.issue;
    v_current BIGINT;
BEGIN
    SELECT discord_thread_id INTO v_current
    FROM gh.issue
    WHERE owner = p_owner AND repo = p_repo AND number = p_number
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'gh.issue not found for %/%/#%', p_owner, p_repo, p_number;
    END IF;

    IF v_current IS NOT NULL AND v_current <> p_thread_id THEN
        RAISE EXCEPTION 'gh.issue %/%/#% already mapped to thread %; refusing to remap to %',
            p_owner, p_repo, p_number, v_current, p_thread_id
            USING ERRCODE = 'unique_violation';
    END IF;

    UPDATE gh.issue
        SET discord_guild_id   = p_guild_id,
            discord_channel_id = p_channel_id,
            discord_thread_id  = p_thread_id
        WHERE owner = p_owner AND repo = p_repo AND number = p_number
        RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

ALTER FUNCTION gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT) OWNER TO service_role;

REVOKE ALL ON FUNCTION gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT)
    TO service_role;

COMMENT ON FUNCTION gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT) IS
'Idempotent for the same thread_id; refuses to remap an issue already linked to a different thread (raises unique_violation). Locks the row FOR UPDATE.';

-- ============================================================================
-- gh.record_event
--   Append-only insert into gh.issue_event. Webhook deliveries are
--   deduplicated on github_delivery_id via the partial unique index;
--   on conflict, returns the EXISTING row id so callers always get a
--   stable BIGINT contract instead of NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.record_event(
    p_owner              TEXT,
    p_repo               TEXT,
    p_number             INT,
    p_event_type         TEXT,
    p_actor              TEXT,
    p_payload            JSONB,
    p_github_delivery_id TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO gh.issue_event (owner, repo, number, event_type, actor, payload, github_delivery_id)
    VALUES (p_owner, p_repo, p_number, p_event_type, p_actor, p_payload, p_github_delivery_id)
    ON CONFLICT (github_delivery_id) WHERE github_delivery_id IS NOT NULL
        DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL AND p_github_delivery_id IS NOT NULL THEN
        SELECT id INTO v_id
        FROM gh.issue_event
        WHERE github_delivery_id = p_github_delivery_id;
    END IF;

    RETURN v_id;
END;
$$;

ALTER FUNCTION gh.record_event(TEXT, TEXT, INT, TEXT, TEXT, JSONB, TEXT) OWNER TO service_role;

REVOKE ALL ON FUNCTION gh.record_event(TEXT, TEXT, INT, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION gh.record_event(TEXT, TEXT, INT, TEXT, TEXT, JSONB, TEXT)
    TO service_role;

-- ============================================================================
-- gh.get_issue
--   Single-row read by (owner, repo, number). Backs the bot's
--   GithubStore L2 read path.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.get_issue(
    p_owner  TEXT,
    p_repo   TEXT,
    p_number INT
)
RETURNS gh.issue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT *
    FROM gh.issue
    WHERE owner = p_owner AND repo = p_repo AND number = p_number;
$$;

ALTER FUNCTION gh.get_issue(TEXT, TEXT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.get_issue(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.get_issue(TEXT, TEXT, INT) TO service_role;

-- ============================================================================
-- gh.list_open_issues
--   Set-returning read of open issues for a repo, ordered by recency.
--   Bounded by LEAST(GREATEST(p_limit, 1), 500) so accidental oversized
--   reads cannot DoS the bot. Backed by gh_issue_open_by_repo_updated_idx
--   (partial index avoids sorting).
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.list_open_issues(
    p_owner TEXT,
    p_repo  TEXT,
    p_limit INT DEFAULT 100
)
RETURNS SETOF gh.issue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 100
COST 50
AS $$
    SELECT *
    FROM gh.issue
    WHERE owner = p_owner AND repo = p_repo AND state = 'open'
    ORDER BY github_updated_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 500);
$$;

ALTER FUNCTION gh.list_open_issues(TEXT, TEXT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.list_open_issues(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.list_open_issues(TEXT, TEXT, INT) TO service_role;

-- ============================================================================
-- gh.claim_undelivered_events
--   Lease-based queue claim. Returns events that are either unclaimed
--   (state=0) or whose claim has expired (state=1 AND claimed_at <
--   now() - p_lease_secs). Sets state=1, claimed_at=now(), generates a
--   fresh claim_token UUID, increments delivery_attempts. Does NOT mark
--   delivered — caller must invoke mark_event_delivered with the returned
--   claim_token after Discord succeeds, or mark_event_failed on failure.
--
--   FOR UPDATE SKIP LOCKED + CTE-based UPDATE FROM keeps concurrent bot
--   shards from contending. claim_token forces every finalizer to prove
--   it owns the current lease — a stalled worker that finishes after
--   another worker reclaims the row will silently no-op rather than
--   double-deliver.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.claim_undelivered_events(
    p_limit       INT      DEFAULT 50,
    p_lease_secs  INT      DEFAULT 300
)
RETURNS TABLE (
    id                BIGINT,
    owner             TEXT,
    repo              TEXT,
    number            INT,
    event_type        TEXT,
    actor             TEXT,
    payload           JSONB,
    created_at        TIMESTAMPTZ,
    delivery_attempts INT,
    claim_token       UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
ROWS 50
COST 100
AS $$
DECLARE
    v_lease INTERVAL := make_interval(secs => GREATEST(p_lease_secs, 30));
BEGIN
    RETURN QUERY
    WITH claimable AS (
        SELECT inner_e.id
        FROM gh.issue_event inner_e
        WHERE inner_e.delivery_state = 0
           OR (
               inner_e.delivery_state = 1
               AND inner_e.claimed_at < now() - v_lease
           )
        ORDER BY inner_e.created_at ASC
        LIMIT LEAST(GREATEST(p_limit, 1), 250)
        FOR UPDATE SKIP LOCKED
    )
    UPDATE gh.issue_event e
        SET delivery_state    = 1,
            claimed_at        = now(),
            claim_token       = gen_random_uuid(),
            delivery_attempts = e.delivery_attempts + 1,
            updated_at        = now()
        FROM claimable c
        WHERE e.id = c.id
        RETURNING
            e.id, e.owner, e.repo, e.number, e.event_type, e.actor,
            e.payload, e.created_at, e.delivery_attempts, e.claim_token;
END;
$$;

ALTER FUNCTION gh.claim_undelivered_events(INT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.claim_undelivered_events(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.claim_undelivered_events(INT, INT) TO service_role;

COMMENT ON FUNCTION gh.claim_undelivered_events(INT, INT) IS
'Lease-based claim. Returns events that are either unclaimed (state=0) or whose claim has expired (state=1 AND claimed_at < now() - p_lease_secs). Sets state=1, claimed_at=now(), generates a fresh claim_token (UUID), increments delivery_attempts. Does NOT mark delivered — caller must invoke mark_event_delivered with the returned claim_token after Discord succeeds, or mark_event_failed on failure. claim_token is required by the finalizers so a stalled worker cannot finalize a row that another worker has since reclaimed.';

-- ============================================================================
-- gh.mark_event_delivered
--   Transitions delivery_state 1 → 2 once the bot reflects the event in
--   the matching Discord thread. Requires p_claim_token to match the
--   row's current claim_token — defends against the lost-lease window.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.mark_event_delivered(
    p_id          BIGINT,
    p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE gh.issue_event
        SET delivery_state = 2,
            delivered_at   = now(),
            claimed_at     = NULL,
            claim_token    = NULL,
            last_error     = NULL,
            updated_at     = now()
        WHERE id = p_id
          AND delivery_state = 1
          AND claim_token = p_claim_token;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION gh.mark_event_delivered(BIGINT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.mark_event_delivered(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.mark_event_delivered(BIGINT, UUID) TO service_role;

COMMENT ON FUNCTION gh.mark_event_delivered(BIGINT, UUID) IS
'Transitions delivery_state 1 → 2 once the bot reflects the event in the matching thread. Requires p_claim_token match the current claim_token on the row, so a stalled worker that finishes after lease expiry + reclaim by another worker is rejected. Returns false on rows not currently claimed by this worker (state != 1 or token mismatch).';

-- ============================================================================
-- gh.mark_event_failed
--   Release the lease + record last_error. Caller must be in state=1
--   with a matching claim_token. Auto-promotes 1 → 3 (dead_letter) when
--   delivery_attempts >= p_max_attempts, otherwise 1 → 0 (retryable).
--   Because delivery_attempts is incremented at claim time, a failure on
--   the N-th claimed attempt dead-letters when delivery_attempts >=
--   p_max_attempts at that point — i.e. p_max_attempts=1 dead-letters
--   the first failure, =25 dead-letters the 25th. Returns the new
--   delivery_state SMALLINT (NULL on no-op).
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.mark_event_failed(
    p_id           BIGINT,
    p_claim_token  UUID,
    p_error        TEXT,
    p_max_attempts INT DEFAULT 25
)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new_state SMALLINT;
BEGIN
    UPDATE gh.issue_event
        SET delivery_state = CASE
                                WHEN delivery_attempts >= GREATEST(p_max_attempts, 1) THEN 3
                                ELSE 0
                             END,
            claimed_at     = NULL,
            claim_token    = NULL,
            delivered_at   = NULL,
            last_error     = LEFT(COALESCE(p_error, ''), 2000),
            updated_at     = now()
        WHERE id = p_id
          AND delivery_state = 1
          AND claim_token = p_claim_token
        RETURNING delivery_state INTO v_new_state;

    RETURN v_new_state;
END;
$$;

ALTER FUNCTION gh.mark_event_failed(BIGINT, UUID, TEXT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.mark_event_failed(BIGINT, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.mark_event_failed(BIGINT, UUID, TEXT, INT) TO service_role;

COMMENT ON FUNCTION gh.mark_event_failed(BIGINT, UUID, TEXT, INT) IS
'Release the lease + record last_error. Caller must be in state=1 with a matching claim_token; rows already terminal (2/3), never claimed (0), or claimed by a different worker return NULL. Because delivery_attempts is incremented at claim time, a failure on the N-th claimed attempt dead-letters when delivery_attempts >= p_max_attempts at that point — i.e. p_max_attempts=1 dead-letters on the first failure, =25 on the 25th. Otherwise transitions 1 → 0 so the event becomes claimable again. last_error truncated to 2000 chars.';

-- ============================================================================
-- gh.event_queue_stats
--   Operational counter snapshot per delivery_state plus oldest pending
--   and oldest still-claimed timestamps. Used by the bot's health endpoint
--   to surface stuck workers, growing backlogs, or accumulating
--   dead-letters. Cheap full-table aggregate; fine to poll at minute
--   granularity.
-- ============================================================================

CREATE OR REPLACE FUNCTION gh.event_queue_stats()
RETURNS TABLE (
    pending           BIGINT,
    claimed           BIGINT,
    delivered         BIGINT,
    dead_letter       BIGINT,
    oldest_pending_at TIMESTAMPTZ,
    oldest_claimed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
COST 50
AS $$
    SELECT
        count(*) FILTER (WHERE delivery_state = 0) AS pending,
        count(*) FILTER (WHERE delivery_state = 1) AS claimed,
        count(*) FILTER (WHERE delivery_state = 2) AS delivered,
        count(*) FILTER (WHERE delivery_state = 3) AS dead_letter,
        min(created_at) FILTER (WHERE delivery_state = 0) AS oldest_pending_at,
        min(claimed_at) FILTER (WHERE delivery_state = 1) AS oldest_claimed_at
    FROM gh.issue_event;
$$;

ALTER FUNCTION gh.event_queue_stats() OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.event_queue_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.event_queue_stats() TO service_role;

COMMENT ON FUNCTION gh.event_queue_stats() IS
'Operational counter snapshot per delivery_state plus oldest pending and oldest still-claimed timestamps. Use to surface stuck workers, growing backlogs, or accumulating dead-letters. Cheap full-table aggregate, fine to poll at minute granularity.';



-- ============================================================================
-- DASHBOARD SERVICE RPCs — per-guild scope via repo allowlist intersection
--
-- gh.issue_event has no server_id column (per-guild routing happens at the
-- bot via the github_repos:<guild> vault row). The dashboard's gh-admin edge
-- function fetches that allowlist server-side and passes it into these RPCs
-- as TEXT[]; every function filters by repo_key = ANY(v_repos) so a guild
-- can only read or mutate events for repos it controls.
--
-- All raise distinct SQLSTATEs the edge layer translates into HTTP codes:
--   GH001 — invalid event id / bad p_before_ts                       (400)
--   GH002 — empty repo allowlist                                     (400)
--   GH003 — no valid repos                                           (400)
--   GH004 — event not found / out of scope / wrong state             (404)
--   GH005 — reason missing or too long                               (400)
--   GH006 — allowlist > 100 entries                                  (413)
--   GH007 — force requeue refused: event currently in-flight (1)     (409)
--   GH008 — force requeue refused: event already pending (0)         (409)
-- ============================================================================

CREATE OR REPLACE FUNCTION gh._normalize_repo_allowlist(
    p_repos TEXT[]
)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = gh, pg_temp
AS $$
    SELECT ARRAY(
        SELECT DISTINCT lower(btrim(r))
        FROM unnest(p_repos) AS r
        WHERE lower(btrim(r)) ~ '^[a-z0-9._-]{1,100}/[a-z0-9._-]{1,100}$'
        ORDER BY 1
    );
$$;

ALTER FUNCTION gh._normalize_repo_allowlist(TEXT[]) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh._normalize_repo_allowlist(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh._normalize_repo_allowlist(TEXT[]) TO service_role;

COMMENT ON FUNCTION gh._normalize_repo_allowlist(TEXT[]) IS
'Shared owner/repo[] normalizer for the dashboard service RPCs. Lowercases, trims, dedupes, regex-filters, sorts. IMMUTABLE STRICT.';


-- ----------------------------------------------------------------------------
-- gh.service_get_guild_event_stats
-- ----------------------------------------------------------------------------

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

    v_repos := gh._normalize_repo_allowlist(p_repos);

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
'Aggregate gh.issue_event counts + last-delivery timestamps for the supplied owner/repo allowlist. Filters via repo_key generated column. service_role only.';


-- ----------------------------------------------------------------------------
-- gh.service_get_recent_failed_events
-- ----------------------------------------------------------------------------

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

    v_repos := gh._normalize_repo_allowlist(p_repos);

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
'Failed-event tail (delivery_state=3) filtered by allowlist for dashboard requeue UI. service_role only.';


-- ----------------------------------------------------------------------------
-- gh.service_get_recent_pending_events
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gh.service_get_recent_pending_events(
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
    delivery_state    SMALLINT,
    delivery_attempts INT,
    created_at        TIMESTAMPTZ,
    claimed_at        TIMESTAMPTZ
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

    v_repos := gh._normalize_repo_allowlist(p_repos);

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
        e.delivery_state, e.delivery_attempts, e.created_at, e.claimed_at
    FROM gh.issue_event e
    WHERE e.repo_key = ANY(v_repos)
      AND e.delivery_state IN (0, 1)
    ORDER BY e.created_at ASC, e.id ASC
    LIMIT v_limit;
END;
$$;

ALTER FUNCTION gh.service_get_recent_pending_events(TEXT[], INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_get_recent_pending_events(TEXT[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_get_recent_pending_events(TEXT[], INT) TO service_role;

COMMENT ON FUNCTION gh.service_get_recent_pending_events(TEXT[], INT) IS
'Pending + in-flight event tail filtered by allowlist. Backed by gh_issue_event_pending_repo_tail_idx. service_role only.';


-- ----------------------------------------------------------------------------
-- gh.service_requeue_event
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gh.service_requeue_event(
    p_repos    TEXT[],
    p_event_id BIGINT,
    p_reason   TEXT DEFAULT NULL
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
    v_repos            TEXT[];
    v_reason           TEXT;
    v_owner            TEXT;
    v_repo             TEXT;
    v_repo_key         TEXT;
    v_number           INT;
    v_event_type       TEXT;
    v_old_state        SMALLINT;
    v_old_attempts     INT;
    v_old_claim_token  UUID;
    v_old_claimed_at   TIMESTAMPTZ;
    v_old_delivered_at TIMESTAMPTZ;
    v_old_last_error   TEXT;
    v_updated_id       BIGINT;
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

    v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
    IF v_reason IS NOT NULL AND char_length(v_reason) > 512 THEN
        RAISE EXCEPTION 'p_reason cannot exceed 512 characters'
            USING ERRCODE = 'GH005';
    END IF;

    v_repos := gh._normalize_repo_allowlist(p_repos);

    IF COALESCE(cardinality(v_repos), 0) = 0 THEN
        RAISE EXCEPTION 'p_repos contained no valid owner/repo entries'
            USING ERRCODE = 'GH003';
    END IF;

    IF cardinality(v_repos) > 100 THEN
        RAISE EXCEPTION 'p_repos cannot contain more than 100 entries'
            USING ERRCODE = 'GH006';
    END IF;

    SELECT
        e.owner, e.repo, e.repo_key, e.number, e.event_type,
        e.delivery_state, e.delivery_attempts, e.claim_token,
        e.claimed_at, e.delivered_at, e.last_error
      INTO
        v_owner, v_repo, v_repo_key, v_number, v_event_type,
        v_old_state, v_old_attempts, v_old_claim_token,
        v_old_claimed_at, v_old_delivered_at, v_old_last_error
    FROM gh.issue_event e
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
      AND e.delivery_state = 3
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'event not found, not in this guild''s allowlist, or not in failed state'
            USING ERRCODE = 'GH004';
    END IF;

    UPDATE gh.issue_event e
    SET delivery_state = 0,
        claim_token    = NULL,
        claimed_at     = NULL,
        delivered_at   = NULL,
        last_error     = NULL,
        updated_at     = now()
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
      AND e.delivery_state = 3
    RETURNING e.id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RAISE EXCEPTION 'requeue update affected zero rows (concurrent state change)'
            USING ERRCODE = 'GH004';
    END IF;

    INSERT INTO gh.requeue_audit (
        issue_event_id, repo_key, owner, repo, number, event_type,
        repos, reason, old_state, old_attempts, old_claim_token,
        old_claimed_at, old_delivered_at, old_last_error, forced
    ) VALUES (
        p_event_id, v_repo_key, v_owner, v_repo, v_number, v_event_type,
        v_repos, v_reason, v_old_state, v_old_attempts, v_old_claim_token,
        v_old_claimed_at, v_old_delivered_at,
        left(v_old_last_error, 2048), FALSE
    );

    RETURN QUERY
    SELECT v_updated_id, 0::SMALLINT, v_old_attempts;
END;
$$;

ALTER FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) IS
'Reset a failed gh.issue_event row back to pending. Allowlist-scoped, failed-only, preserves delivery_attempts. Captures full pre-reset context (claim_token, claimed_at, delivered_at, last_error) into gh.requeue_audit. SQLSTATEs GH001/GH002/GH003/GH004/GH005/GH006. service_role only.';


-- ----------------------------------------------------------------------------
-- gh.service_force_requeue_event
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gh.service_force_requeue_event(
    p_repos    TEXT[],
    p_event_id BIGINT,
    p_reason   TEXT
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
    v_repos            TEXT[];
    v_reason           TEXT;
    v_owner            TEXT;
    v_repo             TEXT;
    v_repo_key         TEXT;
    v_number           INT;
    v_event_type       TEXT;
    v_old_state        SMALLINT;
    v_old_attempts     INT;
    v_old_claim_token  UUID;
    v_old_claimed_at   TIMESTAMPTZ;
    v_old_delivered_at TIMESTAMPTZ;
    v_old_last_error   TEXT;
    v_updated_id       BIGINT;
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

    v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'p_reason is required for forced requeue'
            USING ERRCODE = 'GH005';
    END IF;
    IF char_length(v_reason) > 512 THEN
        RAISE EXCEPTION 'p_reason cannot exceed 512 characters'
            USING ERRCODE = 'GH005';
    END IF;

    v_repos := gh._normalize_repo_allowlist(p_repos);

    IF COALESCE(cardinality(v_repos), 0) = 0 THEN
        RAISE EXCEPTION 'p_repos contained no valid owner/repo entries'
            USING ERRCODE = 'GH003';
    END IF;

    IF cardinality(v_repos) > 100 THEN
        RAISE EXCEPTION 'p_repos cannot contain more than 100 entries'
            USING ERRCODE = 'GH006';
    END IF;

    SELECT
        e.owner, e.repo, e.repo_key, e.number, e.event_type,
        e.delivery_state, e.delivery_attempts, e.claim_token,
        e.claimed_at, e.delivered_at, e.last_error
      INTO
        v_owner, v_repo, v_repo_key, v_number, v_event_type,
        v_old_state, v_old_attempts, v_old_claim_token,
        v_old_claimed_at, v_old_delivered_at, v_old_last_error
    FROM gh.issue_event e
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'event not found or not in this guild''s allowlist'
            USING ERRCODE = 'GH004';
    END IF;

    IF v_old_state = 1 THEN
        RAISE EXCEPTION 'cannot force requeue an in-flight event (delivery_state=1); wait for lease timeout'
            USING ERRCODE = 'GH007';
    END IF;
    IF v_old_state = 0 THEN
        RAISE EXCEPTION 'event is already pending (delivery_state=0); no requeue needed'
            USING ERRCODE = 'GH008';
    END IF;

    UPDATE gh.issue_event e
    SET delivery_state = 0,
        claim_token    = NULL,
        claimed_at     = NULL,
        delivered_at   = NULL,
        last_error     = NULL,
        updated_at     = now()
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
      AND e.delivery_state NOT IN (0, 1)
    RETURNING e.id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RAISE EXCEPTION 'force requeue update affected zero rows (concurrent state change)'
            USING ERRCODE = 'GH004';
    END IF;

    INSERT INTO gh.requeue_audit (
        issue_event_id, repo_key, owner, repo, number, event_type,
        repos, reason, old_state, old_attempts, old_claim_token,
        old_claimed_at, old_delivered_at, old_last_error, forced
    ) VALUES (
        p_event_id, v_repo_key, v_owner, v_repo, v_number, v_event_type,
        v_repos, v_reason, v_old_state, v_old_attempts, v_old_claim_token,
        v_old_claimed_at, v_old_delivered_at,
        left(v_old_last_error, 2048), TRUE
    );

    RETURN QUERY
    SELECT v_updated_id, 0::SMALLINT, v_old_attempts;
END;
$$;

ALTER FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) IS
'Ops escape hatch: replay any allowlist-scoped event in delivery_state 2 (delivered) or 3 (failed). Refuses 1 (in-flight) with GH007 and 0 (already pending) with GH008. Requires non-empty p_reason; logs forced=TRUE in gh.requeue_audit. service_role only; should NOT be wired to a normal dashboard button.';


-- ----------------------------------------------------------------------------
-- gh.service_purge_old_delivered
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gh.service_purge_old_delivered(
    p_before_ts TIMESTAMPTZ,
    p_limit     INT DEFAULT 1000
)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = gh, pg_temp
COST 200
AS $$
DECLARE
    v_limit   INT;
    v_deleted BIGINT;
BEGIN
    PERFORM set_config('lock_timeout', '2s', true);
    PERFORM set_config('statement_timeout', '30s', true);

    IF p_before_ts IS NULL THEN
        RAISE EXCEPTION 'p_before_ts is required'
            USING ERRCODE = 'GH001';
    END IF;
    IF p_before_ts > now() - interval '1 day' THEN
        RAISE EXCEPTION 'p_before_ts must be at least 1 day in the past'
            USING ERRCODE = 'GH001';
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 10000);

    WITH victims AS (
        SELECT id
        FROM gh.issue_event
        WHERE delivery_state = 2
          AND delivered_at < p_before_ts
        ORDER BY delivered_at ASC, id ASC
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    DELETE FROM gh.issue_event e
    USING victims v
    WHERE e.id = v.id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

ALTER FUNCTION gh.service_purge_old_delivered(TIMESTAMPTZ, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_purge_old_delivered(TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_purge_old_delivered(TIMESTAMPTZ, INT) TO service_role;

COMMENT ON FUNCTION gh.service_purge_old_delivered(TIMESTAMPTZ, INT) IS
'Retention sweep: delete delivered events older than p_before_ts in capped batches (max 10k). Backed by gh_issue_event_delivered_retention_idx. SKIP LOCKED avoids blocking the bot. gh.requeue_audit rows survive because they no longer FK to gh.issue_event. service_role only.';
