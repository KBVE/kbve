-- migrate:up

-- ============================================================
-- MEME RPC FUNCTIONS
-- Service-role-only RPC functions for meme feed operations.
-- Called by Deno edge functions via createServiceClient().
--
-- Source of truth: packages/data/sql/schema/meme/meme_rpcs.sql
-- Depends on: 20260227220000_meme_schema_init (full meme schema)
-- ============================================================


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
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify all 7 functions exist
    PERFORM 'meme.service_fetch_feed(int,text,text)'::regprocedure;
    PERFORM 'meme.service_react(uuid,text,smallint)'::regprocedure;
    PERFORM 'meme.service_unreact(uuid,text)'::regprocedure;
    PERFORM 'meme.service_save_meme(uuid,text)'::regprocedure;
    PERFORM 'meme.service_unsave_meme(uuid,text)'::regprocedure;
    PERFORM 'meme.service_get_user_reactions(uuid,text[])'::regprocedure;
    PERFORM 'meme.service_get_user_saves(uuid,text[])'::regprocedure;

    -- Verify service_role has EXECUTE on all 7
    IF NOT has_function_privilege('service_role', 'meme.service_fetch_feed(int,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_fetch_feed';
    END IF;
    IF NOT has_function_privilege('service_role', 'meme.service_react(uuid,text,smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_react';
    END IF;
    IF NOT has_function_privilege('service_role', 'meme.service_unreact(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_unreact';
    END IF;
    IF NOT has_function_privilege('service_role', 'meme.service_save_meme(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_save_meme';
    END IF;
    IF NOT has_function_privilege('service_role', 'meme.service_unsave_meme(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_unsave_meme';
    END IF;
    IF NOT has_function_privilege('service_role', 'meme.service_get_user_reactions(uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_get_user_reactions';
    END IF;
    IF NOT has_function_privilege('service_role', 'meme.service_get_user_saves(uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on meme.service_get_user_saves';
    END IF;

    -- Verify anon does NOT have EXECUTE on any
    IF has_function_privilege('anon', 'meme.service_fetch_feed(int,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_fetch_feed';
    END IF;
    IF has_function_privilege('anon', 'meme.service_react(uuid,text,smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_react';
    END IF;
    IF has_function_privilege('anon', 'meme.service_unreact(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_unreact';
    END IF;
    IF has_function_privilege('anon', 'meme.service_save_meme(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_save_meme';
    END IF;
    IF has_function_privilege('anon', 'meme.service_unsave_meme(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_unsave_meme';
    END IF;
    IF has_function_privilege('anon', 'meme.service_get_user_reactions(uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_get_user_reactions';
    END IF;
    IF has_function_privilege('anon', 'meme.service_get_user_saves(uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on meme.service_get_user_saves';
    END IF;

    -- Verify all owned by service_role
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_fetch_feed(int,text,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_fetch_feed must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_react(uuid,text,smallint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_react must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_unreact(uuid,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_unreact must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_save_meme(uuid,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_save_meme must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_unsave_meme(uuid,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_unsave_meme must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_get_user_reactions(uuid,text[])'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_get_user_reactions must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'meme.service_get_user_saves(uuid,text[])'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'meme.service_get_user_saves must be owned by service_role';
    END IF;

    RAISE NOTICE 'meme.rpcs: all 7 service functions verified successfully.';
END;
$$ LANGUAGE plpgsql;


-- migrate:down

DROP FUNCTION IF EXISTS meme.service_fetch_feed(INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS meme.service_react(UUID, TEXT, SMALLINT);
DROP FUNCTION IF EXISTS meme.service_unreact(UUID, TEXT);
DROP FUNCTION IF EXISTS meme.service_save_meme(UUID, TEXT);
DROP FUNCTION IF EXISTS meme.service_unsave_meme(UUID, TEXT);
DROP FUNCTION IF EXISTS meme.service_get_user_reactions(UUID, TEXT[]);
DROP FUNCTION IF EXISTS meme.service_get_user_saves(UUID, TEXT[]);
