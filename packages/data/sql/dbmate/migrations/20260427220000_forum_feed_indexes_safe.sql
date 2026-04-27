-- migrate:up

-- ============================================================
-- FORUM FEED INDEXES — _safe variants.
--
-- Followup to 20260427210000_forum_schema_init. The original
-- forum_rpcs.sql declared per-sort feed indexes (idx_threads_feed_*)
-- intended to filter `status='active' AND nsfw=FALSE`. Three of them
-- (`_new`, `_top`, `_hot`) collided with broader status='active'-only
-- indexes already created in forum_core.sql; CREATE INDEX IF NOT EXISTS
-- skipped them silently. The other four (`_bump`, plus three
-- `space_feed_*`) had no name conflict and got created with the
-- intended predicate.
--
-- This migration converges everything onto a single `_safe` naming
-- scheme:
--   - DROP the four non-conflicting rpcs-side indexes (no schema
--     source still references them after this commit).
--   - CREATE all seven `_safe` variants. The three that collided are
--     genuinely new; the other four are renames.
--
-- After this migration, the planner sees:
--   * forum_core: idx_threads_feed_new / _top / _hot / _activity
--                 (status='active' only — covers the NSFW opt-in path)
--   * here:       idx_threads_feed_*_safe + idx_threads_space_feed_*_safe
--                 (status='active' AND nsfw=FALSE — default feed path)
-- ============================================================

DROP INDEX IF EXISTS forum.idx_threads_feed_bump;
DROP INDEX IF EXISTS forum.idx_threads_space_feed_new;
DROP INDEX IF EXISTS forum.idx_threads_space_feed_bump;
DROP INDEX IF EXISTS forum.idx_threads_space_feed_hot;

CREATE INDEX IF NOT EXISTS idx_threads_feed_new_safe
    ON forum.threads (created_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_bump_safe
    ON forum.threads (last_activity_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_top_safe
    ON forum.threads (score DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_hot_safe
    ON forum.threads (hot_rank DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_new_safe
    ON forum.threads (space_id, created_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_bump_safe
    ON forum.threads (space_id, last_activity_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_hot_safe
    ON forum.threads (space_id, hot_rank DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

-- migrate:down

DROP INDEX IF EXISTS forum.idx_threads_feed_new_safe;
DROP INDEX IF EXISTS forum.idx_threads_feed_bump_safe;
DROP INDEX IF EXISTS forum.idx_threads_feed_top_safe;
DROP INDEX IF EXISTS forum.idx_threads_feed_hot_safe;
DROP INDEX IF EXISTS forum.idx_threads_space_feed_new_safe;
DROP INDEX IF EXISTS forum.idx_threads_space_feed_bump_safe;
DROP INDEX IF EXISTS forum.idx_threads_space_feed_hot_safe;

-- Note: not recreating the dropped non-safe variants on rollback. The
-- previous migration left feed_new / feed_top / feed_hot un-created in
-- prod (silently skipped), so a clean rollback to 20260427210000 state
-- means "no nsfw-filtered feed indexes" — same as before this migration.
