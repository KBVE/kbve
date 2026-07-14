-- migrate:up
-- Fix: profile.service_get_discord_provider_id was created OWNED BY
-- service_role with SECURITY DEFINER. service_role has NO SELECT on
-- auth.identities (the table is owned by supabase_auth_admin), so
-- the function 500s with `permission denied for table identities`
-- on every call.
--
-- Captured via kubectl logs -n kilobase functions-* :
--   [Error] discord-bootstrap: service_get_discord_provider_id failed:
--   permission denied for table identities
--
-- Fix: transfer ownership to `postgres` (the cluster superuser), which
-- can read auth.identities. SECURITY DEFINER then runs the body as
-- postgres → permission resolves. service_role still has EXECUTE so
-- the edge function can call it; only the *execution context* changes.
--
-- The public proxy keeps its existing ownership chain — it just
-- delegates to the profile function whose new owner has the needed
-- privilege.

ALTER FUNCTION profile.service_get_discord_provider_id(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION profile.service_get_discord_provider_id(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_get_discord_provider_id(uuid)
    TO service_role;


-- migrate:down
-- Restore the original ownership chain.
ALTER FUNCTION profile.service_get_discord_provider_id(uuid) OWNER TO service_role;

REVOKE ALL ON FUNCTION profile.service_get_discord_provider_id(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_get_discord_provider_id(uuid)
    TO service_role;
