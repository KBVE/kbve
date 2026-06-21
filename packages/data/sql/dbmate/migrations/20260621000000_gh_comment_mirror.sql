-- migrate:up

SET search_path = '';

-- Reverse lookup (thread_id → issue) is already served by the existing
-- gh_issue_discord_thread_unique partial index from the cache-init migration.

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
    CONSTRAINT gh_comment_mirror_author_len_chk  CHECK (author IS NULL OR octet_length(author) <= 1024),
    CONSTRAINT gh_comment_mirror_direction_chk
        CHECK (direction IN ('discord_to_github', 'github_to_discord'))
)
-- Most rows take one non-HOT finalize (github_comment_id is indexed); only the
-- rare lease reclaim / tombstone updates are HOT-eligible, so a light 5% reserve
-- keeps headroom for those without sacrificing page density.
WITH (fillfactor = 95);

-- Echo guard (is_github_comment_mirrored) + one-comment-one-mapping invariant.
CREATE UNIQUE INDEX IF NOT EXISTS gh_comment_mirror_github_comment_unique
    ON gh.comment_mirror (github_comment_id)
    WHERE github_comment_id IS NOT NULL;

-- No list-by-issue query exists yet; an (owner, repo, number, created_at DESC,
-- discord_message_id DESC) index — partial on deleted_at IS NULL — should be
-- added together with that query so it is not pure write amplification now.

COMMENT ON TABLE gh.comment_mirror IS
'Maps Discord thread messages to GitHub issue comments for bidirectional sync. discord_to_github rows are created when a human reply in a synced forum thread is mirrored to GitHub; the PK on discord_message_id makes the reverse handler idempotent (one GH comment per Discord message), and github_comment_id targets edit/delete propagation + acts as an echo guard.';

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
              AND gh.comment_mirror.deleted_at IS NULL
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

COMMENT ON FUNCTION gh.claim_comment_mirror(BIGINT, BIGINT, TEXT, TEXT, INT, TEXT, TEXT, INT) IS
'Lease-based idempotency claim for reverse sync. Inserts a placeholder mirror row (github_comment_id NULL, claim_expires_at = statement_timestamp()+lease, lease clamped 1..3600s) and returns TRUE when the caller now owns posting the GitHub comment. On a duplicate delivery it re-claims (TRUE) only if the row is still unfinalized AND the prior lease has expired — so concurrent/rapid redeliveries do NOT each fire a GitHub POST, while a genuinely failed post can retry after the lease lapses. Returns FALSE once github_comment_id is set, so a replayed message_create posts exactly one comment.';

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

COMMENT ON FUNCTION gh.is_github_comment_mirrored(BIGINT) IS
'Echo guard for the forward worker: returns TRUE when a GitHub comment originated from the reverse-sync path, so gh_sync skips re-posting our own mirrored comment back into the thread.';

CREATE OR REPLACE FUNCTION gh.mark_comment_mirror_deleted(p_discord_message_id BIGINT)
RETURNS gh.comment_mirror
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE gh.comment_mirror
        SET deleted_at       = statement_timestamp(),
            claim_expires_at = NULL,
            updated_at       = statement_timestamp()
        WHERE discord_message_id = p_discord_message_id
          AND deleted_at IS NULL
        RETURNING *;
$$;

ALTER FUNCTION gh.mark_comment_mirror_deleted(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.mark_comment_mirror_deleted(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.mark_comment_mirror_deleted(BIGINT) TO service_role;

ALTER TABLE gh.comment_mirror OWNER TO service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

SET search_path = '';

DROP FUNCTION IF EXISTS gh.mark_comment_mirror_deleted(BIGINT);
DROP FUNCTION IF EXISTS gh.is_github_comment_mirrored(BIGINT);
DROP FUNCTION IF EXISTS gh.get_comment_mirror(BIGINT);
DROP FUNCTION IF EXISTS gh.set_comment_mirror_github_id(BIGINT, BIGINT);
DROP FUNCTION IF EXISTS gh.claim_comment_mirror(BIGINT, BIGINT, TEXT, TEXT, INT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS gh.get_issue_by_thread_id(BIGINT);
DROP TABLE IF EXISTS gh.comment_mirror;

NOTIFY pgrst, 'reload schema';
