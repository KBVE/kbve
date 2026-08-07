-- migrate:up

-- ============================================================
-- MAIL SCHEMA — app-facing message store for herbmail.com
--
-- Stalwart runs as MTA-only: it receives on port 25, runs
-- SPF/DKIM/spam checks, then fires an MTA hook (data stage) at
-- axum-herbmail, which calls public.stalwart_ingest below. On
-- success the hook answers {action:"discard"} so Stalwart never
-- stores the message itself — mail.messages is the only copy.
--
-- Internal user-to-user messages insert directly into
-- mail.messages with via='internal', skipping SMTP entirely.
--
-- Retention: pg_cron purges rows older than 90 days.
--
-- Depends on: profile.username (recipient resolution),
--             20260510210000_profile_custom_access_token_hook.sql
-- ============================================================

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
-- INGEST RPC — called by axum-herbmail via PostgREST
-- ===========================================

CREATE OR REPLACE FUNCTION public.stalwart_ingest(
    p_from       text,
    p_recipients text[],
    p_subject    text DEFAULT NULL,
    p_body       text DEFAULT NULL,
    p_headers    jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rcpt       text;
    v_local      text;
    v_user_id    uuid;
    v_from_user  uuid;
    v_accepted   text[] := '{}';
    v_rejected   text[] := '{}';
BEGIN
    SELECT u.user_id INTO v_from_user
      FROM profile.username AS u
     WHERE lower(u.username) = lower(split_part(p_from, '@', 1))
       AND lower(split_part(p_from, '@', 2)) = 'herbmail.com';

    FOREACH v_rcpt IN ARRAY coalesce(p_recipients, '{}') LOOP
        v_local := lower(split_part(v_rcpt, '@', 1));

        IF lower(split_part(v_rcpt, '@', 2)) <> 'herbmail.com' THEN
            v_rejected := array_append(v_rejected, v_rcpt);
            CONTINUE;
        END IF;

        SELECT u.user_id INTO v_user_id
          FROM profile.username AS u
         WHERE lower(u.username) = v_local;

        IF v_user_id IS NULL THEN
            v_rejected := array_append(v_rejected, v_rcpt);
            CONTINUE;
        END IF;

        INSERT INTO mail.messages (user_id, via, from_addr, from_user_id, subject, body, headers)
        VALUES (v_user_id, 'smtp', p_from, v_from_user, p_subject, p_body, p_headers);

        v_accepted := array_append(v_accepted, v_rcpt);
    END LOOP;

    RETURN jsonb_build_object(
        'accepted', to_jsonb(v_accepted),
        'rejected', to_jsonb(v_rejected)
    );
END;
$$;

ALTER FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) OWNER TO postgres;

-- The definer runs as postgres; profile.username is RLS-locked (see
-- 20260510210000_profile_custom_access_token_hook.sql which needed the same
-- treatment for supabase_auth_admin). Grant + policy defensively so recipient
-- resolution never silently returns zero rows and 550s all inbound mail.
GRANT USAGE ON SCHEMA profile TO postgres;
GRANT SELECT ON profile.username TO postgres;

DROP POLICY IF EXISTS "postgres_select" ON profile.username;
CREATE POLICY "postgres_select"
    ON profile.username
    FOR SELECT
    TO postgres
    USING (true);

COMMENT ON FUNCTION public.stalwart_ingest IS
    'Stalwart MTA hook ingest: resolves $username@herbmail.com recipients against profile.username and inserts one mail.messages row per accepted recipient. service_role only.';

REVOKE ALL ON FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) TO service_role;

-- ===========================================
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
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'mail' AND tablename = 'messages'
    ) THEN
        RAISE EXCEPTION 'mail.messages must exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'mail' AND c.relname = 'messages' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'mail.messages must have RLS enabled';
    END IF;

    IF has_function_privilege('anon', 'public.stalwart_ingest(text, text[], text, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must not execute stalwart_ingest';
    END IF;

    RAISE NOTICE 'mail_schema_init.sql: mail schema, RLS, ingest RPC verified.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
           FROM cron.job
          WHERE jobname = 'mail-messages-purge';
    END IF;
END;
$$;

DROP POLICY IF EXISTS "postgres_select" ON profile.username;

DROP FUNCTION IF EXISTS public.stalwart_ingest(text, text[], text, text, jsonb);
DROP SCHEMA IF EXISTS mail CASCADE;
