-- migrate:up

-- Grant ows role access to the extensions schema.
-- pgcrypto (crypt/gen_salt) lives in extensions, not public.
-- Without this, OWS login fails because the crypt() function
-- is not found in the ows,public search path.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_usage_grants
        WHERE grantee = 'ows' AND object_schema = 'extensions'
    ) THEN
        GRANT USAGE ON SCHEMA extensions TO ows;
    END IF;
END $$;

-- migrate:down

REVOKE USAGE ON SCHEMA extensions FROM ows;
