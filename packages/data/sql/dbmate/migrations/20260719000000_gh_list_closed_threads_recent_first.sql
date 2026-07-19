-- migrate:up

SET search_path = '';

-- Backing index so the enumeration is an index-only-ish range scan + LIMIT
-- instead of a full scan-and-sort of every eligible closed issue. Column order
-- and direction MUST match the ORDER BY below exactly (closed_at DESC NULLS
-- LAST, owner, repo, number DESC) for the planner to skip the sort.
CREATE INDEX IF NOT EXISTS issue_closed_thread_backfill_idx
    ON gh.issue (closed_at DESC NULLS LAST, owner, repo, number DESC)
    WHERE state = 'closed'
      AND discord_thread_id IS NOT NULL;

-- Re-order the backfill enumeration most-recently-closed first. The prior
-- (owner, repo, number) ASC ordering front-loaded the OLDEST closed issues, so
-- an active repo (thousands of closed rows) exhausted the cap before reaching
-- recent closes — leaving newly-closed PRs/issues (e.g. #14193) unreconciled
-- when their live `closed` event was missed. closed_at DESC surfaces those.
--
-- NULL closed_at handling is DELIBERATE: such rows (legacy pre-VS6 closes whose
-- upsert never carried a closed_at) sort LAST — lowest reconcile priority. They
-- stay eligible; only if the eligible set exceeds the cap do they drop out, at
-- which point widen the caller's cap or add keyset pagination (follow-up). They
-- are NOT excluded — they are valid backfill targets, just least urgent.
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
    ORDER BY closed_at DESC NULLS LAST, owner, repo, number DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 2000);
$$;

ALTER FUNCTION gh.list_closed_issue_threads(INT) OWNER TO service_role;
REVOKE ALL ON FUNCTION gh.list_closed_issue_threads(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gh.list_closed_issue_threads(INT) TO service_role;

COMMENT ON FUNCTION gh.list_closed_issue_threads(INT) IS
'Closed issues that still carry a discord_thread_id, most-recently-closed first (closed_at DESC), capped at 2000. Feeds the one-shot GH_SYNC_BACKFILL_ON_START sweep that archives/locks threads for issues closed before VS6 was live.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

SET search_path = '';

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

DROP INDEX IF EXISTS gh.issue_closed_thread_backfill_idx;

NOTIFY pgrst, 'reload schema';
