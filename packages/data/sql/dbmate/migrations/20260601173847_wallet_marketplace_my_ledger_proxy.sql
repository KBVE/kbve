-- migrate:up

-- Phase 4 of the marketplace bootstrap: caller-scoped ledger history
-- proxy. Mirrors the read-only contract of proxy_market_my_listings_readonly
-- / proxy_market_my_bids_readonly. Lets an authenticated client paginate
-- their own wallet.ledger rows so the UI can render a "market history"
-- view without leaking ref columns from other accounts.
--
-- Auth model:
--   - authenticated only. Resolves auth.uid() → wallet account via
--     private.proxy_market_caller_account(). Raises 'WLT01' when the
--     caller has no wallet account so the Rust client can fall back
--     to the rw pool's lazy-provisioning proxy (same contract as the
--     existing readonly market proxies).
--
-- Filters:
--   - p_source_kinds wallet.source_kind[] — IN-list. Defaults to the
--     three marketplace source kinds (market_buy / market_sell /
--     market_fee). Pass NULL to disable the filter (returns the full
--     ledger for the caller). Pass an explicit array to narrow to a
--     custom set (e.g. just market_sell).
--   - p_currency wallet.currency_kind — optional. NULL = both
--     currencies.
--
-- Cursor:
--   (p_before_created_at, p_before_id) — both required together,
--   matching the my_listings / my_bids pattern. Sorted by created_at
--   DESC, id DESC. Backed by wallet_ledger_account_currency_idx.
--
-- Owner / grants:
--   OWNER service_role, SECURITY DEFINER, STABLE, search_path = ''.
--   GRANT EXECUTE TO authenticated, service_role. PUBLIC + anon
--   REVOKEd.

CREATE OR REPLACE FUNCTION public.proxy_market_my_ledger_readonly(
    p_limit             INTEGER                 DEFAULT 50,
    p_before_created_at TIMESTAMPTZ             DEFAULT NULL,
    p_before_id         BIGINT                  DEFAULT NULL,
    p_source_kinds      wallet.source_kind[]    DEFAULT ARRAY[
        'market_buy'::wallet.source_kind,
        'market_sell'::wallet.source_kind,
        'market_fee'::wallet.source_kind
    ],
    p_currency          wallet.currency_kind    DEFAULT NULL
)
RETURNS TABLE (
    ledger_id     BIGINT,
    currency      wallet.currency_kind,
    delta         BIGINT,
    balance_after BIGINT,
    source_kind   wallet.source_kind,
    reason        TEXT,
    ref_type      TEXT,
    ref_id        BIGINT,
    created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_account UUID    := private.proxy_market_caller_account();
    v_limit   INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        l.id,
        l.currency,
        l.delta,
        l.balance_after,
        l.source_kind,
        l.reason,
        l.ref_type,
        l.ref_id,
        l.created_at
      FROM wallet.ledger l
     WHERE l.account_id = v_account
       AND (p_source_kinds IS NULL OR l.source_kind = ANY (p_source_kinds))
       AND (p_currency     IS NULL OR l.currency    = p_currency)
       AND (
           p_before_created_at IS NULL
           OR l.created_at < p_before_created_at
           OR (l.created_at = p_before_created_at AND l.id < p_before_id)
       )
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT v_limit;
END;
$$;

ALTER FUNCTION public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
) OWNER TO service_role;

ALTER FUNCTION public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
) COST 100 ROWS 50;

REVOKE ALL ON FUNCTION public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
) TO authenticated, service_role;

COMMENT ON FUNCTION public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
) IS
    'PUBLIC marketplace proxy. Caller-scoped (auth.uid()) wallet.ledger history with source_kind + currency filters, paged. Raises WLT01 when the caller has no wallet account.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
);

NOTIFY pgrst, 'reload schema';
