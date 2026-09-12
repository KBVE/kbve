-- migrate:up
-- ============================================================
-- MAIL: DEFENSE IN DEPTH FOR THE RPC SURFACE
--
-- Review of 20260807121000 and 20260912040000 found:
--   * split_part('@', 2) = 'herbmail.com' accepts
--     'x@herbmail.com@evil.example'; compare whole addresses.
--   * stalwart_ingest trusted MAIL FROM for from_user_id, so an
--     external sender claiming alice@herbmail.com was recorded as
--     alice. It now needs spf=pass in Stalwart's
--     Authentication-Results header (added on port 25).
--   * The daily cap was a read-then-insert race; a per-user
--     transaction advisory lock serializes it.
--   * Subject / error text can carry CR, LF and control bytes into
--     headers; they are collapsed to a space. In-Reply-To and
--     Message-ID must look like <token>.
--   * mail.outbound_daily_cap() was PUBLIC-executable.
--
-- Depends on: 20260912040000_mail_outbound.
-- ============================================================

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
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $$
DECLARE
    v_username text;
    v_to       text;
    v_from     text;
    v_subject  text;
    v_reply    text;
    v_sent_24h integer;
    v_id       uuid;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_username');
    END IF;
    SELECT u.username INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = p_user_id;
    IF v_username IS NULL OR v_username !~ '^[a-z0-9_-]{3,63}$' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_username');
    END IF;
    v_from := v_username || '@herbmail.com';

    v_to := lower(btrim(coalesce(p_to, '')));
    IF octet_length(v_to) NOT BETWEEN 6 AND 254
       OR v_to !~ '^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'bad_recipient');
    END IF;
    IF v_to = v_from THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'self');
    END IF;
    IF p_body IS NULL OR btrim(p_body) = '' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'empty_body');
    END IF;
    IF octet_length(p_body) > 65536 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'too_large');
    END IF;

    v_subject := left(regexp_replace(coalesce(p_subject, ''), '[\x01-\x1F\x7F]+', ' ', 'g'), 998);
    v_reply   := nullif(btrim(coalesce(p_in_reply_to, '')), '');
    IF v_reply IS NOT NULL AND v_reply !~ '^<[^<>[:space:]]{1,250}>$' THEN
        v_reply := NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('mail.outbound:' || p_user_id::text, 0));

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
         v_subject, p_body, v_reply, 'queued')
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
SET statement_timeout = '5s'
AS $$
DECLARE
    v_message_id text;
    v_error      text;
BEGIN
    IF p_id IS NULL OR p_status IS NULL OR p_status NOT IN ('sent', 'failed') THEN
        RAISE EXCEPTION 'herbmail_outbound_mark: status must be sent or failed'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_message_id := nullif(btrim(coalesce(p_message_id, '')), '');
    IF v_message_id IS NOT NULL AND v_message_id !~ '^<[^<>[:space:]]{1,250}>$' THEN
        v_message_id := NULL;
    END IF;
    v_error := left(regexp_replace(coalesce(p_error, ''), '[\x01-\x1F\x7F]+', ' ', 'g'), 2000);

    UPDATE mail.messages
       SET status     = p_status,
           message_id = coalesce(v_message_id, message_id),
           sent_at    = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
           error      = CASE WHEN p_status = 'failed' THEN nullif(v_error, '') ELSE NULL END
     WHERE id = p_id
       AND direction = 'out'
       AND status = 'queued';
    RETURN FOUND;
END;
$$;

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
SET statement_timeout = '10s'
AS $$
DECLARE
    v_from      text := lower(btrim(coalesce(p_from, '')));
    v_rcpt      text;
    v_addr      text;
    v_user_id   uuid;
    v_from_user uuid;
    v_subject   text;
    v_headers   jsonb;
    v_spf_pass  boolean := false;
    v_accepted  text[] := '{}';
    v_rejected  text[] := '{}';
BEGIN
    v_headers := CASE WHEN jsonb_typeof(p_headers) = 'array' THEN p_headers ELSE '[]'::jsonb END;
    v_subject := left(regexp_replace(coalesce(p_subject, ''), '[\x01-\x1F\x7F]+', ' ', 'g'), 998);

    -- Stalwart adds Authentication-Results on port 25; only a verified
    -- herbmail.com sender is linked to a profile.
    SELECT bool_or(h ->> 1 ~* '(^|[[:space:];])spf=pass') INTO v_spf_pass
      FROM jsonb_array_elements(v_headers) AS h
     WHERE jsonb_typeof(h) = 'array'
       AND lower(h ->> 0) = 'authentication-results';
    IF coalesce(v_spf_pass, false) AND v_from ~ '^[a-z0-9_-]{3,63}@herbmail\.com$' THEN
        SELECT u.user_id INTO v_from_user
          FROM profile.username AS u
         WHERE u.username || '@herbmail.com' = v_from;
    END IF;

    FOREACH v_rcpt IN ARRAY coalesce(p_recipients, '{}') LOOP
        v_addr := lower(btrim(coalesce(v_rcpt, '')));
        IF v_addr !~ '^[a-z0-9_-]{3,63}@herbmail\.com$' THEN
            v_rejected := array_append(v_rejected, v_rcpt);
            CONTINUE;
        END IF;
        SELECT u.user_id INTO v_user_id
          FROM profile.username AS u
         WHERE u.username || '@herbmail.com' = v_addr;
        IF v_user_id IS NULL THEN
            v_rejected := array_append(v_rejected, v_rcpt);
            CONTINUE;
        END IF;
        INSERT INTO mail.messages (user_id, via, direction, from_addr, from_user_id, subject, body, headers)
        VALUES (v_user_id, 'smtp', 'in', v_from, v_from_user, v_subject, p_body, v_headers);
        v_accepted := array_append(v_accepted, v_rcpt);
    END LOOP;

    RETURN jsonb_build_object(
        'accepted', to_jsonb(v_accepted),
        'rejected', to_jsonb(v_rejected)
    );
END;
$$;

ALTER FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) OWNER TO postgres;
ALTER FUNCTION mail.outbound_daily_cap() OWNER TO postgres;

REVOKE ALL ON FUNCTION mail.outbound_daily_cap() FROM PUBLIC;
REVOKE ALL ON FUNCTION mail.outbound_daily_cap() FROM anon, authenticated;
REVOKE ALL ON SCHEMA mail FROM PUBLIC;
REVOKE ALL ON SCHEMA mail FROM anon;

DO $$
DECLARE
    fn text;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.herbmail_outbound_prepare(uuid, text, text, text, text)',
        'public.herbmail_outbound_mark(uuid, text, text, text)',
        'public.stalwart_ingest(text, text[], text, text, jsonb)',
        'public.stalwart_rcpt(text)'
    ] LOOP
        IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = fn::regprocedure) THEN
            RAISE EXCEPTION '% must be SECURITY DEFINER', fn;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
             WHERE p.oid = fn::regprocedure
               AND cfg IN ('search_path=', 'search_path=""')
        ) THEN
            RAISE EXCEPTION '% must pin search_path to empty', fn;
        END IF;
        IF (SELECT p.proowner::regrole::text FROM pg_proc p WHERE p.oid = fn::regprocedure) <> 'postgres' THEN
            RAISE EXCEPTION '% must be owned by postgres', fn;
        END IF;
        IF has_function_privilege('anon', fn, 'EXECUTE')
           OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'anon/authenticated must not execute %', fn;
        END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', 'public.herbmail_outbound_prepare(uuid, text, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must execute herbmail_outbound_prepare';
    END IF;
    IF NOT has_function_privilege('stalwart', 'public.stalwart_rcpt(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'stalwart must execute stalwart_rcpt';
    END IF;
    IF has_function_privilege('anon', 'mail.outbound_daily_cap()', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must not execute mail.outbound_daily_cap';
    END IF;
END;
$$;

-- migrate:down

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
