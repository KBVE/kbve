-- ============================================================
-- FORUM SCHEMA — core tables (spaces, tags, threads, comments).
--
-- Proto source of truth: packages/data/proto/kbve/forum.proto
-- Draft SQL (not yet a dbmate migration). Once the schema shape
-- is locked, wrap these files in a numbered migration under
-- packages/data/sql/dbmate/migrations/.
--
-- Depends on: 20260227215000_gen_ulid (public.gen_ulid function).
-- ============================================================

BEGIN;

-- ===========================================
-- SCHEMA SETUP + GRANTS
-- ===========================================

CREATE SCHEMA IF NOT EXISTS forum;
ALTER SCHEMA forum OWNER TO postgres;

GRANT USAGE ON SCHEMA forum TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA forum TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA forum TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA forum TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA forum TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA forum GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA forum GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA forum GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA forum GRANT ALL ON ROUTINES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA forum
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA forum
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA forum
    GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA forum
    GRANT ALL ON ROUTINES TO service_role;

-- Feed is publicly readable; anon + authenticated need USAGE on the schema.
GRANT USAGE ON SCHEMA forum TO anon, authenticated;

-- ===========================================
-- ENUM TYPES — mirror kbve.forum proto enums.
-- Values use the proto's post-stripPrefix, lowercase form.
-- ===========================================

CREATE TYPE forum.thread_status AS ENUM (
    'active',
    'locked',
    'removed',
    'archived',
    'sold',
    'expired',
    'pending',
    'draft',
    'scheduled'
);

CREATE TYPE forum.comment_status AS ENUM (
    'active',
    'removed',
    'flagged',
    'draft'
);

CREATE TYPE forum.thread_type AS ENUM (
    'discussion',
    'question',
    'announcement',
    'marketplace',
    'auction',
    'poll',
    'guide',
    'lfg',
    'showcase',
    'bug_report',
    'asset',
    'status',
    'megathread'
);

CREATE TYPE forum.space_status AS ENUM (
    'active',
    'archived',
    'private',
    'suspended'
);

CREATE TYPE forum.tag_status AS ENUM (
    'active',
    'deprecated',
    'merged'
);

CREATE TYPE forum.vote_direction AS ENUM (
    'up',
    'down',
    'cleared'
);

CREATE TYPE forum.reaction_kind AS ENUM (
    'thumbs_up',
    'thumbs_down',
    'heart',
    'fire',
    'laugh',
    'surprised',
    'sad',
    'angry',
    'clap',
    'eyes',
    'rocket',
    'brain',
    'skull',
    'custom'
);

CREATE TYPE forum.report_reason AS ENUM (
    'spam',
    'harassment',
    'nsfw',
    'violence',
    'copyright',
    'off_topic',
    'scam',
    'misinfo',
    'self_harm',
    'other'
);

CREATE TYPE forum.moderation_action_kind AS ENUM (
    'thread_lock',
    'thread_unlock',
    'thread_remove',
    'thread_restore',
    'thread_pin',
    'thread_unpin',
    'thread_move',
    'comment_remove',
    'comment_restore',
    'user_mute',
    'user_ban',
    'user_unban',
    'report_resolve',
    'report_dismiss',
    'tag_merge',
    'tag_deprecate'
);

CREATE TYPE forum.notification_kind AS ENUM (
    'mention',
    'reply',
    'thread_reply',
    'follow',
    'thread_update',
    'vote_milestone',
    'mod_action',
    'award',
    'auction_outbid',
    'auction_won',
    'accepted_answer',
    'lfg_filled'
);

CREATE TYPE forum.follow_target_kind AS ENUM (
    'user',
    'space',
    'tag'
);

-- target_kind is the union used by reports / moderation_actions / notifications.
-- attachment_parent_kind below stays scoped to the attachments table so we can
-- evolve the two surfaces independently (e.g. add 'message' to attachments
-- without touching mod tooling).
CREATE TYPE forum.target_kind AS ENUM (
    'thread',
    'comment',
    'space',
    'user'
);

CREATE TYPE forum.attachment_parent_kind AS ENUM (
    'thread',
    'comment',
    'space',
    'user'
);

CREATE TYPE forum.attachment_kind AS ENUM (
    'image',
    'video',
    'audio',
    'file',
    'link',
    'code'
);

CREATE TYPE forum.lfg_status AS ENUM (
    'open',
    'full',
    'started',
    'cancelled'
);

-- ===========================================
-- SHARED HELPERS
-- ===========================================

CREATE OR REPLACE FUNCTION forum.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

-- Reddit-style hot score. Older posts decay; high-|score| posts climb.
CREATE OR REPLACE FUNCTION forum.hot_score(p_score BIGINT, p_created_at TIMESTAMPTZ)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    v_order DOUBLE PRECISION;
    v_sign  DOUBLE PRECISION;
    v_epoch DOUBLE PRECISION;
BEGIN
    v_order := LOG(GREATEST(ABS(p_score), 1));
    v_sign := CASE
        WHEN p_score > 0 THEN 1.0
        WHEN p_score < 0 THEN -1.0
        ELSE 0.0
    END;
    v_epoch := EXTRACT(EPOCH FROM p_created_at) - EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-01-01 00:00:00Z');
    RETURN ROUND(((v_sign * v_order) + (v_epoch / 45000.0))::numeric, 7)::DOUBLE PRECISION;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION forum.hot_score IS
    'Reddit-style hot ranking. Higher = hotter. 12.5-hour half-life via 45000s denominator.';

-- Polymorphic existence check for parent_id on attachments / reactions / etc.
CREATE OR REPLACE FUNCTION forum.assert_parent_exists(
    p_kind forum.attachment_parent_kind,
    p_id   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_kind = 'thread' THEN
        RETURN EXISTS (SELECT 1 FROM forum.threads WHERE id = p_id);
    ELSIF p_kind = 'comment' THEN
        RETURN EXISTS (SELECT 1 FROM forum.comments WHERE id = p_id);
    ELSIF p_kind = 'space' THEN
        RETURN EXISTS (SELECT 1 FROM forum.spaces WHERE id = p_id::UUID);
    ELSIF p_kind = 'user' THEN
        RETURN EXISTS (SELECT 1 FROM auth.users WHERE id = p_id::UUID);
    END IF;
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION forum.assert_parent_exists IS
    'Returns TRUE if a row exists for the given (kind, id) — used by service_* RPCs to validate polymorphic refs before insert.';

-- Banned-user guard. Returns TRUE if the user is currently banned.
CREATE OR REPLACE FUNCTION forum.is_user_banned(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
          FROM forum.forum_user_profiles
         WHERE user_id = p_user_id
           AND is_banned = TRUE
           AND (ban_expires_at IS NULL OR ban_expires_at > NOW())
    );
END;
$$;

COMMENT ON FUNCTION forum.is_user_banned IS
    'Returns TRUE when the user has an active forum ban (no expiry set, or expiry in the future).';

-- ===========================================
-- SPACES
-- ===========================================

CREATE TABLE forum.spaces (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                TEXT NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$' AND char_length(slug) BETWEEN 1 AND 50),
    name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description         TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
    parent_space_id     UUID REFERENCES forum.spaces(id) ON DELETE SET NULL,
    rules               TEXT CHECK (rules IS NULL OR char_length(rules) <= 5000),
    icon_url            TEXT CHECK (icon_url IS NULL OR char_length(icon_url) <= 512),
    banner_url          TEXT CHECK (banner_url IS NULL OR char_length(banner_url) <= 512),
    status              forum.space_status NOT NULL DEFAULT 'active',
    follower_count      INTEGER NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
    thread_count        INTEGER NOT NULL DEFAULT 0 CHECK (thread_count >= 0),
    allowed_types       forum.thread_type[] NOT NULL DEFAULT '{}'::forum.thread_type[],
    sort_order          INTEGER NOT NULL DEFAULT 0,
    nsfw                BOOLEAN NOT NULL DEFAULT FALSE,
    flair_config_json   JSONB,
    moderator_ids       UUID[] NOT NULL DEFAULT '{}'::UUID[],
    active_user_count   BIGINT NOT NULL DEFAULT 0 CHECK (active_user_count >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spaces_parent ON forum.spaces (parent_space_id) WHERE parent_space_id IS NOT NULL;
CREATE INDEX idx_spaces_status ON forum.spaces (status);
CREATE INDEX idx_spaces_sort ON forum.spaces (sort_order, slug);

CREATE TRIGGER spaces_updated_at
    BEFORE UPDATE ON forum.spaces
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

-- ===========================================
-- TAGS
-- ===========================================

CREATE TABLE forum.tags (
    id              SERIAL PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$' AND char_length(slug) BETWEEN 1 AND 50),
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    description     TEXT CHECK (description IS NULL OR char_length(description) <= 500),
    status          forum.tag_status NOT NULL DEFAULT 'active',
    alias_of        INTEGER REFERENCES forum.tags(id) ON DELETE SET NULL,
    canonical_id    INTEGER NOT NULL,
    usage_count     INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    created_by      UUID NOT NULL REFERENCES auth.users(id),
    parent_tag_ids  INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
    color           TEXT CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
    icon_ref        TEXT CHECK (icon_ref IS NULL OR char_length(icon_ref) <= 100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tags_canonical_fkey FOREIGN KEY (canonical_id) REFERENCES forum.tags(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_tags_canonical ON forum.tags (canonical_id);
CREATE INDEX idx_tags_status ON forum.tags (status) WHERE status <> 'deprecated';
CREATE INDEX idx_tags_alias ON forum.tags (alias_of) WHERE alias_of IS NOT NULL;

CREATE OR REPLACE FUNCTION forum.set_tag_canonical_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.canonical_id IS NULL OR NEW.canonical_id = 0 THEN
        NEW.canonical_id := NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE TRIGGER tags_set_canonical
    BEFORE INSERT ON forum.tags
    FOR EACH ROW EXECUTE FUNCTION forum.set_tag_canonical_id();

-- ===========================================
-- THREADS
-- ===========================================

CREATE TABLE forum.threads (
    id                          TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    title                       TEXT NOT NULL CHECK (char_length(title) <= 300),
    body                        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
    author_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    space_id                    UUID NOT NULL REFERENCES forum.spaces(id) ON DELETE CASCADE,
    status                      forum.thread_status NOT NULL DEFAULT 'active',
    thread_type                 forum.thread_type NOT NULL DEFAULT 'discussion',
    type_data                   JSONB NOT NULL DEFAULT '{}'::JSONB,
    comment_count               INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    view_count                  BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    slug                        TEXT
        CHECK (slug IS NULL OR (slug ~ '^[a-z0-9][a-z0-9-]*$' AND char_length(slug) <= 300)),
    pinned                      BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_comment_id         TEXT,
    score                       BIGINT NOT NULL DEFAULT 0,
    upvote_count                BIGINT NOT NULL DEFAULT 0 CHECK (upvote_count >= 0),
    downvote_count              BIGINT NOT NULL DEFAULT 0 CHECK (downvote_count >= 0),
    last_activity_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    nsfw                        BOOLEAN NOT NULL DEFAULT FALSE,
    locked                      BOOLEAN NOT NULL DEFAULT FALSE,
    locale                      TEXT CHECK (locale IS NULL OR char_length(locale) <= 10),
    cross_posted_from_thread_id TEXT REFERENCES forum.threads(id) ON DELETE SET NULL,
    quoted_thread_id            TEXT REFERENCES forum.threads(id) ON DELETE SET NULL,
    scheduled_at                TIMESTAMPTZ,
    revision_count              INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
    attachment_count            INTEGER NOT NULL DEFAULT 0 CHECK (attachment_count >= 0),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at                   TIMESTAMPTZ
);

-- Feed sort indexes (item 9 — broaden coverage so the planner can pick the
-- best partial for hot/new/top + nsfw filtering).
CREATE INDEX idx_threads_space_last_activity
    ON forum.threads (space_id, last_activity_at DESC) WHERE status = 'active';
CREATE INDEX idx_threads_space_score
    ON forum.threads (space_id, score DESC) WHERE status = 'active';
CREATE INDEX idx_threads_space_created
    ON forum.threads (space_id, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_threads_active_hot
    ON forum.threads (created_at DESC, score DESC) WHERE status = 'active';
CREATE INDEX idx_threads_active_top
    ON forum.threads (score DESC, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_threads_active_new
    ON forum.threads (created_at DESC, id DESC) WHERE status = 'active';
CREATE INDEX idx_threads_active_nsfw
    ON forum.threads (nsfw, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_threads_author
    ON forum.threads (author_id, created_at DESC);
CREATE INDEX idx_threads_type
    ON forum.threads (thread_type, last_activity_at DESC) WHERE status = 'active';
CREATE INDEX idx_threads_pinned
    ON forum.threads (space_id, last_activity_at DESC) WHERE pinned = TRUE AND status = 'active';
CREATE INDEX idx_threads_scheduled
    ON forum.threads (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_threads_expires_auction
    ON forum.threads ((type_data->>'end_time'))
    WHERE thread_type = 'auction' AND status = 'active';

CREATE TRIGGER threads_updated_at
    BEFORE UPDATE ON forum.threads
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

-- ===========================================
-- COMMENTS
-- ===========================================

CREATE TABLE forum.comments (
    id                  TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    body                TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    author_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id           TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    parent_comment_id   TEXT REFERENCES forum.comments(id) ON DELETE CASCADE,
    depth               INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 5),
    status              forum.comment_status NOT NULL DEFAULT 'active',
    is_accepted         BOOLEAN NOT NULL DEFAULT FALSE,
    score               BIGINT NOT NULL DEFAULT 0,
    upvote_count        BIGINT NOT NULL DEFAULT 0 CHECK (upvote_count >= 0),
    downvote_count      BIGINT NOT NULL DEFAULT 0 CHECK (downvote_count >= 0),
    quoted_comment_id   TEXT REFERENCES forum.comments(id) ON DELETE SET NULL,
    revision_count      INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
    attachment_count    INTEGER NOT NULL DEFAULT 0 CHECK (attachment_count >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at           TIMESTAMPTZ
);

ALTER TABLE forum.threads
    ADD CONSTRAINT threads_accepted_comment_fkey
    FOREIGN KEY (accepted_comment_id) REFERENCES forum.comments(id) ON DELETE SET NULL;

CREATE INDEX idx_comments_thread_created ON forum.comments (thread_id, created_at);
CREATE INDEX idx_comments_thread_score   ON forum.comments (thread_id, score DESC);
CREATE INDEX idx_comments_parent         ON forum.comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX idx_comments_author         ON forum.comments (author_id, created_at DESC);
CREATE INDEX idx_comments_accepted       ON forum.comments (thread_id) WHERE is_accepted = TRUE;

CREATE TRIGGER comments_updated_at
    BEFORE UPDATE ON forum.comments
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

-- ===========================================
-- THREAD ↔ TAG JUNCTION + canonical-resolving view
-- ===========================================

CREATE TABLE forum.thread_tags (
    thread_id   TEXT    NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES forum.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (thread_id, tag_id)
);

CREATE INDEX idx_thread_tags_tag ON forum.thread_tags (tag_id);
CREATE INDEX idx_thread_tags_tag_thread ON forum.thread_tags (tag_id, thread_id);

CREATE OR REPLACE VIEW forum.thread_tags_resolved AS
    SELECT tt.thread_id, t.canonical_id AS tag_id
      FROM forum.thread_tags tt
      JOIN forum.tags t ON t.id = tt.tag_id;

COMMENT ON VIEW forum.thread_tags_resolved IS
    'Canonical-resolved tag edges. Read through this view, never thread_tags directly.';

-- ===========================================
-- RLS — readers see active rows; mutations only via service_* RPCs.
-- (Item 4: direct author UPDATE policies removed; edits route through
-- forum.service_edit_thread / forum.service_edit_comment.)
-- ===========================================

ALTER TABLE forum.spaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_tags  ENABLE ROW LEVEL SECURITY;

-- Item 13 — defense-in-depth FORCE RLS so even table owner respects policies.
ALTER TABLE forum.spaces       FORCE ROW LEVEL SECURITY;
ALTER TABLE forum.tags         FORCE ROW LEVEL SECURITY;
ALTER TABLE forum.threads      FORCE ROW LEVEL SECURITY;
ALTER TABLE forum.comments     FORCE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_tags  FORCE ROW LEVEL SECURITY;

CREATE POLICY spaces_public_read ON forum.spaces
    FOR SELECT TO anon, authenticated
    USING (status <> 'suspended');

CREATE POLICY tags_public_read ON forum.tags
    FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY threads_public_read ON forum.threads
    FOR SELECT TO anon, authenticated
    USING (status IN ('active', 'archived', 'locked', 'sold', 'expired'));
CREATE POLICY threads_author_read_drafts ON forum.threads
    FOR SELECT TO authenticated
    USING (author_id = auth.uid() AND status IN ('draft', 'scheduled', 'pending'));

CREATE POLICY threads_author_insert ON forum.threads
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid() AND status IN ('active', 'draft', 'scheduled'));
-- Item 4: NO direct UPDATE policy on threads. Edits route through
-- forum.service_edit_thread (SECURITY DEFINER, service_role).

CREATE POLICY comments_public_read ON forum.comments
    FOR SELECT TO anon, authenticated
    USING (status = 'active');
CREATE POLICY comments_author_read_drafts ON forum.comments
    FOR SELECT TO authenticated
    USING (author_id = auth.uid() AND status = 'draft');

CREATE POLICY comments_author_insert ON forum.comments
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());
-- Item 4: NO direct UPDATE policy on comments either.

CREATE POLICY thread_tags_public_read ON forum.thread_tags
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Item 8 — explicit grants. RLS policies don't matter without table-level
-- privileges first. Reads broadly available; writes that aren't behind
-- service_* RPCs are listed per-table elsewhere.
GRANT SELECT ON forum.spaces      TO anon, authenticated;
GRANT SELECT ON forum.tags        TO anon, authenticated;
GRANT SELECT ON forum.threads     TO anon, authenticated;
GRANT SELECT ON forum.comments    TO anon, authenticated;
GRANT SELECT ON forum.thread_tags TO anon, authenticated;
GRANT SELECT ON forum.thread_tags_resolved TO anon, authenticated;
-- Author-side INSERTs (only path the policy allows; UPDATE goes via RPC).
GRANT INSERT ON forum.threads  TO authenticated;
GRANT INSERT ON forum.comments TO authenticated;

COMMIT;
