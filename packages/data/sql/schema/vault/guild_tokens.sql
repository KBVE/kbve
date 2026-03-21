-- ============================================================
-- DISCORDSH GUILD VAULT — Per-guild encrypted token storage
--
-- Stores API tokens (GitHub PATs, webhook secrets, etc.) scoped
-- to Discord server guild IDs. Tokens are encrypted via Supabase
-- Vault (vault.secrets / vault.decrypted_secrets).
--
-- Security (quadruple belt-and-suspenders):
--   Belt 1: REVOKE ALL from PUBLIC/anon/authenticated on table + functions
--   Belt 2: GRANT EXECUTE to service_role only
--   Belt 3: Runtime auth.role() check in every service function
--   Belt 4: Ownership verification via verify_guild_owner() in every function
--   + SECURITY DEFINER + SET search_path = '' on all functions
--   + RLS with service_role_full_access only
--   + Rate limit: max 10 tokens per guild
--   + Verification DO block with positive + negative permission checks
--
-- Access flow:
--   user → edge function → createServiceClient()
--     → discordsh.service_* RPC → vault.secrets
--
-- Prerequisite: discordsh schema + servers table must exist
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: discordsh.guild_tokens
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.guild_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id   TEXT NOT NULL REFERENCES discordsh.servers(server_id) ON DELETE CASCADE,
    token_name  TEXT NOT NULL
                CHECK (token_name ~ '^[a-z0-9_-]{3,64}$'),
    service     TEXT NOT NULL
                CHECK (service ~ '^[a-z0-9_]{2,32}$'),
    vault_key   TEXT NOT NULL,
    description TEXT
                CHECK (description IS NULL OR (char_length(description) <= 500 AND discordsh.is_safe_text(description))),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ,

    CONSTRAINT unique_guild_service_token UNIQUE (server_id, service, token_name)
);

COMMENT ON TABLE discordsh.guild_tokens IS 'Per-guild encrypted token storage via Supabase Vault';
COMMENT ON COLUMN discordsh.guild_tokens.vault_key IS 'Path in vault.secrets: guild/{server_id}/tokens/{service}/{token_name}';
COMMENT ON COLUMN discordsh.guild_tokens.service IS 'Service category: github, openai, webhook, etc.';

-- ===========================================
-- INDEXES
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_discordsh_guild_tokens_server
    ON discordsh.guild_tokens (server_id);

CREATE INDEX IF NOT EXISTS idx_discordsh_guild_tokens_active
    ON discordsh.guild_tokens (server_id, is_active)
    WHERE is_active = true;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Cleanup vault secret when guild_tokens row is deleted (including cascade).
-- Fires on direct DELETE and on CASCADE from discordsh.servers FK.
-- Raises WARNING if vault secret is missing (stale vault_key diagnostic).
CREATE OR REPLACE FUNCTION discordsh.trg_guild_tokens_cleanup_vault()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE name = OLD.vault_key;
    IF NOT FOUND THEN
        RAISE WARNING 'guild_tokens cleanup: vault secret not found for token % (key: %)', OLD.id, OLD.vault_key;
    END IF;
    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_guild_tokens_cleanup_vault() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.trg_guild_tokens_cleanup_vault() TO service_role;
ALTER FUNCTION discordsh.trg_guild_tokens_cleanup_vault() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_discordsh_guild_tokens_cleanup_vault ON discordsh.guild_tokens;
CREATE TRIGGER trg_discordsh_guild_tokens_cleanup_vault
    BEFORE DELETE ON discordsh.guild_tokens
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_guild_tokens_cleanup_vault();

-- Reuse existing updated_at trigger function
DROP TRIGGER IF EXISTS trg_discordsh_guild_tokens_updated_at ON discordsh.guild_tokens;
CREATE TRIGGER trg_discordsh_guild_tokens_updated_at
    BEFORE UPDATE ON discordsh.guild_tokens
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_servers_updated_at();

-- Reuse existing timestamp protection trigger
DROP TRIGGER IF EXISTS trg_discordsh_guild_tokens_protect_timestamps ON discordsh.guild_tokens;
CREATE TRIGGER trg_discordsh_guild_tokens_protect_timestamps
    BEFORE INSERT OR UPDATE ON discordsh.guild_tokens
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.protect_timestamps();

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE discordsh.guild_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON discordsh.guild_tokens;
CREATE POLICY "service_role_full_access" ON discordsh.guild_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No policies for anon or authenticated — all access gated through service_role functions

REVOKE ALL ON discordsh.guild_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON discordsh.guild_tokens TO service_role;

-- ===========================================
-- HELPER: verify_guild_owner
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.verify_guild_owner(
    p_server_id TEXT,
    p_owner_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM discordsh.servers s
        WHERE s.server_id = p_server_id
          AND s.owner_id  = p_owner_id
          AND s.status <> 4  -- Reject banned servers
    );
END;
$$;

REVOKE ALL ON FUNCTION discordsh.verify_guild_owner(TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.verify_guild_owner(TEXT, UUID)
    TO service_role;
ALTER FUNCTION discordsh.verify_guild_owner(TEXT, UUID)
    OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Set guild token
--
-- Creates or updates an encrypted token for a guild.
-- Validates ownership, enforces rate limit (max 10 per guild),
-- stores encrypted value in vault.secrets.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_set_guild_token(
    p_owner_id    UUID,
    p_server_id   TEXT,
    p_service     TEXT,
    p_token_name  TEXT,
    p_token_value TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, token_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_vault_key        TEXT;
    v_secret_id        UUID;
    v_token_id         UUID;
    v_clean_token_name TEXT;
    v_clean_service    TEXT;
    v_token_count      INTEGER;
BEGIN
    -- Belt 3: Runtime role verification
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    -- Validate server_id format (Discord snowflake)
    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid server ID format.'::TEXT;
        RETURN;
    END IF;

    -- Validate token_name format (lowercase only)
    IF p_token_name IS NULL OR p_token_name !~ '^[a-z0-9_-]{3,64}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid token name. Use 3-64 lowercase chars: a-z, 0-9, underscore, dash.'::TEXT;
        RETURN;
    END IF;

    -- Validate service format
    IF p_service IS NULL OR p_service !~ '^[a-z0-9_]{2,32}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid service name. Use 2-32 chars: lowercase a-z, 0-9, underscore.'::TEXT;
        RETURN;
    END IF;

    -- Validate token value length
    IF p_token_value IS NULL OR char_length(p_token_value) < 10 OR char_length(p_token_value) > 8000 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token value must be 10-8000 characters.'::TEXT;
        RETURN;
    END IF;

    -- Validate description
    IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Description must be 500 characters or fewer.'::TEXT;
        RETURN;
    END IF;

    v_clean_token_name := lower(trim(p_token_name));
    v_clean_service    := lower(trim(p_service));

    -- Belt 4: Verify guild ownership (also rejects banned servers)
    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Not the server owner.'::TEXT;
        RETURN;
    END IF;

    -- Advisory lock on guild to prevent race condition on rate limit
    PERFORM pg_advisory_xact_lock(hashtext('gvault:' || p_server_id));

    -- Rate limit: max 10 tokens per guild (exclude existing token being updated)
    SELECT count(*) INTO v_token_count
    FROM discordsh.guild_tokens gt
    WHERE gt.server_id = p_server_id
      AND NOT (gt.service = v_clean_service AND gt.token_name = v_clean_token_name);

    IF v_token_count >= 10 THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Rate limit: max 10 tokens per guild.'::TEXT;
        RETURN;
    END IF;

    -- Build vault key path
    v_vault_key := format('guild/%s/tokens/%s/%s', p_server_id, v_clean_service, v_clean_token_name);

    -- Create or update the secret in vault
    BEGIN
        SELECT vault.create_secret(
            p_token_value,
            v_vault_key,
            format('Guild token: %s/%s for server %s', v_clean_service, v_clean_token_name, p_server_id)
        ) INTO v_secret_id;
    EXCEPTION
        WHEN unique_violation THEN
            UPDATE vault.secrets
            SET secret = p_token_value, updated_at = NOW()
            WHERE name = v_vault_key;
    END;

    -- Upsert the token reference
    INSERT INTO discordsh.guild_tokens (
        server_id, token_name, service, vault_key, description, is_active
    ) VALUES (
        p_server_id, v_clean_token_name, v_clean_service, v_vault_key, p_description, true
    )
    ON CONFLICT (server_id, service, token_name)
    DO UPDATE SET
        vault_key   = EXCLUDED.vault_key,
        description = EXCLUDED.description,
        is_active   = true
    RETURNING id INTO v_token_id;

    RETURN QUERY SELECT true, v_token_id, 'Guild token saved.'::TEXT;

EXCEPTION
    WHEN check_violation THEN
        RETURN QUERY SELECT false, NULL::UUID,
            ('Validation failed: ' || SQLERRM)::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_set_guild_token IS
    'Create or update an encrypted guild token. Verifies ownership, rate-limits to 10 per guild.';

REVOKE ALL ON FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
ALTER FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Get guild token (decrypted)
--
-- Returns the decrypted token value from vault.
-- Verifies ownership before returning secrets.
-- service_role only — tokens never reach the browser.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_get_guild_token(
    p_owner_id  UUID,
    p_server_id TEXT,
    p_token_id  UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_vault_key    TEXT;
    v_token_value  TEXT;
BEGIN
    -- Belt 3: Runtime role verification
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    -- Belt 4: Verify guild ownership (also rejects banned servers)
    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RAISE EXCEPTION 'Not the server owner.';
    END IF;

    -- Get vault key and validate token belongs to server
    SELECT gt.vault_key INTO v_vault_key
    FROM discordsh.guild_tokens gt
    WHERE gt.id = p_token_id
      AND gt.server_id = p_server_id
      AND gt.is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token not found, inactive, or does not belong to this server.';
    END IF;

    -- Get decrypted token from vault
    SELECT ds.decrypted_secret INTO v_token_value
    FROM vault.decrypted_secrets ds
    WHERE ds.name = v_vault_key;

    IF v_token_value IS NULL THEN
        RAISE EXCEPTION 'Token value not found in vault.';
    END IF;

    RETURN v_token_value;
END;
$$;

COMMENT ON FUNCTION discordsh.service_get_guild_token IS
    'Retrieve decrypted guild token. Verifies ownership. service_role only — tokens never reach the browser.';

REVOKE ALL ON FUNCTION discordsh.service_get_guild_token(UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_get_guild_token(UUID, TEXT, UUID)
    TO service_role;
ALTER FUNCTION discordsh.service_get_guild_token(UUID, TEXT, UUID)
    OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: List guild tokens (metadata only)
--
-- Returns token metadata for a guild. No decrypted values.
-- Verifies ownership before listing.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_list_guild_tokens(
    p_owner_id  UUID,
    p_server_id TEXT
)
RETURNS TABLE(
    id          UUID,
    token_name  TEXT,
    service     TEXT,
    description TEXT,
    is_active   BOOLEAN,
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Belt 3: Runtime role verification
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    -- Belt 4: Verify guild ownership (also rejects banned servers)
    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RAISE EXCEPTION 'Not the server owner.';
    END IF;

    RETURN QUERY
    SELECT
        gt.id,
        gt.token_name,
        gt.service,
        gt.description,
        gt.is_active,
        gt.created_at,
        gt.updated_at
    FROM discordsh.guild_tokens gt
    WHERE gt.server_id = p_server_id
    ORDER BY gt.service, gt.token_name;
END;
$$;

COMMENT ON FUNCTION discordsh.service_list_guild_tokens IS
    'List guild token metadata (no secrets). Verifies ownership.';

REVOKE ALL ON FUNCTION discordsh.service_list_guild_tokens(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_list_guild_tokens(UUID, TEXT)
    TO service_role;
ALTER FUNCTION discordsh.service_list_guild_tokens(UUID, TEXT)
    OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Delete guild token
--
-- Removes the token reference and the encrypted vault secret.
-- Verifies ownership before deletion.
--
-- Defense-in-depth: vault secret is deleted BOTH manually here
-- AND by the BEFORE DELETE trigger (trg_guild_tokens_cleanup_vault).
-- The manual delete is the primary path; the trigger is the safety
-- net for CASCADE deletes from discordsh.servers FK. On direct
-- service_delete calls, the trigger's second delete is a harmless
-- no-op (0 rows, WARNING raised).
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_delete_guild_token(
    p_owner_id  UUID,
    p_server_id TEXT,
    p_token_id  UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_vault_key TEXT;
BEGIN
    -- Belt 3: Runtime role verification
    IF auth.role() <> 'service_role' THEN
        RETURN QUERY SELECT false, 'Access denied: service_role required.'::TEXT;
        RETURN;
    END IF;

    -- Belt 4: Verify guild ownership (also rejects banned servers)
    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RETURN QUERY SELECT false, 'Not the server owner.'::TEXT;
        RETURN;
    END IF;

    -- Get vault key
    SELECT gt.vault_key INTO v_vault_key
    FROM discordsh.guild_tokens gt
    WHERE gt.id = p_token_id
      AND gt.server_id = p_server_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Token not found or does not belong to this server.'::TEXT;
        RETURN;
    END IF;

    -- Primary vault cleanup (trigger provides secondary safety net)
    DELETE FROM vault.secrets WHERE name = v_vault_key;

    -- Delete the reference (fires cleanup trigger — harmless no-op since vault already cleared)
    DELETE FROM discordsh.guild_tokens gt
    WHERE gt.id = p_token_id
      AND gt.server_id = p_server_id;

    RETURN QUERY SELECT true, 'Guild token deleted.'::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_delete_guild_token IS
    'Delete a guild token from vault and reference table. Verifies ownership. Double-delete pattern for defense-in-depth.';

REVOKE ALL ON FUNCTION discordsh.service_delete_guild_token(UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_delete_guild_token(UUID, TEXT, UUID)
    TO service_role;
ALTER FUNCTION discordsh.service_delete_guild_token(UUID, TEXT, UUID)
    OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Toggle guild token status
--
-- Soft enable/disable a guild token without deleting it.
-- Verifies ownership before toggling.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_toggle_guild_token_status(
    p_owner_id  UUID,
    p_server_id TEXT,
    p_token_id  UUID,
    p_is_active BOOLEAN
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Belt 3: Runtime role verification
    IF auth.role() <> 'service_role' THEN
        RETURN QUERY SELECT false, 'Access denied: service_role required.'::TEXT;
        RETURN;
    END IF;

    -- Belt 4: Verify guild ownership (also rejects banned servers)
    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RETURN QUERY SELECT false, 'Not the server owner.'::TEXT;
        RETURN;
    END IF;

    UPDATE discordsh.guild_tokens gt
    SET is_active = p_is_active
    WHERE gt.id = p_token_id
      AND gt.server_id = p_server_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Token not found or does not belong to this server.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT true,
        CASE WHEN p_is_active THEN 'Guild token enabled.' ELSE 'Guild token disabled.' END::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_toggle_guild_token_status IS
    'Soft enable/disable a guild token. Verifies ownership.';

REVOKE ALL ON FUNCTION discordsh.service_toggle_guild_token_status(UUID, TEXT, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_toggle_guild_token_status(UUID, TEXT, UUID, BOOLEAN)
    TO service_role;
ALTER FUNCTION discordsh.service_toggle_guild_token_status(UUID, TEXT, UUID, BOOLEAN)
    OWNER TO service_role;

-- ===========================================
-- INDEX: Enforce one active token per (server_id, service)
-- ===========================================

CREATE UNIQUE INDEX IF NOT EXISTS guild_tokens_one_active_per_service
    ON discordsh.guild_tokens (server_id, service)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS guild_tokens_bot_lookup_idx
    ON discordsh.guild_tokens (server_id, service, is_active, created_at DESC);

-- ===========================================
-- BOT FUNCTION: Get guild token by service (production-hardened)
--
-- Bot-facing read-only accessor. The bot only knows the
-- guild snowflake and service name — it does not have the
-- owner_id or token_id. No ownership check because the
-- caller is the bot itself (service_role), consuming a
-- token the owner already authorized.
--
-- Returns the decrypted token or NULL if no active token
-- exists. Raises if the guild_tokens row exists but the
-- vault secret is missing (indicates corruption).
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.bot_get_guild_token(
    p_server_id TEXT,
    p_service   TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
    v_server_id   TEXT;
    v_service     TEXT;
    v_vault_key   TEXT;
    v_token_value TEXT;
BEGIN
    -- service_role only
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    -- Normalize inputs before validation
    v_server_id := btrim(p_server_id);
    v_service   := lower(btrim(p_service));

    -- Validate server_id format (Discord snowflake)
    IF v_server_id IS NULL OR v_server_id !~ '^\d{17,20}$' THEN
        RAISE EXCEPTION 'Invalid server ID format';
    END IF;

    -- Validate service format
    IF v_service IS NULL OR v_service !~ '^[a-z0-9_]{2,32}$' THEN
        RAISE EXCEPTION 'Invalid service name format';
    END IF;

    -- Find the active token for this guild + service.
    -- With the partial unique index guild_tokens_one_active_per_service,
    -- at most one row matches. ORDER BY + LIMIT 1 kept as defensive
    -- fallback with deterministic tie-breaker on PK.
    SELECT gt.vault_key
    INTO v_vault_key
    FROM discordsh.guild_tokens AS gt
    WHERE gt.server_id = v_server_id
      AND gt.service   = v_service
      AND gt.is_active = TRUE
    ORDER BY gt.created_at DESC, gt.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Decrypt from vault — broken reference is exceptional
    SELECT ds.decrypted_secret
    INTO v_token_value
    FROM vault.decrypted_secrets AS ds
    WHERE ds.name = v_vault_key;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Active guild token exists for server_id=% and service=%, but vault secret % is missing',
            v_server_id, v_service, v_vault_key;
    END IF;

    RETURN v_token_value;
END;
$$;

COMMENT ON FUNCTION discordsh.bot_get_guild_token IS
    'Bot-facing read-only accessor: returns decrypted token by server_id + service. STABLE, service_role only. Raises on broken vault references.';

REVOKE ALL ON FUNCTION discordsh.bot_get_guild_token(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.bot_get_guild_token(TEXT, TEXT)
    TO service_role;
ALTER FUNCTION discordsh.bot_get_guild_token(TEXT, TEXT)
    OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'discordsh' AND table_name = 'guild_tokens'
    ) THEN
        RAISE EXCEPTION 'discordsh.guild_tokens table not found';
    END IF;

    -- Verify indexes exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'discordsh'
          AND indexname = 'guild_tokens_one_active_per_service'
    ) THEN
        RAISE EXCEPTION 'Partial unique index guild_tokens_one_active_per_service not found';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'discordsh'
          AND indexname = 'guild_tokens_bot_lookup_idx'
    ) THEN
        RAISE EXCEPTION 'Bot lookup index guild_tokens_bot_lookup_idx not found';
    END IF;

    -- Verify all 8 functions exist
    PERFORM 'discordsh.trg_guild_tokens_cleanup_vault()'::regprocedure;
    PERFORM 'discordsh.verify_guild_owner(text,uuid)'::regprocedure;
    PERFORM 'discordsh.service_set_guild_token(uuid,text,text,text,text,text)'::regprocedure;
    PERFORM 'discordsh.service_get_guild_token(uuid,text,uuid)'::regprocedure;
    PERFORM 'discordsh.service_list_guild_tokens(uuid,text)'::regprocedure;
    PERFORM 'discordsh.service_delete_guild_token(uuid,text,uuid)'::regprocedure;
    PERFORM 'discordsh.service_toggle_guild_token_status(uuid,text,uuid,boolean)'::regprocedure;
    PERFORM 'discordsh.bot_get_guild_token(text,text)'::regprocedure;

    -- Verify service_role has EXECUTE on all functions
    IF NOT has_function_privilege('service_role', 'discordsh.verify_guild_owner(text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.verify_guild_owner';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.service_set_guild_token(uuid,text,text,text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.service_set_guild_token';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.service_get_guild_token(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.service_get_guild_token';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.service_list_guild_tokens(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.service_list_guild_tokens';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.service_delete_guild_token(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.service_delete_guild_token';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.service_toggle_guild_token_status(uuid,text,uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.service_toggle_guild_token_status';
    END IF;
    IF NOT has_function_privilege('service_role', 'discordsh.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on discordsh.bot_get_guild_token';
    END IF;

    -- Verify anon CANNOT execute ANY guild vault function
    IF has_function_privilege('anon', 'discordsh.verify_guild_owner(text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.verify_guild_owner';
    END IF;
    IF has_function_privilege('anon', 'discordsh.service_set_guild_token(uuid,text,text,text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.service_set_guild_token';
    END IF;
    IF has_function_privilege('anon', 'discordsh.service_get_guild_token(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.service_get_guild_token';
    END IF;
    IF has_function_privilege('anon', 'discordsh.service_list_guild_tokens(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.service_list_guild_tokens';
    END IF;
    IF has_function_privilege('anon', 'discordsh.service_delete_guild_token(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.service_delete_guild_token';
    END IF;
    IF has_function_privilege('anon', 'discordsh.service_toggle_guild_token_status(uuid,text,uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.service_toggle_guild_token_status';
    END IF;
    IF has_function_privilege('anon', 'discordsh.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on discordsh.bot_get_guild_token';
    END IF;

    -- Verify authenticated CANNOT execute ANY guild vault function
    IF has_function_privilege('authenticated', 'discordsh.verify_guild_owner(text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.verify_guild_owner';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.service_set_guild_token(uuid,text,text,text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.service_set_guild_token';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.service_get_guild_token(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.service_get_guild_token';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.service_list_guild_tokens(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.service_list_guild_tokens';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.service_delete_guild_token(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.service_delete_guild_token';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.service_toggle_guild_token_status(uuid,text,uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.service_toggle_guild_token_status';
    END IF;
    IF has_function_privilege('authenticated', 'discordsh.bot_get_guild_token(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have EXECUTE on discordsh.bot_get_guild_token';
    END IF;

    -- Verify anon has NO table access (all 4 privileges)
    IF has_table_privilege('anon', 'discordsh.guild_tokens', 'SELECT') THEN
        RAISE EXCEPTION 'anon must NOT have SELECT on discordsh.guild_tokens';
    END IF;
    IF has_table_privilege('anon', 'discordsh.guild_tokens', 'INSERT') THEN
        RAISE EXCEPTION 'anon must NOT have INSERT on discordsh.guild_tokens';
    END IF;
    IF has_table_privilege('anon', 'discordsh.guild_tokens', 'UPDATE') THEN
        RAISE EXCEPTION 'anon must NOT have UPDATE on discordsh.guild_tokens';
    END IF;
    IF has_table_privilege('anon', 'discordsh.guild_tokens', 'DELETE') THEN
        RAISE EXCEPTION 'anon must NOT have DELETE on discordsh.guild_tokens';
    END IF;

    -- Verify authenticated has NO table access (all 4 privileges)
    IF has_table_privilege('authenticated', 'discordsh.guild_tokens', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated must NOT have SELECT on discordsh.guild_tokens';
    END IF;
    IF has_table_privilege('authenticated', 'discordsh.guild_tokens', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated must NOT have INSERT on discordsh.guild_tokens';
    END IF;
    IF has_table_privilege('authenticated', 'discordsh.guild_tokens', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated must NOT have UPDATE on discordsh.guild_tokens';
    END IF;
    IF has_table_privilege('authenticated', 'discordsh.guild_tokens', 'DELETE') THEN
        RAISE EXCEPTION 'authenticated must NOT have DELETE on discordsh.guild_tokens';
    END IF;

    -- Verify all functions owned by service_role
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.trg_guild_tokens_cleanup_vault()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.trg_guild_tokens_cleanup_vault must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.verify_guild_owner(text,uuid)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.verify_guild_owner must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_set_guild_token(uuid,text,text,text,text,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_set_guild_token must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_get_guild_token(uuid,text,uuid)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_get_guild_token must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_list_guild_tokens(uuid,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_list_guild_tokens must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_delete_guild_token(uuid,text,uuid)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_delete_guild_token must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_toggle_guild_token_status(uuid,text,uuid,boolean)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_toggle_guild_token_status must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.bot_get_guild_token(text,text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.bot_get_guild_token must be owned by service_role';
    END IF;

    RAISE NOTICE 'guild_tokens: table, 8 functions, all permissions verified successfully (quadruple belt-and-suspenders).';
END;
$$ LANGUAGE plpgsql;

COMMIT;
