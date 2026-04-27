-- ============================================================
-- FORUM SCHEMA — core tables (spaces, tags, threads, comments).
--
-- Proto source of truth: packages/data/proto/kbve/forum.proto
-- Draft SQL (not yet a dbmate migration). Once the schema shape
-- is locked, wrap these files in a numbered migration under
-- packages/data/sql/dbmate/migrations/.
--
-- Hardening passes applied (see commit history):
--   * 13-item review (target_kind split, partial unique indexes,
--     RLS lockdown, vote concurrency, banned/locked guards, FORCE RLS).
--   * 17-item core review (RPC-only mutations, same-thread parent
--     enforcement, accepted-answer integrity, generated hot_rank,
--     refined feed/comment indexes, typed JSONB index, slug
--     normalization, self-reference guards, tags.updated_at,
--     counter REVOKE, function grant cleanup).
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
-- evolve the two surfaces independently.
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

REVOKE ALL ON FUNCTION forum.update_updated_at() FROM PUBLIC;

-- Reddit-style hot score. IMMUTABLE + PARALLEL SAFE so it can drive the
-- threads.hot_rank generated column (item 7).
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
$$ LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path = '';

COMMENT ON FUNCTION forum.hot_score IS
    'Reddit-style hot ranking. Higher = hotter. 12.5-hour half-life via 45000s denominator.';

GRANT EXECUTE ON FUNCTION forum.hot_score(BIGINT, TIMESTAMPTZ) TO anon, authenticated;

-- Item 12: lowercase + trim slugs at write time, defense-in-depth on top of
-- the regex CHECK on the column.
CREATE OR REPLACE FUNCTION forum.normalize_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.slug IS NOT NULL THEN
        NEW.slug := lower(trim(NEW.slug));
    END IF;
    RETURN NEW;
END;
$$;

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
    'Returns TRUE if a row exists for the given (kind, id). Used by service_* RPCs to validate polymorphic refs before insert.';

REVOKE ALL ON FUNCTION forum.assert_parent_exists(forum.attachment_parent_kind, TEXT) FROM PUBLIC;

-- Banned-user guard. Returns TRUE if the user is currently banned. Used in
-- both RPC bodies and RLS policies (item 2).
CREATE OR REPLACE FUNCTION forum.is_user_banned(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
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

REVOKE ALL ON FUNCTION forum.is_user_banned(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forum.is_user_banned(UUID) TO authenticated;

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
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Item 13: prevent self-parent loops.
    CONSTRAINT spaces_no_self_parent CHECK (parent_space_id IS NULL OR parent_space_id <> id)
);

CREATE INDEX idx_spaces_parent ON forum.spaces (parent_space_id) WHERE parent_space_id IS NOT NULL;
CREATE INDEX idx_spaces_status ON forum.spaces (status);
CREATE INDEX idx_spaces_sort ON forum.spaces (sort_order, slug);
-- Item 11: GIN on flair_config_json for ad-hoc flair lookups.
CREATE INDEX idx_spaces_flair_config_gin
    ON forum.spaces USING GIN (flair_config_json jsonb_path_ops)
    WHERE flair_config_json IS NOT NULL;

CREATE TRIGGER spaces_normalize_slug
    BEFORE INSERT OR UPDATE OF slug ON forum.spaces
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_slug();

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
    -- Item 14: tags get an updated_at column + trigger for parity with
    -- spaces / threads / comments.
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tags_canonical_fkey FOREIGN KEY (canonical_id) REFERENCES forum.tags(id) DEFERRABLE INITIALLY DEFERRED,
    -- Item 13: a tag can't alias itself directly.
    CONSTRAINT tags_no_self_alias CHECK (alias_of IS NULL OR alias_of <> id)
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

CREATE TRIGGER tags_normalize_slug
    BEFORE INSERT OR UPDATE OF slug ON forum.tags
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_slug();

CREATE TRIGGER tags_updated_at
    BEFORE UPDATE ON forum.tags
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

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
    edited_at                   TIMESTAMPTZ,
    -- Item 7: precomputed hot rank, kept in sync via the IMMUTABLE forum.hot_score
    -- function. Used by the feed indexes below for sort-by-hot without per-row
    -- function evaluation.
    hot_rank                    DOUBLE PRECISION GENERATED ALWAYS AS
                                    (forum.hot_score(score, created_at)) STORED,
    -- Item 13: a thread can't crosspost or quote itself.
    CONSTRAINT threads_no_self_crosspost CHECK (cross_posted_from_thread_id IS NULL OR cross_posted_from_thread_id <> id),
    CONSTRAINT threads_no_self_quote     CHECK (quoted_thread_id IS NULL OR quoted_thread_id <> id)
);

-- Item 6: thread slug uniqueness scoped per space.
CREATE UNIQUE INDEX idx_threads_space_slug_unique
    ON forum.threads (space_id, slug)
    WHERE slug IS NOT NULL;

-- Feed indexes (items 7, 8, 9, 10, 11). Partial WHERE status = 'active' so
-- the planner picks the smallest matching variant for the dominant feed
-- workload.
CREATE INDEX idx_threads_feed_hot
    ON forum.threads (space_id, hot_rank DESC, created_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_threads_global_hot
    ON forum.threads (hot_rank DESC, created_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_threads_feed_new
    ON forum.threads (space_id, created_at DESC, id DESC)
    WHERE status = 'active';
CREATE INDEX idx_threads_feed_top
    ON forum.threads (space_id, score DESC, created_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_threads_feed_activity
    ON forum.threads (space_id, pinned DESC, last_activity_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_threads_active_nsfw
    ON forum.threads (nsfw, created_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_threads_type
    ON forum.threads (thread_type, last_activity_at DESC)
    WHERE status = 'active';
-- Item 8: author feed index that respects author-visible statuses (drafts /
-- scheduled / pending / removed not surfaced).
CREATE INDEX idx_threads_author_visible
    ON forum.threads (author_id, created_at DESC)
    WHERE status IN ('active', 'archived', 'locked', 'sold', 'expired');
CREATE INDEX idx_threads_scheduled
    ON forum.threads (scheduled_at) WHERE status = 'scheduled';
-- Item 10: typed timestamp extraction so the planner can do range scans on
-- auction end_time. Replaces the old text-sorted index.
CREATE INDEX idx_threads_auction_end_time_ts
    ON forum.threads (((type_data->>'end_time')::TIMESTAMPTZ))
    WHERE thread_type = 'auction'
      AND status = 'active'
      AND type_data ? 'end_time';
-- Item 11: GIN on the JSONB blob for type-specific filters
-- (e.g. PollData.options @> ['…'], MarketplaceData price ranges).
CREATE INDEX idx_threads_type_data_gin
    ON forum.threads USING GIN (type_data jsonb_path_ops);

CREATE TRIGGER threads_normalize_slug
    BEFORE INSERT OR UPDATE OF slug ON forum.threads
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_slug();

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
    edited_at           TIMESTAMPTZ,
    -- Item 13: a comment can't parent / quote itself.
    CONSTRAINT comments_no_self_parent CHECK (parent_comment_id IS NULL OR parent_comment_id <> id),
    CONSTRAINT comments_no_self_quote  CHECK (quoted_comment_id  IS NULL OR quoted_comment_id  <> id)
);

ALTER TABLE forum.threads
    ADD CONSTRAINT threads_accepted_comment_fkey
    FOREIGN KEY (accepted_comment_id) REFERENCES forum.comments(id) ON DELETE SET NULL;

-- Item 4: at most one accepted answer per thread.
CREATE UNIQUE INDEX idx_comments_one_accepted_per_thread
    ON forum.comments (thread_id)
    WHERE is_accepted = TRUE;

-- Item 9: pagination indexes for tree-style + top-sort comment views.
CREATE INDEX idx_comments_thread_tree
    ON forum.comments (thread_id, parent_comment_id, created_at, id)
    WHERE status = 'active';
CREATE INDEX idx_comments_thread_top
    ON forum.comments (thread_id, score DESC, created_at ASC)
    WHERE status = 'active';
CREATE INDEX idx_comments_author_visible
    ON forum.comments (author_id, created_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_comments_parent
    ON forum.comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- Item 3: parent and child comment must belong to the same thread, depth
-- derived from parent (NULL parent → depth 0). Belt-and-suspenders on top
-- of the depth derivation in service_create_comment.
CREATE OR REPLACE FUNCTION forum.assert_comment_parent_same_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_parent_thread_id TEXT;
    v_parent_depth     INTEGER;
BEGIN
    IF NEW.parent_comment_id IS NULL THEN
        NEW.depth := 0;
        RETURN NEW;
    END IF;

    SELECT thread_id, depth
      INTO v_parent_thread_id, v_parent_depth
      FROM forum.comments
     WHERE id = NEW.parent_comment_id;

    IF v_parent_thread_id IS NULL OR v_parent_thread_id <> NEW.thread_id THEN
        RAISE EXCEPTION 'parent comment must belong to the same thread';
    END IF;

    IF v_parent_depth >= 5 THEN
        RAISE EXCEPTION 'maximum comment depth exceeded';
    END IF;

    NEW.depth := v_parent_depth + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER comments_parent_same_thread
    BEFORE INSERT OR UPDATE OF parent_comment_id, thread_id ON forum.comments
    FOR EACH ROW EXECUTE FUNCTION forum.assert_comment_parent_same_thread();

CREATE TRIGGER comments_updated_at
    BEFORE UPDATE ON forum.comments
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

-- Item 5: accepted_comment_id must reference a comment in the same thread
-- and the comment must be active (no accepting a removed answer).
CREATE OR REPLACE FUNCTION forum.assert_accepted_comment_same_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.accepted_comment_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM forum.comments c
         WHERE c.id = NEW.accepted_comment_id
           AND c.thread_id = NEW.id
           AND c.status = 'active'
    ) THEN
        RAISE EXCEPTION 'accepted comment must be active and belong to the same thread';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER threads_accepted_comment_same_thread
    BEFORE INSERT OR UPDATE OF accepted_comment_id ON forum.threads
    FOR EACH ROW EXECUTE FUNCTION forum.assert_accepted_comment_same_thread();

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

-- Item 13 (review pass 1): defense-in-depth FORCE RLS so even table owner
-- respects policies.
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

-- Item 2: insert policy gates on banned-user check. Item 1 also REVOKEs
-- the table-level INSERT below — both layers enforce the same invariant
-- (RLS + no GRANT) so a future re-GRANT can't accidentally bypass the
-- ban check.
CREATE POLICY threads_author_insert ON forum.threads
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND status IN ('active', 'draft', 'scheduled')
        AND NOT forum.is_user_banned(auth.uid())
    );

CREATE POLICY comments_public_read ON forum.comments
    FOR SELECT TO anon, authenticated
    USING (status = 'active');
CREATE POLICY comments_author_read_drafts ON forum.comments
    FOR SELECT TO authenticated
    USING (author_id = auth.uid() AND status = 'draft');

CREATE POLICY comments_author_insert ON forum.comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND NOT forum.is_user_banned(auth.uid())
    );

CREATE POLICY thread_tags_public_read ON forum.thread_tags
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- ===========================================
-- GRANTS — reads broad, mutations RPC-only (item 1)
-- ===========================================

GRANT SELECT ON forum.spaces                TO anon, authenticated;
GRANT SELECT ON forum.tags                  TO anon, authenticated;
GRANT SELECT ON forum.threads               TO anon, authenticated;
GRANT SELECT ON forum.comments              TO anon, authenticated;
GRANT SELECT ON forum.thread_tags           TO anon, authenticated;
GRANT SELECT ON forum.thread_tags_resolved  TO anon, authenticated;

-- Item 1 / Item 15: lock down all mutation paths on threads / comments /
-- thread_tags. Writes route through service_* RPCs (defined in
-- forum_rpcs.sql) where rate limiting, ban checks, slug normalization,
-- counter updates, and audit logging all live in one path.
REVOKE INSERT, UPDATE, DELETE ON forum.threads     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.comments    FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.thread_tags FROM authenticated;
-- Item 15: column-level REVOKE is redundant with the table-level REVOKE
-- above but makes the intent explicit and survives any future blanket
-- regrant. Counter/score columns are SERVICE-MANAGED ONLY.
REVOKE UPDATE (
    comment_count,
    view_count,
    score,
    upvote_count,
    downvote_count,
    last_activity_at,
    revision_count,
    attachment_count
) ON forum.threads FROM authenticated;
REVOKE UPDATE (
    score,
    upvote_count,
    downvote_count,
    revision_count,
    attachment_count,
    is_accepted
) ON forum.comments FROM authenticated;

COMMIT;
