-- migrate:up

-- find_claim_identity_by_discord_id is SECURITY DEFINER and reads auth.identities,
-- so its body runs as the owner. Owned by service_role it throws 42501 (service_role
-- has no SELECT on auth.*); reassign to postgres. Same trap fixed for profile_discord
-- and discordsh_vault.
ALTER FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';

-- migrate:down

ALTER FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) OWNER TO service_role;
