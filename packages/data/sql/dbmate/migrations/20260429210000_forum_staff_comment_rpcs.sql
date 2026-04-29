-- migrate:up

-- ============================================================
-- FORUM — staff moderation RPCs for comments.
--
-- Two new SECURITY DEFINER RPCs let staff edit / remove individual
-- comments without bypassing the moderation_actions audit log:
--
--   forum.service_staff_edit_comment   — staff overwrites body
--   forum.service_staff_remove_comment — staff sets status='removed'
--
-- Plus a small helper:
--
--   forum.is_staff(uuid) — TRUE if the user has any non-zero
--                          permissions row in staff.members.
--
-- Belt-and-suspenders: axum-kbve checks staff at the JWT layer
-- before forwarding the call; the RPC re-checks at the SQL layer
-- so a misbehaving service_role caller can't moderate.
--
-- The remove path also writes to forum.moderation_actions and
-- decrements forum.threads.comment_count to keep the read counter
-- accurate. The edit path skips moderation_actions for now because
-- forum.moderation_action_kind has no `comment_edit` value yet —
-- the comment row's revision_count + edited_at is the audit trail.
-- ============================================================

-- Cross-schema is_staff helper. SECURITY DEFINER + qualified
-- references so it works regardless of caller search_path.
CREATE OR REPLACE FUNCTION forum.is_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM staff.members
         WHERE user_id = p_user_id
           AND permissions <> 0
    );
END;
$$;

COMMENT ON FUNCTION forum.is_staff(UUID) IS
    'TRUE if the user has any non-zero permissions row in staff.members.';

REVOKE ALL ON FUNCTION forum.is_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forum.is_staff(UUID) TO authenticated, service_role;

-- ============================================================
-- service_staff_edit_comment — staff overwrites comment body.
-- ============================================================
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

-- ============================================================
-- service_staff_remove_comment — staff soft-deletes a comment.
-- Mirrors the comment_remove branch in service_record_moderation
-- but with the staff gate inside the RPC itself.
-- ============================================================
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

-- migrate:down

DROP FUNCTION IF EXISTS forum.service_staff_remove_comment(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS forum.service_staff_edit_comment(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS forum.is_staff(UUID);
