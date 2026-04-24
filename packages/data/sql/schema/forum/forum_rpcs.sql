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
-- invoking. These functions assume their inputs have already been
-- authorized; they focus on atomicity + denormalized-counter
-- maintenance.
--
-- Depends on: forum_core.sql, forum_user.sql, forum_engagement.sql,
--             forum_moderation.sql.
-- ============================================================

BEGIN;

-- ===========================================
-- service_resolve_tag_ids — map raw tag IDs to their canonical IDs
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
-- service_create_thread — insert thread + tag edges + bump space counter
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
    v_tag           INTEGER;
    v_status        forum.thread_status;
BEGIN
    -- Ensure the author has a forum_user_profiles row.
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

    -- Resolve and persist tag edges (canonical IDs only).
    v_resolved_tags := forum.service_resolve_tag_ids(p_tag_ids);
    IF array_length(v_resolved_tags, 1) IS NOT NULL THEN
        FOREACH v_tag IN ARRAY v_resolved_tags LOOP
            INSERT INTO forum.thread_tags (thread_id, tag_id)
                 VALUES (v_thread_id, v_tag)
            ON CONFLICT (thread_id, tag_id) DO NOTHING;
            UPDATE forum.tags SET usage_count = usage_count + 1 WHERE id = v_tag;
        END LOOP;
    END IF;

    -- Denormalized counters.
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
-- service_create_comment — insert + bump thread counter + notifications
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
    PERFORM forum.service_ensure_user_profile(p_author_id);

    -- Derive depth from parent.
    IF p_parent_comment_id IS NOT NULL THEN
        SELECT depth + 1, author_id
          INTO v_depth, v_parent_author
          FROM forum.comments
         WHERE id = p_parent_comment_id;
        IF v_depth IS NULL THEN
            RAISE EXCEPTION 'parent comment % not found', p_parent_comment_id;
        END IF;
        IF v_depth > 5 THEN
            v_depth := 5;
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

    -- Bump thread counters + last_activity_at.
    UPDATE forum.threads
       SET comment_count = comment_count + 1,
           last_activity_at = NOW()
     WHERE id = p_thread_id
     RETURNING author_id INTO v_thread_author;

    UPDATE forum.forum_user_profiles
       SET comment_count = comment_count + 1,
           last_active_at = NOW()
     WHERE user_id = p_author_id;

    -- Notifications (skip self-notifications).
    IF v_parent_author IS NOT NULL AND v_parent_author <> p_author_id THEN
        INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
             VALUES (v_parent_author, 'reply', p_author_id, 'comment', v_comment_id);
    ELSIF v_thread_author IS NOT NULL AND v_thread_author <> p_author_id THEN
        INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
             VALUES (v_thread_author, 'thread_reply', p_author_id, 'comment', v_comment_id);
    END IF;

    -- Fan-out to thread subscribers (excluding the author of this comment).
    INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
    SELECT ts.user_id, 'thread_update', p_author_id, 'thread', p_thread_id
      FROM forum.thread_subscriptions ts
     WHERE ts.thread_id = p_thread_id
       AND ts.user_id <> p_author_id
       AND ts.user_id <> COALESCE(v_parent_author, '00000000-0000-0000-0000-000000000000'::UUID)
       AND ts.user_id <> COALESCE(v_thread_author, '00000000-0000-0000-0000-000000000000'::UUID);

    RETURN v_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_create_comment(UUID, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_create_comment(UUID, TEXT, TEXT, TEXT, TEXT)
    TO service_role;

-- ===========================================
-- service_cast_thread_vote — upsert vote + update score counters + karma
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
AS $$
DECLARE
    v_old           forum.vote_direction;
    v_delta_up      INTEGER := 0;
    v_delta_down    INTEGER := 0;
    v_thread_author UUID;
BEGIN
    PERFORM forum.service_ensure_user_profile(p_user_id);

    SELECT direction
      INTO v_old
      FROM forum.thread_votes
     WHERE thread_id = p_thread_id AND voter_id = p_user_id
         FOR UPDATE;

    -- Compute delta for score counters.
    -- Old state first (undo its effect), then new state (apply its effect).
    IF v_old = 'up'   THEN v_delta_up := v_delta_up - 1; END IF;
    IF v_old = 'down' THEN v_delta_down := v_delta_down - 1; END IF;
    IF p_direction = 'up'   THEN v_delta_up := v_delta_up + 1; END IF;
    IF p_direction = 'down' THEN v_delta_down := v_delta_down + 1; END IF;

    -- Upsert vote row.
    IF v_old IS NULL THEN
        INSERT INTO forum.thread_votes (thread_id, voter_id, direction)
             VALUES (p_thread_id, p_user_id, p_direction);
    ELSE
        UPDATE forum.thread_votes
           SET direction = p_direction,
               updated_at = NOW()
         WHERE thread_id = p_thread_id AND voter_id = p_user_id;
    END IF;

    -- Apply counter deltas on the thread.
    UPDATE forum.threads
       SET upvote_count   = upvote_count + v_delta_up,
           downvote_count = downvote_count + v_delta_down,
           score          = score + v_delta_up - v_delta_down,
           last_activity_at = NOW()
     WHERE id = p_thread_id
     RETURNING author_id INTO v_thread_author;

    -- Update voter + author karma bookkeeping.
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
-- service_cast_comment_vote — same pattern as thread vote
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
AS $$
DECLARE
    v_old            forum.vote_direction;
    v_delta_up       INTEGER := 0;
    v_delta_down     INTEGER := 0;
    v_comment_author UUID;
BEGIN
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

    IF v_old IS NULL THEN
        INSERT INTO forum.comment_votes (comment_id, voter_id, direction)
             VALUES (p_comment_id, p_user_id, p_direction);
    ELSE
        UPDATE forum.comment_votes
           SET direction = p_direction,
               updated_at = NOW()
         WHERE comment_id = p_comment_id AND voter_id = p_user_id;
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
-- service_toggle_reaction — add or remove a reaction idempotently
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
AS $$
DECLARE
    v_existing TEXT;
BEGIN
    IF p_parent_kind NOT IN ('thread', 'comment') THEN
        RAISE EXCEPTION 'reaction parent must be thread or comment, got %', p_parent_kind;
    END IF;
    IF (p_kind = 'custom') <> (p_custom_kind IS NOT NULL) THEN
        RAISE EXCEPTION 'custom_kind must be set iff kind = custom';
    END IF;

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
        RETURN FALSE;  -- toggled off
    ELSE
        INSERT INTO forum.reactions (parent_kind, parent_id, user_id, kind, custom_kind)
             VALUES (p_parent_kind, p_parent_id, p_user_id, p_kind, p_custom_kind);
        RETURN TRUE;   -- toggled on
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_toggle_reaction(UUID, forum.attachment_parent_kind, TEXT, forum.reaction_kind, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_toggle_reaction(UUID, forum.attachment_parent_kind, TEXT, forum.reaction_kind, TEXT)
    TO service_role;

-- ===========================================
-- service_file_report — dedupes open reports per (reporter, target)
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_file_report(
    p_reporter_id   UUID,
    p_target_kind   forum.attachment_parent_kind,
    p_target_id     TEXT,
    p_reason        forum.report_reason,
    p_reason_detail TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_report_id TEXT;
BEGIN
    IF p_target_kind NOT IN ('thread', 'comment', 'user') THEN
        RAISE EXCEPTION 'report target must be thread, comment, or user, got %', p_target_kind;
    END IF;

    -- Existing open report? Return its id — idempotent.
    SELECT id
      INTO v_report_id
      FROM forum.reports
     WHERE reporter_id = p_reporter_id
       AND target_kind = p_target_kind
       AND target_id = p_target_id
       AND resolved_at IS NULL;

    IF v_report_id IS NOT NULL THEN
        RETURN v_report_id;
    END IF;

    INSERT INTO forum.reports (reporter_id, target_kind, target_id, reason, reason_detail)
         VALUES (p_reporter_id, p_target_kind, p_target_id, p_reason, p_reason_detail)
      RETURNING id INTO v_report_id;

    -- Auto-flag comments when a report lands on them (visibility hint for
    -- moderators). Threads do not auto-hide; reports are mod-reviewed.
    IF p_target_kind = 'comment' THEN
        UPDATE forum.comments
           SET status = 'flagged'
         WHERE id = p_target_id AND status = 'active';
    END IF;

    RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_file_report(UUID, forum.attachment_parent_kind, TEXT, forum.report_reason, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_file_report(UUID, forum.attachment_parent_kind, TEXT, forum.report_reason, TEXT)
    TO service_role;

-- ===========================================
-- service_place_bid — append to auction_bids, update denormalized head
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
AS $$
DECLARE
    v_bid_id        TEXT;
    v_current_bid   BIGINT;
    v_min_increment BIGINT;
    v_end_time      TIMESTAMPTZ;
    v_type          forum.thread_type;
    v_anti_snipe    BOOLEAN;
    v_anti_snipe_s  INTEGER;
BEGIN
    SELECT thread_type,
           (type_data->>'current_bid')::BIGINT,
           COALESCE((type_data->>'min_increment')::BIGINT, 1),
           (type_data->>'end_time')::TIMESTAMPTZ,
           COALESCE((type_data->>'anti_snipe_enabled')::BOOLEAN, FALSE),
           COALESCE((type_data->>'anti_snipe_extend_seconds')::INTEGER, 0)
      INTO v_type, v_current_bid, v_min_increment, v_end_time, v_anti_snipe, v_anti_snipe_s
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
    IF p_amount < COALESCE(v_current_bid, 0) + v_min_increment THEN
        RAISE EXCEPTION 'bid % below minimum (current %, increment %)', p_amount, v_current_bid, v_min_increment;
    END IF;

    INSERT INTO forum.auction_bids (thread_id, bidder_id, amount, currency)
         VALUES (p_thread_id, p_bidder_id, p_amount, p_currency)
      RETURNING id INTO v_bid_id;

    -- Update denormalized head + optional anti-snipe time extension.
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

    -- Notify prior bidder they were outbid.
    IF v_current_bid IS NOT NULL THEN
        INSERT INTO forum.notifications (recipient_id, kind, actor_id, target_kind, target_id)
        SELECT (type_data->>'current_bidder_id')::UUID, 'auction_outbid', p_bidder_id, 'thread', p_thread_id
          FROM forum.threads
         WHERE id = p_thread_id
           AND (type_data->>'current_bidder_id') IS NOT NULL
           AND (type_data->>'current_bidder_id')::UUID <> p_bidder_id;
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
AS $$
DECLARE
    v_limit INTEGER;
BEGIN
    v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));

    RETURN QUERY
    WITH base AS (
        SELECT t.*
          FROM forum.threads t
         WHERE t.status = 'active'
           AND (p_space_id IS NULL OR t.space_id = p_space_id)
           AND (p_thread_type IS NULL OR t.thread_type = p_thread_type)
           AND (p_include_nsfw OR NOT t.nsfw)
           AND (
                 p_tag_id IS NULL
                 OR EXISTS (
                    SELECT 1 FROM forum.thread_tags_resolved r
                     WHERE r.thread_id = t.id AND r.tag_id = p_tag_id
                 )
           )
    )
    SELECT b.id, b.title, b.body, b.author_id, b.space_id, b.thread_type,
           b.type_data, b.status, b.comment_count, b.view_count,
           b.score, b.upvote_count, b.downvote_count,
           b.last_activity_at, b.created_at, b.nsfw, b.pinned, b.slug
      FROM base b
     ORDER BY
        CASE WHEN p_sort = 'hot'           THEN forum.hot_score(b.score, b.created_at) END DESC NULLS LAST,
        CASE WHEN p_sort = 'top'           THEN b.score END DESC NULLS LAST,
        CASE WHEN p_sort = 'rising'        THEN b.score::DOUBLE PRECISION / GREATEST(EXTRACT(EPOCH FROM NOW() - b.created_at) / 3600.0, 1) END DESC NULLS LAST,
        CASE WHEN p_sort = 'controversial' THEN (b.upvote_count + b.downvote_count)::BIGINT * LEAST(b.upvote_count, b.downvote_count) END DESC NULLS LAST,
        CASE WHEN p_sort = 'bump'          THEN b.last_activity_at END DESC NULLS LAST,
        CASE WHEN p_sort = 'new' OR p_sort NOT IN ('hot','top','rising','controversial','bump') THEN b.created_at END DESC,
        b.id DESC
     LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_fetch_feed(UUID, INTEGER, forum.thread_type, TEXT, TEXT, INTEGER, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_fetch_feed(UUID, INTEGER, forum.thread_type, TEXT, TEXT, INTEGER, BOOLEAN)
    TO service_role;

-- ===========================================
-- service_record_moderation — append to mod log + apply state change
-- ===========================================
CREATE OR REPLACE FUNCTION forum.service_record_moderation(
    p_moderator_id  UUID,
    p_kind          forum.moderation_action_kind,
    p_target_kind   forum.attachment_parent_kind,
    p_target_id     TEXT,
    p_reason        TEXT DEFAULT NULL,
    p_metadata_json JSONB DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_action_id TEXT;
BEGIN
    INSERT INTO forum.moderation_actions (
        moderator_id, kind, target_kind, target_id, reason, metadata_json
    )
    VALUES (p_moderator_id, p_kind, p_target_kind, p_target_id, p_reason, p_metadata_json)
    RETURNING id INTO v_action_id;

    -- Apply the side effect corresponding to the action kind.
    CASE p_kind
        WHEN 'thread_lock'    THEN UPDATE forum.threads SET status = 'locked',  locked = TRUE  WHERE id = p_target_id;
        WHEN 'thread_unlock'  THEN UPDATE forum.threads SET status = 'active',  locked = FALSE WHERE id = p_target_id;
        WHEN 'thread_remove'  THEN UPDATE forum.threads SET status = 'removed' WHERE id = p_target_id;
        WHEN 'thread_restore' THEN UPDATE forum.threads SET status = 'active'  WHERE id = p_target_id;
        WHEN 'thread_pin'     THEN UPDATE forum.threads SET pinned = TRUE  WHERE id = p_target_id;
        WHEN 'thread_unpin'   THEN UPDATE forum.threads SET pinned = FALSE WHERE id = p_target_id;
        WHEN 'thread_move'    THEN
            IF p_metadata_json ? 'space_id' THEN
                UPDATE forum.threads SET space_id = (p_metadata_json->>'space_id')::UUID
                 WHERE id = p_target_id;
            END IF;
        WHEN 'comment_remove'  THEN UPDATE forum.comments SET status = 'removed' WHERE id = p_target_id;
        WHEN 'comment_restore' THEN UPDATE forum.comments SET status = 'active'  WHERE id = p_target_id;
        WHEN 'user_ban'        THEN
            UPDATE forum.forum_user_profiles
               SET is_banned = TRUE,
                   ban_reason = COALESCE(p_reason, ban_reason),
                   ban_expires_at = (p_metadata_json->>'expires_at')::TIMESTAMPTZ
             WHERE user_id = p_target_id::UUID;
        WHEN 'user_unban' THEN
            UPDATE forum.forum_user_profiles
               SET is_banned = FALSE, ban_reason = NULL, ban_expires_at = NULL
             WHERE user_id = p_target_id::UUID;
        WHEN 'user_mute'  THEN
            UPDATE forum.forum_user_profiles SET mute_all_notifications = TRUE
             WHERE user_id = p_target_id::UUID;
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
                UPDATE forum.tags
                   SET status = 'merged',
                       alias_of = (p_metadata_json->>'canonical_id')::INTEGER,
                       canonical_id = (p_metadata_json->>'canonical_id')::INTEGER
                 WHERE id = p_target_id::INTEGER;
            END IF;
        WHEN 'tag_deprecate' THEN
            UPDATE forum.tags SET status = 'deprecated'
             WHERE id = p_target_id::INTEGER;
        ELSE
            NULL;  -- other kinds: just log
    END CASE;

    RETURN v_action_id;
END;
$$;

REVOKE ALL ON FUNCTION forum.service_record_moderation(UUID, forum.moderation_action_kind, forum.attachment_parent_kind, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forum.service_record_moderation(UUID, forum.moderation_action_kind, forum.attachment_parent_kind, TEXT, TEXT, JSONB)
    TO service_role;

COMMIT;
