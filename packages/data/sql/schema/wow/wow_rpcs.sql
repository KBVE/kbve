-- =============================================================
-- wow_rpcs.sql — service + proxy RPCs for the game-account link
--
-- Two audiences, as in the `mc` schema:
--   service_*  called by the provisioner with the service_role key
--   proxy_*    called by the browser as the logged-in user
--
-- Every wow.* function is mirrored by a thin wrapper in `public`.
-- PostgREST only exposes the schemas in PGRST_DB_SCHEMAS and `wow`
-- is not one of them, so a direct wow.* RPC 404s from both the
-- browser and the provisioner.
--
-- Provisioning is claim-then-write on purpose. There is no
-- transaction spanning Postgres and MySQL, so the username is
-- reserved here first (cheap, atomic) and only then inserted into
-- acore_auth. A failed MySQL write leaves a status=0 row that
-- service_release_claim can free.
--
-- Promoted to: ../../dbmate/migrations/20260820051500_wow_schema_init.sql
-- =============================================================

-- ---------- helpers ----------

-- Mirrors forum.assert_user_has_username. The game username is derived from
-- the KBVE username, so a user without one has nothing to derive from.
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

-- ---------- service RPCs ----------

-- Reserves the username for this user and reports the resulting state, so the
-- caller can distinguish a fresh claim from an existing one without a second
-- query. Idempotent per user: re-claiming returns the row already held rather
-- than creating a second account or renaming the first, which is what makes a
-- retry after a failed MySQL insert safe.
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

-- Frees a claim that never got provisioned, so a failed MySQL insert does not
-- permanently burn the username. Deliberately scoped to status = 0: deleting a
-- live row here would orphan a real game account in MySQL that nothing points
-- at any more.
CREATE OR REPLACE FUNCTION wow.service_release_claim(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    DELETE FROM wow.account WHERE user_id = p_user_id AND status = 0;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION wow.service_release_claim(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wow.service_release_claim(UUID) TO service_role;

-- ---------- proxy RPC ----------

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

-- ---------- public wrappers ----------
-- Required because `wow` is not in PGRST_DB_SCHEMAS. Dropping the schema does
-- NOT remove these, so any teardown has to drop them explicitly or they linger
-- as functions pointing at nothing.

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
