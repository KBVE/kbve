-- migrate:up

CREATE SCHEMA IF NOT EXISTS gh;

REVOKE ALL ON SCHEMA gh FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA gh TO service_role;

CREATE TABLE IF NOT EXISTS gh.issue (
    owner               TEXT        NOT NULL,
    repo                TEXT        NOT NULL,
    number              INT         NOT NULL,
    title               TEXT        NOT NULL,
    state               TEXT        NOT NULL,
    body                TEXT,
    labels              JSONB       NOT NULL DEFAULT '[]'::jsonb,
    assignees           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    author              TEXT,
    html_url            TEXT        NOT NULL,
    is_pull_request     BOOLEAN     NOT NULL DEFAULT FALSE,
    github_node_id      TEXT,
    github_created_at   TIMESTAMPTZ NOT NULL,
    github_updated_at   TIMESTAMPTZ NOT NULL,
    closed_at           TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    discord_guild_id    BIGINT,
    discord_channel_id  BIGINT,
    discord_thread_id   BIGINT,
    PRIMARY KEY (owner, repo, number),
    CONSTRAINT gh_issue_owner_shape_chk  CHECK (owner ~ '^[A-Za-z0-9_.-]{1,100}$'),
    CONSTRAINT gh_issue_repo_shape_chk   CHECK (repo  ~ '^[A-Za-z0-9_.-]{1,100}$'),
    CONSTRAINT gh_issue_number_pos_chk   CHECK (number > 0),
    CONSTRAINT gh_issue_state_chk        CHECK (state IN ('open', 'closed')),
    CONSTRAINT gh_issue_labels_array_chk    CHECK (jsonb_typeof(labels)    = 'array'),
    CONSTRAINT gh_issue_assignees_array_chk CHECK (jsonb_typeof(assignees) = 'array'),
    CONSTRAINT gh_issue_discord_guild_pos_chk
        CHECK (discord_guild_id   IS NULL OR discord_guild_id   > 0),
    CONSTRAINT gh_issue_discord_channel_pos_chk
        CHECK (discord_channel_id IS NULL OR discord_channel_id > 0),
    CONSTRAINT gh_issue_discord_thread_pos_chk
        CHECK (discord_thread_id  IS NULL OR discord_thread_id  > 0),
    CONSTRAINT gh_issue_discord_mapping_all_or_none_chk CHECK (
        (
            discord_guild_id   IS NULL
            AND discord_channel_id IS NULL
            AND discord_thread_id  IS NULL
        )
        OR
        (
            discord_guild_id   IS NOT NULL
            AND discord_channel_id IS NOT NULL
            AND discord_thread_id  IS NOT NULL
        )
    ),
    CONSTRAINT gh_issue_updated_after_created_chk
        CHECK (github_updated_at >= github_created_at),
    CONSTRAINT gh_issue_closed_after_created_chk
        CHECK (closed_at IS NULL OR closed_at >= github_created_at),
    CONSTRAINT gh_issue_open_has_no_closed_at_chk
        CHECK (state <> 'open' OR closed_at IS NULL)
);

CREATE INDEX IF NOT EXISTS gh_issue_open_by_repo_updated_idx
    ON gh.issue (owner, repo, github_updated_at DESC)
    WHERE state = 'open';

CREATE INDEX IF NOT EXISTS gh_issue_updated_idx
    ON gh.issue (github_updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS gh_issue_discord_thread_unique
    ON gh.issue (discord_thread_id)
    WHERE discord_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS gh.issue_event (
    id                   BIGSERIAL PRIMARY KEY,
    owner                TEXT        NOT NULL,
    repo                 TEXT        NOT NULL,
    number               INT         NOT NULL,
    event_type           TEXT        NOT NULL,
    actor                TEXT,
    payload              JSONB       NOT NULL,
    github_delivery_id   TEXT,
    delivery_state       SMALLINT    NOT NULL DEFAULT 0,
    delivered_at         TIMESTAMPTZ,
    claimed_at           TIMESTAMPTZ,
    claim_token          UUID,
    delivery_attempts    INT         NOT NULL DEFAULT 0,
    last_error           TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (owner, repo, number)
        REFERENCES gh.issue (owner, repo, number)
        ON DELETE CASCADE,
    CONSTRAINT gh_issue_event_type_shape_chk
        CHECK (event_type ~ '^[A-Za-z0-9_.:-]{1,80}$'),
    CONSTRAINT gh_issue_event_attempts_chk
        CHECK (delivery_attempts >= 0),
    CONSTRAINT gh_issue_event_state_chk
        CHECK (delivery_state IN (0, 1, 2, 3)),
    CONSTRAINT gh_issue_event_payload_object_chk
        CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT gh_issue_event_claimed_after_created_chk
        CHECK (claimed_at IS NULL OR claimed_at >= created_at),
    CONSTRAINT gh_issue_event_delivered_after_created_chk
        CHECK (delivered_at IS NULL OR delivered_at >= created_at),
    CONSTRAINT gh_issue_event_claim_token_when_claimed_chk
        CHECK (delivery_state <> 1 OR claim_token IS NOT NULL),
    CONSTRAINT gh_issue_event_claim_token_only_when_claimed_chk
        CHECK (delivery_state = 1 OR claim_token IS NULL),
    CONSTRAINT gh_issue_event_claimed_at_when_claimed_chk
        CHECK (delivery_state <> 1 OR claimed_at IS NOT NULL),
    CONSTRAINT gh_issue_event_claimed_at_only_when_claimed_chk
        CHECK (delivery_state = 1 OR claimed_at IS NULL),
    CONSTRAINT gh_issue_event_delivered_at_when_delivered_chk
        CHECK (delivery_state <> 2 OR delivered_at IS NOT NULL)
);

COMMENT ON COLUMN gh.issue_event.delivery_state IS
'0=pending (claimable), 1=claimed (in-flight, lease expires at claimed_at + p_lease_secs), 2=delivered (terminal success), 3=dead_letter (terminal failure, retries exhausted).';

CREATE INDEX IF NOT EXISTS gh_issue_event_pending_claim_idx
    ON gh.issue_event (created_at, id)
    WHERE delivery_state = 0;

CREATE INDEX IF NOT EXISTS gh_issue_event_expired_claim_idx
    ON gh.issue_event (claimed_at, created_at, id)
    WHERE delivery_state = 1;

CREATE INDEX IF NOT EXISTS gh_issue_event_dead_letter_idx
    ON gh.issue_event (updated_at DESC, id DESC)
    WHERE delivery_state = 3;

CREATE INDEX IF NOT EXISTS gh_issue_event_lookup_idx
    ON gh.issue_event (owner, repo, number, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS gh_issue_event_delivery_unique
    ON gh.issue_event (github_delivery_id)
    WHERE github_delivery_id IS NOT NULL;

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

ALTER SCHEMA gh OWNER TO service_role;
ALTER TABLE gh.issue OWNER TO service_role;
ALTER TABLE gh.issue_event OWNER TO service_role;
ALTER SEQUENCE gh.issue_event_id_seq OWNER TO service_role;

COMMENT ON SCHEMA gh IS
'L2 cache for GitHub issue/PR metadata + append-only event queue feeding the discordsh thread sync. Mirror-only, RPC-only surface (no direct table grants), owned by service_role.';
COMMENT ON TABLE gh.issue IS
'Mirror of the latest GitHub issue/PR state for allowlisted repos. discord_thread_id is set once the bot creates a forum thread for the issue. Unique partial index on discord_thread_id prevents one thread mapping to multiple issues.';
COMMENT ON TABLE gh.issue_event IS
'Event queue for upstream GitHub events (opened/closed/labeled/assigned/commented). Row facts (owner/repo/number/event_type/payload/...) are immutable after insert; delivery_state + claimed_at + delivered_at + delivery_attempts + last_error mutate as the worker processes the event. Lease-based: claim_undelivered_events transitions 0→1 + bumps attempts; mark_event_delivered transitions 1→2 on Discord success; mark_event_failed transitions 1→0 (retryable) or 1→3 (dead_letter after p_max_attempts).';
COMMENT ON FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Atomic upsert from the gh-webhook edge function. All mutable fields are gated on EXCLUDED.github_updated_at >= existing.github_updated_at so out-of-order or stale webhook deliveries cannot regress newer state. github_updated_at itself uses GREATEST.';
COMMENT ON FUNCTION gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT) IS
'Idempotent for the same thread_id; refuses to remap an issue already linked to a different thread (raises unique_violation). Locks the row FOR UPDATE.';
COMMENT ON FUNCTION gh.claim_undelivered_events(INT, INT) IS
'Lease-based claim. Returns events that are either unclaimed (state=0) or whose claim has expired (state=1 AND claimed_at < now() - p_lease_secs). Sets state=1, claimed_at=now(), generates a fresh claim_token (UUID), increments delivery_attempts. Does NOT mark delivered — caller must invoke mark_event_delivered with the returned claim_token after Discord succeeds, or mark_event_failed on failure. claim_token is required by the finalizers so a stalled worker cannot finalize a row that another worker has since reclaimed.';
COMMENT ON FUNCTION gh.mark_event_delivered(BIGINT, UUID) IS
'Transitions delivery_state 1 → 2 once the bot reflects the event in the matching thread. Requires p_claim_token match the current claim_token on the row, so a stalled worker that finishes after lease expiry + reclaim by another worker is rejected. Returns false on rows not currently claimed by this worker (state != 1 or token mismatch).';
COMMENT ON FUNCTION gh.mark_event_failed(BIGINT, UUID, TEXT, INT) IS
'Release the lease + record last_error. Caller must be in state=1 with a matching claim_token; rows already terminal (2/3), never claimed (0), or claimed by a different worker return NULL. Because delivery_attempts is incremented at claim time, a failure on the N-th claimed attempt dead-letters when delivery_attempts >= p_max_attempts at that point — i.e. p_max_attempts=1 dead-letters on the first failure, =25 on the 25th. Otherwise transitions 1 → 0 so the event becomes claimable again. last_error truncated to 2000 chars.';
COMMENT ON FUNCTION gh.event_queue_stats() IS
'Operational counter snapshot per delivery_state plus oldest pending and oldest still-claimed timestamps. Use to surface stuck workers, growing backlogs, or accumulating dead-letters. Cheap full-table aggregate, fine to poll at minute granularity.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS gh.event_queue_stats();
DROP FUNCTION IF EXISTS gh.mark_event_failed(BIGINT, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS gh.mark_event_delivered(BIGINT, UUID);
DROP FUNCTION IF EXISTS gh.claim_undelivered_events(INT, INT);
DROP FUNCTION IF EXISTS gh.list_open_issues(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS gh.get_issue(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS gh.record_event(TEXT, TEXT, INT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
);
DROP TABLE IF EXISTS gh.issue_event;
DROP TABLE IF EXISTS gh.issue;
DROP SCHEMA IF EXISTS gh;
NOTIFY pgrst, 'reload schema';
