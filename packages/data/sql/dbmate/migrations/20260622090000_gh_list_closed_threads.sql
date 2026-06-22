-- migrate:up

SET search_path = '';

-- Enumerate closed issues that still have a linked Discord thread, for the
-- one-shot reverse-sync backfill (archive/lock threads whose issues were closed
-- before VS6 thread-lifecycle shipped — those never got a `closed` webhook).
-- Reuses the existing gh_issue_discord_thread_unique partial index.
CREATE OR REPLACE FUNCTION gh.list_closed_issue_threads(p_limit INT DEFAULT 500)
RETURNS SETOF gh.issue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 500
COST 50
AS $$
    SELECT *
    FROM gh.issue
    WHERE state = 'closed'
      AND discord_thread_id IS NOT NULL
    ORDER BY owner, repo, number
    LIMIT LEAST(GREATEST(p_limit, 1), 2000);
$$;

ALTER FUNCTION gh.list_closed_issue_threads(INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.list_closed_issue_threads(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.list_closed_issue_threads(INT) TO service_role;

COMMENT ON FUNCTION gh.list_closed_issue_threads(INT) IS
'Closed issues that still carry a discord_thread_id, ordered (owner,repo,number), capped at 2000. Feeds the one-shot GH_SYNC_BACKFILL_ON_START sweep that archives/locks threads for issues closed before VS6 was live.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

SET search_path = '';

DROP FUNCTION IF EXISTS gh.list_closed_issue_threads(INT);

NOTIFY pgrst, 'reload schema';
