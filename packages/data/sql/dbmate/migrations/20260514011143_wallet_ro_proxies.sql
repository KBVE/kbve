-- migrate:up

-- Read-only proxy variants of public.proxy_wallet_get_balance and
-- public.proxy_wallet_list_coupons. These DO NOT call
-- wallet.proxy_ensure_user_account, so they can be executed on the
-- supabase-cluster-pooler-ro replica without write conflicts.
--
-- Error contract (Rust WalletClient maps these):
--   WLT01 'wallet_account_missing'   — caller has no wallet account row
--   WLT01 'wallet_balance_missing'   — account exists, balance row missing
--   WLT02 'wallet_account_duplicate' — invariant violation: more than one
--                                      user-wallet account; data corruption,
--                                      not a normal repair condition
--
-- WLT01 (both messages) triggers fallback to the rw pool's provisioning
-- proxy; WLT02 surfaces as a 500 because it indicates a broken
-- wallet_account_user_uq invariant that needs manual intervention.
--
-- Why custom sqlstates (not P0002 / NO_DATA_FOUND): P0002 is raised by
-- plpgsql for many generic "no row" scenarios, so matching on it would
-- be fragile.
--
-- SECURITY DEFINER intentionally scopes access by auth.uid(); table RLS
-- is not the authorization boundary for these proxy functions. The
-- function owner (service_role) holds the SELECT privileges; the JWT
-- claim is the only thing distinguishing one authenticated caller from
-- another.

-- Composite index matching the list_coupons_readonly query: filter on
-- account_id, order by granted_at DESC + id DESC. Supports the keyset
-- pagination shape (cursor on (granted_at, id)).
CREATE INDEX IF NOT EXISTS wallet_coupon_account_granted_idx
    ON wallet.coupon (account_id, granted_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.proxy_wallet_get_balance_readonly()
RETURNS TABLE (
    account_id  UUID,
    credits     BIGINT,
    khash       BIGINT,
    updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    BEGIN
        SELECT a.id INTO STRICT v_account_id
          FROM wallet.account a
         WHERE a.kind = 'user' AND a.user_id = v_user_id;
    EXCEPTION
        WHEN no_data_found THEN
            RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
        WHEN too_many_rows THEN
            RAISE EXCEPTION 'wallet_account_duplicate' USING ERRCODE = 'WLT02';
    END;

    RETURN QUERY
    SELECT b.account_id, b.credits, b.khash, b.updated_at
      FROM wallet.balance b
     WHERE b.account_id = v_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'wallet_balance_missing' USING ERRCODE = 'WLT01';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.proxy_wallet_get_balance_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_get_balance_readonly() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_get_balance_readonly() OWNER TO service_role;

COMMENT ON FUNCTION public.proxy_wallet_get_balance_readonly() IS
    'Read-only balance fetch. Raises SQLSTATE WLT01 (wallet_account_missing or wallet_balance_missing) when repair is needed; WLT02 (wallet_account_duplicate) on a broken uniqueness invariant.';

-- Defensive: an earlier draft of this migration shipped without keyset
-- pagination args. Drop the no-arg signature first so the new 3-arg
-- function below doesn't collide on environments that already saw the
-- earlier version. No-op on fresh DBs.
DROP FUNCTION IF EXISTS public.proxy_wallet_list_coupons_readonly();

-- list_coupons_readonly takes optional keyset cursor arguments so the
-- coupon history can be paged without grabbing the whole list. All
-- arguments have defaults so existing no-arg callers keep working.
--
-- p_limit            page size, clamped to [1, 100], default 50
-- p_before_granted_at cursor anchor — return rows strictly before this
-- p_before_id        tiebreaker for rows with equal granted_at
CREATE OR REPLACE FUNCTION public.proxy_wallet_list_coupons_readonly(
    p_limit             INTEGER DEFAULT 50,
    p_before_granted_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT DEFAULT NULL
)
RETURNS TABLE (
    coupon_id      BIGINT,
    template_code  TEXT,
    template_label TEXT,
    reward_kind    wallet.reward_kind,
    reward_payload JSONB,
    status         wallet.coupon_status,
    granted_at     TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ,
    redeemed_at    TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
    v_limit      INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    BEGIN
        SELECT a.id INTO STRICT v_account_id
          FROM wallet.account a
         WHERE a.kind = 'user' AND a.user_id = v_user_id;
    EXCEPTION
        WHEN no_data_found THEN
            RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
        WHEN too_many_rows THEN
            RAISE EXCEPTION 'wallet_account_duplicate' USING ERRCODE = 'WLT02';
    END;

    RETURN QUERY
    SELECT
        c.id, t.code, t.label, t.reward_kind, t.reward_payload,
        c.status, c.granted_at, c.expires_at, c.redeemed_at
      FROM wallet.coupon c
      JOIN wallet.coupon_template t ON t.id = c.template_id
     WHERE c.account_id = v_account_id
       AND (
           p_before_granted_at IS NULL
           OR c.granted_at < p_before_granted_at
           OR (c.granted_at = p_before_granted_at AND c.id < p_before_id)
       )
     ORDER BY c.granted_at DESC, c.id DESC
     LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;

COMMENT ON FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'Read-only paged coupon list. Keyset pagination on (granted_at DESC, id DESC). Limit clamped to [1, 100], default 50. Raises SQLSTATE WLT01 (wallet_account_missing) when the caller has no wallet account; the client falls back to the rw pool.';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_wallet_get_balance_readonly();
DROP FUNCTION IF EXISTS public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT);
-- Belt-and-suspenders: drop any older signature too (no-arg version
-- shipped briefly in an earlier draft).
DROP FUNCTION IF EXISTS public.proxy_wallet_list_coupons_readonly();
DROP INDEX IF EXISTS wallet.wallet_coupon_account_granted_idx;
