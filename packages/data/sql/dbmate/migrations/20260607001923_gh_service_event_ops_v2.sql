-- migrate:up
SET search_path = public, pg_catalog;

-- Follow-up to 20260606120000_gh_service_event_ops.sql. Adds an audit table
-- for manual requeues, expands service_requeue_event to accept an optional
-- p_reason (logging into the audit table), and ships two new RPCs:
--   - gh.service_force_requeue_event(...) — ops escape hatch for non-failed
--     events, gated behind a required reason.
--   - gh.service_get_recent_pending_events(...) — in-flight queue tail so
--     the dashboard can show what's backed up when failed_count=0 but
--     queue_depth>0.
--   - gh.service_purge_old_delivered(...) — retention sweep for the bot's
--     append-only event log.

-- ============================================================================
-- TABLE: gh.requeue_audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS gh.requeue_audit (
    id              BIGSERIAL    PRIMARY KEY,
    issue_event_id  BIGINT       NOT NULL REFERENCES gh.issue_event (id) ON DELETE CASCADE,
    repos           TEXT[]       NOT NULL,
    reason          TEXT,
    old_state       SMALLINT     NOT NULL,
    old_attempts    INT          NOT NULL,
    forced          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT gh_requeue_audit_reason_len_chk
        CHECK (reason IS NULL OR char_length(reason) <= 512),
    CONSTRAINT gh_requeue_audit_old_state_chk
        CHECK (old_state IN (0, 1, 2, 3))
);

COMMENT ON TABLE gh.requeue_audit IS
    'Append-only audit trail of manual gh.issue_event requeues triggered by the dashboard / ops tooling. service_role only.';

CREATE INDEX IF NOT EXISTS gh_requeue_audit_event_created_idx
    ON gh.requeue_audit (issue_event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gh_requeue_audit_created_idx
    ON gh.requeue_audit (created_at DESC);

ALTER TABLE gh.requeue_audit OWNER TO service_role;
ALTER SEQUENCE gh.requeue_audit_id_seq OWNER TO service_role;


-- ============================================================================
-- DROP old 2-arg service_requeue_event so we can replace it with the new
-- 3-arg signature (adds p_reason). Drop after creating the audit table so
-- the FK is in place by the time the new function references it.
-- ============================================================================

DROP FUNCTION IF EXISTS gh.service_requeue_event(TEXT[], BIGINT);


-- ============================================================================
-- gh.service_requeue_event(TEXT[], BIGINT, TEXT)
-- ============================================================================

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
    v_repos        TEXT[];
    v_old_state    SMALLINT;
    v_old_attempts INT;
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

    IF p_reason IS NOT NULL AND char_length(p_reason) > 512 THEN
        RAISE EXCEPTION 'p_reason cannot exceed 512 characters'
            USING ERRCODE = 'GH005';
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

    SELECT e.delivery_state, e.delivery_attempts
      INTO v_old_state, v_old_attempts
    FROM gh.issue_event e
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
      AND e.delivery_state = 3
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'event not found, not in this guild''s allowlist, or not in failed state'
            USING ERRCODE = 'GH004';
    END IF;

    RETURN QUERY
    UPDATE gh.issue_event e
    SET delivery_state = 0,
        claim_token    = NULL,
        claimed_at     = NULL,
        delivered_at   = NULL,
        last_error     = NULL,
        updated_at     = now()
    WHERE e.id = p_event_id
    RETURNING e.id, e.delivery_state, e.delivery_attempts;

    INSERT INTO gh.requeue_audit (
        issue_event_id, repos, reason, old_state, old_attempts, forced
    ) VALUES (
        p_event_id, v_repos, p_reason, v_old_state, v_old_attempts, FALSE
    );
END;
$$;

ALTER FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION gh.service_requeue_event(TEXT[], BIGINT, TEXT) IS
    'Reset a single failed gh.issue_event row back to pending so gh_sync claims it again. Allowlist-scoped, failed-only, preserves delivery_attempts, writes a row to gh.requeue_audit. SQLSTATEs GH001/GH002/GH003/GH004/GH005/GH006. service_role only.';


-- ============================================================================
-- gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) — ops escape hatch
-- ============================================================================

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
    v_repos        TEXT[];
    v_old_state    SMALLINT;
    v_old_attempts INT;
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

    IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'p_reason is required for forced requeue'
            USING ERRCODE = 'GH005';
    END IF;

    IF char_length(p_reason) > 512 THEN
        RAISE EXCEPTION 'p_reason cannot exceed 512 characters'
            USING ERRCODE = 'GH005';
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

    SELECT e.delivery_state, e.delivery_attempts
      INTO v_old_state, v_old_attempts
    FROM gh.issue_event e
    WHERE e.id = p_event_id
      AND e.repo_key = ANY(v_repos)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'event not found or not in this guild''s allowlist'
            USING ERRCODE = 'GH004';
    END IF;

    RETURN QUERY
    UPDATE gh.issue_event e
    SET delivery_state = 0,
        claim_token    = NULL,
        claimed_at     = NULL,
        delivered_at   = NULL,
        last_error     = NULL,
        updated_at     = now()
    WHERE e.id = p_event_id
    RETURNING e.id, e.delivery_state, e.delivery_attempts;

    INSERT INTO gh.requeue_audit (
        issue_event_id, repos, reason, old_state, old_attempts, forced
    ) VALUES (
        p_event_id, v_repos, p_reason, v_old_state, v_old_attempts, TRUE
    );
END;
$$;

ALTER FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) TO service_role;

COMMENT ON FUNCTION gh.service_force_requeue_event(TEXT[], BIGINT, TEXT) IS
    'Ops escape hatch: replay any allowlist-scoped event regardless of delivery_state. Requires non-empty p_reason and logs forced=TRUE in gh.requeue_audit. service_role only; should NOT be wired to a normal dashboard button.';


-- ============================================================================
-- gh.service_get_recent_pending_events(TEXT[], INT)
-- ============================================================================

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
    'Pending + in-flight event tail filtered by allowlist. Use to surface what is backed up when queue_depth > 0 but failed_count = 0. service_role only.';


-- ============================================================================
-- gh.service_purge_old_delivered(TIMESTAMPTZ, INT)
-- ============================================================================

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
    'Retention sweep: delete delivered events older than p_before_ts in capped batches (max 10k). SKIP LOCKED avoids blocking the bot. service_role only; intended for a periodic cron from gh-admin or a workflow.';


-- migrate:down
DROP FUNCTION IF EXISTS gh.service_purge_old_delivered(TIMESTAMPTZ, INT);
DROP FUNCTION IF EXISTS gh.service_get_recent_pending_events(TEXT[], INT);
DROP FUNCTION IF EXISTS gh.service_force_requeue_event(TEXT[], BIGINT, TEXT);
DROP FUNCTION IF EXISTS gh.service_requeue_event(TEXT[], BIGINT, TEXT);

-- Recreate the pre-v2 2-arg form from 20260606120000_gh_service_event_ops.sql
-- so a rollback puts the dashboard requeue path back on its prior surface.
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

DROP INDEX IF EXISTS gh.gh_requeue_audit_created_idx;
DROP INDEX IF EXISTS gh.gh_requeue_audit_event_created_idx;
DROP TABLE IF EXISTS gh.requeue_audit;
