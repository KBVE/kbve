-- migrate:up
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

-- migrate:down
DROP FUNCTION IF EXISTS meme.service_create_meme(UUID, TEXT, TEXT, SMALLINT, TEXT, INTEGER, INTEGER, BIGINT, TEXT[], TEXT, TEXT, TEXT, SMALLINT);
