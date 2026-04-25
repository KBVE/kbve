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
    badge_ids               INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
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
WHERE is_banned = FALSE OR ban_expires_at < NOW();

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
    PRIMARY KEY (follower_id, target_kind, target_id)
);

CREATE INDEX idx_user_follows_target      ON forum.user_follows (target_kind, target_id);
CREATE INDEX idx_user_follows_follower    ON forum.user_follows (follower_id, created_at DESC);

ALTER TABLE forum.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.user_follows FORCE ROW LEVEL SECURITY;

CREATE POLICY user_follows_self_read ON forum.user_follows
    FOR SELECT TO authenticated
    USING (follower_id = auth.uid());

CREATE POLICY user_follows_self_write ON forum.user_follows
    FOR INSERT TO authenticated
    WITH CHECK (follower_id = auth.uid());

CREATE POLICY user_follows_self_delete ON forum.user_follows
    FOR DELETE TO authenticated
    USING (follower_id = auth.uid());

-- ===========================================
-- BOOKMARKS — private saved threads per user
-- ===========================================

CREATE TABLE forum.bookmarks (
    id          TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    folder      TEXT CHECK (folder IS NULL OR char_length(folder) <= 100),
    note        TEXT CHECK (note IS NULL OR char_length(note) <= 500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, thread_id)
);

CREATE INDEX idx_bookmarks_user ON forum.bookmarks (user_id, created_at DESC);

ALTER TABLE forum.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.bookmarks FORCE ROW LEVEL SECURITY;

CREATE POLICY bookmarks_self_all ON forum.bookmarks
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

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

ALTER TABLE forum.thread_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY thread_subscriptions_self_all ON forum.thread_subscriptions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Item 8 — explicit grants for user-side surfaces.
GRANT SELECT ON forum.public_user_profiles TO anon, authenticated;

GRANT SELECT, INSERT, DELETE         ON forum.bookmarks            TO authenticated;
GRANT SELECT, INSERT, DELETE         ON forum.user_follows         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.thread_subscriptions TO authenticated;

COMMIT;
