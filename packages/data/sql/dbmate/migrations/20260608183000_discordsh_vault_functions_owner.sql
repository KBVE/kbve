-- migrate:up
-- Fix: the discordsh guild-vault functions were created OWNED BY service_role
-- with SECURITY DEFINER, but they touch the `vault` schema
-- (vault.create_secret / vault.secrets / vault.decrypted_secrets), which
-- service_role has no privileges on. Every token write/read 42501s:
--   Operation failed ... sqlstate=42501 context=guild_vault_rpc
--
-- Same root cause + fix as 20260608014906_profile_discord_provider_id_owner:
-- transfer ownership to `postgres` (the cluster superuser), which can access
-- vault. SECURITY DEFINER then runs the body as postgres → privilege resolves.
-- service_role keeps EXECUTE so the edge function can still call them; only the
-- execution context changes. Functions that never touch vault
-- (service_list_guild_tokens, service_toggle_guild_token_status) are left as-is.

ALTER FUNCTION discordsh.service_set_guild_token(uuid, text, text, text, text, text)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION discordsh.service_set_guild_token(uuid, text, text, text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_set_guild_token(uuid, text, text, text, text, text)
    TO service_role;

ALTER FUNCTION discordsh.service_get_guild_token(uuid, text, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION discordsh.service_get_guild_token(uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_get_guild_token(uuid, text, uuid)
    TO service_role;

ALTER FUNCTION discordsh.service_delete_guild_token(uuid, text, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION discordsh.service_delete_guild_token(uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_delete_guild_token(uuid, text, uuid)
    TO service_role;

ALTER FUNCTION discordsh.bot_get_guild_token(text, text)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION discordsh.bot_get_guild_token(text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.bot_get_guild_token(text, text)
    TO service_role;

ALTER FUNCTION discordsh.trg_guild_tokens_cleanup_vault()
    OWNER TO postgres;
REVOKE ALL ON FUNCTION discordsh.trg_guild_tokens_cleanup_vault()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.trg_guild_tokens_cleanup_vault()
    TO service_role;


-- migrate:down
ALTER FUNCTION discordsh.service_set_guild_token(uuid, text, text, text, text, text)
    OWNER TO service_role;
ALTER FUNCTION discordsh.service_get_guild_token(uuid, text, uuid)
    OWNER TO service_role;
ALTER FUNCTION discordsh.service_delete_guild_token(uuid, text, uuid)
    OWNER TO service_role;
ALTER FUNCTION discordsh.bot_get_guild_token(text, text)
    OWNER TO service_role;
ALTER FUNCTION discordsh.trg_guild_tokens_cleanup_vault()
    OWNER TO service_role;
