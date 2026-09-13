-- migrate:up

-- Three defects in 20260912210000_mail_threads, found by auditing the objects
-- it actually created rather than the SQL that was meant to create them.

-- 1. mail.assign_thread was created SECURITY DEFINER and never had its default
--    PUBLIC execute revoked, unlike every other definer function in this
--    schema. Trigger functions are invoked by the system and do not need the
--    grant, so nothing depends on it being there.
REVOKE ALL ON FUNCTION mail.assign_thread() FROM PUBLIC, anon, authenticated;

-- 2. The trigger trusted a caller-supplied thread_id verbatim. Nothing sets it
--    today, but the rule "a thread belongs to one mailbox" was enforced only by
--    callers behaving; an insert naming another mailbox's thread was accepted
--    and grafted a message into that conversation. Reads stayed scoped by
--    user_id, so this was pollution rather than disclosure. The database now
--    enforces the rule: a supplied thread_id is honoured only if it already
--    exists in this mailbox, otherwise it is resolved from scratch.
CREATE OR REPLACE FUNCTION mail.assign_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    known boolean;
BEGIN
    IF NEW.thread_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM mail.messages AS own
             WHERE own.user_id = NEW.user_id
               AND own.thread_id = NEW.thread_id
        ) INTO known;

        IF known THEN
            RETURN NEW;
        END IF;

        NEW.thread_id := NULL;
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

REVOKE ALL ON FUNCTION mail.assign_thread() FROM PUBLIC, anon, authenticated;

-- 3. last_snippet was built by regexp over mail.messages.body, but inbound
--    bodies are raw MIME, so the thread list showed Content-Type headers and
--    base64 instead of the message. Decoding MIME is the API's job -- it
--    already does it for single messages -- so the function hands back a capped
--    slice of the raw body and lets the caller render it. Capped at 8KB
--    because this is a list: fifty untrimmed bodies is a payload, not a list.
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
               'last_body',      left(t.last_body, 8192),
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
                 last_msg.body      AS last_body,
                 g.participants
            FROM (
                SELECT m.thread_id,
                       m.user_id,
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
                 WHERE lm.user_id = g.user_id
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

REVOKE ALL ON FUNCTION public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text) TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS public.herbmail_thread_list(uuid, integer, timestamptz, uuid, text);

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
