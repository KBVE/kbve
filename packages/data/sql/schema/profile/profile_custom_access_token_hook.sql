-- ============================================================
-- public.custom_access_token_hook (v2)
--
-- Hand-authored mirror of the canonical state established by:
--   20260510210000_profile_custom_access_token_hook.sql  (v1)
--   20260531005655_auth_hook_owned_guilds_claim.sql       (v2)
--
-- GoTrue access-token hook called before signing a JWT (when
-- GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true). Embeds two
-- claims into the JWT:
--   - kbve_username  ← profile.username for the auth user_id
--   - owned_guilds   ← profile.get_discord_owned_guilds_claim
--                       (Discord guild snowflakes the user owns)
--
-- The hook does NO external calls. It reads pre-cached state
-- only: profile.username (populated by the OAuth callback flow)
-- and profile.discord_bootstrap_cache (populated by the
-- discord-bootstrap edge fn — see P5.8b).
--
-- Lives in the public schema because GoTrue's config expects the
-- function at public.custom_access_token_hook. Owner is
-- supabase_auth_admin so SECURITY DEFINER executes under a role
-- that holds the required grants (profile schema USAGE, table
-- SELECTs).
--
-- Security boundary: invalid / missing user_id strips both
-- kbve_username and owned_guilds from inbound claims before
-- returning, so a malformed event cannot smuggle a privileged
-- claim through the hook. Top-level event guard coerces NULL /
-- scalar inputs to {}.
-- ============================================================

-- supabase_auth_admin needs grants on profile.username +
-- profile.discord_bootstrap_cache (handled in
-- profile_username.sql + profile_discord_bootstrap_cache.sql);
-- + EXECUTE on profile.get_discord_owned_guilds_claim (granted
-- in profile_discord_bootstrap_cache.sql).

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id      uuid;
    v_username     text;
    v_owned_guilds jsonb;
    v_claims       jsonb;
    v_now          timestamptz := statement_timestamp();
BEGIN
    -- Defensive top-level event guard. GoTrue always passes an
    -- object, but jsonb_set on NULL / scalar input misbehaves —
    -- coerce malformed payloads to {} before any work. Catches
    -- manual-invocation footguns + future payload changes.
    IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
        event := '{}'::jsonb;
    END IF;

    v_claims :=
        CASE
            WHEN jsonb_typeof(event->'claims') = 'object'
                THEN event->'claims'
            ELSE '{}'::jsonb
        END;

    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            -- Malformed user_id → strip any pre-existing privileged
            -- claims and return early. Caller cannot smuggle
            -- privileged claims via a garbage user_id.
            RETURN jsonb_set(
                event,
                '{claims}',
                v_claims - 'kbve_username' - 'owned_guilds',
                true
            );
    END;

    IF v_user_id IS NULL THEN
        RETURN jsonb_set(
            event,
            '{claims}',
            v_claims - 'kbve_username' - 'owned_guilds',
            true
        );
    END IF;

    SELECT u.username
      INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = v_user_id;

    IF v_username IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{kbve_username}', to_jsonb(v_username), true);
    ELSE
        v_claims := v_claims - 'kbve_username';
    END IF;

    -- Explicit strip before set — matches the invalid-user
    -- branches above. Documents that any inbound caller-supplied
    -- owned_guilds claim is never trusted (jsonb_set would
    -- overwrite anyway, but the strip makes the security
    -- boundary visually obvious).
    v_claims := v_claims - 'owned_guilds';
    v_owned_guilds := profile.get_discord_owned_guilds_claim(v_user_id, v_now);
    v_claims := jsonb_set(v_claims, '{owned_guilds}', v_owned_guilds, true);

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
    'GoTrue access-token hook v2: embeds profile.username as kbve_username and delegates owned_guilds lookup to profile.get_discord_owned_guilds_claim. No external calls. Slim PL/pgSQL orchestration; guild work happens in the SQL helper for planner inlining.';
