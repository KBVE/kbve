-- migrate:up
-- Fix: service_set_guild_token's on-conflict path wrote PLAINTEXT directly into
-- vault.secrets.secret (the encrypted column) instead of re-encrypting via
-- vault.update_secret. So any *updated* token (re-saved bot config, rotated
-- secret) became unreadable — vault.decrypted_secrets raises 22023
-- (invalid_parameter_value) trying to decrypt non-ciphertext, surfaced on the
-- dashboard as `sqlstate=22023 context=guild_vault_rpc` when the integration
-- probe peeks discordsh_config. First-write tokens (vault.create_secret) read
-- fine; only updates were corrupt.
--
-- Re-create the function using vault.update_secret(id, value) on conflict, which
-- encrypts correctly. CREATE OR REPLACE preserves the postgres ownership set in
-- 20260608183000 (re-asserted below for safety — vault access needs it).
--
-- Existing corrupt secrets are NOT auto-repaired (can't distinguish plaintext
-- from ciphertext safely); re-saving the affected row through this fixed path
-- repairs it.

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
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;

    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid server ID format.'::TEXT;
        RETURN;
    END IF;

    IF p_token_name IS NULL OR p_token_name !~ '^[a-z0-9_-]{3,64}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid token name. Use 3-64 lowercase chars: a-z, 0-9, underscore, dash.'::TEXT;
        RETURN;
    END IF;

    IF p_service IS NULL OR p_service !~ '^[a-z0-9_]{2,32}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid service name. Use 2-32 chars: lowercase a-z, 0-9, underscore.'::TEXT;
        RETURN;
    END IF;

    IF p_token_value IS NULL OR char_length(p_token_value) < 10 OR char_length(p_token_value) > 8000 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token value must be 10-8000 characters.'::TEXT;
        RETURN;
    END IF;

    IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Description must be 500 characters or fewer.'::TEXT;
        RETURN;
    END IF;

    v_clean_token_name := lower(trim(p_token_name));
    v_clean_service    := lower(trim(p_service));

    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Not the server owner.'::TEXT;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('gvault:' || p_server_id));

    SELECT count(*) INTO v_token_count
    FROM discordsh.guild_tokens gt
    WHERE gt.server_id = p_server_id
      AND NOT (gt.service = v_clean_service AND gt.token_name = v_clean_token_name);

    IF v_token_count >= 10 THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Rate limit: max 10 tokens per guild.'::TEXT;
        RETURN;
    END IF;

    v_vault_key := format('guild/%s/tokens/%s/%s', p_server_id, v_clean_service, v_clean_token_name);

    BEGIN
        SELECT vault.create_secret(
            p_token_value,
            v_vault_key,
            format('Guild token: %s/%s for server %s', v_clean_service, v_clean_token_name, p_server_id)
        ) INTO v_secret_id;
    EXCEPTION
        WHEN unique_violation THEN
            SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_vault_key;
            PERFORM vault.update_secret(v_secret_id, p_token_value);
    END;

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

REVOKE ALL ON FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
ALTER FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    OWNER TO postgres;


-- migrate:down
-- Restore the plaintext on-conflict write (the buggy original behavior).
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
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Access denied: service_role required';
    END IF;
    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid server ID format.'::TEXT;
        RETURN;
    END IF;
    IF p_token_name IS NULL OR p_token_name !~ '^[a-z0-9_-]{3,64}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid token name. Use 3-64 lowercase chars: a-z, 0-9, underscore, dash.'::TEXT;
        RETURN;
    END IF;
    IF p_service IS NULL OR p_service !~ '^[a-z0-9_]{2,32}$' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid service name. Use 2-32 chars: lowercase a-z, 0-9, underscore.'::TEXT;
        RETURN;
    END IF;
    IF p_token_value IS NULL OR char_length(p_token_value) < 10 OR char_length(p_token_value) > 8000 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token value must be 10-8000 characters.'::TEXT;
        RETURN;
    END IF;
    IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Description must be 500 characters or fewer.'::TEXT;
        RETURN;
    END IF;
    v_clean_token_name := lower(trim(p_token_name));
    v_clean_service    := lower(trim(p_service));
    IF NOT discordsh.verify_guild_owner(p_server_id, p_owner_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Not the server owner.'::TEXT;
        RETURN;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('gvault:' || p_server_id));
    SELECT count(*) INTO v_token_count
    FROM discordsh.guild_tokens gt
    WHERE gt.server_id = p_server_id
      AND NOT (gt.service = v_clean_service AND gt.token_name = v_clean_token_name);
    IF v_token_count >= 10 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Rate limit: max 10 tokens per guild.'::TEXT;
        RETURN;
    END IF;
    v_vault_key := format('guild/%s/tokens/%s/%s', p_server_id, v_clean_service, v_clean_token_name);
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
        RETURN QUERY SELECT false, NULL::UUID, ('Validation failed: ' || SQLERRM)::TEXT;
END;
$$;

ALTER FUNCTION discordsh.service_set_guild_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
    OWNER TO postgres;
