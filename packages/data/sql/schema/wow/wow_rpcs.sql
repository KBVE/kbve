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

REVOKE ALL ON FUNCTION wow.assert_user_has_username(UUID) FROM PUBLIC, anon;

-- ---------- service RPCs ----------

-- Reserves the username for this user and reports the resulting state, so the
-- caller can distinguish a fresh claim from an existing one without a second
-- query. Idempotent per user: re-claiming returns the row already held rather
-- than creating a second account or renaming the first, which is what makes a
-- retry after a failed MySQL insert safe.
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

-- ---------- public wrappers ----------
-- Required because `wow` is not in PGRST_DB_SCHEMAS. Dropping the schema does
-- NOT remove these, so any teardown has to drop them explicitly or they linger
-- as functions pointing at nothing.

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
