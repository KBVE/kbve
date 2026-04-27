-- migrate:up

-- ============================================================
-- FORUM — username gate.
--
-- forum.service_create_thread + forum.service_create_comment now
-- require the author to have a row in profile.username. The new
-- helper forum.assert_user_has_username runs cross-schema as
-- SECURITY DEFINER (postgres owner) and raises P0001 with a HINT
-- pointing at profile.service_add_username.
--
-- This migration emits the helper plus CREATE OR REPLACE on both
-- RPCs. The function bodies are copied verbatim from
-- packages/data/sql/schema/forum/forum_rpcs.sql at HEAD with the
-- new PERFORM forum.assert_user_has_username(...) call inserted
-- right after the is_user_banned check.
-- ============================================================

CREATE OR REPLACE FUNCTION forum.assert_user_has_username(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM profile.username WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'username required: user must set a username before posting'
            USING ERRCODE = 'P0001', HINT = 'Call profile.service_add_username before posting.';
    END IF;
END;
$$;

COMMENT ON FUNCTION forum.assert_user_has_username IS
    'Raises if the user has no row in profile.username. Called by every forum.service_create_* RPC before insert.';

REVOKE ALL ON FUNCTION forum.assert_user_has_username(UUID) FROM PUBLIC;

-- service_create_thread — re-emit with the gate.
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

    PERFORM forum.assert_user_has_username(p_author_id);

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
        INSERT INTO forum.thread_tags (thread_id, tag_id)
        SELECT v_thread_id, t
          FROM unnest(v_resolved_tags) AS t
        ON CONFLICT (thread_id, tag_id) DO NOTHING;
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

-- service_create_comment — re-emit with the gate.
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

    PERFORM forum.assert_user_has_username(p_author_id);

    IF p_body IS NULL OR length(p_body) < 1 OR length(p_body) > 20000 THEN
        RAISE EXCEPTION 'invalid comment body length';
    END IF;

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

-- migrate:down

-- Down: drop the helper. The CREATE OR REPLACE bodies above retain the
-- PERFORM forum.assert_user_has_username call, so a rollback leaves the
-- two RPCs erroring "function does not exist" until they're re-emitted
-- without the gate. Rollback only when truly needed and re-apply forward
-- immediately after.
DROP FUNCTION IF EXISTS forum.assert_user_has_username(UUID);
