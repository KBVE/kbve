-- migrate:up

BEGIN;

-- ============================================================
-- GoTrue Custom Access Token Hook: inject profile username
--
-- GoTrue calls public.custom_access_token_hook(event jsonb) before
-- signing a JWT (when GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true).
-- We look up profile.username for the auth user_id and embed it into
-- the JWT as a top-level claim "kbve_username". Downstream services
-- (irc-gateway, etc.) can then read it without a DB round-trip.
--
-- The hook runs as supabase_auth_admin (function is SECURITY DEFINER,
-- owned by that role). It needs:
--   USAGE on schema public  (to resolve the function itself)
--   USAGE on schema profile (to resolve profile.username)
--   SELECT on profile.username
--   An RLS policy permitting SELECT (the table is RLS-locked to
--   service_role by default).
-- ============================================================

GRANT USAGE  ON SCHEMA   public           TO supabase_auth_admin;
GRANT USAGE  ON SCHEMA   profile          TO supabase_auth_admin;
GRANT SELECT ON TABLE    profile.username TO supabase_auth_admin;

DROP POLICY IF EXISTS "supabase_auth_admin_select" ON profile.username;
CREATE POLICY "supabase_auth_admin_select"
    ON profile.username
    AS PERMISSIVE
    FOR SELECT
    TO supabase_auth_admin
    USING (true);

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id  uuid;
    v_username text;
    v_claims   jsonb;
BEGIN
    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN event;
    END;

    IF v_user_id IS NULL THEN
        RETURN event;
    END IF;

    v_claims := COALESCE(event->'claims', '{}'::jsonb);

    SELECT u.username
      INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = v_user_id;

    IF v_username IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{kbve_username}', to_jsonb(v_username), true);
    ELSE
        v_claims := v_claims - 'kbve_username';
    END IF;

    RETURN jsonb_set(event, '{claims}', v_claims, true);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb)
    OWNER TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
    'GoTrue access-token hook: injects profile.username into the JWT as kbve_username.';

DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;

    IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema public for the hook to resolve.';
    END IF;

    IF NOT has_schema_privilege('supabase_auth_admin', 'profile', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema profile.';
    END IF;

    IF NOT has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold EXECUTE on public.custom_access_token_hook(jsonb).';
    END IF;

    IF has_function_privilege('anon',          'public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated','public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('public',     'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'public.custom_access_token_hook(jsonb) must not be executable by anon/authenticated/public.';
    END IF;

    IF NOT has_table_privilege('supabase_auth_admin', 'profile.username', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.username for the hook to read usernames.';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- migrate:down

BEGIN;

DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

DROP POLICY IF EXISTS "supabase_auth_admin_select" ON profile.username;

REVOKE SELECT ON TABLE profile.username FROM supabase_auth_admin;
REVOKE USAGE  ON SCHEMA profile          FROM supabase_auth_admin;

-- NOTE: We deliberately do NOT revoke USAGE ON SCHEMA public from
-- supabase_auth_admin here. Other Supabase machinery and other hooks
-- may rely on that grant; this migration does not own it.

COMMIT;
