-- migrate:up

-- Conversation grouping for the herbmail inbox. Every message carries the id of
-- the message that started its conversation, so a reply arriving months later
-- still lands on the original thread instead of appearing as a loose row.
--
-- The root is resolved by walking in_reply_to -> message_id within one mailbox.
-- Threading is per user_id: two mailboxes that happen to see the same RFC
-- message id keep separate threads, and the walk can never cross between them.
--
-- herbmail_inbox_list / herbmail_message_get are deliberately left alone. Two
-- services call them today (herbmail-api and services/mail), so the thread
-- surface is additive: new functions, existing signatures untouched.

ALTER TABLE mail.messages
    ADD COLUMN IF NOT EXISTS thread_id uuid;

-- Resolve each message to the root of its reply chain. Messages whose parent is
-- absent (the other side of the conversation was never delivered here) root on
-- themselves, which is also the single-message case.
WITH RECURSIVE walk AS (
    SELECT m.id, m.user_id, m.id AS root_id, m.in_reply_to, 0 AS depth
      FROM mail.messages AS m
     WHERE m.thread_id IS NULL

    UNION ALL

    SELECT w.id, w.user_id, parent.id AS root_id, parent.in_reply_to, w.depth + 1
      FROM walk AS w
      JOIN mail.messages AS parent
        ON parent.user_id = w.user_id
       AND parent.message_id IS NOT NULL
       AND parent.message_id = w.in_reply_to
       AND parent.id <> w.id
     WHERE w.in_reply_to IS NOT NULL
       AND w.depth < 100
),
roots AS (
    SELECT DISTINCT ON (id) id, root_id
      FROM walk
     ORDER BY id, depth DESC
)
UPDATE mail.messages AS m
   SET thread_id = roots.root_id
  FROM roots
 WHERE m.id = roots.id
   AND m.thread_id IS NULL;

-- New rows inherit their parent's thread, or start one of their own. Doing this
-- in the database rather than the API keeps both services consistent without
-- either having to know the rule.
CREATE OR REPLACE FUNCTION mail.assign_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.thread_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.in_reply_to IS NOT NULL THEN
        SELECT parent.thread_id
          INTO NEW.thread_id
          FROM mail.messages AS parent
         WHERE parent.user_id = NEW.user_id
           AND parent.message_id = NEW.in_reply_to
           AND parent.thread_id IS NOT NULL
         ORDER BY parent.received_at ASC
         LIMIT 1;
    END IF;

    NEW.thread_id := coalesce(NEW.thread_id, NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_assign_thread ON mail.messages;
CREATE TRIGGER messages_assign_thread
    BEFORE INSERT ON mail.messages
    FOR EACH ROW
    EXECUTE FUNCTION mail.assign_thread();

CREATE INDEX IF NOT EXISTS messages_thread_idx
    ON mail.messages (user_id, thread_id, received_at ASC);

CREATE INDEX IF NOT EXISTS messages_thread_activity_idx
    ON mail.messages (user_id, thread_id, received_at DESC);

-- One row per conversation, ordered by latest activity. Paginates on
-- (last_activity, thread_id) for the same reason the message list does: a plain
-- timestamp cursor drops rows that share a millisecond.
DROP FUNCTION IF EXISTS public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text);

CREATE OR REPLACE FUNCTION public.herbmail_thread_list(
    p_user_id   uuid,
    p_limit     integer     DEFAULT 50,
    p_before    timestamptz DEFAULT NULL,
    p_before_id uuid        DEFAULT NULL,
    p_direction text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'thread_id',      t.thread_id,
               'subject',        t.subject,
               'participants',   t.participants,
               'message_count',  t.message_count,
               'last_activity',  t.last_activity,
               'last_direction', t.last_direction,
               'last_status',    t.last_status,
               'last_snippet',   t.last_snippet,
               'has_failure',    t.has_failure
           ) ORDER BY t.last_activity DESC, t.thread_id DESC), '[]'::jsonb)
      FROM (
          SELECT g.thread_id,
                 g.last_activity,
                 g.message_count,
                 g.has_failure,
                 last_msg.subject,
                 last_msg.direction AS last_direction,
                 last_msg.status    AS last_status,
                 left(regexp_replace(coalesce(last_msg.body, ''), '\s+', ' ', 'g'), 200) AS last_snippet,
                 g.participants
            FROM (
                SELECT m.thread_id,
                       max(m.received_at) AS last_activity,
                       count(*)           AS message_count,
                       bool_or(m.status = 'failed') AS has_failure,
                       (SELECT coalesce(jsonb_agg(DISTINCT addr), '[]'::jsonb)
                          FROM (
                              SELECT m2.from_addr AS addr
                                FROM mail.messages AS m2
                               WHERE m2.user_id = m.user_id
                                 AND m2.thread_id = m.thread_id
                                 AND m2.from_addr IS NOT NULL
                               UNION
                              SELECT m3.to_addr
                                FROM mail.messages AS m3
                               WHERE m3.user_id = m.user_id
                                 AND m3.thread_id = m.thread_id
                                 AND m3.to_addr IS NOT NULL
                          ) AS addrs) AS participants
                  FROM mail.messages AS m
                 WHERE p_user_id IS NOT NULL
                   AND m.user_id = p_user_id
                   AND m.thread_id IS NOT NULL
                   AND (p_direction IS NULL OR EXISTS (
                           SELECT 1 FROM mail.messages AS d
                            WHERE d.user_id = m.user_id
                              AND d.thread_id = m.thread_id
                              AND d.direction = p_direction))
                 GROUP BY m.user_id, m.thread_id
            ) AS g
            JOIN LATERAL (
                SELECT lm.subject, lm.direction, lm.status, lm.body
                  FROM mail.messages AS lm
                 WHERE lm.user_id = p_user_id
                   AND lm.thread_id = g.thread_id
                 ORDER BY lm.received_at DESC, lm.id DESC
                 LIMIT 1
            ) AS last_msg ON TRUE
           WHERE ((p_before IS NULL AND p_before_id IS NULL)
                  OR (p_before IS NOT NULL AND p_before_id IS NOT NULL
                      AND (g.last_activity, g.thread_id) < (p_before, p_before_id)))
           ORDER BY g.last_activity DESC, g.thread_id DESC
           LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
      ) AS t;
$$;

-- Every message in one conversation, oldest first, so the client renders it as
-- a transcript. Bodies are capped the same way herbmail_message_get caps them.
DROP FUNCTION IF EXISTS public.herbmail_thread_get(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.herbmail_thread_get(
    p_user_id   uuid,
    p_thread_id uuid,
    p_limit     integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
    SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
               'thread_id', p_thread_id,
               'subject',   max(t.subject) FILTER (WHERE t.rn = 1),
               'messages',  jsonb_agg(jsonb_build_object(
                   'id',             t.id,
                   'direction',      t.direction,
                   'status',         t.status,
                   'via',            t.via,
                   'from_addr',      t.from_addr,
                   'to_addr',        t.to_addr,
                   'subject',        t.subject,
                   'body',           left(t.body, 1048576),
                   'body_truncated', (length(coalesce(t.body, '')) > 1048576),
                   'message_id',     t.message_id,
                   'in_reply_to',    t.in_reply_to,
                   'received_at',    t.received_at,
                   'sent_at',        t.sent_at,
                   'error',          t.error,
                   'from_username',  t.from_username
               ) ORDER BY t.received_at ASC, t.id ASC)
           ) END
      FROM (
          SELECT m.*,
                 fu.username AS from_username,
                 row_number() OVER (ORDER BY m.received_at ASC, m.id ASC) AS rn
            FROM mail.messages AS m
            LEFT JOIN profile.username AS fu ON fu.user_id = m.from_user_id
           WHERE p_user_id IS NOT NULL
             AND p_thread_id IS NOT NULL
             AND m.user_id = p_user_id
             AND m.thread_id = p_thread_id
           ORDER BY m.received_at ASC, m.id ASC
           LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
      ) AS t;
$$;

REVOKE ALL ON FUNCTION public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.herbmail_thread_get(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.herbmail_thread_get(uuid, uuid, integer) TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS public.herbmail_thread_get(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text);
DROP TRIGGER IF EXISTS messages_assign_thread ON mail.messages;
DROP FUNCTION IF EXISTS mail.assign_thread();
DROP INDEX IF EXISTS mail.messages_thread_activity_idx;
DROP INDEX IF EXISTS mail.messages_thread_idx;
ALTER TABLE mail.messages DROP COLUMN IF EXISTS thread_id;
