-- migrate:up
SET search_path = public, pg_catalog;

-- discord-bootstrap edge fn needs to verify the caller's user_id ↔
-- discord provider_id link before trusting their provider_token.
-- PostgREST does not expose the `auth` schema by default, so the
-- direct .schema("auth").from("identities").select(...) call from
-- the edge function returns 500. Wrap it in a SECURITY DEFINER RPC
-- so service_role can read auth.identities through the JSON layer.

CREATE OR REPLACE FUNCTION profile.service_get_discord_provider_id(
    p_user_id uuid
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_provider_id TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT provider_id
      INTO v_provider_id
    FROM auth.identities
    WHERE user_id = p_user_id
      AND provider = 'discord'
    LIMIT 1;

    RETURN v_provider_id;
END;
$$;

ALTER FUNCTION profile.service_get_discord_provider_id(uuid) OWNER TO service_role;
REVOKE ALL ON FUNCTION profile.service_get_discord_provider_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_get_discord_provider_id(uuid) TO service_role;

COMMENT ON FUNCTION profile.service_get_discord_provider_id(uuid) IS
    'Returns the Discord provider_id (snowflake) linked to a kbve user_id, or NULL if no Discord identity is linked. SECURITY DEFINER so the discord-bootstrap edge fn can read auth.identities (PostgREST does not expose the auth schema directly). service_role only.';


-- Public proxy: PostgREST resolves rpc("name") against public by
-- default, so dropping a public-schema wrapper lets the edge fn call
-- supabase.rpc("service_get_discord_provider_id", ...) without a
-- .schema("profile") prefix. STABLE + service_role only.

CREATE OR REPLACE FUNCTION public.service_get_discord_provider_id(
    p_user_id uuid
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT profile.service_get_discord_provider_id(p_user_id);
$$;

ALTER FUNCTION public.service_get_discord_provider_id(uuid) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.service_get_discord_provider_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_discord_provider_id(uuid) TO service_role;

COMMENT ON FUNCTION public.service_get_discord_provider_id(uuid) IS
    'Public-schema proxy for profile.service_get_discord_provider_id so PostgREST rpc() calls resolve without .schema() prefix. STABLE, service_role only.';


-- migrate:down
DROP FUNCTION IF EXISTS public.service_get_discord_provider_id(uuid);
DROP FUNCTION IF EXISTS profile.service_get_discord_provider_id(uuid);
