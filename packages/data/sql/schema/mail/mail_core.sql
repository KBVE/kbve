-- mail schema: single store for herbmail.com mail (inbound via the Stalwart
-- MTA hook, outbound via herbmail-api). Mirror of migrations
-- 20260807121000, 20260912040000, 20260912120000. Review surface only.

CREATE SCHEMA IF NOT EXISTS mail;

-- ===========================================
-- TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS mail.messages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    via         text        NOT NULL DEFAULT 'smtp'
                            CHECK (via IN ('smtp', 'internal')),
    from_addr   text        NOT NULL,
    from_user_id uuid       REFERENCES auth.users (id) ON DELETE SET NULL,
    subject     text,
    body        text,
    headers     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    status      text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processed', 'failed')),
    received_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mail.messages IS
    'Single store for herbmail.com mail. via=smtp rows arrive from the Stalwart MTA hook; via=internal rows are user-to-user messages that never touch SMTP. Purged after 90 days by pg_cron.';

CREATE INDEX IF NOT EXISTS messages_user_received_id_idx
    ON mail.messages (user_id, received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_pending_idx
    ON mail.messages (received_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS messages_received_idx
    ON mail.messages (received_at);

-- ===========================================
-- RLS + GRANTS
-- ===========================================

ALTER TABLE mail.messages ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA mail TO authenticated, service_role;
GRANT SELECT ON mail.messages TO authenticated;
GRANT ALL ON mail.messages TO service_role;

DROP POLICY IF EXISTS "messages_select_own" ON mail.messages;
CREATE POLICY "messages_select_own"
    ON mail.messages
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- ===========================================

ALTER TABLE mail.messages
    ADD COLUMN IF NOT EXISTS direction   text NOT NULL DEFAULT 'in'
        CHECK (direction IN ('in', 'out')),
    ADD COLUMN IF NOT EXISTS to_addr     text,
    ADD COLUMN IF NOT EXISTS message_id  text,
    ADD COLUMN IF NOT EXISTS in_reply_to text,
    ADD COLUMN IF NOT EXISTS sent_at     timestamptz,
    ADD COLUMN IF NOT EXISTS error       text;

ALTER TABLE mail.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE mail.messages
    ADD CONSTRAINT messages_status_check
    CHECK (status IN ('pending', 'processed', 'failed', 'queued', 'sent'));

ALTER TABLE mail.messages DROP CONSTRAINT IF EXISTS messages_outbound_to_check;
ALTER TABLE mail.messages
    ADD CONSTRAINT messages_outbound_to_check
    CHECK (direction = 'in' OR to_addr IS NOT NULL);

CREATE INDEX IF NOT EXISTS messages_outbound_user_idx
    ON mail.messages (user_id, received_at DESC)
    WHERE direction = 'out';

CREATE INDEX IF NOT EXISTS messages_inbound_from_idx
    ON mail.messages (user_id, lower(from_addr))
    WHERE direction = 'in';

COMMENT ON COLUMN mail.messages.direction IS
    'in = received through Stalwart or internally; out = sent by the user through herbmail-api.';

-- RETENTION — purge messages older than 90 days
-- ===========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
           FROM cron.job
          WHERE jobname = 'mail-messages-purge';

        PERFORM cron.schedule(
            'mail-messages-purge',
            '17 4 * * *',
            $job$DELETE FROM mail.messages WHERE received_at < now() - interval '90 days'$job$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed — skipping mail-messages-purge schedule (local/dev).';
    END IF;
END;
$$;

-- ===========================================

-- ===========================================
-- THREADING (mirror of 20260912210000_mail_threads)
-- ===========================================


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

-- ===========================================
-- THREADING HARDENING (mirror of 20260912220000_mail_threads_hardening)
-- ===========================================


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
