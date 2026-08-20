-- =============================================================
-- wow_core.sql — link ledger between a KBVE account and a
--                ToCloud9 (AzerothCore) game account
--
-- The credential itself is deliberately NOT here. A game account
-- lives in MySQL (acore_auth.account) because the AzerothCore
-- auth server reads that table directly, and Postgres cannot
-- write to it. This schema records only which KBVE user owns
-- which game username, and whether the MySQL side exists yet.
--
-- We never hold the password. The browser derives an SRP6
-- salt + verifier locally and only those reach the server, which
-- is the same thing the game itself stores.
--
-- Promoted to: ../../dbmate/migrations/20260820051500_wow_schema_init.sql
-- =============================================================

CREATE SCHEMA IF NOT EXISTS wow;

-- ---------- tables ----------

-- user_id is the primary key, which is what enforces "one game account per
-- KBVE account". It keys on the auth UUID rather than the email string so the
-- rule survives an email change.
--
-- status is a small state machine rather than a boolean because the MySQL
-- insert can fail after the claim succeeds, and "reserved but not yet real"
-- has to be distinguishable from "live":
--   0 = claimed     — username reserved, MySQL row not written yet
--   1 = provisioned — acore_auth.account exists, account is usable
--   2 = disabled    — retained so the username stays reserved
CREATE TABLE IF NOT EXISTS wow.account (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,
    username TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    provisioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- AzerothCore uppercases account names before hashing them into the SRP6
    -- identity, so storing them any other way would let two rows collide in
    -- MySQL while looking distinct here. 16 chars keeps us well inside the
    -- varchar(32) that acore_auth.account.username allows.
    CONSTRAINT wow_username_format_chk
        CHECK (username ~ '^[A-Z0-9_-]{3,16}$'),
    CONSTRAINT wow_status_chk
        CHECK (status IN (0, 1, 2)),
    CONSTRAINT wow_provisioned_at_chk
        CHECK (status <> 1 OR provisioned_at IS NOT NULL)
);

-- ---------- indexes ----------

CREATE UNIQUE INDEX IF NOT EXISTS idx_wow_account_username
    ON wow.account (username);

-- A claim that never reached MySQL holds its username forever unless something
-- sweeps it. Partial, because status = 0 is a transient state and the index
-- should stay small enough that a reaper scan is cheap.
CREATE INDEX IF NOT EXISTS idx_wow_account_stale_claim
    ON wow.account (created_at)
    WHERE status = 0;

-- ---------- triggers ----------

CREATE OR REPLACE FUNCTION wow.trg_account_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Every other function here revokes PUBLIC explicitly; this one needs it too,
-- because PostgreSQL grants EXECUTE to PUBLIC on newly created functions.
REVOKE ALL ON FUNCTION wow.trg_account_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wow_account_updated_at ON wow.account;
CREATE TRIGGER trg_wow_account_updated_at
    BEFORE UPDATE ON wow.account
    FOR EACH ROW EXECUTE FUNCTION wow.trg_account_updated_at();

-- ---------- policies ----------

-- Nothing reaches this table directly. The browser goes through
-- public.proxy_get_wow_account and the provisioner through the service RPCs,
-- all SECURITY DEFINER.
ALTER TABLE wow.account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON wow.account;
CREATE POLICY "service_role_full_access" ON wow.account
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- grants ----------

GRANT USAGE ON SCHEMA wow TO service_role;

-- Default privileges cover objects created after this point, which is what
-- carries the grants into wow_rpcs.sql. The ON ALL forms only touch what
-- already exists, so anything named there has to be spelled out by hand.
ALTER DEFAULT PRIVILEGES IN SCHEMA wow
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wow
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wow
    GRANT ALL ON FUNCTIONS TO service_role;

GRANT ALL ON TABLE wow.account TO service_role;
REVOKE ALL ON TABLE wow.account FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA wow FROM PUBLIC, anon, authenticated;
