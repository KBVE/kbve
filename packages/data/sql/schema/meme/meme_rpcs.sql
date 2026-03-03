-- ============================================================
-- MEME RPC FUNCTIONS
-- Service-role-only RPC functions for meme feed operations.
-- Called by Deno edge functions via createServiceClient().
--
-- Depends on: meme_core.sql, meme_engagement.sql, meme_social.sql
-- ============================================================

BEGIN;

-- ===========================================
-- RPC: service_fetch_feed
-- Paginated published meme feed with author info
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_fetch_feed(
    p_limit  INT  DEFAULT 20,
    p_cursor TEXT DEFAULT NULL,
    p_tag    TEXT DEFAULT NULL
)
RETURNS TABLE (
    id              TEXT,
    title           TEXT,
    format          SMALLINT,
    asset_url       TEXT,
    thumbnail_url   TEXT,
    width           INTEGER,
    height          INTEGER,
    tags            TEXT[],
    view_count      BIGINT,
    reaction_count  BIGINT,
    comment_count   BIGINT,
    save_count      BIGINT,
    share_count     BIGINT,
    created_at      TIMESTAMPTZ,
    author_name     TEXT,
    author_avatar   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Clamp limit to 1-50
    p_limit := GREATEST(1, LEAST(p_limit, 50));

    RETURN QUERY
    SELECT
        m.id,
        m.title,
        m.format,
        m.asset_url,
        m.thumbnail_url,
        m.width,
        m.height,
        m.tags,
        m.view_count,
        m.reaction_count,
        m.comment_count,
        m.save_count,
        m.share_count,
        m.created_at,
        p.display_name AS author_name,
        p.avatar_url   AS author_avatar
    FROM meme.memes AS m
    LEFT JOIN meme.meme_user_profiles AS p
        ON p.user_id = m.author_id
    WHERE m.status = 3  -- published only
      AND (p_cursor IS NULL OR m.id < p_cursor)
      AND (p_tag IS NULL OR p_tag = ANY(m.tags))
    ORDER BY m.id DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_fetch_feed(INT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_fetch_feed(INT, TEXT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_fetch_feed(INT, TEXT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_react
-- Add or change a reaction on a meme
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_react(
    p_user_id   UUID,
    p_meme_id   TEXT,
    p_reaction  SMALLINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO meme.meme_reactions (meme_id, user_id, reaction)
    VALUES (p_meme_id, p_user_id, p_reaction)
    ON CONFLICT (meme_id, user_id)
    DO UPDATE SET reaction = EXCLUDED.reaction;

    RETURN p_meme_id;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_react(UUID, TEXT, SMALLINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_react(UUID, TEXT, SMALLINT)
    TO service_role;
ALTER FUNCTION meme.service_react(UUID, TEXT, SMALLINT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_unreact
-- Remove a reaction from a meme
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_unreact(
    p_user_id  UUID,
    p_meme_id  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM meme.meme_reactions
    WHERE meme_id = p_meme_id AND user_id = p_user_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_unreact(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_unreact(UUID, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_unreact(UUID, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_save_meme
-- Bookmark a meme to the default saves bucket
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_save_meme(
    p_user_id  UUID,
    p_meme_id  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO meme.meme_saves (meme_id, user_id, collection_id)
    VALUES (p_meme_id, p_user_id, NULL)
    ON CONFLICT (meme_id, user_id, COALESCE(collection_id, '__default__'))
    DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_save_meme(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_save_meme(UUID, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_save_meme(UUID, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_unsave_meme
-- Remove a meme from default saves
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_unsave_meme(
    p_user_id  UUID,
    p_meme_id  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM meme.meme_saves
    WHERE meme_id = p_meme_id
      AND user_id = p_user_id
      AND collection_id IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_unsave_meme(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_unsave_meme(UUID, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_unsave_meme(UUID, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_get_user_reactions
-- Batch lookup of user reactions for given meme IDs
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_get_user_reactions(
    p_user_id   UUID,
    p_meme_ids  TEXT[]
)
RETURNS TABLE (
    meme_id   TEXT,
    reaction  SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT r.meme_id, r.reaction
    FROM meme.meme_reactions AS r
    WHERE r.user_id = p_user_id
      AND r.meme_id = ANY(p_meme_ids);
END;
$$;

REVOKE ALL ON FUNCTION meme.service_get_user_reactions(UUID, TEXT[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_get_user_reactions(UUID, TEXT[])
    TO service_role;
ALTER FUNCTION meme.service_get_user_reactions(UUID, TEXT[])
    OWNER TO service_role;


-- ===========================================
-- RPC: service_get_user_saves
-- Batch lookup of user saves for given meme IDs
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_get_user_saves(
    p_user_id   UUID,
    p_meme_ids  TEXT[]
)
RETURNS TABLE (
    meme_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT s.meme_id
    FROM meme.meme_saves AS s
    WHERE s.user_id = p_user_id
      AND s.meme_id = ANY(p_meme_ids);
END;
$$;

REVOKE ALL ON FUNCTION meme.service_get_user_saves(UUID, TEXT[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_get_user_saves(UUID, TEXT[])
    TO service_role;
ALTER FUNCTION meme.service_get_user_saves(UUID, TEXT[])
    OWNER TO service_role;


-- ===========================================
-- RPC: service_create_comment
-- Create a top-level or threaded reply comment
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_create_comment(
    p_user_id   UUID,
    p_meme_id   TEXT,
    p_body      TEXT,
    p_parent_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id TEXT;
BEGIN
    -- Validate parent belongs to the same meme
    IF p_parent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM meme.meme_comments
            WHERE id = p_parent_id AND meme_id = p_meme_id
        ) THEN
            RAISE EXCEPTION 'Parent comment not found or belongs to a different meme';
        END IF;
    END IF;

    INSERT INTO meme.meme_comments (meme_id, author_id, body, parent_id)
    VALUES (p_meme_id, p_user_id, p_body, p_parent_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_create_comment(UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_create_comment(UUID, TEXT, TEXT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_create_comment(UUID, TEXT, TEXT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_delete_comment
-- Delete own comment (cascades to replies)
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_delete_comment(
    p_user_id    UUID,
    p_comment_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM meme.meme_comments
    WHERE id = p_comment_id AND author_id = p_user_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_delete_comment(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_delete_comment(UUID, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_delete_comment(UUID, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_fetch_comments
-- Paginated top-level comments for a meme
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_fetch_comments(
    p_meme_id TEXT,
    p_limit   INT  DEFAULT 20,
    p_cursor  TEXT DEFAULT NULL
)
RETURNS TABLE (
    id              TEXT,
    author_id       UUID,
    body            TEXT,
    parent_id       TEXT,
    reaction_count  BIGINT,
    reply_count     INTEGER,
    created_at      TIMESTAMPTZ,
    author_name     TEXT,
    author_avatar   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    p_limit := GREATEST(1, LEAST(p_limit, 50));

    RETURN QUERY
    SELECT
        c.id,
        c.author_id,
        c.body,
        c.parent_id,
        c.reaction_count,
        c.reply_count,
        c.created_at,
        p.display_name AS author_name,
        p.avatar_url   AS author_avatar
    FROM meme.meme_comments AS c
    LEFT JOIN meme.meme_user_profiles AS p
        ON p.user_id = c.author_id
    WHERE c.meme_id = p_meme_id
      AND c.parent_id IS NULL
      AND (p_cursor IS NULL OR c.id < p_cursor)
    ORDER BY c.id DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_fetch_comments(TEXT, INT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_fetch_comments(TEXT, INT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_fetch_comments(TEXT, INT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_fetch_replies
-- Paginated replies to a comment (oldest first)
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_fetch_replies(
    p_parent_id TEXT,
    p_limit     INT  DEFAULT 20,
    p_cursor    TEXT DEFAULT NULL
)
RETURNS TABLE (
    id              TEXT,
    author_id       UUID,
    body            TEXT,
    parent_id       TEXT,
    reaction_count  BIGINT,
    reply_count     INTEGER,
    created_at      TIMESTAMPTZ,
    author_name     TEXT,
    author_avatar   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    p_limit := GREATEST(1, LEAST(p_limit, 50));

    RETURN QUERY
    SELECT
        c.id,
        c.author_id,
        c.body,
        c.parent_id,
        c.reaction_count,
        c.reply_count,
        c.created_at,
        p.display_name AS author_name,
        p.avatar_url   AS author_avatar
    FROM meme.meme_comments AS c
    LEFT JOIN meme.meme_user_profiles AS p
        ON p.user_id = c.author_id
    WHERE c.parent_id = p_parent_id
      AND (p_cursor IS NULL OR c.id > p_cursor)
    ORDER BY c.id ASC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_fetch_replies(TEXT, INT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_fetch_replies(TEXT, INT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_fetch_replies(TEXT, INT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_increment_view
-- Increment view count on a published meme
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_increment_view(
    p_meme_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE meme.memes
    SET view_count = view_count + 1
    WHERE id = p_meme_id AND status = 3;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_increment_view(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_increment_view(TEXT)
    TO service_role;
ALTER FUNCTION meme.service_increment_view(TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_increment_share
-- Increment share count on a published meme
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_increment_share(
    p_meme_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE meme.memes
    SET share_count = share_count + 1
    WHERE id = p_meme_id AND status = 3;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_increment_share(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_increment_share(TEXT)
    TO service_role;
ALTER FUNCTION meme.service_increment_share(TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_get_profile
-- Fetch public user profile with stats
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_get_profile(
    p_user_id UUID
)
RETURNS TABLE (
    user_id                  UUID,
    display_name             TEXT,
    avatar_url               TEXT,
    bio                      TEXT,
    total_memes              BIGINT,
    total_reactions_received BIGINT,
    total_views_received     BIGINT,
    follower_count           INTEGER,
    following_count          INTEGER,
    joined_at                TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.user_id,
        p.display_name,
        p.avatar_url,
        p.bio,
        p.total_memes,
        p.total_reactions_received,
        p.total_views_received,
        p.follower_count,
        p.following_count,
        p.joined_at
    FROM meme.meme_user_profiles AS p
    WHERE p.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_get_profile(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_get_profile(UUID)
    TO service_role;
ALTER FUNCTION meme.service_get_profile(UUID)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_upsert_profile
-- Create or update user profile (non-NULL params only)
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_upsert_profile(
    p_user_id      UUID,
    p_display_name TEXT DEFAULT NULL,
    p_avatar_url   TEXT DEFAULT NULL,
    p_bio          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO meme.meme_user_profiles (user_id, display_name, avatar_url, bio)
    VALUES (p_user_id, p_display_name, p_avatar_url, p_bio)
    ON CONFLICT (user_id) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, meme.meme_user_profiles.display_name),
        avatar_url   = COALESCE(EXCLUDED.avatar_url,   meme.meme_user_profiles.avatar_url),
        bio          = COALESCE(EXCLUDED.bio,           meme.meme_user_profiles.bio);
END;
$$;

REVOKE ALL ON FUNCTION meme.service_upsert_profile(UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_upsert_profile(UUID, TEXT, TEXT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_upsert_profile(UUID, TEXT, TEXT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_get_user_memes
-- Paginated published memes by a specific user
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_get_user_memes(
    p_user_id UUID,
    p_limit   INT  DEFAULT 20,
    p_cursor  TEXT DEFAULT NULL
)
RETURNS TABLE (
    id              TEXT,
    title           TEXT,
    format          SMALLINT,
    asset_url       TEXT,
    thumbnail_url   TEXT,
    width           INTEGER,
    height          INTEGER,
    tags            TEXT[],
    view_count      BIGINT,
    reaction_count  BIGINT,
    comment_count   BIGINT,
    save_count      BIGINT,
    share_count     BIGINT,
    created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    p_limit := GREATEST(1, LEAST(p_limit, 50));

    RETURN QUERY
    SELECT
        m.id,
        m.title,
        m.format,
        m.asset_url,
        m.thumbnail_url,
        m.width,
        m.height,
        m.tags,
        m.view_count,
        m.reaction_count,
        m.comment_count,
        m.save_count,
        m.share_count,
        m.created_at
    FROM meme.memes AS m
    WHERE m.author_id = p_user_id
      AND m.status = 3
      AND (p_cursor IS NULL OR m.id < p_cursor)
    ORDER BY m.id DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_get_user_memes(UUID, INT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_get_user_memes(UUID, INT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_get_user_memes(UUID, INT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_follow
-- Follow a user
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_follow(
    p_follower_id  UUID,
    p_following_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO meme.meme_follows (follower_id, following_id)
    VALUES (p_follower_id, p_following_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_follow(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_follow(UUID, UUID)
    TO service_role;
ALTER FUNCTION meme.service_follow(UUID, UUID)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_unfollow
-- Unfollow a user
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_unfollow(
    p_follower_id  UUID,
    p_following_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM meme.meme_follows
    WHERE follower_id = p_follower_id
      AND following_id = p_following_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_unfollow(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_unfollow(UUID, UUID)
    TO service_role;
ALTER FUNCTION meme.service_unfollow(UUID, UUID)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_report_meme
-- Submit a content report on a meme
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_report_meme(
    p_reporter_id UUID,
    p_meme_id     TEXT,
    p_reason      SMALLINT,
    p_detail      TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id TEXT;
BEGIN
    INSERT INTO meme.meme_reports (meme_id, reporter_id, reason, detail)
    VALUES (p_meme_id, p_reporter_id, p_reason, p_detail)
    ON CONFLICT (meme_id, reporter_id) WHERE resolved = false
    DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_report_meme(UUID, TEXT, SMALLINT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_report_meme(UUID, TEXT, SMALLINT, TEXT)
    TO service_role;
ALTER FUNCTION meme.service_report_meme(UUID, TEXT, SMALLINT, TEXT)
    OWNER TO service_role;


-- ===========================================
-- RPC: service_create_meme
-- Service-role-only: insert a new meme (URL reference + metadata)
-- Belt: validates all fields at RPC level
-- Suspenders: table constraints + triggers catch anything missed
-- ===========================================

CREATE OR REPLACE FUNCTION meme.service_create_meme(
    p_author_id       UUID,
    p_asset_url       TEXT,
    p_title           TEXT       DEFAULT NULL,
    p_format          SMALLINT   DEFAULT 0,
    p_thumbnail_url   TEXT       DEFAULT NULL,
    p_width           INTEGER    DEFAULT NULL,
    p_height          INTEGER    DEFAULT NULL,
    p_file_size       BIGINT     DEFAULT NULL,
    p_tags            TEXT[]     DEFAULT '{}',
    p_source_url      TEXT       DEFAULT NULL,
    p_alt_text        TEXT       DEFAULT NULL,
    p_content_hash    TEXT       DEFAULT NULL,
    p_status          SMALLINT   DEFAULT 1
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meme_id TEXT;
BEGIN
    -- Belt: validate at RPC level before hitting table constraints

    IF p_author_id IS NULL THEN
        RAISE EXCEPTION 'author_id is required';
    END IF;

    IF p_asset_url IS NULL OR btrim(p_asset_url) = '' THEN
        RAISE EXCEPTION 'asset_url is required';
    END IF;
    IF NOT meme.is_safe_url(p_asset_url) THEN
        RAISE EXCEPTION 'asset_url must be a valid HTTPS URL (max 2048 chars)';
    END IF;

    IF p_thumbnail_url IS NOT NULL AND NOT meme.is_safe_url(p_thumbnail_url) THEN
        RAISE EXCEPTION 'thumbnail_url must be a valid HTTPS URL';
    END IF;
    IF p_source_url IS NOT NULL AND NOT meme.is_safe_url(p_source_url) THEN
        RAISE EXCEPTION 'source_url must be a valid HTTPS URL';
    END IF;

    IF p_title IS NOT NULL AND (char_length(p_title) > 200 OR NOT meme.is_safe_text(p_title)) THEN
        RAISE EXCEPTION 'title must be <= 200 chars with no control characters';
    END IF;

    IF p_alt_text IS NOT NULL AND (char_length(p_alt_text) > 500 OR NOT meme.is_safe_text(p_alt_text)) THEN
        RAISE EXCEPTION 'alt_text must be <= 500 chars with no control characters';
    END IF;

    IF p_format < 0 OR p_format > 4 THEN
        RAISE EXCEPTION 'format must be between 0 and 4';
    END IF;

    IF p_status NOT IN (1, 2, 3) THEN
        RAISE EXCEPTION 'status must be 1 (draft), 2 (pending), or 3 (published)';
    END IF;

    IF NOT meme.are_valid_tags(p_tags) THEN
        RAISE EXCEPTION 'tags must be <= 20 lowercase slug-safe strings (1-50 chars each)';
    END IF;

    IF p_content_hash IS NOT NULL AND (char_length(p_content_hash) > 128 OR p_content_hash !~ '^[a-f0-9]+$') THEN
        RAISE EXCEPTION 'content_hash must be lowercase hex, max 128 chars';
    END IF;

    -- Suspenders: INSERT — table constraints + triggers catch anything we missed
    INSERT INTO meme.memes (
        author_id, asset_url, title, format, status,
        thumbnail_url, width, height, file_size,
        tags, source_url, alt_text, content_hash,
        published_at
    ) VALUES (
        p_author_id, p_asset_url, p_title, p_format, p_status,
        p_thumbnail_url, p_width, p_height, p_file_size,
        p_tags, p_source_url, p_alt_text, p_content_hash,
        CASE WHEN p_status = 3 THEN NOW() ELSE NULL END
    )
    RETURNING id INTO v_meme_id;

    RETURN v_meme_id;
END;
$$;

REVOKE ALL ON FUNCTION meme.service_create_meme(UUID, TEXT, TEXT, SMALLINT, TEXT, INTEGER, INTEGER, BIGINT, TEXT[], TEXT, TEXT, TEXT, SMALLINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION meme.service_create_meme(UUID, TEXT, TEXT, SMALLINT, TEXT, INTEGER, INTEGER, BIGINT, TEXT[], TEXT, TEXT, TEXT, SMALLINT)
    TO service_role;
ALTER FUNCTION meme.service_create_meme(UUID, TEXT, TEXT, SMALLINT, TEXT, INTEGER, INTEGER, BIGINT, TEXT[], TEXT, TEXT, TEXT, SMALLINT)
    OWNER TO service_role;


-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    v_funcs TEXT[] := ARRAY[
        'meme.service_fetch_feed(int,text,text)',
        'meme.service_react(uuid,text,smallint)',
        'meme.service_unreact(uuid,text)',
        'meme.service_save_meme(uuid,text)',
        'meme.service_unsave_meme(uuid,text)',
        'meme.service_get_user_reactions(uuid,text[])',
        'meme.service_get_user_saves(uuid,text[])',
        'meme.service_create_comment(uuid,text,text,text)',
        'meme.service_delete_comment(uuid,text)',
        'meme.service_fetch_comments(text,int,text)',
        'meme.service_fetch_replies(text,int,text)',
        'meme.service_increment_view(text)',
        'meme.service_increment_share(text)',
        'meme.service_get_profile(uuid)',
        'meme.service_upsert_profile(uuid,text,text,text)',
        'meme.service_get_user_memes(uuid,int,text)',
        'meme.service_follow(uuid,uuid)',
        'meme.service_unfollow(uuid,uuid)',
        'meme.service_report_meme(uuid,text,smallint,text)',
        'meme.service_create_meme(uuid,text,text,smallint,text,integer,integer,bigint,text[],text,text,text,smallint)'
    ];
    v_fn TEXT;
BEGIN
    PERFORM set_config('search_path', '', true);

    FOREACH v_fn IN ARRAY v_funcs LOOP
        -- Verify function exists
        PERFORM v_fn::regprocedure;

        -- Verify service_role has EXECUTE
        IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role must have EXECUTE on %', v_fn;
        END IF;

        -- Verify anon does NOT have EXECUTE
        IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'anon must NOT have EXECUTE on %', v_fn;
        END IF;

        -- Verify owned by service_role
        IF EXISTS (
            SELECT 1 FROM pg_proc
            WHERE oid = v_fn::regprocedure
              AND pg_get_userbyid(proowner) <> 'service_role'
        ) THEN
            RAISE EXCEPTION '% must be owned by service_role', v_fn;
        END IF;
    END LOOP;

    RAISE NOTICE 'meme.rpcs: all 20 service functions verified successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
