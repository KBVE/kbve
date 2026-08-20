-- migrate:up

-- ============================================================
-- WOW SCHEMA — links a KBVE account to a ToCloud9 game account
--
-- Mirrors the `mc` schema, with one structural difference worth
-- stating: the credential itself does NOT live here. A WoW
-- account row lives in MySQL (acore_auth.account) because the
-- AzerothCore auth server reads it directly, and Postgres cannot
-- write there. This schema is the *link and claim ledger* only —
-- it records which KBVE user owns which game username, and
-- whether the MySQL side has been provisioned yet.
--
-- The unique constraint on user_id is what enforces "one game
-- account per KBVE account". It keys on the auth user UUID rather
-- than the email string, so the rule survives an email change.
--
-- Flow:
--   1. Browser derives an SRP6 salt+verifier from the chosen
--      password. The plaintext never leaves the device.
--   2. Browser POSTs salt+verifier to the accountd bridge with
--      its Supabase JWT.
--   3. accountd calls wow.service_claim_account to reserve the
--      username (this is the uniqueness gate), then INSERTs into
--      acore_auth.account, then calls
--      wow.service_mark_provisioned.
--
-- Claim-before-write is deliberate: a duplicate claim fails here,
-- cheaply and transactionally, instead of racing two inserts into
-- MySQL where there is no cross-store transaction to save us.
--
-- Depends on: profile.username (name derivation + gate),
--             20260510210000_profile_custom_access_token_hook.sql
-- ============================================================

CREATE SCHEMA IF NOT EXISTS wow;

GRANT USAGE ON SCHEMA wow TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA wow TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA wow TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA wow TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA wow
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wow
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wow
    GRANT ALL ON FUNCTIONS TO service_role;

-- ========== TABLE: wow.account ==========

-- status is a small state machine rather than a boolean because the
-- MySQL insert can fail after the claim succeeds, and we need to be
-- able to tell "reserved but not yet real" from "live".
--   0 = claimed   — username reserved, MySQL row not written yet
--   1 = provisioned — acore_auth.account exists, account is usable
--   2 = disabled  — retained so the username stays reserved
CREATE TABLE IF NOT EXISTS wow.account (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,
    username TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    provisioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- AzerothCore uppercases account names before hashing, so storing
    -- them any other way would let two rows collide in MySQL while
    -- looking distinct here.
    CONSTRAINT wow_username_format_chk
        CHECK (username ~ '^[A-Z0-9_-]{3,16}$'),
    CONSTRAINT wow_status_chk
        CHECK (status IN (0, 1, 2)),
    CONSTRAINT wow_provisioned_at_chk
        CHECK (status <> 1 OR provisioned_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wow_account_username
    ON wow.account (username);

ALTER TABLE wow.account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON wow.account;
CREATE POLICY "service_role_full_access" ON wow.account
    FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON ALL TABLES    IN SCHEMA wow FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA wow FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wow FROM PUBLIC, anon, authenticated;

-- ========== TRIGGERS ==========

CREATE OR REPLACE FUNCTION wow.trg_account_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wow_account_updated_at ON wow.account;
CREATE TRIGGER trg_wow_account_updated_at
    BEFORE UPDATE ON wow.account
    FOR EACH ROW EXECUTE FUNCTION wow.trg_account_updated_at();

-- ========== HELPERS ==========

-- Mirrors forum.assert_user_has_username: the game username is derived
-- from the KBVE username, so a user without one has nothing to derive from.
CREATE OR REPLACE FUNCTION wow.assert_user_has_username(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM profile.username WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'username required: set a KBVE username before creating a game account'
            USING ERRCODE = 'P0001', HINT = 'Call profile.service_add_username first.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION wow.assert_user_has_username(UUID) FROM PUBLIC, anon;

-- ========== SERVICE RPCs (accountd, service_role key) ==========

-- Reserves the username for this user. Returns the resulting status so the
-- caller can tell a fresh claim from an existing one without a second query.
-- Idempotent for the same (user_id, username): re-claiming your own row is a
-- no-op, which makes a retry after a failed MySQL insert safe.
CREATE OR REPLACE FUNCTION wow.service_claim_account(
    p_user_id UUID,
    p_username TEXT
)
RETURNS TABLE (username TEXT, status INTEGER, was_created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_existing wow.account%ROWTYPE;
BEGIN
    PERFORM wow.assert_user_has_username(p_user_id);

    SELECT * INTO v_existing FROM wow.account WHERE user_id = p_user_id;

    IF FOUND THEN
        -- One account per user. Surfacing the existing name (rather than
        -- raising) lets the UI show what they already have.
        RETURN QUERY SELECT v_existing.username, v_existing.status, FALSE;
        RETURN;
    END IF;

    BEGIN
        INSERT INTO wow.account (user_id, username, status)
        VALUES (p_user_id, upper(p_username), 0);
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'game username already taken'
                USING ERRCODE = '23505';
        WHEN check_violation THEN
            RAISE EXCEPTION 'invalid game username: must be 3-16 chars of A-Z, 0-9, _ or -'
                USING ERRCODE = '22023';
    END;

    RETURN QUERY SELECT upper(p_username), 0, TRUE;
END;
$$;

COMMENT ON FUNCTION wow.service_claim_account(UUID, TEXT) IS
    'Reserves a game username for a KBVE user before the provisioner writes acore_auth.account. service_role only.';

REVOKE ALL ON FUNCTION wow.service_claim_account(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wow.service_claim_account(UUID, TEXT) TO service_role;

-- Flips a claim to live once the MySQL row exists.
CREATE OR REPLACE FUNCTION wow.service_mark_provisioned(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    UPDATE wow.account
       SET status = 1, provisioned_at = NOW()
     WHERE user_id = p_user_id;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION wow.service_mark_provisioned(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wow.service_mark_provisioned(UUID) TO service_role;

-- Releases a claim that never got provisioned, so a failed MySQL insert does
-- not permanently burn the username. Deliberately refuses to touch a live
-- account — those must be disabled, never silently dropped.
CREATE OR REPLACE FUNCTION wow.service_release_claim(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    DELETE FROM wow.account WHERE user_id = p_user_id AND status = 0;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION wow.service_release_claim(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wow.service_release_claim(UUID) TO service_role;

-- ========== PROXY RPC (browser, as the logged-in user) ==========

CREATE OR REPLACE FUNCTION wow.proxy_get_account()
RETURNS TABLE (
    username TEXT,
    status INTEGER,
    is_provisioned BOOLEAN,
    provisioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
    END IF;

    RETURN QUERY
        SELECT a.username, a.status, a.status = 1, a.provisioned_at, a.created_at
          FROM wow.account AS a
         WHERE a.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION wow.proxy_get_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wow.proxy_get_account() TO authenticated, service_role;

-- ========== PUBLIC WRAPPER ==========

-- PostgREST only exposes the schemas in PGRST_DB_SCHEMAS, and `wow` is not
-- one of them, so a browser supabase.rpc('...') would 404 without this.
CREATE OR REPLACE FUNCTION public.proxy_get_wow_account()
RETURNS TABLE (
    username TEXT,
    status INTEGER,
    is_provisioned BOOLEAN,
    provisioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY SELECT * FROM wow.proxy_get_account();
END;
$$;

COMMENT ON FUNCTION public.proxy_get_wow_account() IS
    'Public wrapper for wow.proxy_get_account. Authenticated callers only; wow schema is not exposed via PostgREST.';

REVOKE ALL ON FUNCTION public.proxy_get_wow_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_get_wow_account() TO authenticated, service_role;
ALTER FUNCTION public.proxy_get_wow_account() OWNER TO service_role;

-- The service RPCs need wrappers for the same reason the proxy does: `wow` is
-- not in PGRST_DB_SCHEMAS, so accountd and the edge fallback would both get a
-- 404 calling wow.* directly. These are service_role-only.

CREATE OR REPLACE FUNCTION public.service_claim_wow_account(
    p_user_id UUID,
    p_username TEXT
)
RETURNS TABLE (username TEXT, status INTEGER, was_created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY SELECT * FROM wow.service_claim_account(p_user_id, p_username);
END;
$$;

REVOKE ALL ON FUNCTION public.service_claim_wow_account(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_wow_account(UUID, TEXT) TO service_role;
ALTER FUNCTION public.service_claim_wow_account(UUID, TEXT) OWNER TO service_role;

CREATE OR REPLACE FUNCTION public.service_mark_wow_provisioned(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN wow.service_mark_provisioned(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.service_mark_wow_provisioned(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_mark_wow_provisioned(UUID) TO service_role;
ALTER FUNCTION public.service_mark_wow_provisioned(UUID) OWNER TO service_role;

CREATE OR REPLACE FUNCTION public.service_release_wow_claim(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN wow.service_release_claim(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.service_release_wow_claim(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_release_wow_claim(UUID) TO service_role;
ALTER FUNCTION public.service_release_wow_claim(UUID) OWNER TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS public.service_release_wow_claim(UUID);
DROP FUNCTION IF EXISTS public.service_mark_wow_provisioned(UUID);
DROP FUNCTION IF EXISTS public.service_claim_wow_account(UUID, TEXT);
DROP FUNCTION IF EXISTS public.proxy_get_wow_account();
DROP FUNCTION IF EXISTS wow.proxy_get_account();
DROP FUNCTION IF EXISTS wow.service_release_claim(UUID);
DROP FUNCTION IF EXISTS wow.service_mark_provisioned(UUID);
DROP FUNCTION IF EXISTS wow.service_claim_account(UUID, TEXT);
DROP FUNCTION IF EXISTS wow.assert_user_has_username(UUID);
DROP TRIGGER IF EXISTS trg_wow_account_updated_at ON wow.account;
DROP FUNCTION IF EXISTS wow.trg_account_updated_at();
DROP TABLE IF EXISTS wow.account;
DROP SCHEMA IF EXISTS wow;
