-- migrate:up

-- ============================================================
-- gen_ulid() — ULID generator for use as primary keys
--
-- Produces a 32-character hex string: 12-char timestamp prefix
-- (milliseconds since epoch) + 20-char random suffix.
--
-- Requires: pgcrypto extension in the "extensions" schema
-- (standard in Supabase; locally via init/02-extensions-stub.sql)
--
-- Source: packages/data/sql/old/functions/utils/gen_ulid.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.gen_ulid()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    time_part TEXT := to_hex((extract(epoch FROM clock_timestamp()) * 1000)::bigint);
    rand_part TEXT := encode(extensions.gen_random_bytes(10), 'hex');
BEGIN
    RETURN lpad(time_part, 12, '0') || rand_part;
END;
$$;

COMMENT ON FUNCTION public.gen_ulid IS 'Generates a ULID-like 32-char hex string: 12-char timestamp + 20-char random';

-- migrate:down

DROP FUNCTION IF EXISTS public.gen_ulid();
