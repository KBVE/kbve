-- migrate:up

CREATE SCHEMA IF NOT EXISTS gh;

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
    PRIMARY KEY (owner, repo, number)
);

CREATE INDEX IF NOT EXISTS gh_issue_state_idx
    ON gh.issue (owner, repo, state);

CREATE INDEX IF NOT EXISTS gh_issue_updated_idx
    ON gh.issue (github_updated_at DESC);

CREATE INDEX IF NOT EXISTS gh_issue_thread_idx
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
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (owner, repo, number)
        REFERENCES gh.issue (owner, repo, number)
        ON DELETE CASCADE
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
        p_title, p_state, p_body, COALESCE(p_labels, '[]'::jsonb), COALESCE(p_assignees, '[]'::jsonb),
        p_author, p_html_url,
        p_is_pull_request, p_github_node_id,
        p_github_created_at, p_github_updated_at, p_closed_at, now()
    )
    ON CONFLICT (owner, repo, number) DO UPDATE
        SET title             = EXCLUDED.title,
            state             = EXCLUDED.state,
            body              = EXCLUDED.body,
            labels            = EXCLUDED.labels,
            assignees         = EXCLUDED.assignees,
            author            = EXCLUDED.author,
            html_url          = EXCLUDED.html_url,
            is_pull_request   = EXCLUDED.is_pull_request,
            github_node_id    = COALESCE(EXCLUDED.github_node_id, gh.issue.github_node_id),
            github_created_at = EXCLUDED.github_created_at,
            github_updated_at = GREATEST(gh.issue.github_updated_at, EXCLUDED.github_updated_at),
            closed_at         = EXCLUDED.closed_at,
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
    v_row gh.issue;
BEGIN
    UPDATE gh.issue
        SET discord_guild_id   = p_guild_id,
            discord_channel_id = p_channel_id,
            discord_thread_id  = p_thread_id
        WHERE owner = p_owner AND repo = p_repo AND number = p_number
        RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'gh.issue not found for %/%/#%', p_owner, p_repo, p_number;
    END IF;

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
    LIMIT GREATEST(p_limit, 1);
$$;

ALTER FUNCTION gh.list_open_issues(TEXT, TEXT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.list_open_issues(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.list_open_issues(TEXT, TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION gh.claim_undelivered_events(
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id           BIGINT,
    owner        TEXT,
    repo         TEXT,
    number       INT,
    event_type   TEXT,
    actor        TEXT,
    payload      JSONB,
    created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    UPDATE gh.issue_event e
        SET delivered_to_discord = TRUE,
            delivered_at = now()
        WHERE e.id IN (
            SELECT inner_e.id
            FROM gh.issue_event inner_e
            WHERE inner_e.delivered_to_discord = FALSE
            ORDER BY inner_e.created_at ASC
            LIMIT GREATEST(p_limit, 1)
            FOR UPDATE SKIP LOCKED
        )
        RETURNING
            e.id, e.owner, e.repo, e.number, e.event_type, e.actor,
            e.payload, e.created_at;
END;
$$;

ALTER FUNCTION gh.claim_undelivered_events(INT) OWNER TO service_role;

REVOKE ALL ON FUNCTION gh.claim_undelivered_events(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.claim_undelivered_events(INT) TO service_role;

GRANT USAGE ON SCHEMA gh TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gh TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gh TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA gh
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA gh
    GRANT USAGE, SELECT ON SEQUENCES TO service_role;

COMMENT ON SCHEMA gh IS
'L2 cache for GitHub issue/PR metadata + append-only event queue feeding the discordsh thread sync. Mirror-only, owned by service_role.';
COMMENT ON TABLE gh.issue IS
'Mirror of the latest GitHub issue/PR state for allowlisted repos. discord_thread_id is set once the bot creates a forum thread for the issue.';
COMMENT ON TABLE gh.issue_event IS
'Append-only stream of upstream GitHub events (opened/closed/labeled/assigned/commented). delivered_to_discord flips true once the bot has reflected the event in the matching thread.';
COMMENT ON FUNCTION gh.upsert_issue(
    TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Atomic upsert from the gh-webhook edge function. github_updated_at uses GREATEST to swallow out-of-order webhook deliveries.';
COMMENT ON FUNCTION gh.claim_undelivered_events(INT) IS
'Bot worker fetches the next batch of undelivered events with SKIP LOCKED + atomic mark-delivered. Safe to run concurrently across bot shards.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS gh.list_open_issues(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS gh.get_issue(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS gh.claim_undelivered_events(INT);
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
