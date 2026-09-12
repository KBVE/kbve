-- mail RPC surface, hardened form (20260912120000). service_role calls the
-- public.* functions through PostgREST; the stalwart role calls stalwart_rcpt
-- directly as Stalwart's SQL directory. All SECURITY DEFINER, owned by
-- postgres, search_path pinned, anon/authenticated revoked.

CREATE OR REPLACE FUNCTION mail.outbound_daily_cap()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 20 $$;

CREATE OR REPLACE FUNCTION public.stalwart_rcpt(p_address text)
RETURNS TABLE (email text, type text, description text)
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
    -- The whole address is compared, never a split fragment, so
    -- 'alice@herbmail.com@evil.example' cannot resolve. The shape
    -- check mirrors profile.username's CHECK constraints
    -- (lowercase [a-z0-9_-], 3..63 chars), which with the unique
    -- index on username makes LIMIT 1 deterministic.
    SELECT lower(u.username) || '@herbmail.com' AS email,
           'individual'::text AS type,
           u.username::text AS description
      FROM profile.username AS u
     WHERE octet_length(p_address) BETWEEN 16 AND 254
       AND lower(p_address) ~ '^[a-z0-9_-]{3,63}@herbmail[.]com$'
       AND lower(p_address) = u.username || '@herbmail.com'
     LIMIT 1;
$$;

ALTER FUNCTION public.stalwart_rcpt(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stalwart_rcpt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stalwart_rcpt(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stalwart_rcpt(text) TO stalwart;

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

REVOKE ALL ON FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_outbound_prepare(uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_outbound_mark(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stalwart_ingest(text, text[], text, text, jsonb) TO service_role;

-- Read surface (20260912200000) for the herbmail web client. PostgREST does not expose the
-- mail schema, so herbmail-api reads a user's mailbox through these
-- service_role-only definer functions, scoped by the user id it verified
-- from the caller's JWT. Same posture as the outbound RPCs: owned by
-- postgres, search_path pinned, anon/authenticated revoked.

CREATE OR REPLACE FUNCTION public.herbmail_inbox_list(
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
               'id',           m.id,
               'direction',    m.direction,
               'status',       m.status,
               'from_addr',    m.from_addr,
               'to_addr',      m.to_addr,
               'subject',      m.subject,
               'message_id',   m.message_id,
               'in_reply_to',  m.in_reply_to,
               'received_at',  m.received_at,
               'sent_at',      m.sent_at,
               'from_username', m.from_username,
               'has_body',     (m.body IS NOT NULL AND m.body <> '')
           ) ORDER BY m.received_at DESC, m.id DESC), '[]'::jsonb)
      FROM (
          SELECT m.*, fu.username AS from_username
            FROM mail.messages AS m
            LEFT JOIN profile.username AS fu ON fu.user_id = m.from_user_id
           WHERE p_user_id IS NOT NULL
             AND m.user_id = p_user_id
             AND (p_direction IS NULL OR m.direction = p_direction)
             AND ((p_before IS NULL AND p_before_id IS NULL)
                  OR (p_before IS NOT NULL AND p_before_id IS NOT NULL
                      AND (m.received_at, m.id) < (p_before, p_before_id)))
           ORDER BY m.received_at DESC, m.id DESC
           LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
      ) AS m;
$$;

CREATE OR REPLACE FUNCTION public.herbmail_message_get(
    p_user_id uuid,
    p_id      uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
    SELECT jsonb_build_object(
               'id',           m.id,
               'direction',    m.direction,
               'status',       m.status,
               'via',          m.via,
               'from_addr',    m.from_addr,
               'to_addr',      m.to_addr,
               'subject',      m.subject,
               'body',         left(m.body, 1048576),
               'body_truncated', (length(coalesce(m.body, '')) > 1048576),
               'headers',      m.headers,
               'message_id',   m.message_id,
               'in_reply_to',  m.in_reply_to,
               'received_at',  m.received_at,
               'sent_at',      m.sent_at,
               'error',        m.error,
               'from_username', fu.username
           )
      FROM mail.messages AS m
      LEFT JOIN profile.username AS fu ON fu.user_id = m.from_user_id
     WHERE p_user_id IS NOT NULL
       AND p_id IS NOT NULL
       AND m.user_id = p_user_id
       AND m.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.herbmail_mailbox_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
    SELECT jsonb_build_object(
               'username', u.username,
               'address',  CASE WHEN u.username ~ '^[a-z0-9_-]{3,63}$'
                                THEN u.username || '@herbmail.com' END,
               'inbound',  (SELECT count(*) FROM mail.messages AS m
                             WHERE m.user_id = p_user_id AND m.direction = 'in'),
               'outbound', (SELECT count(*) FROM mail.messages AS m
                             WHERE m.user_id = p_user_id AND m.direction = 'out'),
               'sent_24h', (SELECT count(*) FROM mail.messages AS m
                             WHERE m.user_id = p_user_id
                               AND m.direction = 'out'
                               AND m.status IN ('queued', 'sent')
                               AND m.received_at > now() - interval '24 hours'),
               'daily_cap', mail.outbound_daily_cap(),
               'retention_days', 90
           )
      FROM (SELECT p_user_id AS user_id) AS me
      LEFT JOIN profile.username AS u ON u.user_id = me.user_id
     WHERE p_user_id IS NOT NULL;
$$;

ALTER FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.herbmail_message_get(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.herbmail_mailbox_stats(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.herbmail_message_get(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_message_get(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_message_get(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.herbmail_mailbox_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_mailbox_stats(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_mailbox_stats(uuid) TO service_role;
