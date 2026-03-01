-- migrate:up

-- ============================================================
-- MEME RPC FUNCTIONS v2
-- Comments, view/share tracking, profiles, follows, reports.
-- Called by Deno edge functions via createServiceClient().
--
-- Source of truth: packages/data/sql/schema/meme/meme_rpcs.sql
-- Depends on: 20260228210000_meme_rpcs (v1 RPCs)
-- ============================================================


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
-- VERIFICATION (all 19 RPCs)
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
        'meme.service_report_meme(uuid,text,smallint,text)'
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

    RAISE NOTICE 'meme.rpcs: all 19 service functions verified successfully.';
END;
$$ LANGUAGE plpgsql;


-- migrate:down

DROP FUNCTION IF EXISTS meme.service_create_comment(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS meme.service_delete_comment(UUID, TEXT);
DROP FUNCTION IF EXISTS meme.service_fetch_comments(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS meme.service_fetch_replies(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS meme.service_increment_view(TEXT);
DROP FUNCTION IF EXISTS meme.service_increment_share(TEXT);
DROP FUNCTION IF EXISTS meme.service_get_profile(UUID);
DROP FUNCTION IF EXISTS meme.service_upsert_profile(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS meme.service_get_user_memes(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS meme.service_follow(UUID, UUID);
DROP FUNCTION IF EXISTS meme.service_unfollow(UUID, UUID);
DROP FUNCTION IF EXISTS meme.service_report_meme(UUID, TEXT, SMALLINT, TEXT);
