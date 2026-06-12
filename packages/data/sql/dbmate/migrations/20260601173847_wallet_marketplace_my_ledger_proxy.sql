-- migrate:up

-- Phase 4 of the marketplace bootstrap: caller-scoped ledger history
-- proxy. Mirrors the read-only contract of proxy_market_my_listings_readonly
-- / proxy_market_my_bids_readonly. Lets an authenticated client paginate
-- their own wallet.ledger rows so the UI can render a "market history"
-- view.
--
-- Auth model:
--   - authenticated only. Resolves auth.uid() → wallet account via
--     private.proxy_market_caller_account(). Raises 'WLT01' when the
--     caller has no wallet account so the Rust client can fall back
--     to the rw pool's lazy-provisioning proxy (same contract as the
--     existing readonly market proxies).
--   - account_id is omitted from the returned shape — every row is
--     guaranteed to be the caller's. ref_type / ref_id ARE returned:
--     for market_* rows they point to the caller's own bid / listing
--     (already publicly browseable via proxy_market_list_active_readonly
--     / proxy_market_listing_detail_readonly), so there is no cross-
--     account exposure. reason is a stable enum-like string emitted
--     by wallet.service_credit / service_debit / settle / cancel call
--     sites (`'buy_now'`, `'listing_cancelled'`, `'expired_with_bid'`,
--     etc.) — no admin notes, no internal payloads.
--
-- Filters:
--   - p_source_kinds wallet.source_kind[] — IN-list. Defaults to the
--     three marketplace source kinds (market_buy / market_sell /
--     market_fee). Pass NULL to widen to the caller's full ledger
--     (still caller-scoped — no cross-user leak, just a broader read
--     surface on this proxy). Pass an explicit array to narrow to a
--     custom set (e.g. ARRAY['market_sell']). Empty array '{}' is
--     rejected with 22023 (treated as a client bug, not "match
--     nothing").
--   - p_currency wallet.currency_kind — optional. NULL = both
--     currencies.
--
-- Cursor:
--   (p_before_created_at, p_before_id) — both required together,
--   matching the my_listings / my_bids pattern. p_before_id must be
--   positive when supplied. Sorted by created_at DESC, id DESC.
--   Backed by wallet_ledger_account_currency_idx. A follow-up index
--   migration (separate PR) will add a partial covering index for
--   the marketplace-only hot path; planner currently uses the
--   composite index plus a filter — acceptable until measured.
--
-- Owner / grants:
--   OWNER service_role, SECURITY DEFINER, STABLE, search_path = ''.
--   GRANT EXECUTE TO authenticated, service_role. PUBLIC + anon
--   REVOKEd.

-- Drop any prior shape before recreating so a future signature change
-- (return-column rename / add / drop) does not error out on the
-- PostgreSQL "cannot change return type of existing function" check.
-- This is a no-op on first apply.
DROP FUNCTION IF EXISTS public.proxy_market_my_ledger_readonly(
    INTEGER, TIMESTAMPTZ, BIGINT, wallet.source_kind[], wallet.currency_kind
);

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
    v_account UUID;
    v_limit   INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;

    IF p_before_id IS NOT NULL AND p_before_id <= 0 THEN
        RAISE EXCEPTION 'before_id must be positive'
            USING ERRCODE = '22023';
    END IF;

    IF p_source_kinds IS NOT NULL AND cardinality(p_source_kinds) = 0 THEN
        RAISE EXCEPTION 'source_kinds cannot be empty; pass NULL to widen to the full ledger'
            USING ERRCODE = '22023';
    END IF;

    v_account := private.proxy_market_caller_account();

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
) COST 100 ROWS 100;

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
