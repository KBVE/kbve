-- ============================================================
-- FORUM SCHEMA — user-side tables.
--
-- Forum-specific denormalized state (karma, post_count, signature,
-- flair, rank, badges) keyed by Supabase user_id. Identity stays in
-- kbve.profile.UserProfile.
--
-- Plus user-owned graph: follows (user/space/tag), bookmarks,
-- thread subscriptions.
--
-- Item 3: profile updates go through forum.service_update_user_profile —
-- direct UPDATE policy removed so users cannot mutate karma / ban flags.
-- A read-only public view forum.public_user_profiles exposes the safe
-- subset for client reads.
--
-- Hardening pass:
--   * forum_user_profiles base table is REVOKEd from anon/authenticated.
--     Public reads go through public_user_profiles only. The view
--     stays SECURITY DEFINER (default) — switching to security_invoker
--     would require granting clients SELECT on the base table, which
--     defeats the safe-subset model.
--   * badge_ids capped at 128 entries; trigger collapses duplicates
--     via array_agg(DISTINCT).
--   * user_follows blocks self-follow (target_kind='user' AND
--     target_id = follower_id) and rejects empty/oversized target_id.
--   * bookmarks folder/note CHECKs reject whitespace-only values.
--     Bookmarks + thread_subscriptions FOR ALL policies split into
--     per-action policies for auditability.
--   * Notification fanout indexes on thread_subscriptions
--     (push_enabled, email_enabled partials) so the comment-create
--     RPC's bulk INSERT doesn't scan the full table.
--   * Leaderboard indexes filter banned users at the index level.
-- ============================================================

BEGIN;

-- ===========================================
-- FORUM_USER_PROFILES
-- ===========================================

CREATE TABLE forum.forum_user_profiles (
    user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    karma                   BIGINT NOT NULL DEFAULT 0,
    post_count              BIGINT NOT NULL DEFAULT 0 CHECK (post_count >= 0),
    comment_count           BIGINT NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    upvotes_given           BIGINT NOT NULL DEFAULT 0 CHECK (upvotes_given >= 0),
    downvotes_given         BIGINT NOT NULL DEFAULT 0 CHECK (downvotes_given >= 0),
    upvotes_received        BIGINT NOT NULL DEFAULT 0 CHECK (upvotes_received >= 0),
    downvotes_received      BIGINT NOT NULL DEFAULT 0 CHECK (downvotes_received >= 0),
    signature               TEXT CHECK (signature IS NULL OR char_length(signature) <= 500),
    flair_id                INTEGER,
    flair_text              TEXT CHECK (flair_text IS NULL OR char_length(flair_text) <= 100),
    rank_id                 INTEGER,
    badge_ids               INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[]
        CHECK (cardinality(badge_ids) <= 128),
    joined_forum_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at          TIMESTAMPTZ,
    trust_level             SMALLINT NOT NULL DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 5),
    mute_all_notifications  BOOLEAN NOT NULL DEFAULT FALSE,
    show_nsfw               BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned               BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason              TEXT CHECK (ban_reason IS NULL OR char_length(ban_reason) <= 1000),
    ban_expires_at          TIMESTAMPTZ
);

CREATE INDEX idx_forum_user_profiles_karma     ON forum.forum_user_profiles (karma DESC);
CREATE INDEX idx_forum_user_profiles_banned    ON forum.forum_user_profiles (is_banned) WHERE is_banned = TRUE;
CREATE INDEX idx_forum_user_profiles_last_act  ON forum.forum_user_profiles (last_active_at DESC) WHERE last_active_at IS NOT NULL;
-- Leaderboard partials: skip banned users at the index level so the
-- public-facing top-karma / recently-active queries stay fast even as
-- the ban list grows.
CREATE INDEX idx_forum_user_profiles_public_karma
    ON forum.forum_user_profiles (karma DESC, user_id)
    WHERE is_banned = FALSE;
CREATE INDEX idx_forum_user_profiles_public_last_active
    ON forum.forum_user_profiles (last_active_at DESC, user_id)
    WHERE last_active_at IS NOT NULL AND is_banned = FALSE;

-- Collapse duplicate badge IDs at write time so client + RPC writers
-- don't need to dedup themselves.
CREATE OR REPLACE FUNCTION forum.normalize_badge_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.badge_ids IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::INTEGER[])
          INTO NEW.badge_ids
          FROM unnest(NEW.badge_ids) AS x;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_badge_ids() FROM PUBLIC;

CREATE TRIGGER forum_user_profiles_badge_ids_unique
    BEFORE INSERT OR UPDATE OF badge_ids ON forum.forum_user_profiles
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_badge_ids();

ALTER TABLE forum.forum_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.forum_user_profiles FORCE ROW LEVEL SECURITY;

-- Item 3: NO end-user UPDATE policy on the base table. Profile mutations
-- route through forum.service_update_user_profile so users cannot tamper
-- with karma, post_count, ban flags, or trust_level.
--
-- Public reads expose the safe subset via forum.public_user_profiles view.
-- The base table is reachable only by service_role.

-- Read-only safe subset for clients. Excludes ban_reason, mute flags,
-- show_nsfw, ban_expires_at — those are private settings or moderation-only.
--
-- Active-ban predicate spelled out positively: hide rows where the
-- user is banned AND (the ban has no expiry OR the expiry is still in
-- the future). The previous `is_banned = FALSE OR ban_expires_at < NOW()`
-- form was equivalent but read awkwardly for permanent bans.
CREATE OR REPLACE VIEW forum.public_user_profiles AS
SELECT
    user_id,
    karma,
    post_count,
    comment_count,
    upvotes_received,
    downvotes_received,
    signature,
    flair_id,
    flair_text,
    rank_id,
    badge_ids,
    joined_forum_at,
    last_active_at,
    trust_level
FROM forum.forum_user_profiles
WHERE NOT (
    is_banned = TRUE
    AND (ban_expires_at IS NULL OR ban_expires_at > NOW())
);

COMMENT ON VIEW forum.public_user_profiles IS
    'Public-safe forum stats. Hides ban_reason, notification + content prefs, and active-ban rows.';

-- ===========================================
-- USER_FOLLOWS — user → user / space / tag edges
-- ===========================================

CREATE TABLE forum.user_follows (
    follower_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_kind             forum.follow_target_kind NOT NULL,
    target_id               TEXT NOT NULL,
    notifications_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, target_kind, target_id),
    -- Block self-follow: target_kind='user' AND target_id matching
    -- the follower's UUID.
    CONSTRAINT user_follows_no_self_follow CHECK (
        target_kind <> 'user'
        OR target_id <> follower_id::TEXT
    ),
    -- Reject blank / oversized target_id. UUID is 36 chars; tag /
    -- space slugs cap at 50; allow 128 to leave room.
    CONSTRAINT user_follows_target_id_format CHECK (
        char_length(btrim(target_id)) > 0
        AND char_length(target_id) <= 128
    )
);

CREATE INDEX idx_user_follows_target      ON forum.user_follows (target_kind, target_id);
CREATE INDEX idx_user_follows_follower    ON forum.user_follows (follower_id, created_at DESC);

ALTER TABLE forum.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.user_follows FORCE ROW LEVEL SECURITY;

-- All `auth.uid()` calls wrapped in `(SELECT …)` so Postgres caches
-- one call per query (Supabase RLS perf advisory).
CREATE POLICY user_follows_self_read ON forum.user_follows
    FOR SELECT TO authenticated
    USING (follower_id = (SELECT auth.uid()));

CREATE POLICY user_follows_self_write ON forum.user_follows
    FOR INSERT TO authenticated
    WITH CHECK (follower_id = (SELECT auth.uid()));

CREATE POLICY user_follows_self_delete ON forum.user_follows
    FOR DELETE TO authenticated
    USING (follower_id = (SELECT auth.uid()));

-- ===========================================
-- BOOKMARKS — private saved threads per user
-- ===========================================

CREATE TABLE forum.bookmarks (
    id          TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    folder      TEXT CHECK (
        folder IS NULL
        OR (char_length(folder) <= 100 AND char_length(btrim(folder)) > 0)
    ),
    note        TEXT CHECK (
        note IS NULL
        OR (char_length(note) <= 500 AND char_length(btrim(note)) > 0)
    ),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, thread_id)
);

CREATE INDEX idx_bookmarks_user ON forum.bookmarks (user_id, created_at DESC);
-- Folder browsing: "show me bookmarks in <folder>".
CREATE INDEX idx_bookmarks_user_folder
    ON forum.bookmarks (user_id, folder, created_at DESC)
    WHERE folder IS NOT NULL;

ALTER TABLE forum.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.bookmarks FORCE ROW LEVEL SECURITY;

-- FOR ALL split into per-action policies for clearer audit. Each
-- action enforces user_id = auth.uid() identically; splitting just
-- makes "what can authenticated do?" answerable per-action via
-- pg_policies.
CREATE POLICY bookmarks_self_select ON forum.bookmarks
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY bookmarks_self_insert ON forum.bookmarks
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY bookmarks_self_update ON forum.bookmarks
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY bookmarks_self_delete ON forum.bookmarks
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- ===========================================
-- THREAD_SUBSCRIPTIONS — per-thread notification opt-in
-- ===========================================

CREATE TABLE forum.thread_subscriptions (
    thread_id       TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX idx_thread_subscriptions_user ON forum.thread_subscriptions (user_id);
-- Hot path: service_create_comment fans out notifications to every
-- subscriber of the thread. Without this, that's a sequential scan.
CREATE INDEX idx_thread_subscriptions_thread
    ON forum.thread_subscriptions (thread_id);
-- Per-channel partials so notification workers can skip subscribers
-- who muted the channel without an extra heap fetch.
CREATE INDEX idx_thread_subscriptions_push_enabled
    ON forum.thread_subscriptions (thread_id, user_id)
    WHERE push_enabled = TRUE;
CREATE INDEX idx_thread_subscriptions_email_enabled
    ON forum.thread_subscriptions (thread_id, user_id)
    WHERE email_enabled = TRUE;

ALTER TABLE forum.thread_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_subscriptions FORCE ROW LEVEL SECURITY;

-- Split FOR ALL into per-action policies (matches bookmarks above).
CREATE POLICY thread_subscriptions_self_select ON forum.thread_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY thread_subscriptions_self_insert ON forum.thread_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY thread_subscriptions_self_update ON forum.thread_subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY thread_subscriptions_self_delete ON forum.thread_subscriptions
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- Grants — base profile table is RPC-only on the write side,
-- view-only on the read side.
-- ============================================================

-- Public reads only via the safe view. Base table is unreachable
-- from anon/authenticated (RLS would block it anyway, but the explicit
-- REVOKE prevents future schema-wide GRANTs from leaking columns).
REVOKE ALL ON forum.forum_user_profiles FROM anon, authenticated;
GRANT SELECT ON forum.public_user_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.forum_user_profiles TO service_role;

-- User-owned graphs.
GRANT SELECT, INSERT, DELETE         ON forum.bookmarks            TO authenticated;
GRANT SELECT, INSERT, DELETE         ON forum.user_follows         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.thread_subscriptions TO authenticated;

COMMENT ON TABLE forum.forum_user_profiles IS
    'Forum-side user state. RPC-only mutations via service_update_user_profile / service_record_moderation. Public reads go through forum.public_user_profiles.';
COMMENT ON TABLE forum.user_follows IS
    'User-owned follow graph (user / space / tag). Self-follow blocked via CHECK.';
COMMENT ON TABLE forum.bookmarks IS
    'Private saved threads, one row per (user, thread).';
COMMENT ON TABLE forum.thread_subscriptions IS
    'Per-thread notification opt-in. Fanout indexes split push / email channels.';

COMMIT;
