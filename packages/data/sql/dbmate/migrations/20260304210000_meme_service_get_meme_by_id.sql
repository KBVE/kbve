-- migrate:up

CREATE OR REPLACE FUNCTION meme.service_get_meme_by_id(
    p_meme_id TEXT
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
    WHERE m.id = p_meme_id
      AND m.status = 3;  -- published only
END;
$$;

REVOKE ALL ON FUNCTION meme.service_get_meme_by_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION meme.service_get_meme_by_id(TEXT) TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS meme.service_get_meme_by_id(TEXT);
