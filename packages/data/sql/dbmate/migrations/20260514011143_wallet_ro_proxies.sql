-- migrate:up

-- Read-only proxy variants of public.proxy_wallet_get_balance and
-- public.proxy_wallet_list_coupons. These DO NOT call
-- wallet.proxy_ensure_user_account, so they can be executed on the
-- supabase-cluster-pooler-ro replica without write conflicts.
--
-- Contract on missing account: raise SQLSTATE 'WLT01' (custom). The Rust
-- WalletClient catches that one sqlstate and falls back to the rw pool's
-- provisioning proxy, then retries the read. Account provisioning still
-- runs through wallet.proxy_ensure_user_account, just as a repair lane.
--
-- Why a custom sqlstate (not P0002 / NO_DATA_FOUND): P0002 is raised by
-- plpgsql for a number of generic "no row" scenarios, so matching on it
-- would be fragile. WLT01 is reserved for this wallet RO contract.

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
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT a.id INTO v_account_id
      FROM wallet.account a
     WHERE a.kind = 'user' AND a.user_id = v_user_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;

    RETURN QUERY
    SELECT b.account_id, b.credits, b.khash, b.updated_at
      FROM wallet.balance b
     WHERE b.account_id = v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.proxy_wallet_get_balance_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_get_balance_readonly() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_get_balance_readonly() OWNER TO service_role;

COMMENT ON FUNCTION public.proxy_wallet_get_balance_readonly() IS
    'Read-only balance fetch. Raises SQLSTATE WLT01 when the caller has no wallet account; the client falls back to the rw pool to provision and retry.';

CREATE OR REPLACE FUNCTION public.proxy_wallet_list_coupons_readonly()
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
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT a.id INTO v_account_id
      FROM wallet.account a
     WHERE a.kind = 'user' AND a.user_id = v_user_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;

    RETURN QUERY
    SELECT
        c.id, t.code, t.label, t.reward_kind, t.reward_payload,
        c.status, c.granted_at, c.expires_at, c.redeemed_at
      FROM wallet.coupon c
      JOIN wallet.coupon_template t ON t.id = c.template_id
     WHERE c.account_id = v_account_id
     ORDER BY c.granted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.proxy_wallet_list_coupons_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_list_coupons_readonly() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_list_coupons_readonly() OWNER TO service_role;

COMMENT ON FUNCTION public.proxy_wallet_list_coupons_readonly() IS
    'Read-only coupon list. Raises SQLSTATE WLT01 when the caller has no wallet account; the client falls back to the rw pool to provision and retry.';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_wallet_get_balance_readonly();
DROP FUNCTION IF EXISTS public.proxy_wallet_list_coupons_readonly();
