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
    CONSTRAINT gh_issue_state_chk        CHECK (state IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS gh_issue_state_idx
    ON gh.issue (owner, repo, state);

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
    delivered_to_discord BOOLEAN     NOT NULL DEFAULT FALSE,
    delivered_at         TIMESTAMPTZ,
    claimed_at           TIMESTAMPTZ,
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
        CHECK (delivery_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS gh_issue_event_undelivered_idx
    ON gh.issue_event (created_at)
    WHERE delivered_to_discord = FALSE;

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
            github_node_id    = COALESCE(EXCLUDED.github_node_id, gh.issue.github_node_id),
            github_created_at = EXCLUDED.github_created_at,
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
    delivery_attempts INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lease INTERVAL := make_interval(secs => GREATEST(p_lease_secs, 30));
BEGIN
    RETURN QUERY
    UPDATE gh.issue_event e
        SET claimed_at        = now(),
            delivery_attempts = e.delivery_attempts + 1,
            updated_at        = now()
        WHERE e.id IN (
            SELECT inner_e.id
            FROM gh.issue_event inner_e
            WHERE inner_e.delivered_to_discord = FALSE
              AND (inner_e.claimed_at IS NULL OR inner_e.claimed_at < now() - v_lease)
            ORDER BY inner_e.created_at ASC
            LIMIT LEAST(GREATEST(p_limit, 1), 250)
            FOR UPDATE SKIP LOCKED
        )
        RETURNING
            e.id, e.owner, e.repo, e.number, e.event_type, e.actor,
            e.payload, e.created_at, e.delivery_attempts;
END;
$$;

ALTER FUNCTION gh.claim_undelivered_events(INT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.claim_undelivered_events(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.claim_undelivered_events(INT, INT) TO service_role;

CREATE OR REPLACE FUNCTION gh.mark_event_delivered(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE gh.issue_event
        SET delivered_to_discord = TRUE,
            delivered_at         = now(),
            claimed_at           = NULL,
            last_error           = NULL,
            updated_at           = now()
        WHERE id = p_id
          AND delivered_to_discord = FALSE;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION gh.mark_event_delivered(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.mark_event_delivered(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.mark_event_delivered(BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION gh.mark_event_failed(p_id BIGINT, p_error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE gh.issue_event
        SET claimed_at = NULL,
            last_error = LEFT(COALESCE(p_error, ''), 2000),
            updated_at = now()
        WHERE id = p_id
          AND delivered_to_discord = FALSE;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

ALTER FUNCTION gh.mark_event_failed(BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.mark_event_failed(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.mark_event_failed(BIGINT, TEXT) TO service_role;

ALTER SCHEMA gh OWNER TO service_role;
ALTER TABLE gh.issue OWNER TO service_role;
ALTER TABLE gh.issue_event OWNER TO service_role;
ALTER SEQUENCE gh.issue_event_id_seq OWNER TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA gh
    GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMENT ON SCHEMA gh IS
'L2 cache for GitHub issue/PR metadata + append-only event queue feeding the discordsh thread sync. Mirror-only, RPC-only surface (no direct table grants), owned by service_role.';
COMMENT ON TABLE gh.issue IS
'Mirror of the latest GitHub issue/PR state for allowlisted repos. discord_thread_id is set once the bot creates a forum thread for the issue. Unique partial index on discord_thread_id prevents one thread mapping to multiple issues.';
COMMENT ON TABLE gh.issue_event IS
'Append-only stream of upstream GitHub events (opened/closed/labeled/assigned/commented). Lease-based delivery: claim_undelivered_events sets claimed_at + bumps delivery_attempts; mark_event_delivered flips delivered_to_discord on Discord success; mark_event_failed records the error and releases the claim so it can be retried after the lease window.';
COMMENT ON FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Atomic upsert from the gh-webhook edge function. All mutable fields are gated on EXCLUDED.github_updated_at >= existing.github_updated_at so out-of-order or stale webhook deliveries cannot regress newer state. github_updated_at itself uses GREATEST.';
COMMENT ON FUNCTION gh.set_discord_thread(TEXT, TEXT, INT, BIGINT, BIGINT, BIGINT) IS
'Idempotent for the same thread_id; refuses to remap an issue already linked to a different thread (raises unique_violation). Locks the row FOR UPDATE.';
COMMENT ON FUNCTION gh.claim_undelivered_events(INT, INT) IS
'Lease-based claim. Returns events that are either unclaimed or whose claim has expired (claimed_at < now() - p_lease_secs). Sets claimed_at, increments delivery_attempts. Does NOT mark delivered — caller must invoke mark_event_delivered after the Discord side succeeds, or mark_event_failed on failure so the lease releases for retry.';
COMMENT ON FUNCTION gh.mark_event_delivered(BIGINT) IS
'Flips delivered_to_discord = true once the bot has reflected the event in the matching thread. Idempotent — returns false if already delivered.';
COMMENT ON FUNCTION gh.mark_event_failed(BIGINT, TEXT) IS
'Release the lease + record the last error so the event becomes claimable again. last_error is truncated to 2000 chars.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS gh.mark_event_failed(BIGINT, TEXT);
DROP FUNCTION IF EXISTS gh.mark_event_delivered(BIGINT);
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
