-- migrate:up
-- ============================================================
-- MAIL: OUTBOUND MESSAGES (reply-only, capped)
--
-- Outbound rows live in the same mail.messages table as inbound
-- ones so a mailbox is one query. herbmail-api authenticates the
-- user, calls public.herbmail_outbound_prepare (service_role,
-- definer) which enforces the policy and inserts a queued row,
-- relays the message to Stalwart's internal listener, then calls
-- public.herbmail_outbound_mark with the result.
--
-- Policy, enforced here so every caller gets the same answer:
--   * From is always $username@herbmail.com for the caller.
--   * Reply-only: the recipient must have written to this user
--     before (an inbound row owned by the user with that from_addr).
--   * Cap: at most mail.outbound_daily_cap() sends per user per
--     rolling 24h, counting queued + sent rows.
--
-- Depends on: 20260807121000_mail_schema_init, profile.username.
-- ============================================================

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

CREATE OR REPLACE FUNCTION mail.outbound_daily_cap()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 20 $$;

CREATE OR REPLACE FUNCTION public.herbmail_outbound_prepare(
    p_user_id     uuid,
    p_to          text,
    p_subject     text,
    p_body        text,
    p_in_reply_to text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_username text;
    v_to       text := lower(btrim(coalesce(p_to, '')));
    v_from     text;
    v_sent_24h integer;
    v_id       uuid;
BEGIN
    SELECT u.username INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = p_user_id;
    IF v_username IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_username');
    END IF;
    v_from := v_username || '@herbmail.com';

    IF v_to !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' OR octet_length(v_to) > 254 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'bad_recipient');
    END IF;
    IF v_to = v_from THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'self');
    END IF;
    IF coalesce(btrim(p_body), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'empty_body');
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM mail.messages AS m
         WHERE m.user_id = p_user_id
           AND m.direction = 'in'
           AND lower(m.from_addr) = v_to
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_a_reply');
    END IF;

    SELECT count(*) INTO v_sent_24h
      FROM mail.messages AS m
     WHERE m.user_id = p_user_id
       AND m.direction = 'out'
       AND m.status IN ('queued', 'sent')
       AND m.received_at > now() - interval '24 hours';
    IF v_sent_24h >= mail.outbound_daily_cap() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap',
                                  'cap', mail.outbound_daily_cap());
    END IF;

    INSERT INTO mail.messages
        (user_id, via, direction, from_addr, from_user_id, to_addr,
         subject, body, in_reply_to, status)
    VALUES
        (p_user_id, 'smtp', 'out', v_from, p_user_id, v_to,
         left(coalesce(p_subject, ''), 998), p_body, nullif(btrim(p_in_reply_to), ''), 'queued')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'from', v_from, 'to', v_to);
END;
$$;

CREATE OR REPLACE FUNCTION public.herbmail_outbound_mark(
    p_id         uuid,
    p_status     text,
    p_message_id text DEFAULT NULL,
    p_error      text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_status NOT IN ('sent', 'failed') THEN
        RAISE EXCEPTION 'herbmail_outbound_mark: status must be sent or failed';
    END IF;
    UPDATE mail.messages
       SET status     = p_status,
           message_id = coalesce(p_message_id, message_id),
           sent_at    = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
           error      = CASE WHEN p_status = 'failed' THEN left(p_error, 2000) ELSE NULL END
     WHERE id = p_id
       AND direction = 'out'
       AND status = 'queued';
    RETURN FOUND;
END;
$$;

ALTER FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.herbmail_outbound_prepare IS
    'herbmail-api outbound: enforces reply-only + daily cap and inserts a queued mail.messages row. service_role only.';
COMMENT ON FUNCTION public.herbmail_outbound_mark IS
    'herbmail-api outbound: records the relay result on a queued row. service_role only.';

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.herbmail_outbound_prepare(uuid, text, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must not execute herbmail_outbound_prepare';
    END IF;
    IF has_function_privilege('authenticated', 'public.herbmail_outbound_mark(uuid, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must not execute herbmail_outbound_mark';
    END IF;
END;
$$;

-- migrate:down

DROP FUNCTION IF EXISTS public.herbmail_outbound_mark(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.herbmail_outbound_prepare(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS mail.outbound_daily_cap();
DROP INDEX IF EXISTS mail.messages_inbound_from_idx;
DROP INDEX IF EXISTS mail.messages_outbound_user_idx;
ALTER TABLE mail.messages DROP CONSTRAINT IF EXISTS messages_outbound_to_check;
DELETE FROM mail.messages WHERE direction = 'out';
ALTER TABLE mail.messages DROP CONSTRAINT IF EXISTS messages_status_check;
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
