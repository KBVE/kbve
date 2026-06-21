-- ============================================================================
-- GH COMMENT MIRROR — Discord thread message ↔ GitHub issue comment mapping
--                     for bidirectional sync (Discord → GitHub comments) and
--                     the reverse thread→issue lookup.
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260621000000_gh_comment_mirror.sql).
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready. Depends on
-- gh_core.sql + gh_rpcs.sql.
--
-- Mental model:
--   The forward worker (gh_sync.rs) creates a forum thread per issue and
--   stores discord_thread_id on gh.issue. The reverse handler (gh_reverse.rs)
--   does the opposite: a human reply in that thread becomes a GitHub issue
--   comment. get_issue_by_thread_id resolves the thread back to its issue;
--   gh.comment_mirror dedupes posts (one GH comment per Discord message),
--   targets edit/delete propagation, and guards against echo loops.
--
-- All functions are SECURITY DEFINER, owned by service_role, reachable
-- only by service_role (PUBLIC/anon/authenticated revoked from each).
-- ============================================================================

-- Reverse lookup (thread_id → issue) reuses gh_issue_discord_thread_unique
-- (the existing unique partial index on gh.issue.discord_thread_id).

CREATE TABLE IF NOT EXISTS gh.comment_mirror (
    discord_message_id  BIGINT      NOT NULL,
    discord_channel_id  BIGINT      NOT NULL,
    github_comment_id   BIGINT,
    owner               TEXT        NOT NULL,
    repo                TEXT        NOT NULL,
    number              INT         NOT NULL,
    direction           TEXT        NOT NULL,
    author              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    claim_expires_at    TIMESTAMPTZ,
    PRIMARY KEY (discord_message_id),
    CONSTRAINT gh_comment_mirror_owner_shape_chk CHECK (owner ~ '^[A-Za-z0-9_.-]{1,100}$'),
    CONSTRAINT gh_comment_mirror_repo_shape_chk  CHECK (repo  ~ '^[A-Za-z0-9_.-]{1,100}$'),
    CONSTRAINT gh_comment_mirror_number_pos_chk  CHECK (number > 0),
    CONSTRAINT gh_comment_mirror_message_pos_chk CHECK (discord_message_id > 0),
    CONSTRAINT gh_comment_mirror_channel_pos_chk CHECK (discord_channel_id > 0),
    CONSTRAINT gh_comment_mirror_github_pos_chk  CHECK (github_comment_id IS NULL OR github_comment_id > 0),
    CONSTRAINT gh_comment_mirror_author_len_chk  CHECK (author IS NULL OR length(author) <= 256),
    CONSTRAINT gh_comment_mirror_direction_chk
        CHECK (direction IN ('discord_to_github', 'github_to_discord'))
)
-- Claim retries + delete tombstones touch no indexed column → HOT-eligible;
-- reserve page headroom to keep them HOT and avoid index bloat.
WITH (fillfactor = 90);

-- Echo guard (is_github_comment_mirrored) + one-comment-one-mapping invariant.
CREATE UNIQUE INDEX IF NOT EXISTS gh_comment_mirror_github_comment_unique
    ON gh.comment_mirror (github_comment_id)
    WHERE github_comment_id IS NOT NULL;

-- No list-by-issue query exists yet; add an (owner, repo, number,
-- created_at DESC, discord_message_id DESC) index — partial on
-- deleted_at IS NULL — alongside that query rather than carrying pure write
-- amplification now.

-- thread_id → issue reverse lookup.
CREATE OR REPLACE FUNCTION gh.get_issue_by_thread_id(p_thread_id BIGINT)
RETURNS gh.issue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT *
    FROM gh.issue
    WHERE discord_thread_id = p_thread_id;
$$;

ALTER FUNCTION gh.get_issue_by_thread_id(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.get_issue_by_thread_id(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.get_issue_by_thread_id(BIGINT) TO service_role;

-- Lease-based idempotency claim: returns TRUE when the caller owns posting the
-- GH comment (fresh row, or unfinalized row whose prior lease has expired).
CREATE OR REPLACE FUNCTION gh.claim_comment_mirror(
    p_discord_message_id BIGINT,
    p_discord_channel_id BIGINT,
    p_owner              TEXT,
    p_repo               TEXT,
    p_number             INT,
    p_direction          TEXT,
    p_author             TEXT,
    p_lease_secs         INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH ins AS (
        INSERT INTO gh.comment_mirror (
            discord_message_id, discord_channel_id, github_comment_id,
            owner, repo, number, direction, author, claim_expires_at
        )
        VALUES (
            p_discord_message_id, p_discord_channel_id, NULL,
            p_owner, p_repo, p_number, p_direction, p_author,
            statement_timestamp()
                + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_secs, 300), 1), 3600))
        )
        ON CONFLICT (discord_message_id) DO UPDATE
            SET claim_expires_at = EXCLUDED.claim_expires_at,
                updated_at       = statement_timestamp()
            WHERE gh.comment_mirror.github_comment_id IS NULL
              AND COALESCE(gh.comment_mirror.claim_expires_at, '-infinity'::timestamptz)
                  <= statement_timestamp()
        RETURNING TRUE
    )
    SELECT EXISTS (SELECT FROM ins);
$$;

ALTER FUNCTION gh.claim_comment_mirror(BIGINT, BIGINT, TEXT, TEXT, INT, TEXT, TEXT, INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.claim_comment_mirror(BIGINT, BIGINT, TEXT, TEXT, INT, TEXT, TEXT, INT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.claim_comment_mirror(BIGINT, BIGINT, TEXT, TEXT, INT, TEXT, TEXT, INT)
    TO service_role;

-- Finalize a claimed mirror row with the posted GitHub comment id + clear the
-- lease. Updates only the unfinalized row (github_comment_id IS NULL), so a
-- duplicate finalize is a no-op (returns FALSE) and never rewrites the tuple.
CREATE OR REPLACE FUNCTION gh.set_comment_mirror_github_id(
    p_discord_message_id BIGINT,
    p_github_comment_id  BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH upd AS (
        UPDATE gh.comment_mirror
            SET github_comment_id = p_github_comment_id,
                claim_expires_at  = NULL,
                updated_at        = statement_timestamp()
            WHERE discord_message_id = p_discord_message_id
              AND github_comment_id IS NULL
        RETURNING 1
    )
    SELECT EXISTS (SELECT FROM upd);
$$;

ALTER FUNCTION gh.set_comment_mirror_github_id(BIGINT, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.set_comment_mirror_github_id(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.set_comment_mirror_github_id(BIGINT, BIGINT) TO service_role;

-- Read a mirror row (edit/delete propagation + echo guard).
CREATE OR REPLACE FUNCTION gh.get_comment_mirror(p_discord_message_id BIGINT)
RETURNS gh.comment_mirror
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT *
    FROM gh.comment_mirror
    WHERE discord_message_id = p_discord_message_id;
$$;

ALTER FUNCTION gh.get_comment_mirror(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.get_comment_mirror(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.get_comment_mirror(BIGINT) TO service_role;

-- Echo guard: did this GitHub comment originate from the reverse path?
CREATE OR REPLACE FUNCTION gh.is_github_comment_mirrored(p_github_comment_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM gh.comment_mirror
        WHERE github_comment_id = p_github_comment_id
    );
$$;

ALTER FUNCTION gh.is_github_comment_mirrored(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.is_github_comment_mirrored(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.is_github_comment_mirrored(BIGINT) TO service_role;

-- Tombstone a mirror row when its Discord message is deleted.
CREATE OR REPLACE FUNCTION gh.mark_comment_mirror_deleted(p_discord_message_id BIGINT)
RETURNS gh.comment_mirror
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE gh.comment_mirror
        SET deleted_at = statement_timestamp(),
            updated_at = statement_timestamp()
        WHERE discord_message_id = p_discord_message_id
          AND deleted_at IS NULL
        RETURNING *;
$$;

ALTER FUNCTION gh.mark_comment_mirror_deleted(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.mark_comment_mirror_deleted(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.mark_comment_mirror_deleted(BIGINT) TO service_role;

ALTER TABLE gh.comment_mirror OWNER TO service_role;

COMMENT ON TABLE gh.comment_mirror IS
'Maps Discord thread messages to GitHub issue comments for bidirectional sync. discord_to_github rows are created when a human reply in a synced forum thread is mirrored to GitHub; the PK on discord_message_id makes the reverse handler idempotent (one GH comment per Discord message), and github_comment_id targets edit/delete propagation + acts as an echo guard.';
COMMENT ON FUNCTION gh.claim_comment_mirror(BIGINT, BIGINT, TEXT, TEXT, INT, TEXT, TEXT) IS
'Idempotency claim for reverse sync. Inserts a placeholder mirror row (github_comment_id NULL) and returns TRUE when the caller now owns posting the GitHub comment. Returns TRUE again if a prior placeholder exists but was never finalized (github_comment_id still NULL) so a failed/restarted post retries. Returns FALSE once github_comment_id is set, so a replayed message_create posts exactly one comment.';

NOTIFY pgrst, 'reload schema';
