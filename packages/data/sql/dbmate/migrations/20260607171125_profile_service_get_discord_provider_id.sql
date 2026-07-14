-- migrate:up
SET search_path = public, pg_catalog;

-- discord-bootstrap edge fn needs to verify the caller's user_id ↔
-- discord provider_id link before trusting their provider_token.
-- PostgREST does not expose the auth schema for security reasons
-- (auth.identities carries provider_id + provider_data for every
-- OAuth link across every user). Edge functions must reach
-- auth.identities through a SECURITY DEFINER proxy.
--
-- Security boundary: caller must be service_role and must pass the
-- already-authenticated Supabase user_id. This function does NOT
-- verify end-user auth — it trusts the caller has done that. Never
-- grant EXECUTE to anon or authenticated; doing so would let any
-- signed-in user enumerate Discord snowflakes by UUID.

CREATE OR REPLACE FUNCTION profile.service_get_discord_provider_id(
    p_user_id uuid
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
COST 25
AS $$
    SELECT i.provider_id::text
    FROM auth.identities AS i
    WHERE i.user_id = p_user_id
      AND i.provider = 'discord'
    ORDER BY i.created_at DESC NULLS LAST
    LIMIT 1;
$$;

ALTER FUNCTION profile.service_get_discord_provider_id(uuid) OWNER TO service_role;
REVOKE ALL ON FUNCTION profile.service_get_discord_provider_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_get_discord_provider_id(uuid) TO service_role;

COMMENT ON FUNCTION profile.service_get_discord_provider_id(uuid) IS
    'Returns the Discord provider_id (snowflake) linked to a kbve user_id, or NULL if no Discord identity is linked. SECURITY DEFINER over auth.identities with search_path=''''; deterministic ordering by created_at DESC so multi-identity users always resolve to the most recent link. service_role only — caller must already have authenticated the user_id.';


-- public.proxy_service_get_discord_provider_id — PostgREST proxy.
-- Lets the edge fn call supabase.rpc("proxy_service_get_discord_provider_id")
-- without a .schema("profile") prefix. proxy_* naming mirrors the
-- convention used by discordsh and forum schemas.

CREATE OR REPLACE FUNCTION public.proxy_service_get_discord_provider_id(
    p_user_id uuid
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
COST 25
AS $$
    SELECT profile.service_get_discord_provider_id(p_user_id);
$$;

ALTER FUNCTION public.proxy_service_get_discord_provider_id(uuid) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_get_discord_provider_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_get_discord_provider_id(uuid) TO service_role;

COMMENT ON FUNCTION public.proxy_service_get_discord_provider_id(uuid) IS
    'PostgREST-resolvable proxy for profile.service_get_discord_provider_id. Edge fns call supabase.rpc("proxy_service_get_discord_provider_id"). STABLE, service_role only.';


-- migrate:down
DROP FUNCTION IF EXISTS public.proxy_service_get_discord_provider_id(uuid);
DROP FUNCTION IF EXISTS public.service_get_discord_provider_id(uuid);
DROP FUNCTION IF EXISTS profile.service_get_discord_provider_id(uuid);
