-- migrate:up

-- ============================================================
-- BOT FUNCTION: Get guild token by service
--
-- Bot-facing read-only accessor. The bot only knows the guild
-- snowflake and service name — it does not have the owner_id
-- or token_id. No ownership check because the caller is the
-- bot itself (service_role), consuming a token the owner
-- already authorized.
--
-- Returns the first active, matching decrypted token or NULL.
--
-- Source of truth: packages/data/sql/schema/vault/guild_tokens.sql
-- Depends on: 20260302000000_discordsh_guild_vault
-- ============================================================

CREATE OR REPLACE FUNCTION discordsh.bot_get_guild_token(
    p_server_id TEXT,
    p_service   TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_vault_key   TEXT;
    v_token_value TEXT;
BEGIN
    -- service_role only
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    -- Validate server_id format (Discord snowflake)
    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RAISE EXCEPTION 'Invalid server ID format';
    END IF;

    -- Validate service format
    IF p_service IS NULL OR p_service !~ '^[a-z0-9_]{2,32}$' THEN
        RAISE EXCEPTION 'Invalid service name format';
    END IF;

    -- Find the active token for this guild + service
    SELECT gt.vault_key INTO v_vault_key
    FROM discordsh.guild_tokens gt
    WHERE gt.server_id = p_server_id
      AND gt.service   = p_service
      AND gt.is_active = true
    ORDER BY gt.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Decrypt from vault
    SELECT ds.decrypted_secret INTO v_token_value
    FROM vault.decrypted_secrets ds
    WHERE ds.name = v_vault_key;

    RETURN v_token_value;
END;
$$;

COMMENT ON FUNCTION discordsh.bot_get_guild_token IS
    'Bot-facing read-only accessor: returns decrypted token by server_id + service. service_role only.';

REVOKE ALL ON FUNCTION discordsh.bot_get_guild_token(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.bot_get_guild_token(TEXT, TEXT)
    TO service_role;
ALTER FUNCTION discordsh.bot_get_guild_token(TEXT, TEXT)
    OWNER TO service_role;

-- ============================================================
-- PROXY RPC: Public-facing wrapper for edge functions
--
-- Edge functions call Supabase RPC via PostgREST, which routes
-- to the public schema. This proxy delegates to the discordsh
-- function while maintaining the same security guarantees.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_get_guild_token(
    p_server_id TEXT,
    p_service   TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- service_role only
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    RETURN discordsh.bot_get_guild_token(p_server_id, p_service);
END;
$$;

COMMENT ON FUNCTION public.bot_get_guild_token IS
    'Public proxy for discordsh.bot_get_guild_token — callable via PostgREST RPC. service_role only.';

REVOKE ALL ON FUNCTION public.bot_get_guild_token(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_get_guild_token(TEXT, TEXT)
    TO service_role;

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify both functions exist
    PERFORM 'discordsh.bot_get_guild_token(text,text)'::regprocedure;
    PERFORM 'public.bot_get_guild_token(text,text)'::regprocedure;

    -- Verify service_role has EXECUTE
    IF NOT has_function_privilege('service_role', 'discordsh.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.bot_get_guild_token';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on public.bot_get_guild_token';
    END IF;

    -- Verify anon CANNOT execute
    IF has_function_privilege('anon', 'discordsh.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.bot_get_guild_token';
    END IF;
    IF has_function_privilege('anon', 'public.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on public.bot_get_guild_token';
    END IF;

    -- Verify authenticated CANNOT execute
    IF has_function_privilege('authenticated', 'discordsh.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.bot_get_guild_token';
    END IF;
    IF has_function_privilege('authenticated', 'public.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on public.bot_get_guild_token';
    END IF;

    -- Verify ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.bot_get_guild_token(text,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.bot_get_guild_token must be owned by service_role';
    END IF;

    RAISE NOTICE 'bot_get_guild_token: both functions created, all permissions verified.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DROP FUNCTION IF EXISTS public.bot_get_guild_token(TEXT, TEXT);
DROP FUNCTION IF EXISTS discordsh.bot_get_guild_token(TEXT, TEXT);
