-- ============================================================================
-- GH CORE — schema, gh.issue mirror table, gh.issue_event lease-based queue,
--           constraints, indexes, ownership.
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260523033933_gh_issue_cache_init.sql).
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready.
--
-- Mental model:
--   gh is an L2 cache + event relay between GitHub webhooks and the
--   discordsh bot. gh.issue mirrors the latest GitHub issue/PR state for
--   allowlisted repos. gh.issue_event is an append-only event log that
--   the bot worker drains via a lease + claim_token + dead-letter loop.
--
-- Surface:
--   Mirror-only. RPC-only. No direct table grants outside ownership.
--   Schema + tables + sequence owned by service_role so SECURITY DEFINER
--   functions reach the tables through ownership, not explicit GRANT.
-- ============================================================================

-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS gh;

REVOKE ALL ON SCHEMA gh FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA gh TO service_role;

-- ============================================================================
-- TABLE: gh.issue
--   Mirror of the latest GitHub issue/PR state for allowlisted repos.
--   PK is (owner, repo, number). Mutable fields (title/state/body/labels/
--   assignees/...) are gated behind EXCLUDED.github_updated_at >= existing
--   inside gh.upsert_issue so out-of-order or stale webhook deliveries
--   cannot regress newer state. github_created_at is omitted from the
--   ON CONFLICT UPDATE so first-insert value is preserved as immutable.
--
--   discord_thread_id is set once the bot creates a forum thread for the
--   issue; partial UNIQUE index prevents one Discord thread mapping to
--   multiple issues. Discord ID triple is all-or-none.
-- ============================================================================

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

COMMENT ON TABLE gh.issue IS
'Mirror of the latest GitHub issue/PR state for allowlisted repos. discord_thread_id is set once the bot creates a forum thread for the issue. Unique partial index on discord_thread_id prevents one thread mapping to multiple issues.';

CREATE INDEX IF NOT EXISTS gh_issue_open_by_repo_updated_idx
    ON gh.issue (owner, repo, github_updated_at DESC)
    WHERE state = 'open';

CREATE INDEX IF NOT EXISTS gh_issue_updated_idx
    ON gh.issue (github_updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS gh_issue_discord_thread_unique
    ON gh.issue (discord_thread_id)
    WHERE discord_thread_id IS NOT NULL;

-- ============================================================================
-- TABLE: gh.issue_event
--   Event queue for upstream GitHub events (opened/closed/labeled/assigned/
--   commented). Row facts (owner/repo/number/event_type/payload/...) are
--   treated as immutable by the RPC surface after insert — no trigger
--   enforces this, but no role outside service_role can reach the table
--   and the RPCs never update those columns.
--
--   Lease-based delivery state machine:
--     0 = pending     (claimable)
--     1 = claimed     (in-flight; lease expires at claimed_at + p_lease_secs)
--     2 = delivered   (terminal success)
--     3 = dead_letter (terminal failure, retries exhausted)
--
--   claim_token (UUID) is generated on every transition into state=1 and
--   required by both finalizers. A stalled worker whose lease expired
--   cannot finalize a row that another worker has since reclaimed — the
--   token will not match.
--
--   FK CASCADE on (owner, repo, number) means dropping a mirrored issue
--   also drops its event history. record_event MUST be called after
--   upsert_issue for the same issue.
-- ============================================================================

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

COMMENT ON TABLE gh.issue_event IS
'Event queue for upstream GitHub events (opened/closed/labeled/assigned/commented). Row facts (owner/repo/number/event_type/payload/...) are treated as immutable by the RPC surface after insert — no trigger enforces this, but no role outside service_role can reach the table and the RPCs never update those columns. delivery_state + claimed_at + delivered_at + delivery_attempts + last_error + claim_token mutate as the worker processes the event. Lease-based: claim_undelivered_events transitions 0→1 + bumps attempts; mark_event_delivered transitions 1→2 on Discord success; mark_event_failed transitions 1→0 (retryable) or 1→3 (dead_letter after p_max_attempts).';

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

-- ============================================================================
-- OWNERSHIP — RPC-only posture. Schema, tables, sequence all owned by
-- service_role so SECURITY DEFINER functions reach the tables via the
-- "owner has all rights" rule without explicit table-level GRANT.
-- PUBLIC/anon/authenticated have no schema USAGE, so they cannot reach
-- the tables or functions even if grants leak.
-- ============================================================================

ALTER SCHEMA gh OWNER TO service_role;
ALTER TABLE gh.issue OWNER TO service_role;
ALTER TABLE gh.issue_event OWNER TO service_role;
ALTER SEQUENCE gh.issue_event_id_seq OWNER TO service_role;

COMMENT ON SCHEMA gh IS
'L2 cache for GitHub issue/PR metadata + append-only event queue feeding the discordsh thread sync. Mirror-only, RPC-only surface (no direct table grants), owned by service_role.';
