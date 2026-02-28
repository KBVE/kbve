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
