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

CREATE INDEX IF NOT EXISTS messages_user_received_idx
    ON mail.messages (user_id, received_at DESC);

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
ALTER TABLE mail.messages
    ADD CONSTRAINT messages_status_check
    CHECK (status IN ('pending', 'processed', 'failed'));
ALTER TABLE mail.messages
    DROP COLUMN IF EXISTS error,
    DROP COLUMN IF EXISTS sent_at,
    DROP COLUMN IF EXISTS in_reply_to,
    DROP COLUMN IF EXISTS message_id,
    DROP COLUMN IF EXISTS to_addr,
    DROP COLUMN IF EXISTS direction;
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
