-- migrate:up

-- ============================================================
-- FORUM RLS — performance pass.
--
-- Two classes of advisory from the Supabase linter:
--
-- 1. `auth.uid()` re-evaluates per row. Wrap in
--    `(SELECT auth.uid())` so Postgres caches one call per query.
--    Same pattern used in 20260318210000_rls_subquery_auth_uid for
--    other schemas.
--
-- 2. `forum.threads` and `forum.comments` each have two permissive
--    SELECT policies (public_read + author_read_drafts). Postgres OR's
--    permissive policies but evaluates each per row. Merge into a
--    single `*_select` policy with the same OR'd clause to halve the
--    per-row overhead.
--
-- All policies use DROP POLICY IF EXISTS + CREATE POLICY so the
-- migration is rerunnable + safe across rollbacks.
-- ============================================================

-- ── forum.threads ─────────────────────────────────────────────
DROP POLICY IF EXISTS threads_public_read ON forum.threads;
DROP POLICY IF EXISTS threads_author_read_drafts ON forum.threads;
DROP POLICY IF EXISTS threads_select ON forum.threads;
CREATE POLICY threads_select ON forum.threads
    FOR SELECT TO anon, authenticated
    USING (
        status IN ('active', 'archived', 'locked', 'sold', 'expired')
        OR (
            author_id = (SELECT auth.uid())
            AND status IN ('draft', 'scheduled', 'pending')
        )
    );

DROP POLICY IF EXISTS threads_author_insert ON forum.threads;
CREATE POLICY threads_author_insert ON forum.threads
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid())
        AND status IN ('active', 'draft', 'scheduled')
        AND NOT forum.is_user_banned((SELECT auth.uid()))
    );

-- ── forum.comments ────────────────────────────────────────────
DROP POLICY IF EXISTS comments_public_read ON forum.comments;
DROP POLICY IF EXISTS comments_author_read_drafts ON forum.comments;
DROP POLICY IF EXISTS comments_select ON forum.comments;
CREATE POLICY comments_select ON forum.comments
    FOR SELECT TO anon, authenticated
    USING (
        status = 'active'
        OR (
            author_id = (SELECT auth.uid())
            AND status = 'draft'
        )
    );

DROP POLICY IF EXISTS comments_author_insert ON forum.comments;
CREATE POLICY comments_author_insert ON forum.comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid())
        AND NOT forum.is_user_banned((SELECT auth.uid()))
    );

-- ── forum.user_follows ────────────────────────────────────────
DROP POLICY IF EXISTS user_follows_self_read ON forum.user_follows;
CREATE POLICY user_follows_self_read ON forum.user_follows
    FOR SELECT TO authenticated
    USING (follower_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_follows_self_write ON forum.user_follows;
CREATE POLICY user_follows_self_write ON forum.user_follows
    FOR INSERT TO authenticated
    WITH CHECK (follower_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_follows_self_delete ON forum.user_follows;
CREATE POLICY user_follows_self_delete ON forum.user_follows
    FOR DELETE TO authenticated
    USING (follower_id = (SELECT auth.uid()));

-- ── forum.bookmarks ───────────────────────────────────────────
DROP POLICY IF EXISTS bookmarks_self_select ON forum.bookmarks;
CREATE POLICY bookmarks_self_select ON forum.bookmarks
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bookmarks_self_insert ON forum.bookmarks;
CREATE POLICY bookmarks_self_insert ON forum.bookmarks
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bookmarks_self_update ON forum.bookmarks;
CREATE POLICY bookmarks_self_update ON forum.bookmarks
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bookmarks_self_delete ON forum.bookmarks;
CREATE POLICY bookmarks_self_delete ON forum.bookmarks
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- ── forum.thread_subscriptions ────────────────────────────────
DROP POLICY IF EXISTS thread_subscriptions_self_select ON forum.thread_subscriptions;
CREATE POLICY thread_subscriptions_self_select ON forum.thread_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS thread_subscriptions_self_insert ON forum.thread_subscriptions;
CREATE POLICY thread_subscriptions_self_insert ON forum.thread_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS thread_subscriptions_self_update ON forum.thread_subscriptions;
CREATE POLICY thread_subscriptions_self_update ON forum.thread_subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS thread_subscriptions_self_delete ON forum.thread_subscriptions;
CREATE POLICY thread_subscriptions_self_delete ON forum.thread_subscriptions
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- ── forum.thread_votes ────────────────────────────────────────
DROP POLICY IF EXISTS thread_votes_self_read ON forum.thread_votes;
CREATE POLICY thread_votes_self_read ON forum.thread_votes
    FOR SELECT TO authenticated
    USING (voter_id = (SELECT auth.uid()));

-- ── forum.comment_votes ───────────────────────────────────────
DROP POLICY IF EXISTS comment_votes_self_read ON forum.comment_votes;
CREATE POLICY comment_votes_self_read ON forum.comment_votes
    FOR SELECT TO authenticated
    USING (voter_id = (SELECT auth.uid()));

-- ── forum.poll_votes ──────────────────────────────────────────
DROP POLICY IF EXISTS poll_votes_self_read ON forum.poll_votes;
CREATE POLICY poll_votes_self_read ON forum.poll_votes
    FOR SELECT TO authenticated
    USING (voter_id = (SELECT auth.uid()));

-- ── forum.reports ─────────────────────────────────────────────
DROP POLICY IF EXISTS reports_self_read ON forum.reports;
CREATE POLICY reports_self_read ON forum.reports
    FOR SELECT TO authenticated
    USING (reporter_id = (SELECT auth.uid()));

-- ── forum.notifications ───────────────────────────────────────
DROP POLICY IF EXISTS notifications_self_read ON forum.notifications;
CREATE POLICY notifications_self_read ON forum.notifications
    FOR SELECT TO authenticated
    USING (recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_self_update ON forum.notifications;
CREATE POLICY notifications_self_update ON forum.notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = (SELECT auth.uid()))
    WITH CHECK (recipient_id = (SELECT auth.uid()));

-- migrate:down

-- Down: reverts to the per-row auth.uid() form + the dual-permissive
-- SELECT policies on threads + comments. Only useful if the prior shape
-- is needed for rollback testing.

DROP POLICY IF EXISTS threads_select ON forum.threads;
CREATE POLICY threads_public_read ON forum.threads
    FOR SELECT TO anon, authenticated
    USING (status IN ('active', 'archived', 'locked', 'sold', 'expired'));
CREATE POLICY threads_author_read_drafts ON forum.threads
    FOR SELECT TO authenticated
    USING (author_id = auth.uid() AND status IN ('draft', 'scheduled', 'pending'));

DROP POLICY IF EXISTS threads_author_insert ON forum.threads;
CREATE POLICY threads_author_insert ON forum.threads
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND status IN ('active', 'draft', 'scheduled')
        AND NOT forum.is_user_banned(auth.uid())
    );

DROP POLICY IF EXISTS comments_select ON forum.comments;
CREATE POLICY comments_public_read ON forum.comments
    FOR SELECT TO anon, authenticated
    USING (status = 'active');
CREATE POLICY comments_author_read_drafts ON forum.comments
    FOR SELECT TO authenticated
    USING (author_id = auth.uid() AND status = 'draft');

DROP POLICY IF EXISTS comments_author_insert ON forum.comments;
CREATE POLICY comments_author_insert ON forum.comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND NOT forum.is_user_banned(auth.uid())
    );

-- The remaining policy rewrites in this migration are pure perf
-- changes (auth.uid() → (SELECT auth.uid())). Down doesn't bother
-- restoring the old form for those — the (SELECT …) form is strictly
-- a perf improvement with identical semantics.
