-- ============================================================
-- FORUM SCHEMA — user-side tables.
--
-- Forum-specific denormalized state (karma, post_count, signature,
-- flair, rank, badges) keyed by Supabase user_id. Identity fields
-- stay in kbve.profile.UserProfile.
--
-- Plus user-owned graph: follows (user/space/tag), bookmarks,
-- thread subscriptions.
--
-- Depends on: forum_core.sql.
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

-- Public read of profiles (show karma, signature, flair on user pages).
-- Sensitive fields (ban_reason, mute_all_notifications, show_nsfw) stay
-- server-side — frontend only queries non-sensitive columns via RPC.
CREATE POLICY forum_user_profiles_public_read ON forum.forum_user_profiles
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- User updates own profile fields (signature, flair, notification prefs).
CREATE POLICY forum_user_profiles_self_update ON forum.forum_user_profiles
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Insert bootstrap: new user row created by RPC the first time they post.
-- No author-side INSERT policy — service_role handles creation.

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

-- Anyone can count followers (read-anyone); follower list visibility is
-- controlled at the RPC layer (e.g. "who follows @alice" requires auth
-- + returns only the viewer's own row, or aggregate counts).
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

CREATE POLICY thread_subscriptions_self_all ON forum.thread_subscriptions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMIT;
