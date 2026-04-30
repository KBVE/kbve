-- migrate:up

-- ============================================================
-- FORUM — Twitter-style hashtag autovivify.
--
-- axum-kbve renders the markdown body through kbve::markdown which
-- already extracts `#hashtag` tokens during parse. This migration
-- adds the SECURITY DEFINER RPCs the handler needs to:
--   1. resolve those slugs to tag_ids, creating new rows on demand
--      (`service_resolve_or_create_tag_slugs`).
--   2. drive the per-tag feed at /forum/tag/{slug} via the existing
--      service_fetch_feed `p_tag_id` filter
--      (`service_get_tag_by_slug`).
--   3. drive the all-tags listing page at /forum/tags
--      (`service_list_tags`).
--
-- Mirrors packages/data/sql/schema/forum/forum_rpcs.sql; keep the
-- two in sync.
-- ============================================================

-- ===========================================
-- service_resolve_or_create_tag_slugs — slug-driven tag autovivify
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_resolve_or_create_tag_slugs(
    p_slugs       TEXT[],
    p_created_by  UUID
)
RETURNS INTEGER[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean   TEXT[];
    v_out     INTEGER[];
BEGIN
    IF p_slugs IS NULL OR cardinality(p_slugs) = 0 THEN
        RETURN '{}'::INTEGER[];
    END IF;

    IF p_created_by IS NULL THEN
        RAISE EXCEPTION 'p_created_by required for tag creation';
    END IF;

    SELECT array_agg(s ORDER BY s)
      INTO v_clean
      FROM (
          SELECT DISTINCT lower(trim(slug)) AS s
            FROM unnest(p_slugs) AS slug
           WHERE slug IS NOT NULL
             AND lower(trim(slug)) ~ '^[a-z0-9][a-z0-9-]*$'
             AND char_length(trim(slug)) BETWEEN 1 AND 50
           LIMIT 20
      ) clean;

    IF v_clean IS NULL OR cardinality(v_clean) = 0 THEN
        RETURN '{}'::INTEGER[];
    END IF;

    INSERT INTO forum.tags (slug, name, canonical_id, created_by)
    SELECT s, s, 0, p_created_by
      FROM unnest(v_clean) AS s
    ON CONFLICT (slug) DO NOTHING;

    SELECT array_agg(DISTINCT t.canonical_id ORDER BY t.canonical_id)
      INTO v_out
      FROM forum.tags t
     WHERE t.slug = ANY(v_clean)
       AND t.status <> 'deprecated';

    RETURN COALESCE(v_out, '{}'::INTEGER[]);
END;
$$;

REVOKE ALL ON FUNCTION forum.service_resolve_or_create_tag_slugs(TEXT[], UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_resolve_or_create_tag_slugs(TEXT[], UUID)
    TO service_role;

-- ===========================================
-- service_get_tag_by_slug — public-read for /forum/tag/{slug} feeds
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_get_tag_by_slug(p_slug TEXT)
RETURNS TABLE (
    id              INTEGER,
    canonical_id    INTEGER,
    slug            TEXT,
    name            TEXT,
    description     TEXT,
    status          forum.tag_status,
    thread_count    BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_slug TEXT := lower(trim(coalesce(p_slug, '')));
BEGIN
    IF v_slug = ''
       OR v_slug !~ '^[a-z0-9][a-z0-9-]*$'
       OR char_length(v_slug) > 50 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT canonical.id,
           canonical.canonical_id,
           canonical.slug,
           canonical.name,
           canonical.description,
           canonical.status,
           COALESCE((
               SELECT count(*)::BIGINT
                 FROM forum.thread_tags_resolved tr
                 JOIN forum.threads th ON th.id = tr.thread_id
                WHERE tr.tag_id = canonical.id
                  AND th.status = 'active'
                  AND th.nsfw = FALSE
           ), 0) AS thread_count
      FROM forum.tags input
      JOIN forum.tags canonical ON canonical.id = input.canonical_id
     WHERE input.slug = v_slug
       AND canonical.status <> 'deprecated';
END;
$$;

REVOKE ALL ON FUNCTION forum.service_get_tag_by_slug(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_get_tag_by_slug(TEXT) TO service_role;

-- ===========================================
-- service_list_tags — popularity-sorted tag listing for /forum/tags/
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_list_tags(p_limit INT DEFAULT 100)
RETURNS TABLE (
    id              INTEGER,
    slug            TEXT,
    name            TEXT,
    description     TEXT,
    thread_count    BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
BEGIN
    RETURN QUERY
    WITH counts AS (
        SELECT tr.tag_id, count(*)::BIGINT AS thread_count
          FROM forum.thread_tags_resolved tr
          JOIN forum.threads th ON th.id = tr.thread_id
         WHERE th.status = 'active'
           AND th.nsfw = FALSE
         GROUP BY tr.tag_id
    )
    SELECT t.id,
           t.slug,
           t.name,
           t.description,
           COALESCE(c.thread_count, 0) AS thread_count
      FROM forum.tags t
      LEFT JOIN counts c ON c.tag_id = t.id
     WHERE t.status = 'active'
       AND t.id = t.canonical_id
     ORDER BY COALESCE(c.thread_count, 0) DESC, t.slug ASC
     LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_list_tags(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_list_tags(INT) TO service_role;

-- ===========================================
-- service_get_thread_tags — chips for a single thread
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_get_thread_tags(p_thread_id TEXT)
RETURNS TABLE (
    id    INTEGER,
    slug  TEXT,
    name  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_thread_id IS NULL OR char_length(p_thread_id) > 64 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT t.id, t.slug, t.name
      FROM forum.thread_tags_resolved tr
      JOIN forum.tags t ON t.id = tr.tag_id
     WHERE tr.thread_id = p_thread_id
       AND t.status <> 'deprecated'
     ORDER BY t.slug ASC;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_get_thread_tags(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_get_thread_tags(TEXT) TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS forum.service_get_thread_tags(TEXT);
DROP FUNCTION IF EXISTS forum.service_list_tags(INT);
DROP FUNCTION IF EXISTS forum.service_get_tag_by_slug(TEXT);
DROP FUNCTION IF EXISTS forum.service_resolve_or_create_tag_slugs(TEXT[], UUID);
