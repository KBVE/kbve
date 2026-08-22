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
--   1. Browser asks the `wow` edge function to reserve a name.
--      wow.service_claim_account derives it from profile.username
--      and returns the name it actually took.
--   2. Browser derives an SRP6 salt+verifier from that exact name
--      and the chosen password. The plaintext never leaves the
--      device.
--   3. Browser POSTs salt+verifier back; the edge function INSERTs
--      into acore_auth.account and calls
--      wow.service_mark_provisioned.
--
-- Reserve-before-derive is what makes step 2 safe. The name is not
-- the KBVE username verbatim — it is truncated to 16 and may carry
-- a collision suffix — and SRP6 hashes UPPER(name):UPPER(pass), so
-- hashing against a guess would produce a verifier the auth server
-- can never validate.
--
-- Claim-before-write is deliberate for the same reason it is in mc:
-- a duplicate claim fails here, cheaply and transactionally, instead
-- of racing two inserts into MySQL where there is no cross-store
-- transaction to save us.
--
-- Depends on: profile.username (name derivation + gate),
--             20260510210000_profile_custom_access_token_hook.sql
-- ============================================================

CREATE SCHEMA IF NOT EXISTS wow;

GRANT USAGE ON SCHEMA wow TO service_role;

-- Default privileges have to be declared before the objects they cover; the
-- GRANT/REVOKE ... ON ALL forms only touch what already exists, so they are
-- applied further down, once wow.account is in place.
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

-- A claim that never reached MySQL holds its username forever unless something
-- sweeps it. Partial, because status = 0 is a transient state and the index
-- should stay small enough that a reaper scan is cheap.
CREATE INDEX IF NOT EXISTS idx_wow_account_stale_claim
    ON wow.account (created_at)
    WHERE status = 0;

ALTER TABLE wow.account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON wow.account;
CREATE POLICY "service_role_full_access" ON wow.account
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Named explicitly rather than via ON ALL TABLES, so this stays correct no
-- matter where in the file it sits.
GRANT ALL ON TABLE wow.account TO service_role;
REVOKE ALL ON TABLE wow.account FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA wow FROM PUBLIC, anon, authenticated;
-- Functions are not covered here: each one below carries its own REVOKE, which
-- is the only form that can run after the function exists.

-- ========== TRIGGERS ==========

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

REVOKE ALL ON FUNCTION wow.assert_user_has_username(UUID) FROM PUBLIC, anon, authenticated;

-- ========== SERVICE RPCs (wow edge function, service_role key) ==========

-- Reserves the username for this user. Returns the resulting status so the
-- caller can tell a fresh claim from an existing one without a second query.
-- Idempotent for the same (user_id, username): re-claiming your own row is a
-- no-op, which makes a retry after a failed MySQL insert safe.
-- ---------- derivation ----------

-- The game username is not chosen; it is the KBVE username, uppercased.
-- profile.username is ^[a-z0-9_-]+$ so the character class always survives the
-- fold, but it allows up to 63 characters while the 3.3.5a login box caps the
-- account field at 16 — so the name has to be shortened, and shortening
-- collides. Attempt 1 is the plain truncation; later attempts trade trailing
-- characters for a numeric suffix, which keeps the result inside 16 without
-- ever dropping below the 3-character floor.
CREATE OR REPLACE FUNCTION wow.derive_username(p_base TEXT, p_attempt INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT CASE
        WHEN p_attempt <= 1 THEN left(p_base, 16)
        ELSE left(p_base, 16 - length(p_attempt::TEXT)) || p_attempt::TEXT
    END;
$$;

REVOKE ALL ON FUNCTION wow.derive_username(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wow.derive_username(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION wow.service_claim_account(p_user_id UUID)
RETURNS TABLE (username TEXT, status INTEGER, was_created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_existing wow.account%ROWTYPE;
    v_base TEXT;
    v_candidate TEXT;
    v_attempt INTEGER := 1;
BEGIN
    PERFORM wow.assert_user_has_username(p_user_id);

    SELECT * INTO v_existing FROM wow.account WHERE user_id = p_user_id;

    IF FOUND THEN
        -- One account per user. Surfacing the existing name (rather than
        -- raising) lets the UI show what they already have.
        RETURN QUERY SELECT v_existing.username, v_existing.status, FALSE;
        RETURN;
    END IF;

    SELECT upper(u.username) INTO v_base
      FROM profile.username AS u WHERE u.user_id = p_user_id;

    -- Walking candidates inside the transaction is what makes the reserved
    -- name authoritative. The caller hashes its SRP6 verifier against whatever
    -- comes back from here, so a name suggested before the insert would be
    -- wrong the moment two users with similar handles claim at once.
    WHILE v_attempt <= 999 LOOP
        v_candidate := wow.derive_username(v_base, v_attempt);
        BEGIN
            INSERT INTO wow.account (user_id, username, status)
            VALUES (p_user_id, v_candidate, 0);

            RETURN QUERY SELECT v_candidate, 0, TRUE;
            RETURN;
        EXCEPTION
            WHEN unique_violation THEN
                -- Could be the username index or the user_id primary key. The
                -- latter means a concurrent claim by this same user won the
                -- race, and that row is the answer rather than a retry.
                SELECT * INTO v_existing FROM wow.account WHERE user_id = p_user_id;
                IF FOUND THEN
                    RETURN QUERY SELECT v_existing.username, v_existing.status, FALSE;
                    RETURN;
                END IF;
                v_attempt := v_attempt + 1;
            WHEN check_violation THEN
                RAISE EXCEPTION 'KBVE username % cannot be used as a game name', v_base
                    USING ERRCODE = '22023';
        END;
    END LOOP;

    RAISE EXCEPTION 'no free game username derivable from %', v_base
        USING ERRCODE = '23505',
              HINT = 'Every suffix through 999 is taken; change the KBVE username.';
END;
$$;

COMMENT ON FUNCTION wow.service_claim_account(UUID) IS
    'Reserves the game username derived from profile.username before the provisioner writes acore_auth.account. Returns the name actually reserved. service_role only.';

REVOKE ALL ON FUNCTION wow.service_claim_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wow.service_claim_account(UUID) TO service_role;

-- Flips a claim to live once the MySQL row exists.
CREATE OR REPLACE FUNCTION wow.service_mark_provisioned(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    -- Scoped to status = 0 so this can only ever complete a claim. Without the
    -- guard, a replayed provisioning call would silently reactivate a disabled
    -- account (status = 2) and rewrite provisioned_at on an already-live row.
    UPDATE wow.account
       SET status = 1, provisioned_at = NOW()
     WHERE user_id = p_user_id AND status = 0;
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
    suggested_username TEXT,
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

    -- Driven from profile.username, not wow.account, so a user with no game
    -- account still gets a row telling them what theirs will be called. No
    -- KBVE username means no row at all, which is the signal the UI needs to
    -- send them to set one first.
    --
    -- suggested_username is for display only. It is attempt 1 and ignores
    -- collisions; the authoritative name comes back from the claim.
    RETURN QUERY
        SELECT a.username,
               wow.derive_username(upper(p.username), 1),
               a.status,
               COALESCE(a.status = 1, FALSE),
               a.provisioned_at,
               a.created_at
          FROM profile.username AS p
          LEFT JOIN wow.account AS a ON a.user_id = v_user_id
         WHERE p.user_id = v_user_id;
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
    suggested_username TEXT,
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
-- not in PGRST_DB_SCHEMAS, so the edge function would get a 404 calling wow.*
-- directly. These are service_role-only.

CREATE OR REPLACE FUNCTION public.service_claim_wow_account(p_user_id UUID)
RETURNS TABLE (username TEXT, status INTEGER, was_created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY SELECT * FROM wow.service_claim_account(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.service_claim_wow_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_wow_account(UUID) TO service_role;
ALTER FUNCTION public.service_claim_wow_account(UUID) OWNER TO service_role;

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
DROP FUNCTION IF EXISTS public.service_claim_wow_account(UUID);
DROP FUNCTION IF EXISTS public.proxy_get_wow_account();
DROP FUNCTION IF EXISTS wow.proxy_get_account();
DROP FUNCTION IF EXISTS wow.service_release_claim(UUID);
DROP FUNCTION IF EXISTS wow.service_mark_provisioned(UUID);
DROP FUNCTION IF EXISTS wow.service_claim_account(UUID);
DROP FUNCTION IF EXISTS wow.derive_username(TEXT, INTEGER);
DROP FUNCTION IF EXISTS wow.assert_user_has_username(UUID);
DROP TRIGGER IF EXISTS trg_wow_account_updated_at ON wow.account;
DROP FUNCTION IF EXISTS wow.trg_account_updated_at();
DROP TABLE IF EXISTS wow.account;
DROP SCHEMA IF EXISTS wow;
