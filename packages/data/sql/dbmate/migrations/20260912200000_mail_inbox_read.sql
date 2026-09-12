-- migrate:up

-- Read surface for the herbmail web client. PostgREST does not expose the
-- mail schema, so herbmail-api reads a user's mailbox through these
-- service_role-only definer functions, scoped by the user id it verified
-- from the caller's JWT. Same posture as the outbound RPCs: owned by
-- postgres, search_path pinned, anon/authenticated revoked.

CREATE OR REPLACE FUNCTION public.herbmail_inbox_list(
    p_user_id uuid,
    p_limit   integer     DEFAULT 50,
    p_before  timestamptz DEFAULT NULL
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
               'from_user_id', m.from_user_id,
               'has_body',     (m.body IS NOT NULL AND m.body <> '')
           ) ORDER BY m.received_at DESC, m.id DESC), '[]'::jsonb)
      FROM (
          SELECT *
            FROM mail.messages AS m
           WHERE p_user_id IS NOT NULL
             AND m.user_id = p_user_id
             AND (p_before IS NULL OR m.received_at < p_before)
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
               'body',         m.body,
               'headers',      m.headers,
               'message_id',   m.message_id,
               'in_reply_to',  m.in_reply_to,
               'received_at',  m.received_at,
               'sent_at',      m.sent_at,
               'error',        m.error,
               'from_user_id', m.from_user_id
           )
      FROM mail.messages AS m
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

ALTER FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.herbmail_message_get(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.herbmail_mailbox_stats(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_inbox_list(uuid, integer, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.herbmail_message_get(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_message_get(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_message_get(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.herbmail_mailbox_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.herbmail_mailbox_stats(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herbmail_mailbox_stats(uuid) TO service_role;

DO $$
DECLARE
    fn   text;
    rec  record;
BEGIN
    FOR fn IN SELECT unnest(ARRAY[
        'public.herbmail_inbox_list(uuid, integer, timestamptz)',
        'public.herbmail_message_get(uuid, uuid)',
        'public.herbmail_mailbox_stats(uuid)'
    ]) LOOP
        SELECT p.prosecdef,
               pg_get_userbyid(p.proowner) AS owner,
               coalesce((SELECT bool_or(cfg IN ('search_path=', 'search_path=""'))
                           FROM unnest(p.proconfig) AS cfg), false) AS pinned
          INTO rec
          FROM pg_proc AS p
         WHERE p.oid = fn::regprocedure;
        IF NOT rec.prosecdef THEN
            RAISE EXCEPTION '% must be SECURITY DEFINER', fn;
        END IF;
        IF rec.owner <> 'postgres' THEN
            RAISE EXCEPTION '% must be owned by postgres, is %', fn, rec.owner;
        END IF;
        IF NOT rec.pinned THEN
            RAISE EXCEPTION '% must pin search_path', fn;
        END IF;
        IF has_function_privilege('anon', fn, 'EXECUTE')
           OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
            RAISE EXCEPTION '% must not be executable by anon/authenticated', fn;
        END IF;
        IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
            RAISE EXCEPTION '% must be executable by service_role', fn;
        END IF;
    END LOOP;
END;
$$;

-- migrate:down

DROP FUNCTION IF EXISTS public.herbmail_mailbox_stats(uuid);
DROP FUNCTION IF EXISTS public.herbmail_message_get(uuid, uuid);
DROP FUNCTION IF EXISTS public.herbmail_inbox_list(uuid, integer, timestamptz);
