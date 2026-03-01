-- ============================================================
-- Supabase extensions schema stub for local migration testing.
--
-- In production, Supabase manages an "extensions" schema that
-- holds pgcrypto, uuid-ossp, and other extensions. This stub
-- creates the same structure so gen_ulid() and other functions
-- that reference extensions.gen_random_bytes() work locally.
--
-- In production, this schema already exists.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;

-- pgcrypto provides gen_random_bytes() and crypt/gen_salt
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- ============================================================
-- Vault schema stub for local migration testing.
--
-- In production, Supabase manages the vault extension via
-- pgsodium with transparent encryption. This stub provides
-- the same API surface so vault-related migrations succeed
-- locally without pgsodium.
--
-- In production, this schema already exists.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS vault;

-- Minimal secrets table (matches Supabase vault.secrets structure)
CREATE TABLE IF NOT EXISTS vault.secrets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE,
    description TEXT,
    secret      TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Stub vault.create_secret() — in production this encrypts via pgsodium;
-- locally we just store plaintext
CREATE OR REPLACE FUNCTION vault.create_secret(
    new_secret      TEXT,
    new_name        TEXT DEFAULT NULL,
    new_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (new_secret, new_name, new_description)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Stub vault.decrypted_secrets view — in production this decrypts
-- via pgsodium; locally we just return the plaintext
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
SELECT
    id,
    name,
    description,
    secret AS decrypted_secret,
    created_at,
    updated_at
FROM vault.secrets;

-- Grant access to service_role
GRANT USAGE ON SCHEMA vault TO service_role;
GRANT ALL ON vault.secrets TO service_role;
GRANT SELECT ON vault.decrypted_secrets TO service_role;
GRANT EXECUTE ON FUNCTION vault.create_secret(TEXT, TEXT, TEXT) TO service_role;
