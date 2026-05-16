-- migrate:up

-- Phase 3 of the marketplace bootstrap: PostgREST-exposed public proxy
-- functions that wrap the Phase 2 service-layer RPCs after applying
-- auth.uid()-based ownership checks. These are the only marketplace
-- functions callable by `authenticated` JWTs.
--
-- Read-side functions are STABLE and avoid any writes, so they are
-- safe on the supabase-cluster-pooler-ro replica via the wallet
-- client's read() path. On missing wallet account for the caller
-- they raise SQLSTATE 'WLT01' so the Rust client can fall back to
-- the rw pool's lazy-provisioning proxy (same contract as
-- public.proxy_wallet_get_balance_readonly).
--
-- Auth model:
--   - list_active_readonly + listing_detail_readonly: callable by
--     anon + authenticated. Browse is public.
--   - my_listings_readonly + my_bids_readonly: authenticated only,
--     uses auth.uid() to scope.
--   - create_listing / place_bid / buy_now / cancel_listing: write
--     proxies, authenticated only. Each resolves auth.uid() →
--     wallet account (raises WLT01 on missing) before calling the
--     Phase 2 service RPC. Phase 2 already locks tables + verifies
--     state, so the proxy is a thin auth layer.
--
-- Owner / grants:
--   All functions OWNER service_role + SECURITY DEFINER + search_path
--   = ''. Read-side proxies STABLE. Grants per-function vary
--   (anon allowed for the public browse pair).

-- ============================================================================
-- Dependency preflight
--
-- Phase 3 proxies require the Phase 2 service RPCs to exist. Fail the
-- migration with a clear message if a prior phase is missing rather
-- than letting CREATE FUNCTION compile against a phantom signature.
-- ============================================================================
DO $$
DECLARE
    v_required TEXT[] := ARRAY[
        'wallet.service_create_listing(uuid,jsonb,wallet.currency_kind,bigint,bigint,timestamptz,uuid)',
        'wallet.service_place_bid(bigint,uuid,bigint,uuid)',
        'wallet.service_buy_now(bigint,uuid,uuid)',
        'wallet.service_cancel_listing(bigint,uuid,text)'
    ];
    v_proc TEXT;
BEGIN
    FOREACH v_proc IN ARRAY v_required LOOP
        IF to_regprocedure(v_proc) IS NULL THEN
            RAISE EXCEPTION 'dependency missing: % — apply Phase 2 first', v_proc;
        END IF;
    END LOOP;
    IF to_regclass('wallet.account') IS NULL THEN
        RAISE EXCEPTION 'dependency missing: wallet.account';
    END IF;
    -- proxy_market_caller_account relies on this partial unique to
    -- safely SELECT INTO without STRICT.
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND tablename = 'account'
           AND indexname = 'wallet_account_user_uq'
    ) THEN
        RAISE EXCEPTION 'dependency missing: wallet_account_user_uq partial unique index';
    END IF;
END;
$$;

-- Public-exposure note:
-- proxy_market_list_active_readonly + proxy_market_listing_detail_readonly
-- are anon-callable. Both expose seller_account as a stable wallet
-- UUID — acceptable since the seller is the public storefront, and
-- a future profile-join will replace it with a public handle. All
-- other wallet account UUIDs (current_bid_account, buyer_account,
-- bidder_account inside bids) are redacted from the anon surface.
-- Authenticated my_listings + my_bids proxies return the caller's
-- own context only, so no extra exposure there.

-- ============================================================================
-- INTERNAL HELPER: resolve auth.uid() → wallet.account.id
--
-- Raises 28000 if unauthenticated, WLT01 if the caller has no wallet
-- account (Rust client falls back to the rw lazy-provision path).
-- Used by every authenticated proxy below.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_caller_account()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    SELECT id INTO v_account_id
      FROM wallet.account
     WHERE kind = 'user' AND user_id = v_user_id;
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;
    RETURN v_account_id;
END;
$$;
ALTER FUNCTION public.proxy_market_caller_account() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_caller_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_market_caller_account() TO service_role;
COMMENT ON FUNCTION public.proxy_market_caller_account() IS
    'INTERNAL marketplace proxy helper. Resolves auth.uid() → wallet.account.id. Raises 28000 on anon, WLT01 on missing wallet account.';

-- ============================================================================
-- public.proxy_market_list_active_readonly
--
-- Public browse. Keyset cursor on (created_at DESC, id DESC) matches
-- wallet_listing_active_created_idx. No auth required.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_list_active_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    listing_id          BIGINT,
    seller_account      UUID,
    item_ref            JSONB,
    currency            wallet.currency_kind,
    buy_now_price       BIGINT,
    min_bid             BIGINT,
    current_bid         BIGINT,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    -- Cursor pair must be all-or-nothing; otherwise the keyset
    -- tie-breaker `id < NULL` silently turns the cursor into a no-op.
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;

    -- current_bid_account redacted from anon output; bidder identity
    -- is exposed only via authenticated my_bids_readonly. seller_account
    -- stays since a marketplace listing's seller is the storefront.
    RETURN QUERY
    SELECT
        l.id, l.seller_account, l.item_ref, l.currency,
        l.buy_now_price, l.min_bid, l.current_bid,
        l.expires_at, l.created_at
      FROM wallet.listing l
     WHERE l.status = 'active'
       -- Hide listings whose deadline has passed but the cron sweep
       -- has not yet flipped status. Keeps browse output consistent
       -- with what users can actually act on.
       AND l.expires_at > statement_timestamp()
       AND (
           p_before_created_at IS NULL
           OR l.created_at < p_before_created_at
           OR (l.created_at = p_before_created_at AND l.id < p_before_id)
       )
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT) COST 100 ROWS 50;
REVOKE ALL ON FUNCTION public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'PUBLIC marketplace proxy. Paged active-listing browse, anon-callable. Keyset cursor on (created_at DESC, id DESC), limit clamped [1, 100], default 50. seller_account stays exposed (storefront identity); current_bid_account redacted. Hides deadline-passed-but-not-yet-swept rows via expires_at > now().';

-- ============================================================================
-- public.proxy_market_listing_detail_readonly
--
-- Single listing + bid history (most recent 50 bids). Anon-callable.
-- Raises P1001 on missing listing so the client surfaces a clean 404.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_listing_detail_readonly(
    p_listing_id BIGINT
)
RETURNS TABLE (
    listing_id          BIGINT,
    seller_account      UUID,
    item_ref            JSONB,
    currency            wallet.currency_kind,
    buy_now_price       BIGINT,
    min_bid             BIGINT,
    current_bid         BIGINT,
    current_bid_id      BIGINT,
    listing_status      wallet.listing_status,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    settled_at          TIMESTAMPTZ,
    bids                JSONB
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_listing wallet.listing%ROWTYPE;
    v_bids    JSONB;
BEGIN
    IF p_listing_id IS NULL THEN
        RAISE EXCEPTION 'listing_id is required' USING ERRCODE = '22004';
    END IF;
    SELECT * INTO v_listing FROM wallet.listing WHERE id = p_listing_id;
    IF v_listing.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;

    -- Anon-visible bid history: bidder_account intentionally redacted.
    -- A future profile-join refactor will expose a stable public
    -- handle here; for now the bid amount + timing + status is enough
    -- for browse UX without leaking the wallet account graph.
    SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.placed_at DESC, sub.id DESC), '[]'::jsonb)
      INTO v_bids
      FROM (
          SELECT jsonb_build_object(
              'bid_id', b.id,
              'amount', b.amount,
              'status', b.status,
              'placed_at', b.placed_at,
              'settled_at', b.settled_at
          ) AS row, b.placed_at, b.id
            FROM wallet.bid b
           WHERE b.listing_id = p_listing_id
           ORDER BY b.placed_at DESC, b.id DESC
           LIMIT 50
      ) sub;

    listing_id          := v_listing.id;
    seller_account      := v_listing.seller_account;
    item_ref            := v_listing.item_ref;
    currency            := v_listing.currency;
    buy_now_price       := v_listing.buy_now_price;
    min_bid             := v_listing.min_bid;
    current_bid         := v_listing.current_bid;
    current_bid_id      := v_listing.current_bid_id;
    listing_status      := v_listing.status;
    expires_at          := v_listing.expires_at;
    created_at          := v_listing.created_at;
    updated_at          := v_listing.updated_at;
    settled_at          := v_listing.settled_at;
    bids                := v_bids;
    RETURN NEXT;
END;
$$;
ALTER FUNCTION public.proxy_market_listing_detail_readonly(BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_market_listing_detail_readonly(BIGINT) COST 100 ROWS 1;
REVOKE ALL ON FUNCTION public.proxy_market_listing_detail_readonly(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_market_listing_detail_readonly(BIGINT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_listing_detail_readonly(BIGINT) IS
    'PUBLIC marketplace proxy. Anon-callable single-listing read + 50 most recent bids. seller_account stays exposed (the listing storefront); current_bid_account, buyer_account, and bidder_account inside bids are redacted to avoid leaking the wallet-account graph. Once a profile schema lands, replace seller_account with a profile handle too. Raises P1001 on missing listing, 22004 on null id.';

-- ============================================================================
-- public.proxy_market_my_listings_readonly
--
-- Caller's own listings, paged. Auth required. Raises WLT01 on missing
-- wallet account (client falls back to rw provisioning).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_my_listings_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    listing_id          BIGINT,
    item_ref            JSONB,
    currency            wallet.currency_kind,
    buy_now_price       BIGINT,
    min_bid             BIGINT,
    current_bid         BIGINT,
    current_bid_account UUID,
    buyer_account       UUID,
    listing_status      wallet.listing_status,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ,
    settled_at          TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_seller UUID := public.proxy_market_caller_account();
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT
        l.id, l.item_ref, l.currency,
        l.buy_now_price, l.min_bid, l.current_bid, l.current_bid_account,
        l.buyer_account, l.status AS listing_status, l.expires_at, l.created_at, l.settled_at
      FROM wallet.listing l
     WHERE l.seller_account = v_seller
       AND (
           p_before_created_at IS NULL
           OR l.created_at < p_before_created_at
           OR (l.created_at = p_before_created_at AND l.id < p_before_id)
       )
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT) COST 100 ROWS 50;
REVOKE ALL ON FUNCTION public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'PUBLIC marketplace proxy. Caller-scoped (auth.uid()) listing history, paged. Raises WLT01 when the caller has no wallet account.';

-- ============================================================================
-- public.proxy_market_my_bids_readonly
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_my_bids_readonly(
    p_limit            INTEGER     DEFAULT 50,
    p_before_placed_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id        BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    bid_id           BIGINT,
    listing_id       BIGINT,
    amount           BIGINT,
    bid_status       wallet.bid_status,
    placed_at        TIMESTAMPTZ,
    settled_at       TIMESTAMPTZ,
    escrow_ledger_id BIGINT,
    refund_ledger_id BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_bidder UUID := public.proxy_market_caller_account();
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_placed_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_placed_at and before_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT
        b.id, b.listing_id, b.amount, b.status AS bid_status, b.placed_at,
        b.settled_at, b.escrow_ledger_id, b.refund_ledger_id
      FROM wallet.bid b
     WHERE b.bidder_account = v_bidder
       AND (
           p_before_placed_at IS NULL
           OR b.placed_at < p_before_placed_at
           OR (b.placed_at = p_before_placed_at AND b.id < p_before_id)
       )
     ORDER BY b.placed_at DESC, b.id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT) COST 100 ROWS 50;
REVOKE ALL ON FUNCTION public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'PUBLIC marketplace proxy. Caller-scoped (auth.uid()) bid history, paged. Raises WLT01 when the caller has no wallet account.';

-- ============================================================================
-- public.proxy_market_create_listing — write proxy
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_create_listing(
    p_item_ref        JSONB,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_seller UUID := public.proxy_market_caller_account();
BEGIN
    -- Reject obviously bad inputs early; Phase 2 service does deeper
    -- validation but a clean proxy boundary avoids surfacing the
    -- service-layer NULL errors via the HTTP path.
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;
    IF p_item_ref IS NULL OR jsonb_typeof(p_item_ref) <> 'object' THEN
        RAISE EXCEPTION 'item_ref must be a JSON object' USING ERRCODE = '22023';
    END IF;
    IF p_buy_now_price IS NULL AND p_min_bid IS NULL THEN
        RAISE EXCEPTION 'listing requires buy_now_price or min_bid' USING ERRCODE = '22023';
    END IF;
    IF p_buy_now_price IS NOT NULL AND p_buy_now_price <= 0 THEN
        RAISE EXCEPTION 'buy_now_price must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_min_bid IS NOT NULL AND p_min_bid <= 0 THEN
        RAISE EXCEPTION 'min_bid must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at IS NULL OR p_expires_at <= statement_timestamp() THEN
        RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
    END IF;
    RETURN wallet.service_create_listing(
        v_seller, p_item_ref, 'khash'::wallet.currency_kind,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    );
END;
$$;
ALTER FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'PUBLIC marketplace proxy. Authenticated create-listing wrapper. Resolves auth.uid() → seller wallet account, then calls wallet.service_create_listing with currency=khash.';

-- ============================================================================
-- public.proxy_market_place_bid — write proxy
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_place_bid(
    p_listing_id      BIGINT,
    p_amount          BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_bidder UUID := public.proxy_market_caller_account();
BEGIN
    IF p_listing_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'listing_id and idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '22023';
    END IF;
    RETURN wallet.service_place_bid(p_listing_id, v_bidder, p_amount, p_idempotency_key);
END;
$$;
ALTER FUNCTION public.proxy_market_place_bid(BIGINT, BIGINT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_place_bid(BIGINT, BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_market_place_bid(BIGINT, BIGINT, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_place_bid(BIGINT, BIGINT, UUID) IS
    'PUBLIC marketplace proxy. Authenticated place-bid wrapper. Resolves auth.uid() → bidder wallet account, then calls wallet.service_place_bid.';

-- ============================================================================
-- public.proxy_market_buy_now — write proxy
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_buy_now(
    p_listing_id      BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_buyer UUID := public.proxy_market_caller_account();
BEGIN
    IF p_listing_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'listing_id and idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    RETURN wallet.service_buy_now(p_listing_id, v_buyer, p_idempotency_key);
END;
$$;
ALTER FUNCTION public.proxy_market_buy_now(BIGINT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_buy_now(BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_market_buy_now(BIGINT, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_buy_now(BIGINT, UUID) IS
    'PUBLIC marketplace proxy. Authenticated buy-now wrapper. Resolves auth.uid() → buyer wallet account, then calls wallet.service_buy_now.';

-- ============================================================================
-- public.proxy_market_cancel_listing — write proxy
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_market_cancel_listing(
    p_listing_id BIGINT,
    p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_seller UUID := public.proxy_market_caller_account();
    v_reason TEXT;
BEGIN
    IF p_listing_id IS NULL THEN
        RAISE EXCEPTION 'listing_id is required' USING ERRCODE = '22004';
    END IF;
    v_reason := NULLIF(btrim(p_reason), '');
    IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
        RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22001';
    END IF;
    PERFORM wallet.service_cancel_listing(p_listing_id, v_seller, v_reason);
END;
$$;
ALTER FUNCTION public.proxy_market_cancel_listing(BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_cancel_listing(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_market_cancel_listing(BIGINT, TEXT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_cancel_listing(BIGINT, TEXT) IS
    'PUBLIC marketplace proxy. Authenticated seller-cancel wrapper. Resolves auth.uid() → seller wallet account, then calls wallet.service_cancel_listing.';

-- PostgREST schema cache refresh after the new public.* surface lands.
NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_market_cancel_listing(BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_market_buy_now(BIGINT, UUID);
DROP FUNCTION IF EXISTS public.proxy_market_place_bid(BIGINT, BIGINT, UUID);
DROP FUNCTION IF EXISTS public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT);
DROP FUNCTION IF EXISTS public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT);
DROP FUNCTION IF EXISTS public.proxy_market_listing_detail_readonly(BIGINT);
DROP FUNCTION IF EXISTS public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT);
DROP FUNCTION IF EXISTS public.proxy_market_caller_account();

NOTIFY pgrst, 'reload schema';
