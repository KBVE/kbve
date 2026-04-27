-- migrate:up

-- ============================================================
-- FORUM SCHEMA — initial migration.
-- Source of truth: packages/data/sql/schema/forum/*.sql.
-- Depends on public.gen_ulid (20260227215000_gen_ulid) + auth.users.
-- ============================================================


-- ============================================================
-- inlined: packages/data/sql/schema/forum/forum_core.sql
-- ============================================================
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
--   * Pass 3 (this file): auction end_time CHECK gate on the typed
--     JSONB index, REVOKE on remaining helper functions, ordering
--     notes for is_user_banned + FORCE RLS.
--
-- Depends on: 20260227215000_gen_ulid (public.gen_ulid function).
--
-- ─── DESIGN NOTES ────────────────────────────────────────────────────────────
--
-- forum.is_user_banned references forum.forum_user_profiles which is
-- created in forum_user.sql. plpgsql function bodies are stored as text
-- and parsed at first call, NOT at CREATE FUNCTION time, so it is safe
-- to declare the function here before the table exists in the migration
-- order. The first invocation only happens after migration completes,
-- by which time forum_user_profiles is live.
--
-- FORCE ROW LEVEL SECURITY is applied to the read-side tables. It does
-- NOT block service_* RPC mutations because Postgres superusers
-- (postgres) and roles with the BYPASSRLS attribute (service_role in
-- Supabase) bypass RLS unconditionally — FORCE RLS only matters when
-- the table owner is a non-superuser without BYPASSRLS. Our migrations
-- run as postgres and the Rust supabase client uses service_role; both
-- bypass.
--
-- Author INSERT policies (threads_author_insert / comments_author_insert)
-- and the table-level INSERT REVOKE for `authenticated` are intentionally
-- both present. The REVOKE makes mutations RPC-only today; the policies
-- stay as the correct-by-construction enforcement if a future change
-- ever re-GRANTs INSERT to authenticated. Banned-user check inside the
-- WITH CHECK never fires under the current GRANT setup but documents the
-- invariant.
-- ============================================================


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

REVOKE ALL ON FUNCTION forum.normalize_slug() FROM PUBLIC;

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

REVOKE ALL ON FUNCTION forum.set_tag_canonical_id() FROM PUBLIC;

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
    CONSTRAINT threads_no_self_quote     CHECK (quoted_thread_id IS NULL OR quoted_thread_id <> id),
    -- Item 5 (review pass 2): the typed-timestamp index
    -- idx_threads_auction_end_time_ts blows up if `end_time` is present
    -- but malformed. Reject obvious garbage at write time so the index
    -- expression is always castable. Loose ISO-8601 prefix check —
    -- service_create_thread is expected to write proper TIMESTAMPTZ
    -- strings, this is a belt-and-suspenders sanity gate.
    CONSTRAINT threads_auction_end_time_valid CHECK (
        thread_type <> 'auction'
        OR NOT (type_data ? 'end_time')
        OR (type_data->>'end_time') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    )
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
-- Auction end_time queries route through idx_threads_type_data_gin
-- below. The original plan was a typed-timestamp expression index, but
-- text→TIMESTAMP / TIMESTAMPTZ casts are STABLE (DateStyle GUC) and
-- Postgres rejects them in index expressions. The CHECK constraint
-- threads_auction_end_time_valid still gates write-time format so the
-- GIN scan can rely on a parsable end_time when a query needs one.
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

REVOKE ALL ON FUNCTION forum.assert_comment_parent_same_thread() FROM PUBLIC;

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

REVOKE ALL ON FUNCTION forum.assert_accepted_comment_same_thread() FROM PUBLIC;

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


-- ============================================================
-- inlined: packages/data/sql/schema/forum/forum_user.sql
-- ============================================================
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
    USING (user_id = auth.uid());

CREATE POLICY bookmarks_self_insert ON forum.bookmarks
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY bookmarks_self_update ON forum.bookmarks
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY bookmarks_self_delete ON forum.bookmarks
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

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
    USING (user_id = auth.uid());

CREATE POLICY thread_subscriptions_self_insert ON forum.thread_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY thread_subscriptions_self_update ON forum.thread_subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY thread_subscriptions_self_delete ON forum.thread_subscriptions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

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


-- ============================================================
-- inlined: packages/data/sql/schema/forum/forum_engagement.sql
-- ============================================================
-- ============================================================
-- FORUM SCHEMA — engagement tables.
--
-- Votes (private, reddit-style), reactions (emoji), auction bid
-- history, poll vote audit trail.
--
-- Votes are PRIVATE: only the voter sees their own row. Aggregate
-- totals (upvote_count / downvote_count / score) on threads +
-- comments are maintained by service_cast_* RPCs.
--
-- Hardening pass:
--   * Vote rows never store 'cleared' — service_cast_* deletes the
--     row instead. CHECK enforces the invariant on disk.
--   * thread_votes / comment_votes / poll_votes / auction_bids /
--     reactions are RPC-only. Mutations REVOKEd from authenticated.
--   * Reactions get a polymorphic parent-exists trigger as belt-and-
--     suspenders behind service_toggle_reaction.
--   * Auction bids gate on (thread_type='auction' AND active AND
--     unlocked) and currency is normalized to lowercase.
--   * Poll votes gate on (thread_type='poll' AND active AND unlocked)
--     and option_indices is bounded + unique.
--   * voter_recent indexes drive "my recent votes" UI without a
--     full scan.
-- ============================================================


-- ===========================================
-- THREAD_VOTES — reddit-style, private, one row per voter
-- ===========================================

CREATE TABLE forum.thread_votes (
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- service_cast_thread_vote DELETEs on 'cleared' so persisted rows
    -- are always 'up' or 'down'.
    direction   forum.vote_direction NOT NULL CHECK (direction IN ('up', 'down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, voter_id)
);

CREATE INDEX idx_thread_votes_voter_recent
    ON forum.thread_votes (voter_id, updated_at DESC);
CREATE INDEX idx_thread_votes_thread_dir
    ON forum.thread_votes (thread_id, direction);

CREATE TRIGGER thread_votes_updated_at
    BEFORE UPDATE ON forum.thread_votes
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

-- Identity guard. Catches service_role mistakes that try to UPDATE the
-- (thread_id, voter_id) primary key columns instead of upserting.
-- Shared across thread/comment/poll vote tables — TG_TABLE_NAME picks
-- the right column pair.
CREATE OR REPLACE FUNCTION forum.prevent_vote_identity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'thread_votes' THEN
        IF NEW.thread_id IS DISTINCT FROM OLD.thread_id
        OR NEW.voter_id  IS DISTINCT FROM OLD.voter_id THEN
            RAISE EXCEPTION 'thread_votes identity fields are immutable';
        END IF;
    ELSIF TG_TABLE_NAME = 'comment_votes' THEN
        IF NEW.comment_id IS DISTINCT FROM OLD.comment_id
        OR NEW.voter_id   IS DISTINCT FROM OLD.voter_id THEN
            RAISE EXCEPTION 'comment_votes identity fields are immutable';
        END IF;
    ELSIF TG_TABLE_NAME = 'poll_votes' THEN
        IF NEW.thread_id IS DISTINCT FROM OLD.thread_id
        OR NEW.voter_id  IS DISTINCT FROM OLD.voter_id THEN
            RAISE EXCEPTION 'poll_votes identity fields are immutable';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.prevent_vote_identity_mutation() FROM PUBLIC;

CREATE TRIGGER thread_votes_identity_immutable
    BEFORE UPDATE ON forum.thread_votes
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_vote_identity_mutation();

ALTER TABLE forum.thread_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY thread_votes_self_read ON forum.thread_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

-- Writes go through forum.service_cast_thread_vote (service_role).

-- ===========================================
-- COMMENT_VOTES — same shape as thread_votes
-- ===========================================

CREATE TABLE forum.comment_votes (
    comment_id  TEXT NOT NULL REFERENCES forum.comments(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- service_cast_comment_vote DELETEs on 'cleared'.
    direction   forum.vote_direction NOT NULL CHECK (direction IN ('up', 'down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, voter_id)
);

CREATE INDEX idx_comment_votes_voter_recent
    ON forum.comment_votes (voter_id, updated_at DESC);
CREATE INDEX idx_comment_votes_comment_dir
    ON forum.comment_votes (comment_id, direction);

CREATE TRIGGER comment_votes_updated_at
    BEFORE UPDATE ON forum.comment_votes
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

CREATE TRIGGER comment_votes_identity_immutable
    BEFORE UPDATE ON forum.comment_votes
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_vote_identity_mutation();

ALTER TABLE forum.comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.comment_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY comment_votes_self_read ON forum.comment_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

-- ===========================================
-- REACTIONS — polymorphic on thread OR comment
-- Item 2: nullable custom_kind dedupe via expression unique index
-- (table-level UNIQUE with NULL columns silently allows duplicates).
-- ===========================================

CREATE TABLE forum.reactions (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    parent_kind     forum.attachment_parent_kind NOT NULL
        CHECK (parent_kind IN ('thread', 'comment')),
    parent_id       TEXT NOT NULL,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            forum.reaction_kind NOT NULL,
    -- Format gate: lowercase emoji shortcodes (party_blob, kbve:wave).
    custom_kind     TEXT CHECK (
        custom_kind IS NULL
        OR custom_kind ~ '^[a-z0-9_:-]{1,50}$'
    ),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enforce: custom_kind is only meaningful when kind = 'custom'.
    CHECK ((kind = 'custom' AND custom_kind IS NOT NULL) OR (kind <> 'custom' AND custom_kind IS NULL))
);

-- Item 2: expression unique index using COALESCE so NULL custom_kind dedupes
-- correctly. A plain table-level UNIQUE would treat each NULL as distinct and
-- let duplicate (parent, user, kind) rows slip through.
CREATE UNIQUE INDEX ux_reactions_once
    ON forum.reactions (
        parent_kind,
        parent_id,
        user_id,
        kind,
        COALESCE(custom_kind, '')
    );

-- Aggregation index for "show emoji counts per parent". Includes
-- custom_kind so GROUP BY (kind, custom_kind) can be index-only.
CREATE INDEX idx_reactions_target_counts
    ON forum.reactions (parent_kind, parent_id, kind, custom_kind);
CREATE INDEX idx_reactions_user
    ON forum.reactions (user_id, created_at DESC);
-- "Did I react to this parent?" UI lookup (per-user reactions on a
-- given target). Distinct from idx_reactions_user (recent activity).
CREATE INDEX idx_reactions_user_parent
    ON forum.reactions (user_id, parent_kind, parent_id, kind, custom_kind);

-- Lowercase + trim so dedupe and UI matching see canonical strings.
CREATE OR REPLACE FUNCTION forum.normalize_reaction_custom_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.custom_kind IS NOT NULL THEN
        NEW.custom_kind := lower(trim(NEW.custom_kind));
        IF NEW.custom_kind = '' THEN
            NEW.custom_kind := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_reaction_custom_kind() FROM PUBLIC;

CREATE TRIGGER reactions_normalize_custom_kind
    BEFORE INSERT OR UPDATE OF custom_kind ON forum.reactions
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_reaction_custom_kind();

ALTER TABLE forum.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.reactions FORCE ROW LEVEL SECURITY;

CREATE POLICY reactions_public_read ON forum.reactions
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes through forum.service_toggle_reaction (service_role).
-- No author INSERT/DELETE policy: REVOKE on the table makes the RPC
-- the single mutation surface, and the RPC enforces banned-user +
-- parent-exists + locked-thread checks before writing.

-- Belt-and-suspenders: even service_role inserts must reference a real
-- parent in the matching state. Catches RPC bugs and ad-hoc backfills.
CREATE OR REPLACE FUNCTION forum.assert_reaction_parent_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.parent_kind = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.threads
             WHERE id = NEW.parent_id
               AND status NOT IN ('removed', 'draft', 'pending', 'scheduled')
        ) THEN
            RAISE EXCEPTION 'reaction parent thread % not visible', NEW.parent_id;
        END IF;
    ELSIF NEW.parent_kind = 'comment' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.comments
             WHERE id = NEW.parent_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'reaction parent comment % not active', NEW.parent_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_reaction_parent_exists() FROM PUBLIC;

CREATE TRIGGER reactions_parent_exists
    BEFORE INSERT ON forum.reactions
    FOR EACH ROW EXECUTE FUNCTION forum.assert_reaction_parent_exists();

-- ===========================================
-- AUCTION_BIDS — append-only bid history per auction thread
-- ===========================================

CREATE TABLE forum.auction_bids (
    id          TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    bidder_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount      BIGINT NOT NULL CHECK (amount > 0),
    -- Lowercased + bounded by normalize_auction_bid_currency trigger.
    -- Format gate keeps storage tidy (usd, eur, gp, kbve_credit, etc).
    currency    TEXT NOT NULL CHECK (currency ~ '^[a-z0-9_:-]{1,32}$'),
    retracted   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_bids_thread_amount
    ON forum.auction_bids (thread_id, amount DESC);
CREATE INDEX idx_auction_bids_bidder
    ON forum.auction_bids (bidder_id, created_at DESC);
-- "My bids on thread X" without scanning the whole bidder history.
CREATE INDEX idx_auction_bids_bidder_thread
    ON forum.auction_bids (bidder_id, thread_id, created_at DESC);
-- Hot path for "current winning bid": filter retracted out, sort by
-- amount desc + earliest tiebreaker. INCLUDE keeps bidder_id +
-- currency in the leaf so winner display can be index-only.
CREATE INDEX idx_auction_bids_current
    ON forum.auction_bids (thread_id, amount DESC, created_at ASC)
    INCLUDE (bidder_id, currency)
    WHERE retracted = FALSE;

CREATE OR REPLACE FUNCTION forum.normalize_auction_bid_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.currency := lower(trim(NEW.currency));
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_auction_bid_currency() FROM PUBLIC;

CREATE TRIGGER auction_bids_normalize_currency
    BEFORE INSERT ON forum.auction_bids
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_auction_bid_currency();

CREATE OR REPLACE FUNCTION forum.assert_auction_bid_valid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM forum.threads
         WHERE id = NEW.thread_id
           AND thread_type = 'auction'
           AND status = 'active'
           AND locked = FALSE
    ) THEN
        RAISE EXCEPTION 'bids only allowed on active unlocked auction threads';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_auction_bid_valid() FROM PUBLIC;

CREATE TRIGGER auction_bids_valid
    BEFORE INSERT ON forum.auction_bids
    FOR EACH ROW EXECUTE FUNCTION forum.assert_auction_bid_valid();

-- Append-only at the row layer: only `retracted` may flip after insert.
CREATE OR REPLACE FUNCTION forum.prevent_auction_bid_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.id          IS DISTINCT FROM OLD.id
    OR NEW.thread_id   IS DISTINCT FROM OLD.thread_id
    OR NEW.bidder_id   IS DISTINCT FROM OLD.bidder_id
    OR NEW.amount      IS DISTINCT FROM OLD.amount
    OR NEW.currency    IS DISTINCT FROM OLD.currency
    OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'auction bids are append-only; only retracted may change';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.prevent_auction_bid_mutation() FROM PUBLIC;

CREATE TRIGGER auction_bids_append_only
    BEFORE UPDATE ON forum.auction_bids
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_auction_bid_mutation();

ALTER TABLE forum.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.auction_bids FORCE ROW LEVEL SECURITY;

CREATE POLICY auction_bids_public_read ON forum.auction_bids
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes through service_place_bid RPC.

-- ===========================================
-- POLL_VOTES — audit trail for non-anonymous polls
-- ===========================================

CREATE TABLE forum.poll_votes (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    thread_id       TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    voter_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    option_indices  INTEGER[] NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (thread_id, voter_id),
    CONSTRAINT poll_votes_options_not_empty
        CHECK (cardinality(option_indices) > 0),
    CONSTRAINT poll_votes_options_bounded
        CHECK (cardinality(option_indices) <= 20)
);

CREATE INDEX idx_poll_votes_thread ON forum.poll_votes (thread_id);
-- "My recent poll votes" UI lookup, parallel to thread/comment vote indexes.
CREATE INDEX idx_poll_votes_voter_recent
    ON forum.poll_votes (voter_id, updated_at DESC);

CREATE TRIGGER poll_votes_updated_at
    BEFORE UPDATE ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

CREATE TRIGGER poll_votes_identity_immutable
    BEFORE UPDATE ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_vote_identity_mutation();

-- Single pass over the array: collect total count, distinct count,
-- and non-negative count in one unnest scan.
CREATE OR REPLACE FUNCTION forum.assert_poll_vote_options_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_total      INTEGER;
    v_distinct   INTEGER;
    v_non_neg    INTEGER;
BEGIN
    SELECT COUNT(*), COUNT(DISTINCT x), COUNT(*) FILTER (WHERE x >= 0)
      INTO v_total, v_distinct, v_non_neg
      FROM unnest(NEW.option_indices) AS x;

    IF v_non_neg <> v_total THEN
        RAISE EXCEPTION 'poll option indices must be non-negative';
    END IF;
    IF v_distinct <> v_total THEN
        RAISE EXCEPTION 'poll option indices must be unique';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_poll_vote_options_unique() FROM PUBLIC;

CREATE TRIGGER poll_votes_unique_options
    BEFORE INSERT OR UPDATE OF option_indices ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.assert_poll_vote_options_unique();

-- Combined gate: poll thread must be active+unlocked AND every
-- option_index must fall within type_data->'options'. Single thread
-- lookup serves both checks (was two lookups before).
CREATE OR REPLACE FUNCTION forum.assert_poll_vote_valid_full()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_option_count INTEGER;
BEGIN
    SELECT jsonb_array_length(t.type_data->'options')
      INTO v_option_count
      FROM forum.threads t
     WHERE t.id          = NEW.thread_id
       AND t.thread_type = 'poll'
       AND t.status      = 'active'
       AND t.locked      = FALSE;

    IF v_option_count IS NULL OR v_option_count <= 0 THEN
        RAISE EXCEPTION 'poll votes only allowed on active unlocked polls with options';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(NEW.option_indices) AS x
         WHERE x >= v_option_count
    ) THEN
        RAISE EXCEPTION 'poll option index out of range (max %)', v_option_count - 1;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_poll_vote_valid_full() FROM PUBLIC;

CREATE TRIGGER poll_votes_valid_full
    BEFORE INSERT OR UPDATE OF thread_id, option_indices ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.assert_poll_vote_valid_full();

ALTER TABLE forum.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.poll_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY poll_votes_self_read ON forum.poll_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

-- ============================================================
-- Grants — engagement is RPC-only on the write side.
--
-- Reads are public for reactions / auction_bids; private (self-row)
-- for thread_votes / comment_votes / poll_votes via RLS.
-- ============================================================

-- Public reads.
GRANT SELECT ON forum.reactions     TO anon, authenticated;
GRANT SELECT ON forum.auction_bids  TO anon, authenticated;

-- Private reads (RLS limits to voter_id = auth.uid()).
GRANT SELECT ON forum.thread_votes  TO authenticated;
GRANT SELECT ON forum.comment_votes TO authenticated;
GRANT SELECT ON forum.poll_votes    TO authenticated;

-- No GRANT INSERT/UPDATE/DELETE on engagement tables to authenticated.
-- All mutations route through service_* RPCs (service_role only).
-- Explicit REVOKE belt-and-suspenders against any future schema-wide
-- GRANT ALL — applied to both authenticated and anon for completeness.
REVOKE INSERT, UPDATE, DELETE ON forum.thread_votes  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.comment_votes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.poll_votes    FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.auction_bids  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.reactions     FROM authenticated, anon;

-- service_role bypasses RLS, but explicit GRANT keeps RPC writes
-- working even if a future schema-wide REVOKE ALL strips defaults.
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.thread_votes  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.comment_votes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.poll_votes    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.auction_bids  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.reactions     TO service_role;

-- Documentation. Future migrations should not GRANT writes to anon /
-- authenticated; mutations belong inside service_* RPCs.
COMMENT ON TABLE forum.thread_votes  IS
    'Private vote rows. RPC-only mutation surface. Do not grant direct writes to anon/authenticated.';
COMMENT ON TABLE forum.comment_votes IS
    'Private comment vote rows. RPC-only mutation surface. Do not grant direct writes to anon/authenticated.';
COMMENT ON TABLE forum.reactions     IS
    'Publicly readable reactions. RPC-only mutation surface. Parent validity enforced by trigger.';
COMMENT ON TABLE forum.auction_bids  IS
    'Append-only auction bid history. RPC-only mutation surface. Only retracted is mutable post-insert.';
COMMENT ON TABLE forum.poll_votes    IS
    'Private poll vote audit rows. RPC-only mutation surface.';


-- ============================================================
-- inlined: packages/data/sql/schema/forum/forum_moderation.sql
-- ============================================================
-- ============================================================
-- FORUM SCHEMA — moderation + notifications + attachments.
--
-- Reports (user-filed), ModerationAction (append-only audit log),
-- Notifications (per-recipient inbox), Attachments (polymorphic
-- media linkage).
--
-- Item 1: reports / moderation_actions / notifications use the
-- `forum.target_kind` enum (thread/comment/space/user). Attachments
-- keep `forum.attachment_parent_kind` so the two surfaces evolve
-- independently.
--
-- Item 2: reports use a partial unique INDEX on (reporter, target)
-- WHERE resolved_at IS NULL — table-level UNIQUE with NULL columns
-- silently allows duplicates.
--
-- Hardening pass:
--   * reports + attachments are RPC-only on the write side.
--     forum.service_create_report / service_resolve_report /
--     service_attach_media / service_delete_attachment own mutations.
--   * notifications: clients only get column-level UPDATE on read_at.
--     No way to mutate body / kind / actor / target from the client.
--   * moderation_actions is append-only end-to-end — even service_role
--     loses UPDATE/DELETE so the audit trail is tamper-resistant.
--   * Polymorphic targets are validated at write time:
--       - reports → forum.assert_target_exists (thread/comment/space/user)
--       - attachments → forum.assert_parent_exists (from core)
--   * Notifications enforce the (target_kind, target_id) pair invariant
--     and split the recipient-inbox index by read state.
--   * Attachments require https URLs and matching kind/mime pairs.
-- ============================================================


-- ===========================================
-- HELPERS — target existence check (target_kind enum surface)
-- ===========================================

-- Polymorphic existence check for the moderation surface (target_kind).
-- Catches malformed UUIDs in invalid_text_representation so the trigger
-- returns FALSE instead of erroring on bad input.
CREATE OR REPLACE FUNCTION forum.assert_target_exists(
    p_kind forum.target_kind,
    p_id   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_kind = 'thread' THEN
        RETURN EXISTS (SELECT 1 FROM forum.threads  WHERE id = p_id);
    ELSIF p_kind = 'comment' THEN
        RETURN EXISTS (SELECT 1 FROM forum.comments WHERE id = p_id);
    ELSIF p_kind = 'space' THEN
        RETURN EXISTS (SELECT 1 FROM forum.spaces   WHERE id = p_id::UUID);
    ELSIF p_kind = 'user' THEN
        RETURN EXISTS (SELECT 1 FROM auth.users     WHERE id = p_id::UUID);
    END IF;
    RETURN FALSE;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_target_exists(forum.target_kind, TEXT) FROM PUBLIC;

-- ===========================================
-- REPORTS — user flags bad content / users
-- ===========================================

CREATE TABLE forum.reports (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    reporter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_kind     forum.target_kind NOT NULL,
    target_id       TEXT NOT NULL,
    reason          forum.report_reason NOT NULL,
    reason_detail   TEXT CHECK (reason_detail IS NULL OR char_length(reason_detail) <= 2000),
    resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Resolution must be atomic: both columns set or both NULL.
    CONSTRAINT reports_resolution_pair CHECK (
        (resolved_at IS NULL AND resolved_by IS NULL)
        OR
        (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    )
);

-- Item 2: one open report per (reporter, target). Partial unique index
-- avoids the NULL-comparison gotcha — once resolved_at is set, the row
-- exits the index and a re-report is allowed.
CREATE UNIQUE INDEX ux_reports_open_once
    ON forum.reports (reporter_id, target_kind, target_id)
    WHERE resolved_at IS NULL;

CREATE INDEX idx_reports_unresolved
    ON forum.reports (created_at DESC)
    WHERE resolved_at IS NULL;
CREATE INDEX idx_reports_target
    ON forum.reports (target_kind, target_id);
CREATE INDEX idx_reports_reason
    ON forum.reports (reason, created_at DESC)
    WHERE resolved_at IS NULL;
-- Mod-queue lookup: "show me unresolved reports against this target".
-- Distinct from idx_reports_target which covers historical lookups too.
CREATE INDEX idx_reports_unresolved_target
    ON forum.reports (target_kind, target_id, created_at DESC)
    WHERE resolved_at IS NULL;
-- RPC-side rate limiting: "how many reports has this user filed in
-- the last N minutes".
CREATE INDEX idx_reports_reporter_recent
    ON forum.reports (reporter_id, created_at DESC);

CREATE OR REPLACE FUNCTION forum.assert_report_target_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT forum.assert_target_exists(NEW.target_kind, NEW.target_id) THEN
        RAISE EXCEPTION 'report target % % does not exist', NEW.target_kind, NEW.target_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_report_target_exists() FROM PUBLIC;

CREATE TRIGGER reports_target_exists
    BEFORE INSERT OR UPDATE OF target_kind, target_id ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_report_target_exists();

-- Stricter than assert_target_exists: blocks reports against threads
-- already in removed/draft/pending/scheduled state and non-active
-- comments. Stops reports from being filed against content that was
-- already actioned.
CREATE OR REPLACE FUNCTION forum.assert_report_target_visible()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.target_kind = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.threads
             WHERE id = NEW.target_id
               AND status NOT IN ('removed', 'draft', 'pending', 'scheduled')
        ) THEN
            RAISE EXCEPTION 'cannot report non-visible thread %', NEW.target_id;
        END IF;
    ELSIF NEW.target_kind = 'comment' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.comments
             WHERE id = NEW.target_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'cannot report non-active comment %', NEW.target_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_report_target_visible() FROM PUBLIC;

CREATE TRIGGER reports_target_visible
    BEFORE INSERT ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_report_target_visible();

CREATE OR REPLACE FUNCTION forum.assert_report_not_self_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.target_kind = 'user' AND NEW.target_id = NEW.reporter_id::TEXT THEN
        RAISE EXCEPTION 'users cannot report themselves';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_report_not_self_user() FROM PUBLIC;

CREATE TRIGGER reports_not_self_user
    BEFORE INSERT ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_report_not_self_user();

-- Defense-in-depth: even though service_create_report checks
-- is_user_banned, the trigger blocks any direct service_role insert
-- that bypasses the RPC guard.
CREATE OR REPLACE FUNCTION forum.assert_reporter_not_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF forum.is_user_banned(NEW.reporter_id) THEN
        RAISE EXCEPTION 'banned users cannot file reports';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_reporter_not_banned() FROM PUBLIC;

CREATE TRIGGER reports_not_banned
    BEFORE INSERT ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_reporter_not_banned();

-- Trim reason_detail and collapse empty strings to NULL so analytics
-- and partial unique indexes don't see whitespace duplicates.
CREATE OR REPLACE FUNCTION forum.normalize_report_detail()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.reason_detail IS NOT NULL THEN
        NEW.reason_detail := trim(NEW.reason_detail);
        IF NEW.reason_detail = '' THEN
            NEW.reason_detail := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_report_detail() FROM PUBLIC;

CREATE TRIGGER reports_normalize_detail
    BEFORE INSERT OR UPDATE OF reason_detail ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_report_detail();

ALTER TABLE forum.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.reports FORCE ROW LEVEL SECURITY;

CREATE POLICY reports_self_read ON forum.reports
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

-- Writes through forum.service_create_report (service_role).
-- No author INSERT policy: the table-level REVOKE makes the RPC the
-- single mutation surface, and the RPC enforces banned-user +
-- target-exists + not-self-report invariants.

-- ===========================================
-- MODERATION_ACTIONS — append-only audit log
-- ===========================================

CREATE TABLE forum.moderation_actions (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    moderator_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    kind            forum.moderation_action_kind NOT NULL,
    target_kind     forum.target_kind NOT NULL,
    target_id       TEXT NOT NULL,
    reason          TEXT CHECK (reason IS NULL OR char_length(reason) <= 2000),
    metadata_json   JSONB,
    -- Groups multi-step moderation actions (e.g. "ban + remove all
    -- posts + clear reports") into one audit chain.
    correlation_id  TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) <= 64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Mods cannot moderate themselves.
    CONSTRAINT moderation_actions_no_self_target_user CHECK (
        NOT (target_kind = 'user' AND target_id = moderator_id::TEXT)
    )
);

CREATE INDEX idx_moderation_actions_target
    ON forum.moderation_actions (target_kind, target_id, created_at DESC);
CREATE INDEX idx_moderation_actions_moderator
    ON forum.moderation_actions (moderator_id, created_at DESC);
CREATE INDEX idx_moderation_actions_kind
    ON forum.moderation_actions (kind, created_at DESC);
-- Search by metadata (e.g. {"ban_kind": "shadow"}). jsonb_path_ops is
-- the smaller / faster GIN op class for @> containment.
CREATE INDEX idx_moderation_actions_metadata_gin
    ON forum.moderation_actions USING GIN (metadata_json jsonb_path_ops)
    WHERE metadata_json IS NOT NULL;
-- Group lookup for a multi-step moderation chain. DESC matches the
-- most common read pattern (newest action in chain first).
CREATE INDEX idx_moderation_actions_correlation
    ON forum.moderation_actions (correlation_id, created_at DESC)
    WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION forum.assert_mod_action_target_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT forum.assert_target_exists(NEW.target_kind, NEW.target_id) THEN
        RAISE EXCEPTION 'moderation action target % % does not exist',
            NEW.target_kind, NEW.target_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_mod_action_target_exists() FROM PUBLIC;

CREATE TRIGGER moderation_actions_target_exists
    BEFORE INSERT ON forum.moderation_actions
    FOR EACH ROW EXECUTE FUNCTION forum.assert_mod_action_target_exists();

ALTER TABLE forum.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.moderation_actions FORCE ROW LEVEL SECURITY;

-- Public read of mod log — transparency by default.
CREATE POLICY moderation_actions_public_read ON forum.moderation_actions
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Append-only end-to-end. Even service_role drops UPDATE / DELETE so
-- the audit trail is tamper-resistant. Inserts route through
-- forum.service_record_moderation_action.

-- ===========================================
-- NOTIFICATIONS — per-recipient inbox
-- ===========================================

CREATE TABLE forum.notifications (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    recipient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            forum.notification_kind NOT NULL,
    actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_kind     forum.target_kind,
    target_id       TEXT,
    body            TEXT CHECK (body IS NULL OR char_length(body) <= 500),
    read_at         TIMESTAMPTZ,
    -- Optional TTL. Cleanup job sweeps expired rows.
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- target_kind and target_id must be set together or both NULL.
    CONSTRAINT notifications_target_pair
        CHECK (
            (target_kind IS NULL AND target_id IS NULL)
            OR
            (target_kind IS NOT NULL AND target_id IS NOT NULL)
        )
);

CREATE INDEX idx_notifications_recipient
    ON forum.notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread
    ON forum.notifications (recipient_id, created_at DESC)
    WHERE read_at IS NULL;
-- Inbox toggle: list by read state then time.
CREATE INDEX idx_notifications_recipient_read
    ON forum.notifications (recipient_id, read_at, created_at DESC);
-- Cleanup sweep: delete read notifications older than N days.
CREATE INDEX idx_notifications_old_read
    ON forum.notifications (created_at)
    WHERE read_at IS NOT NULL;
-- TTL sweep.
CREATE INDEX idx_notifications_expiry
    ON forum.notifications (expires_at)
    WHERE expires_at IS NOT NULL;
-- Anti-spam dedupe split by target presence. We can't COALESCE the
-- target_kind enum into a sentinel because enum→text is STABLE (rename
-- via ALTER TYPE) and Postgres rejects STABLE functions in index
-- expressions. Splitting into two partials avoids the cast entirely
-- and the notifications_target_pair CHECK guarantees target_kind +
-- target_id are set/cleared together so the targeted index sees both
-- NOT NULL together. actor_id (nullable UUID) still uses a literal
-- sentinel — UUID literal cast is IMMUTABLE.
CREATE UNIQUE INDEX ux_notifications_dedupe_unread_targeted
    ON forum.notifications (
        recipient_id,
        kind,
        COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::UUID),
        target_kind,
        target_id
    )
    WHERE read_at IS NULL AND target_kind IS NOT NULL;

CREATE UNIQUE INDEX ux_notifications_dedupe_unread_targetless
    ON forum.notifications (
        recipient_id,
        kind,
        COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::UUID)
    )
    WHERE read_at IS NULL AND target_kind IS NULL;
-- Bulk mark-all-read fast path. Smaller than idx_notifications_unread
-- because it omits created_at — the bulk UPDATE only filters on
-- (recipient_id, read_at IS NULL).
CREATE INDEX idx_notifications_unread_only
    ON forum.notifications (recipient_id)
    WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION forum.assert_notification_target_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.target_kind IS NOT NULL THEN
        IF NOT forum.assert_target_exists(NEW.target_kind, NEW.target_id) THEN
            RAISE EXCEPTION 'notification target % % does not exist',
                NEW.target_kind, NEW.target_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_notification_target_exists() FROM PUBLIC;

CREATE TRIGGER notifications_target_exists
    BEFORE INSERT OR UPDATE OF target_kind, target_id ON forum.notifications
    FOR EACH ROW EXECUTE FUNCTION forum.assert_notification_target_exists();

ALTER TABLE forum.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_self_read ON forum.notifications
    FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

-- Mark-as-read only. RLS row gate + column-level GRANT (in the grants
-- block below) means clients can flip read_at on their own rows but
-- not touch body / kind / actor / target.
CREATE POLICY notifications_self_update ON forum.notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

-- Deletes only through service_role.

-- ===========================================
-- ATTACHMENTS — polymorphic media / link / file on any parent
-- ===========================================

CREATE TABLE forum.attachments (
    id                  TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    parent_kind         forum.attachment_parent_kind NOT NULL,
    parent_id           TEXT NOT NULL,
    kind                forum.attachment_kind NOT NULL,
    url                 TEXT NOT NULL CHECK (
        char_length(url) <= 2048
        AND url ~* '^https://'
    ),
    -- IANA-ish format: type/subtype with the subset of legal chars.
    mime_type           TEXT CHECK (
        mime_type IS NULL
        OR (
            char_length(mime_type) <= 128
            AND mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
        )
    ),
    -- 50 MiB upper bound. Tune per product; image hosts can lower
    -- via column-level CHECK on a per-uploader_role basis later.
    size_bytes          BIGINT CHECK (
        size_bytes IS NULL
        OR (size_bytes >= 0 AND size_bytes <= 50 * 1024 * 1024)
    ),
    width               INTEGER CHECK (width IS NULL OR width > 0),
    height              INTEGER CHECK (height IS NULL OR height > 0),
    duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    alt_text            TEXT CHECK (alt_text IS NULL OR char_length(alt_text) <= 500),
    title               TEXT CHECK (title IS NULL OR char_length(title) <= 300),
    preview_image_url   TEXT CHECK (
        preview_image_url IS NULL
        OR (char_length(preview_image_url) <= 2048 AND preview_image_url ~* '^https://')
    ),
    language            TEXT CHECK (language IS NULL OR char_length(language) <= 32),
    uploader_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    -- Keep mime_type aligned with the high-level kind. Skip for file /
    -- code (any) and link (mime is irrelevant — usually NULL).
    CONSTRAINT attachments_kind_mime_consistent CHECK (
        mime_type IS NULL
        OR kind IN ('file', 'code')
        OR (kind = 'image' AND mime_type LIKE 'image/%')
        OR (kind = 'video' AND mime_type LIKE 'video/%')
        OR (kind = 'audio' AND mime_type LIKE 'audio/%')
        OR (kind = 'link')
    ),
    -- Catch obviously bogus dimensions (e.g. corrupt EXIF).
    CONSTRAINT attachments_dims_sane CHECK (
        kind NOT IN ('image', 'video')
        OR (
            (width  IS NULL OR width  <= 16384)
            AND
            (height IS NULL OR height <= 16384)
        )
    )
);

CREATE INDEX idx_attachments_parent
    ON forum.attachments (parent_kind, parent_id, sort_order);
CREATE INDEX idx_attachments_uploader
    ON forum.attachments (uploader_id, created_at DESC);
CREATE INDEX idx_attachments_kind
    ON forum.attachments (kind);
-- One URL per parent. Stops accidental double-uploads + lets the RPC
-- treat (parent, url) as a natural key.
CREATE UNIQUE INDEX ux_attachments_dedupe
    ON forum.attachments (parent_kind, parent_id, url);

CREATE OR REPLACE FUNCTION forum.normalize_attachment_language()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.language IS NOT NULL THEN
        NEW.language := lower(trim(NEW.language));
        IF NEW.language = '' THEN
            NEW.language := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_attachment_language() FROM PUBLIC;

CREATE TRIGGER attachments_normalize_language
    BEFORE INSERT OR UPDATE OF language ON forum.attachments
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_attachment_language();

-- Stricter than core forum.assert_parent_exists: thread / comment
-- parents must be in a visible state. Stops attachments from being
-- attached to removed or draft content.
CREATE OR REPLACE FUNCTION forum.assert_attachment_parent_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.parent_kind = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.threads
             WHERE id = NEW.parent_id
               AND status NOT IN ('removed', 'draft', 'pending', 'scheduled')
        ) THEN
            RAISE EXCEPTION 'attachment parent thread % not visible', NEW.parent_id;
        END IF;
    ELSIF NEW.parent_kind = 'comment' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.comments
             WHERE id = NEW.parent_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'attachment parent comment % not active', NEW.parent_id;
        END IF;
    ELSE
        IF NOT forum.assert_parent_exists(NEW.parent_kind, NEW.parent_id) THEN
            RAISE EXCEPTION 'attachment parent % % does not exist',
                NEW.parent_kind, NEW.parent_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_attachment_parent_exists() FROM PUBLIC;

CREATE TRIGGER attachments_parent_exists
    BEFORE INSERT OR UPDATE OF parent_kind, parent_id ON forum.attachments
    FOR EACH ROW EXECUTE FUNCTION forum.assert_attachment_parent_exists();

ALTER TABLE forum.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY attachments_public_read ON forum.attachments
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes through forum.service_attach_media / service_delete_attachment
-- (service_role). Table-level REVOKE makes the RPC the single mutation
-- surface; RPC enforces banned-user + uploader-owns-parent gates.

-- ============================================================
-- Grants — moderation surface is RPC-only on the write side.
--
-- Reports + attachments + notifications mutations route through
-- service_* RPCs. Notifications get a column-level GRANT so users can
-- mark-as-read but cannot rewrite kind / actor / target / body.
-- moderation_actions is append-only end-to-end: even service_role
-- loses UPDATE / DELETE.
-- ============================================================

-- Public reads.
GRANT SELECT ON forum.moderation_actions TO anon, authenticated;
GRANT SELECT ON forum.attachments        TO anon, authenticated;

-- Authenticated reads.
GRANT SELECT ON forum.reports       TO authenticated;
GRANT SELECT ON forum.notifications TO authenticated;

-- Notifications: only read_at is user-mutable. Column-level GRANT keeps
-- the policy honest — RLS row-gates and grants column-gates.
REVOKE UPDATE           ON forum.notifications FROM authenticated;
GRANT  UPDATE (read_at) ON forum.notifications TO   authenticated;

-- RPC-only writes everywhere else.
REVOKE INSERT, UPDATE, DELETE ON forum.reports     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.attachments FROM authenticated;

-- moderation_actions is append-only end-to-end. service_role only
-- gets SELECT + INSERT — no UPDATE / DELETE on the audit log.
REVOKE INSERT, UPDATE, DELETE ON forum.moderation_actions FROM authenticated;
REVOKE UPDATE, DELETE         ON forum.moderation_actions FROM service_role;

-- service_role explicit grants so RPC mutations survive any future
-- schema-wide REVOKE ALL cleanup.
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.reports       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.attachments   TO service_role;
GRANT SELECT, INSERT                 ON forum.moderation_actions TO service_role;


-- ============================================================
-- inlined: packages/data/sql/schema/forum/forum_rpcs.sql
-- ============================================================
-- ============================================================
-- FORUM RPC FUNCTIONS
--
-- Service-role-only RPCs invoked by axum-kbve via the Supabase
-- service client. Every `service_*` function is:
--   - SECURITY DEFINER (runs with DB owner privileges)
--   - SET search_path = '' (defense against search-path hijack)
--   - REVOKED from PUBLIC / anon / authenticated
--   - GRANTED EXECUTE only to service_role
--
-- The caller (axum-kbve) validates auth + authorization before
-- invoking. Each write RPC:
--   - calls forum.is_user_banned(p_user) and aborts on TRUE
--   - validates polymorphic refs via forum.assert_parent_exists or
--     forum.assert_target_exists where applicable
--   - takes pg_advisory_xact_lock on contentious paths (votes,
--     reactions, reports)
--   - raises on no-op edits so callers can distinguish "not yours"
--     / "locked" / "not found" from a successful zero-update
--
-- Hardening pass:
--   * service_create_thread now validates space exists + thread_type
--     in space.allowed_types, and batches tag bumps in one UPDATE.
--   * service_create_comment rejects depth>5 instead of clamping
--     silently. Bulk subscription notifications use ON CONFLICT
--     DO NOTHING against the unique-unread dedupe index.
--   * service_toggle_reaction + service_file_report take an advisory
--     lock to serialize toggle/dedup races.
--   * service_file_report uses forum.assert_target_exists (no enum
--     cross-cast) and logs auto-flag actions.
--   * service_place_bid enforces currency consistency and an optional
--     reserve_price.
--   * service_mark_notifications_read caps p_ids length so a single
--     RPC call cannot scan an unbounded array.
--   * service_fetch_feed implements cursor pagination + per-sort
--     ORDER BY branches that can use indexes.
--   * service_record_moderation accepts a correlation_id, keeps
--     thread/space counters consistent on remove/restore, and rejects
--     canonical-self-loop on tag_merge.
--
-- Depends on: forum_core.sql, forum_user.sql, forum_engagement.sql,
--             forum_moderation.sql.
-- ============================================================


-- ===========================================
-- service_resolve_tag_ids — map raw tag IDs to canonical IDs
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_resolve_tag_ids(p_tag_ids INTEGER[])
RETURNS INTEGER[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_out INTEGER[];
BEGIN
    IF p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL THEN
        RETURN '{}'::INTEGER[];
    END IF;
    SELECT array_agg(DISTINCT t.canonical_id ORDER BY t.canonical_id)
      INTO v_out
      FROM forum.tags t
     WHERE t.id = ANY(p_tag_ids)
       AND t.status <> 'deprecated';
    RETURN COALESCE(v_out, '{}'::INTEGER[]);
END;
$$;

REVOKE ALL ON FUNCTION forum.service_resolve_tag_ids(INTEGER[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_resolve_tag_ids(INTEGER[]) TO service_role;

-- ===========================================
-- service_ensure_user_profile — bootstrap forum_user_profiles row
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_ensure_user_profile(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO forum.forum_user_profiles (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_ensure_user_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_ensure_user_profile(UUID) TO service_role;

-- ===========================================
-- service_update_user_profile — user-controlled profile fields (item 3)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_update_user_profile(
    p_user_id                UUID,
    p_signature              TEXT DEFAULT NULL,
    p_flair_text             TEXT DEFAULT NULL,
    p_mute_all_notifications BOOLEAN DEFAULT NULL,
    p_show_nsfw              BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Bounds match table CHECKs but raise earlier with a friendlier message.
    IF p_signature IS NOT NULL AND length(p_signature) > 500 THEN
        RAISE EXCEPTION 'signature too long (max 500)';
    END IF;
    IF p_flair_text IS NOT NULL AND length(p_flair_text) > 100 THEN
        RAISE EXCEPTION 'flair_text too long (max 100)';
    END IF;

    -- Bootstrap the row so first-time writes can't silently no-op.
    PERFORM forum.service_ensure_user_profile(p_user_id);

    -- NULLIF(trim(...), '') turns empty / whitespace strings into NULL,
    -- which COALESCE then maps back to "no change". Clients that want
    -- to clear a field should pass NULL explicitly — same effect, but
    -- nobody overwrites an existing signature with whitespace.
    UPDATE forum.forum_user_profiles
       SET signature              = COALESCE(NULLIF(trim(p_signature),  ''), signature),
           flair_text             = COALESCE(NULLIF(trim(p_flair_text), ''), flair_text),
           mute_all_notifications = COALESCE(p_mute_all_notifications, mute_all_notifications),
           show_nsfw              = COALESCE(p_show_nsfw, show_nsfw),
           last_active_at         = NOW()
     WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'forum profile % not found', p_user_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_update_user_profile(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_update_user_profile(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN)
    TO service_role;

-- ===========================================
-- service_create_thread — insert thread + tag edges + bump space counter
-- (item 11: banned-user guard.)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_create_thread(
    p_author_id     UUID,
    p_space_id      UUID,
    p_title         TEXT,
    p_body          TEXT,
    p_thread_type   forum.thread_type,
    p_type_data     JSONB,
    p_tag_ids       INTEGER[],
    p_slug          TEXT DEFAULT NULL,
    p_nsfw          BOOLEAN DEFAULT FALSE,
    p_locale        TEXT DEFAULT NULL,
    p_scheduled_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_thread_id     TEXT;
    v_resolved_tags INTEGER[];
    v_status        forum.thread_status;
    v_allowed       forum.thread_type[];
BEGIN
    IF forum.is_user_banned(p_author_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    -- Fail fast on bad input so we don't get to the table CHECK.
    IF p_title IS NULL OR length(trim(p_title)) < 3 OR length(p_title) > 180 THEN
        RAISE EXCEPTION 'invalid thread title length';
    END IF;
    IF p_body IS NULL OR length(p_body) < 1 OR length(p_body) > 50000 THEN
        RAISE EXCEPTION 'invalid thread body length';
    END IF;
    IF p_slug IS NOT NULL AND length(p_slug) > 160 THEN
        RAISE EXCEPTION 'slug too long';
    END IF;
    IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 20 THEN
        RAISE EXCEPTION 'too many tags (max 20, got %)', array_length(p_tag_ids, 1);
    END IF;

    -- Validate space exists + the requested thread_type is allowed.
    -- Empty allowed_types means "any type permitted".
    SELECT allowed_types
      INTO v_allowed
      FROM forum.spaces
     WHERE id = p_space_id
       AND status = 'active'
         FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'space % not found or inactive', p_space_id;
    END IF;
    IF array_length(v_allowed, 1) IS NOT NULL
       AND NOT (p_thread_type = ANY(v_allowed)) THEN
        RAISE EXCEPTION 'thread_type % not permitted in space %',
            p_thread_type, p_space_id;
    END IF;

    PERFORM forum.service_ensure_user_profile(p_author_id);

    v_status := CASE
        WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW() THEN 'scheduled'::forum.thread_status
        ELSE 'active'::forum.thread_status
    END;

    INSERT INTO forum.threads (
        title, body, author_id, space_id, thread_type, type_data,
        slug, nsfw, locale, scheduled_at, status, last_activity_at
    )
    VALUES (
        p_title, p_body, p_author_id, p_space_id, p_thread_type, COALESCE(p_type_data, '{}'::JSONB),
        p_slug, p_nsfw, p_locale, p_scheduled_at, v_status, NOW()
    )
    RETURNING id INTO v_thread_id;

    v_resolved_tags := forum.service_resolve_tag_ids(p_tag_ids);
    IF array_length(v_resolved_tags, 1) IS NOT NULL THEN
        -- Edge insert in one shot.
        INSERT INTO forum.thread_tags (thread_id, tag_id)
        SELECT v_thread_id, t
          FROM unnest(v_resolved_tags) AS t
        ON CONFLICT (thread_id, tag_id) DO NOTHING;
        -- Bump usage_count in one UPDATE instead of one-per-tag.
        UPDATE forum.tags
           SET usage_count = usage_count + 1
         WHERE id = ANY(v_resolved_tags);
    END IF;

    UPDATE forum.spaces
       SET thread_count = thread_count + 1,
           updated_at = NOW()
     WHERE id = p_space_id;

    UPDATE forum.forum_user_profiles
       SET post_count = post_count + 1,
           last_active_at = NOW()
     WHERE user_id = p_author_id;

    RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_create_thread(UUID, UUID, TEXT, TEXT, forum.thread_type, JSONB, INTEGER[], TEXT, BOOLEAN, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_create_thread(UUID, UUID, TEXT, TEXT, forum.thread_type, JSONB, INTEGER[], TEXT, BOOLEAN, TEXT, TIMESTAMPTZ)
    TO service_role;

-- ===========================================
-- service_edit_thread — author-only edit, atomic + audit-friendly (item 4)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_edit_thread(
    p_author_id UUID,
    p_thread_id TEXT,
    p_title     TEXT,
    p_body      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF forum.is_user_banned(p_author_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    UPDATE forum.threads
       SET title          = p_title,
           body           = p_body,
           edited_at      = NOW(),
           revision_count = revision_count + 1
     WHERE id = p_thread_id
       AND author_id = p_author_id
       AND status IN ('active', 'draft', 'scheduled')
       AND locked = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'thread % not editable (not found, not author, locked, or wrong status)', p_thread_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_edit_thread(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_edit_thread(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ===========================================
-- service_create_comment — insert + bump thread counter + notifications
-- (item 12: locked-thread guard.)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_create_comment(
    p_author_id         UUID,
    p_thread_id         TEXT,
    p_body              TEXT,
    p_parent_comment_id TEXT DEFAULT NULL,
    p_quoted_comment_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_comment_id    TEXT;
    v_depth         INTEGER := 0;
    v_thread_author UUID;
    v_parent_author UUID;
BEGIN
    IF forum.is_user_banned(p_author_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    IF p_body IS NULL OR length(p_body) < 1 OR length(p_body) > 20000 THEN
        RAISE EXCEPTION 'invalid comment body length';
    END IF;

    -- Take a SHARE lock on the thread row so concurrent moderation
    -- (lock / remove) can't slip in between this check and our INSERT.
    -- Distinguishes "no such thread" from "thread not accepting".
    PERFORM 1
      FROM forum.threads
     WHERE id = p_thread_id
           FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'thread % not found', p_thread_id;
    END IF;
    IF EXISTS (
        SELECT 1
          FROM forum.threads
         WHERE id = p_thread_id
           AND (locked = TRUE OR status <> 'active')
    ) THEN
        RAISE EXCEPTION 'thread % is not accepting comments', p_thread_id;
    END IF;

    PERFORM forum.service_ensure_user_profile(p_author_id);

    IF p_parent_comment_id IS NOT NULL THEN
        SELECT depth + 1, author_id
          INTO v_depth, v_parent_author
          FROM forum.comments
         WHERE id = p_parent_comment_id
           AND thread_id = p_thread_id
           AND status = 'active';
        IF v_depth IS NULL THEN
            RAISE EXCEPTION 'parent comment % not found in thread %',
                p_parent_comment_id, p_thread_id;
        END IF;
        -- Hard reject — silent clamp would store the comment at the
        -- wrong depth and break thread rendering.
        IF v_depth > 5 THEN
            RAISE EXCEPTION 'comment depth % exceeds max (5)', v_depth;
        END IF;
    END IF;

    INSERT INTO forum.comments (
        body, author_id, thread_id, parent_comment_id,
        quoted_comment_id, depth, status
    )
    VALUES (
        p_body, p_author_id, p_thread_id, p_parent_comment_id,
        p_quoted_comment_id, v_depth, 'active'
    )
    RETURNING id INTO v_comment_id;

    UPDATE forum.threads
       SET comment_count = comment_count + 1,
           last_activity_at = NOW()
     WHERE id = p_thread_id
     RETURNING author_id INTO v_thread_author;

    UPDATE forum.forum_user_profiles
       SET comment_count = comment_count + 1,
           last_active_at = NOW()
     WHERE user_id = p_author_id;

    -- ON CONFLICT DO NOTHING against ux_notifications_dedupe_unread
    -- keeps the burst from raising on duplicate unread entries.
    IF v_parent_author IS NOT NULL AND v_parent_author <> p_author_id THEN
        INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
             VALUES (v_parent_author, 'reply', p_author_id, 'comment', v_comment_id)
        ON CONFLICT DO NOTHING;
    ELSIF v_thread_author IS NOT NULL AND v_thread_author <> p_author_id THEN
        INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
             VALUES (v_thread_author, 'thread_reply', p_author_id, 'comment', v_comment_id)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
    SELECT ts.user_id, 'thread_update', p_author_id, 'thread', p_thread_id
      FROM forum.thread_subscriptions ts
     WHERE ts.thread_id = p_thread_id
       AND ts.user_id <> p_author_id
       AND ts.user_id IS DISTINCT FROM v_parent_author
       AND ts.user_id IS DISTINCT FROM v_thread_author
    ON CONFLICT DO NOTHING;

    RETURN v_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_create_comment(UUID, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_create_comment(UUID, TEXT, TEXT, TEXT, TEXT)
    TO service_role;

-- ===========================================
-- service_edit_comment — author-only edit (item 4)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_edit_comment(
    p_author_id  UUID,
    p_comment_id TEXT,
    p_body       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF forum.is_user_banned(p_author_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    UPDATE forum.comments
       SET body           = p_body,
           edited_at      = NOW(),
           revision_count = revision_count + 1
     WHERE id = p_comment_id
       AND author_id = p_author_id
       AND status IN ('active', 'draft');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'comment % not editable (not found, not author, or wrong status)', p_comment_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_edit_comment(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_edit_comment(UUID, TEXT, TEXT) TO service_role;

-- ===========================================
-- service_cast_thread_vote — advisory lock + DELETE-on-cleared (item 6)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_cast_thread_vote(
    p_user_id   UUID,
    p_thread_id TEXT,
    p_direction forum.vote_direction
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
DECLARE
    v_old           forum.vote_direction;
    v_delta_up      INTEGER := 0;
    v_delta_down    INTEGER := 0;
    v_thread_author UUID;
BEGIN
    IF forum.is_user_banned(p_user_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    -- Item 6: per-(thread, voter) advisory lock so concurrent vote flips
    -- serialize and counter deltas stay coherent.
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'forum.thread_vote:' || p_thread_id || ':' || p_user_id::TEXT, 0));

    PERFORM 1
      FROM forum.threads
     WHERE id = p_thread_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'thread % not votable', p_thread_id;
    END IF;

    PERFORM forum.service_ensure_user_profile(p_user_id);

    SELECT direction
      INTO v_old
      FROM forum.thread_votes
     WHERE thread_id = p_thread_id AND voter_id = p_user_id
         FOR UPDATE;

    IF v_old = 'up'   THEN v_delta_up := v_delta_up - 1; END IF;
    IF v_old = 'down' THEN v_delta_down := v_delta_down - 1; END IF;
    IF p_direction = 'up'   THEN v_delta_up := v_delta_up + 1; END IF;
    IF p_direction = 'down' THEN v_delta_down := v_delta_down + 1; END IF;

    -- Item 6: clearing deletes the row instead of leaving a 'cleared' tombstone.
    IF p_direction = 'cleared' THEN
        DELETE FROM forum.thread_votes
         WHERE thread_id = p_thread_id AND voter_id = p_user_id;
    ELSE
        INSERT INTO forum.thread_votes (thread_id, voter_id, direction)
             VALUES (p_thread_id, p_user_id, p_direction)
        ON CONFLICT (thread_id, voter_id)
        DO UPDATE SET direction  = EXCLUDED.direction,
                      updated_at = NOW();
    END IF;

    UPDATE forum.threads
       SET upvote_count   = upvote_count + v_delta_up,
           downvote_count = downvote_count + v_delta_down,
           score          = score + v_delta_up - v_delta_down,
           last_activity_at = NOW()
     WHERE id = p_thread_id
     RETURNING author_id INTO v_thread_author;

    UPDATE forum.forum_user_profiles
       SET upvotes_given   = upvotes_given   + GREATEST(v_delta_up,   0),
           downvotes_given = downvotes_given + GREATEST(v_delta_down, 0),
           last_active_at  = NOW()
     WHERE user_id = p_user_id;

    IF v_thread_author IS NOT NULL AND v_thread_author <> p_user_id THEN
        UPDATE forum.forum_user_profiles
           SET upvotes_received   = upvotes_received   + GREATEST(v_delta_up,   0),
               downvotes_received = downvotes_received + GREATEST(v_delta_down, 0),
               karma              = karma + v_delta_up - v_delta_down
         WHERE user_id = v_thread_author;
    END IF;

    RETURN p_direction::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_cast_thread_vote(UUID, TEXT, forum.vote_direction)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_cast_thread_vote(UUID, TEXT, forum.vote_direction)
    TO service_role;

-- ===========================================
-- service_cast_comment_vote — same hardening as thread vote
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_cast_comment_vote(
    p_user_id    UUID,
    p_comment_id TEXT,
    p_direction  forum.vote_direction
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
DECLARE
    v_old            forum.vote_direction;
    v_delta_up       INTEGER := 0;
    v_delta_down     INTEGER := 0;
    v_comment_author UUID;
BEGIN
    IF forum.is_user_banned(p_user_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'forum.comment_vote:' || p_comment_id || ':' || p_user_id::TEXT, 0));

    PERFORM 1
      FROM forum.comments
     WHERE id = p_comment_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'comment % not votable', p_comment_id;
    END IF;

    PERFORM forum.service_ensure_user_profile(p_user_id);

    SELECT direction
      INTO v_old
      FROM forum.comment_votes
     WHERE comment_id = p_comment_id AND voter_id = p_user_id
         FOR UPDATE;

    IF v_old = 'up'   THEN v_delta_up := v_delta_up - 1; END IF;
    IF v_old = 'down' THEN v_delta_down := v_delta_down - 1; END IF;
    IF p_direction = 'up'   THEN v_delta_up := v_delta_up + 1; END IF;
    IF p_direction = 'down' THEN v_delta_down := v_delta_down + 1; END IF;

    IF p_direction = 'cleared' THEN
        DELETE FROM forum.comment_votes
         WHERE comment_id = p_comment_id AND voter_id = p_user_id;
    ELSE
        INSERT INTO forum.comment_votes (comment_id, voter_id, direction)
             VALUES (p_comment_id, p_user_id, p_direction)
        ON CONFLICT (comment_id, voter_id)
        DO UPDATE SET direction  = EXCLUDED.direction,
                      updated_at = NOW();
    END IF;

    UPDATE forum.comments
       SET upvote_count   = upvote_count + v_delta_up,
           downvote_count = downvote_count + v_delta_down,
           score          = score + v_delta_up - v_delta_down
     WHERE id = p_comment_id
     RETURNING author_id INTO v_comment_author;

    UPDATE forum.forum_user_profiles
       SET upvotes_given   = upvotes_given   + GREATEST(v_delta_up,   0),
           downvotes_given = downvotes_given + GREATEST(v_delta_down, 0),
           last_active_at  = NOW()
     WHERE user_id = p_user_id;

    IF v_comment_author IS NOT NULL AND v_comment_author <> p_user_id THEN
        UPDATE forum.forum_user_profiles
           SET upvotes_received   = upvotes_received   + GREATEST(v_delta_up,   0),
               downvotes_received = downvotes_received + GREATEST(v_delta_down, 0),
               karma              = karma + v_delta_up - v_delta_down
         WHERE user_id = v_comment_author;
    END IF;

    RETURN p_direction::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_cast_comment_vote(UUID, TEXT, forum.vote_direction)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_cast_comment_vote(UUID, TEXT, forum.vote_direction)
    TO service_role;

-- ===========================================
-- service_toggle_reaction — idempotent add/remove (item 10 + item 11)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_toggle_reaction(
    p_user_id      UUID,
    p_parent_kind  forum.attachment_parent_kind,
    p_parent_id    TEXT,
    p_kind         forum.reaction_kind,
    p_custom_kind  TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
DECLARE
    v_existing TEXT;
BEGIN
    IF forum.is_user_banned(p_user_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;
    IF p_parent_kind NOT IN ('thread', 'comment') THEN
        RAISE EXCEPTION 'reaction parent must be thread or comment, got %', p_parent_kind;
    END IF;
    IF (p_kind = 'custom') <> (p_custom_kind IS NOT NULL) THEN
        RAISE EXCEPTION 'custom_kind must be set iff kind = custom';
    END IF;
    -- forum.assert_reaction_parent_exists trigger does the
    -- visibility-aware existence check. This is just a fast-path
    -- no-such-row guard.
    IF NOT forum.assert_parent_exists(p_parent_kind, p_parent_id) THEN
        RAISE EXCEPTION 'reaction parent %/% does not exist', p_parent_kind, p_parent_id;
    END IF;

    -- Serialize toggle/dedup races against ux_reactions_once. 64-bit
    -- hash keeps cross-key collisions below epsilon.
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'forum.reaction:' ||
        p_parent_kind::TEXT || ':' || p_parent_id || ':' ||
        p_user_id::TEXT || ':' || p_kind::TEXT || ':' ||
        COALESCE(p_custom_kind, ''),
        0
    ));

    SELECT id
      INTO v_existing
      FROM forum.reactions
     WHERE parent_kind = p_parent_kind
       AND parent_id = p_parent_id
       AND user_id = p_user_id
       AND kind = p_kind
       AND COALESCE(custom_kind, '') = COALESCE(p_custom_kind, '')
         FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        DELETE FROM forum.reactions WHERE id = v_existing;
        RETURN FALSE;
    ELSE
        INSERT INTO forum.reactions (parent_kind, parent_id, user_id, kind, custom_kind)
             VALUES (p_parent_kind, p_parent_id, p_user_id, p_kind, p_custom_kind);
        RETURN TRUE;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_toggle_reaction(UUID, forum.attachment_parent_kind, TEXT, forum.reaction_kind, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_toggle_reaction(UUID, forum.attachment_parent_kind, TEXT, forum.reaction_kind, TEXT)
    TO service_role;

-- ===========================================
-- service_file_report — dedup open reports per (reporter, target)
-- (item 1: target_kind enum; item 10: parent existence; item 11: ban guard.)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_file_report(
    p_reporter_id   UUID,
    p_target_kind   forum.target_kind,
    p_target_id     TEXT,
    p_reason        forum.report_reason,
    p_reason_detail TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
DECLARE
    v_report_id TEXT;
BEGIN
    IF forum.is_user_banned(p_reporter_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;
    IF p_target_kind NOT IN ('thread', 'comment', 'user') THEN
        RAISE EXCEPTION 'report target must be thread, comment, or user, got %', p_target_kind;
    END IF;
    -- forum.assert_target_exists is the target_kind-native helper —
    -- no enum cross-cast hazard. Trigger
    -- forum.assert_report_target_visible adds a stricter visibility
    -- gate at INSERT time.
    IF NOT forum.assert_target_exists(p_target_kind, p_target_id) THEN
        RAISE EXCEPTION 'report target %/% does not exist', p_target_kind, p_target_id;
    END IF;

    -- Serialize concurrent reports from the same (reporter, target).
    -- Cleaner failure than racing against ux_reports_open_once.
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'forum.report:' || p_reporter_id::TEXT || ':' ||
        p_target_kind::TEXT || ':' || p_target_id,
        0
    ));

    SELECT id
      INTO v_report_id
      FROM forum.reports
     WHERE reporter_id = p_reporter_id
       AND target_kind = p_target_kind
       AND target_id = p_target_id
       AND resolved_at IS NULL
         FOR UPDATE;

    IF v_report_id IS NOT NULL THEN
        RETURN v_report_id;
    END IF;

    INSERT INTO forum.reports (reporter_id, target_kind, target_id, reason, reason_detail)
         VALUES (p_reporter_id, p_target_kind, p_target_id, p_reason, p_reason_detail)
      RETURNING id INTO v_report_id;

    -- Auto-flag the comment so it goes into the mod queue. The
    -- "flagged" status itself is the audit signal — no
    -- moderation_actions row written because moderation_action_kind
    -- has no 'comment_flag' value (auto-flag is system-driven, not
    -- moderator-driven).
    IF p_target_kind = 'comment' THEN
        UPDATE forum.comments
           SET status = 'flagged'
         WHERE id = p_target_id AND status = 'active';
    END IF;

    RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_file_report(UUID, forum.target_kind, TEXT, forum.report_reason, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_file_report(UUID, forum.target_kind, TEXT, forum.report_reason, TEXT)
    TO service_role;

-- ===========================================
-- service_place_bid — auction-type guard, anti-snipe, outbid notification
-- (item 7: capture v_previous_bidder before the type_data update so we
-- notify the correct user.)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_place_bid(
    p_bidder_id UUID,
    p_thread_id TEXT,
    p_amount    BIGINT,
    p_currency  TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
DECLARE
    v_bid_id           TEXT;
    v_current_bid      BIGINT;
    v_previous_bidder  UUID;
    v_min_increment    BIGINT;
    v_end_time         TIMESTAMPTZ;
    v_type             forum.thread_type;
    v_anti_snipe       BOOLEAN;
    v_anti_snipe_s     INTEGER;
    v_currency         TEXT;
    v_reserve          BIGINT;
    v_normalized_curr  TEXT;
BEGIN
    IF forum.is_user_banned(p_bidder_id) THEN
        RAISE EXCEPTION 'forum user is banned';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'bid amount must be positive';
    END IF;
    IF p_currency IS NULL
       OR length(trim(p_currency)) < 2
       OR length(trim(p_currency)) > 16 THEN
        RAISE EXCEPTION 'invalid currency';
    END IF;

    -- Self-bidding lets the owner inflate their own auction.
    IF EXISTS (
        SELECT 1 FROM forum.threads
         WHERE id = p_thread_id AND author_id = p_bidder_id
    ) THEN
        RAISE EXCEPTION 'cannot bid on own auction';
    END IF;

    v_normalized_curr := lower(trim(p_currency));

    SELECT thread_type,
           (type_data->>'current_bid')::BIGINT,
           (type_data->>'current_bidder_id')::UUID,
           COALESCE((type_data->>'min_increment')::BIGINT, 1),
           (type_data->>'end_time')::TIMESTAMPTZ,
           COALESCE((type_data->>'anti_snipe_enabled')::BOOLEAN, FALSE),
           COALESCE((type_data->>'anti_snipe_extend_seconds')::INTEGER, 0),
           lower(trim(type_data->>'currency')),
           NULLIF(type_data->>'reserve_price','')::BIGINT
      INTO v_type, v_current_bid, v_previous_bidder,
           v_min_increment, v_end_time, v_anti_snipe, v_anti_snipe_s,
           v_currency, v_reserve
      FROM forum.threads
     WHERE id = p_thread_id
         FOR UPDATE;

    IF v_type IS NULL THEN
        RAISE EXCEPTION 'thread % not found', p_thread_id;
    END IF;
    IF v_type <> 'auction' THEN
        RAISE EXCEPTION 'thread % is not an auction (type = %)', p_thread_id, v_type;
    END IF;
    IF v_end_time IS NOT NULL AND v_end_time < NOW() THEN
        RAISE EXCEPTION 'auction % has ended at %', p_thread_id, v_end_time;
    END IF;
    -- Currency must match the auction's declared currency. Bidding in
    -- a different denomination would corrupt current_bid comparisons.
    IF v_currency IS NOT NULL AND v_currency <> v_normalized_curr THEN
        RAISE EXCEPTION 'bid currency % does not match auction currency %',
            v_normalized_curr, v_currency;
    END IF;
    IF p_amount < COALESCE(v_current_bid, 0) + v_min_increment THEN
        RAISE EXCEPTION 'bid % below minimum (current %, increment %)', p_amount, v_current_bid, v_min_increment;
    END IF;
    -- Reserve check: first bid that meets reserve clears it; later
    -- bids only need to top current_bid + increment.
    IF v_reserve IS NOT NULL
       AND v_current_bid IS NULL
       AND p_amount < v_reserve THEN
        RAISE EXCEPTION 'bid % below reserve %', p_amount, v_reserve;
    END IF;

    INSERT INTO forum.auction_bids (thread_id, bidder_id, amount, currency)
         VALUES (p_thread_id, p_bidder_id, p_amount, v_normalized_curr)
      RETURNING id INTO v_bid_id;

    UPDATE forum.threads
       SET type_data = type_data
            || jsonb_build_object(
                'current_bid', p_amount,
                'current_bidder_id', p_bidder_id::TEXT,
                'bid_count', COALESCE((type_data->>'bid_count')::INTEGER, 0) + 1,
                'end_time', CASE
                    WHEN v_anti_snipe AND v_end_time - NOW() < make_interval(secs => v_anti_snipe_s)
                        THEN (NOW() + make_interval(secs => v_anti_snipe_s))::TEXT
                    ELSE v_end_time::TEXT
                END
            ),
           last_activity_at = NOW()
     WHERE id = p_thread_id;

    -- Item 7: previous bidder was captured BEFORE the type_data update.
    IF v_previous_bidder IS NOT NULL AND v_previous_bidder <> p_bidder_id THEN
        INSERT INTO forum.notifications (
            recipient_id, kind, actor_id, target_kind, target_id
        )
        VALUES (
            v_previous_bidder, 'auction_outbid', p_bidder_id, 'thread', p_thread_id
        );
    END IF;

    RETURN v_bid_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_place_bid(UUID, TEXT, BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_place_bid(UUID, TEXT, BIGINT, TEXT)
    TO service_role;

-- ===========================================
-- service_mark_notifications_read — batch mark read
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_mark_notifications_read(
    p_user_id UUID,
    p_ids     TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Cap the array so a single RPC call cannot scan an unbounded
    -- list. Clients chunk into 200-id batches.
    IF array_length(p_ids, 1) > 200 THEN
        RAISE EXCEPTION 'mark-read batch size % exceeds limit (200)',
            array_length(p_ids, 1);
    END IF;
    UPDATE forum.notifications
       SET read_at = NOW()
     WHERE recipient_id = p_user_id
       AND id = ANY(COALESCE(p_ids, '{}'::TEXT[]))
       AND read_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_mark_notifications_read(UUID, TEXT[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_mark_notifications_read(UUID, TEXT[])
    TO service_role;

-- ===========================================
-- service_fetch_feed — paginated feed with sort mode
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_fetch_feed(
    p_space_id      UUID    DEFAULT NULL,
    p_tag_id        INTEGER DEFAULT NULL,
    p_thread_type   forum.thread_type DEFAULT NULL,
    p_sort          TEXT    DEFAULT 'hot',
    p_cursor        TEXT    DEFAULT NULL,
    p_limit         INTEGER DEFAULT 25,
    p_include_nsfw  BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id                  TEXT,
    title               TEXT,
    body                TEXT,
    author_id           UUID,
    space_id            UUID,
    thread_type         forum.thread_type,
    type_data           JSONB,
    status              forum.thread_status,
    comment_count       INTEGER,
    view_count          BIGINT,
    score               BIGINT,
    upvote_count        BIGINT,
    downvote_count      BIGINT,
    last_activity_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ,
    nsfw                BOOLEAN,
    pinned              BOOLEAN,
    slug                TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '2s'
AS $$
DECLARE
    v_limit       INTEGER;
    v_sort        TEXT;
    v_cursor_key  TEXT;
    v_cursor_id   TEXT;
    v_cur_score   BIGINT;
    v_cur_hot     DOUBLE PRECISION;
    v_cur_ts      TIMESTAMPTZ;
BEGIN
    v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
    v_sort  := COALESCE(p_sort, 'new');
    IF v_sort NOT IN ('hot', 'top', 'new', 'bump') THEN
        v_sort := 'new';
    END IF;

    -- Cursor format: "<sort_key>|<id>". Only the four supported sort
    -- modes carry cursors; rising / controversial would need a
    -- recompute-stable score and are deferred.
    IF p_cursor IS NOT NULL THEN
        v_cursor_key := split_part(p_cursor, '|', 1);
        v_cursor_id  := split_part(p_cursor, '|', 2);
        IF v_cursor_id = '' THEN
            RAISE EXCEPTION 'malformed cursor: %', p_cursor;
        END IF;

        IF v_sort = 'top' THEN
            v_cur_score := v_cursor_key::BIGINT;
        ELSIF v_sort = 'hot' THEN
            v_cur_hot := v_cursor_key::DOUBLE PRECISION;
        ELSIF v_sort IN ('new', 'bump') THEN
            v_cur_ts := v_cursor_key::TIMESTAMPTZ;
        END IF;
    END IF;

    -- Per-sort RETURN QUERY branches let the planner pick the matching
    -- partial index (idx_threads_feed_*) instead of CASE-wrapping the
    -- ORDER BY which prevents index ordering.
    IF v_sort = 'new' THEN
        RETURN QUERY
        SELECT t.id, t.title, t.body, t.author_id, t.space_id, t.thread_type,
               t.type_data, t.status, t.comment_count, t.view_count,
               t.score, t.upvote_count, t.downvote_count,
               t.last_activity_at, t.created_at, t.nsfw, t.pinned, t.slug
          FROM forum.threads t
         WHERE t.status = 'active'
           AND (p_space_id    IS NULL OR t.space_id    = p_space_id)
           AND (p_thread_type IS NULL OR t.thread_type = p_thread_type)
           AND (p_include_nsfw OR NOT t.nsfw)
           AND (p_tag_id IS NULL OR EXISTS (
                SELECT 1 FROM forum.thread_tags_resolved r
                 WHERE r.thread_id = t.id AND r.tag_id = p_tag_id))
           AND (p_cursor IS NULL OR (t.created_at, t.id) < (v_cur_ts, v_cursor_id))
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT v_limit;

    ELSIF v_sort = 'bump' THEN
        RETURN QUERY
        SELECT t.id, t.title, t.body, t.author_id, t.space_id, t.thread_type,
               t.type_data, t.status, t.comment_count, t.view_count,
               t.score, t.upvote_count, t.downvote_count,
               t.last_activity_at, t.created_at, t.nsfw, t.pinned, t.slug
          FROM forum.threads t
         WHERE t.status = 'active'
           AND (p_space_id    IS NULL OR t.space_id    = p_space_id)
           AND (p_thread_type IS NULL OR t.thread_type = p_thread_type)
           AND (p_include_nsfw OR NOT t.nsfw)
           AND (p_tag_id IS NULL OR EXISTS (
                SELECT 1 FROM forum.thread_tags_resolved r
                 WHERE r.thread_id = t.id AND r.tag_id = p_tag_id))
           AND (p_cursor IS NULL OR (t.last_activity_at, t.id) < (v_cur_ts, v_cursor_id))
         ORDER BY t.last_activity_at DESC, t.id DESC
         LIMIT v_limit;

    ELSIF v_sort = 'top' THEN
        RETURN QUERY
        SELECT t.id, t.title, t.body, t.author_id, t.space_id, t.thread_type,
               t.type_data, t.status, t.comment_count, t.view_count,
               t.score, t.upvote_count, t.downvote_count,
               t.last_activity_at, t.created_at, t.nsfw, t.pinned, t.slug
          FROM forum.threads t
         WHERE t.status = 'active'
           AND (p_space_id    IS NULL OR t.space_id    = p_space_id)
           AND (p_thread_type IS NULL OR t.thread_type = p_thread_type)
           AND (p_include_nsfw OR NOT t.nsfw)
           AND (p_tag_id IS NULL OR EXISTS (
                SELECT 1 FROM forum.thread_tags_resolved r
                 WHERE r.thread_id = t.id AND r.tag_id = p_tag_id))
           AND (p_cursor IS NULL OR (t.score, t.id) < (v_cur_score, v_cursor_id))
         ORDER BY t.score DESC, t.id DESC
         LIMIT v_limit;

    ELSE  -- 'hot' default
        RETURN QUERY
        SELECT t.id, t.title, t.body, t.author_id, t.space_id, t.thread_type,
               t.type_data, t.status, t.comment_count, t.view_count,
               t.score, t.upvote_count, t.downvote_count,
               t.last_activity_at, t.created_at, t.nsfw, t.pinned, t.slug
          FROM forum.threads t
         WHERE t.status = 'active'
           AND (p_space_id    IS NULL OR t.space_id    = p_space_id)
           AND (p_thread_type IS NULL OR t.thread_type = p_thread_type)
           AND (p_include_nsfw OR NOT t.nsfw)
           AND (p_tag_id IS NULL OR EXISTS (
                SELECT 1 FROM forum.thread_tags_resolved r
                 WHERE r.thread_id = t.id AND r.tag_id = p_tag_id))
           AND (p_cursor IS NULL OR (t.hot_rank, t.id) < (v_cur_hot, v_cursor_id))
         ORDER BY t.hot_rank DESC, t.id DESC
         LIMIT v_limit;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_fetch_feed(UUID, INTEGER, forum.thread_type, TEXT, TEXT, INTEGER, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_fetch_feed(UUID, INTEGER, forum.thread_type, TEXT, TEXT, INTEGER, BOOLEAN)
    TO service_role;

-- ===========================================
-- service_record_moderation — append-to-log + apply state change
-- (item 1: uses forum.target_kind enum.)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_record_moderation(
    p_moderator_id   UUID,
    p_kind           forum.moderation_action_kind,
    p_target_kind    forum.target_kind,
    p_target_id      TEXT,
    p_reason         TEXT DEFAULT NULL,
    p_metadata_json  JSONB DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_action_id    TEXT;
    v_canonical    INTEGER;
    v_old_space    UUID;
    v_old_status   forum.thread_status;
    v_thread_space UUID;
    v_comment_thread TEXT;
    v_kind_text    TEXT;
BEGIN
    -- Reject obvious mismatches (comment_remove against a thread, etc).
    -- Cheaper than discovering the same in a per-branch UPDATE that
    -- silently zero-rows.
    v_kind_text := p_kind::TEXT;
    IF v_kind_text LIKE 'thread_%'  AND p_target_kind <> 'thread'  THEN
        RAISE EXCEPTION 'kind % requires target_kind=thread (got %)',  p_kind, p_target_kind;
    END IF;
    IF v_kind_text LIKE 'comment_%' AND p_target_kind <> 'comment' THEN
        RAISE EXCEPTION 'kind % requires target_kind=comment (got %)', p_kind, p_target_kind;
    END IF;
    IF v_kind_text LIKE 'user_%'    AND p_target_kind <> 'user'    THEN
        RAISE EXCEPTION 'kind % requires target_kind=user (got %)',    p_kind, p_target_kind;
    END IF;

    INSERT INTO forum.moderation_actions (
        moderator_id, kind, target_kind, target_id, reason,
        metadata_json, correlation_id
    )
    VALUES (
        p_moderator_id, p_kind, p_target_kind, p_target_id, p_reason,
        p_metadata_json, p_correlation_id
    )
    RETURNING id INTO v_action_id;

    CASE p_kind
        WHEN 'thread_lock' THEN
            UPDATE forum.threads SET status = 'locked', locked = TRUE
             WHERE id = p_target_id AND status <> 'removed';
            IF NOT FOUND THEN
                RAISE EXCEPTION 'thread % not lockable', p_target_id;
            END IF;
        WHEN 'thread_unlock' THEN
            UPDATE forum.threads SET status = 'active', locked = FALSE
             WHERE id = p_target_id AND status = 'locked';
            IF NOT FOUND THEN
                RAISE EXCEPTION 'thread % not unlockable', p_target_id;
            END IF;
        WHEN 'thread_remove'  THEN
            -- Decrement space.thread_count only on the active→removed
            -- edge so repeated remove calls don't drift the counter.
            UPDATE forum.threads
               SET status = 'removed'
             WHERE id = p_target_id
               AND status <> 'removed'
            RETURNING space_id INTO v_thread_space;
            IF FOUND THEN
                UPDATE forum.spaces
                   SET thread_count = GREATEST(thread_count - 1, 0),
                       updated_at   = NOW()
                 WHERE id = v_thread_space;
            END IF;
        WHEN 'thread_restore' THEN
            UPDATE forum.threads
               SET status = 'active'
             WHERE id = p_target_id
               AND status = 'removed'
            RETURNING space_id INTO v_thread_space;
            IF FOUND THEN
                UPDATE forum.spaces
                   SET thread_count = thread_count + 1,
                       updated_at   = NOW()
                 WHERE id = v_thread_space;
            END IF;
        WHEN 'thread_pin' THEN
            UPDATE forum.threads SET pinned = TRUE  WHERE id = p_target_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'thread % not found for pin', p_target_id;
            END IF;
        WHEN 'thread_unpin' THEN
            UPDATE forum.threads SET pinned = FALSE WHERE id = p_target_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'thread % not found for unpin', p_target_id;
            END IF;
        WHEN 'thread_move'    THEN
            IF p_metadata_json ? 'space_id' THEN
                UPDATE forum.threads
                   SET space_id = (p_metadata_json->>'space_id')::UUID
                 WHERE id = p_target_id
                RETURNING space_id INTO v_thread_space;
                -- Bump destination + decrement source to keep
                -- per-space thread_count accurate.
                IF FOUND AND p_metadata_json ? 'from_space_id' THEN
                    v_old_space := (p_metadata_json->>'from_space_id')::UUID;
                    UPDATE forum.spaces SET thread_count = GREATEST(thread_count - 1, 0)
                     WHERE id = v_old_space;
                    UPDATE forum.spaces SET thread_count = thread_count + 1
                     WHERE id = v_thread_space;
                END IF;
            END IF;
        WHEN 'comment_remove'  THEN
            UPDATE forum.comments
               SET status = 'removed'
             WHERE id = p_target_id
               AND status <> 'removed'
            RETURNING thread_id INTO v_comment_thread;
            IF FOUND THEN
                UPDATE forum.threads
                   SET comment_count = GREATEST(comment_count - 1, 0)
                 WHERE id = v_comment_thread;
            END IF;
        WHEN 'comment_restore' THEN
            UPDATE forum.comments
               SET status = 'active'
             WHERE id = p_target_id
               AND status = 'removed'
            RETURNING thread_id INTO v_comment_thread;
            IF FOUND THEN
                UPDATE forum.threads
                   SET comment_count = comment_count + 1
                 WHERE id = v_comment_thread;
            END IF;
        WHEN 'user_ban' THEN
            UPDATE forum.forum_user_profiles
               SET is_banned = TRUE,
                   ban_reason = COALESCE(p_reason, ban_reason),
                   ban_expires_at = NULLIF(p_metadata_json->>'expires_at','')::TIMESTAMPTZ
             WHERE user_id = p_target_id::UUID;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'forum profile for user % not found', p_target_id;
            END IF;
        WHEN 'user_unban' THEN
            UPDATE forum.forum_user_profiles
               SET is_banned = FALSE, ban_reason = NULL, ban_expires_at = NULL
             WHERE user_id = p_target_id::UUID;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'forum profile for user % not found', p_target_id;
            END IF;
        WHEN 'user_mute' THEN
            UPDATE forum.forum_user_profiles SET mute_all_notifications = TRUE
             WHERE user_id = p_target_id::UUID;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'forum profile for user % not found', p_target_id;
            END IF;
        WHEN 'report_resolve' THEN
            UPDATE forum.reports
               SET resolved_by = p_moderator_id,
                   resolved_at = NOW(),
                   resolution_note = p_reason
             WHERE id = p_target_id;
        WHEN 'report_dismiss' THEN
            UPDATE forum.reports
               SET resolved_by = p_moderator_id,
                   resolved_at = NOW(),
                   resolution_note = COALESCE(p_reason, 'dismissed')
             WHERE id = p_target_id;
        WHEN 'tag_merge' THEN
            IF p_metadata_json ? 'canonical_id' THEN
                v_canonical := (p_metadata_json->>'canonical_id')::INTEGER;
                IF v_canonical = p_target_id::INTEGER THEN
                    RAISE EXCEPTION 'tag_merge cannot point a tag at itself (id %)', v_canonical;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM forum.tags
                     WHERE id = v_canonical AND status = 'active'
                ) THEN
                    RAISE EXCEPTION 'canonical tag % not active', v_canonical;
                END IF;
                UPDATE forum.tags
                   SET status = 'merged',
                       alias_of = v_canonical,
                       canonical_id = v_canonical
                 WHERE id = p_target_id::INTEGER;
            END IF;
        WHEN 'tag_deprecate' THEN
            UPDATE forum.tags SET status = 'deprecated'
             WHERE id = p_target_id::INTEGER;
        ELSE
            NULL;
    END CASE;

    RETURN v_action_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_record_moderation(UUID, forum.moderation_action_kind, forum.target_kind, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_record_moderation(UUID, forum.moderation_action_kind, forum.target_kind, TEXT, TEXT, JSONB, TEXT)
    TO service_role;

-- ============================================================
-- Feed support indexes — co-located with service_fetch_feed.
--
-- Each branch in service_fetch_feed targets one of these partial
-- indexes. status='active' AND nsfw=FALSE matches the default
-- (non-NSFW) feed; the NSFW path falls back to a sequential scan
-- since most clients never request it.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_threads_feed_new
    ON forum.threads (created_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_bump
    ON forum.threads (last_activity_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_top
    ON forum.threads (score DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_hot
    ON forum.threads (hot_rank DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

-- Per-space variants for the common case of "show me a single space".
CREATE INDEX IF NOT EXISTS idx_threads_space_feed_new
    ON forum.threads (space_id, created_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_bump
    ON forum.threads (space_id, last_activity_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_hot
    ON forum.threads (space_id, hot_rank DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;


-- migrate:down

DROP SCHEMA IF EXISTS forum CASCADE;
