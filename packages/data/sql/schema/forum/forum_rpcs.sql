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

BEGIN;

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

    -- Single pass: trim + lowercase, validate against the table CHECK,
    -- DISTINCT, sort, cap at 20 — same query that drives the INSERT
    -- and the lookup.
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
-- service_get_tag_by_slug — canonical tag row for /forum/tag/{slug}
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
    -- Aggregate counts once via a CTE rather than a per-row LATERAL
    -- subquery; lifts /forum/tags from O(N) subqueries to O(1).
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

    -- Username gate: posting without a username is rejected so the read
    -- side never has to render a UUID stand-in.
    PERFORM forum.assert_user_has_username(p_author_id);

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

    -- Username gate: see service_create_thread.
    PERFORM forum.assert_user_has_username(p_author_id);

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

-- ===========================================
-- Staff comment moderation RPCs.
--
-- Both gate on `forum.is_staff(p_user_id)` so a misbehaving
-- service_role caller can't moderate without staff rights. axum-kbve
-- still does its own JWT-side staff check before forwarding —
-- belt-and-suspenders.
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_staff_edit_comment(
    p_user_id    UUID,
    p_comment_id TEXT,
    p_new_body   TEXT,
    p_reason     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
BEGIN
    IF NOT forum.is_staff(p_user_id) THEN
        RAISE EXCEPTION 'staff permissions required';
    END IF;

    IF p_new_body IS NULL OR length(p_new_body) < 1 OR length(p_new_body) > 20000 THEN
        RAISE EXCEPTION 'invalid comment body length';
    END IF;

    UPDATE forum.comments
       SET body           = p_new_body,
           edited_at      = NOW(),
           revision_count = revision_count + 1
     WHERE id = p_comment_id
       AND status IN ('active', 'flagged');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'comment % not found or not editable', p_comment_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_staff_edit_comment(UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_staff_edit_comment(UUID, TEXT, TEXT, TEXT)
    TO service_role;

-- Mirrors the comment_remove branch in service_record_moderation but
-- enforces the staff gate inline. Decrements the parent thread's
-- comment_count and writes to forum.moderation_actions for the audit
-- trail.
CREATE OR REPLACE FUNCTION forum.service_staff_remove_comment(
    p_user_id    UUID,
    p_comment_id TEXT,
    p_reason     TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '1s'
AS $$
DECLARE
    v_action_id      TEXT;
    v_comment_thread TEXT;
BEGIN
    IF NOT forum.is_staff(p_user_id) THEN
        RAISE EXCEPTION 'staff permissions required';
    END IF;

    UPDATE forum.comments
       SET status = 'removed'
     WHERE id = p_comment_id
       AND status <> 'removed'
    RETURNING thread_id INTO v_comment_thread;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'comment % not found or already removed', p_comment_id;
    END IF;

    UPDATE forum.threads
       SET comment_count = GREATEST(comment_count - 1, 0)
     WHERE id = v_comment_thread;

    INSERT INTO forum.moderation_actions (
        moderator_id, kind, target_kind, target_id, reason, metadata_json
    )
    VALUES (
        p_user_id,
        'comment_remove',
        'comment',
        p_comment_id,
        p_reason,
        jsonb_build_object('via', 'service_staff_remove_comment')
    )
    RETURNING id INTO v_action_id;

    RETURN v_action_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_staff_remove_comment(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_staff_remove_comment(UUID, TEXT, TEXT)
    TO service_role;

-- ============================================================
-- Feed support indexes (default-safe variants) — co-located with
-- service_fetch_feed.
--
-- Each branch in service_fetch_feed targets one of these partial
-- indexes. The `_safe` suffix distinguishes them from the broader
-- forum_core feed indexes (which gate only on status='active'); the
-- _safe variants additionally filter nsfw=FALSE to match the default
-- p_include_nsfw=FALSE feed path. The NSFW path falls back to the
-- core indexes since most clients never request NSFW threads.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_threads_feed_new_safe
    ON forum.threads (created_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_bump_safe
    ON forum.threads (last_activity_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_top_safe
    ON forum.threads (score DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_feed_hot_safe
    ON forum.threads (hot_rank DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

-- Per-space variants for the common case of "show me a single space".
CREATE INDEX IF NOT EXISTS idx_threads_space_feed_new_safe
    ON forum.threads (space_id, created_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_bump_safe
    ON forum.threads (space_id, last_activity_at DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_space_feed_hot_safe
    ON forum.threads (space_id, hot_rank DESC, id DESC)
    WHERE status = 'active' AND nsfw = FALSE;

COMMIT;
