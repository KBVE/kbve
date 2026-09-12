-- migrate:up
-- ============================================================
-- STALWART: RECIPIENT LOOKUP AS A DEFINER FUNCTION
--
-- 20260911210000 granted the stalwart role SELECT on
-- profile.username, but the table carries row-level security with
-- policies only for postgres, service_role and supabase_auth_admin,
-- so the role sees zero rows and every RCPT TO is refused. Same
-- pattern as public.stalwart_ingest: a SECURITY DEFINER function
-- owned by postgres does the read; the stalwart role only gets
-- EXECUTE. Stalwart's SQL directory queries it by recipient
-- address and reads back the columns it maps (email, type,
-- description).
--
-- Depends on: 20260807121000_mail_schema_init (pattern),
--             20260911210000_stalwart_profile_username_read (role grants).
-- ============================================================

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

-- The direct table grant is dead weight under RLS; keep the role to EXECUTE only.
REVOKE SELECT ON TABLE profile.username FROM stalwart;

-- migrate:down

DROP FUNCTION IF EXISTS public.stalwart_rcpt(text);
GRANT SELECT ON TABLE profile.username TO stalwart;
