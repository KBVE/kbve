-- migrate:up
-- ============================================================================
-- WALLET ↔ INVENTORY LISTING WIRE — foundation (Phase 6.1a)
--
-- Lands:
--   1. inventory.service_split_for_listing — split a HELD stackable row
--      directly into a NEW listing_escrow row + a smaller held source.
--      Combines "split + lock" so the partial-unique invariant on
--      held-stackable rows is never violated (the new row leaves the
--      partial index immediately because it's in listing_escrow).
--   2. wallet.listing.item_id column + active-uniqueness + CHECK so
--      active listings MUST reference an inventory.item row. Existing
--      legacy non-active rows keep working because the CHECK only
--      fires for status='active'.
--   3. wallet.service_create_listing_with_item — new authoritative
--      listing creator that takes (p_item_id, p_qty). When p_qty is
--      NULL or equals the source row qty, the whole row is locked via
--      inventory.service_listing_lock. Otherwise it splits via
--      inventory.service_split_for_listing.
--   4. public.proxy_market_create_listing_with_item — authenticated
--      wrapper. Enforces inventory.is_2fa_required_for_listing aal2
--      gate + the high_value_khash_threshold gate.
--
-- The legacy wallet.service_create_listing(UUID, JSONB, ...) +
-- proxy_market_create_listing(JSONB, ...) STAY in place. axum + Astro
-- migrate to the *_with_item variants in Phase 6.1b. The legacy
-- functions get dropped in 6.1c once all callers move over.
--
-- Settle / cancel / expire / buy_now hooks land in the sibling
-- migration 20260520114244_wallet_listing_settle_inventory.sql.
--
-- LOCK-ORDER INVARIANT (cross-schema):
--   wallet marketplace functions lock wallet.listing FIRST, then call
--   inventory.service_listing_* which locks inventory.item second.
--   inventory.service_listing_* MUST NOT lock wallet.listing in any
--   path — that would invert the order and create a deadlock surface.
--   Any future reconciliation tooling that wants to traverse
--   inventory → listing MUST read wallet.listing without acquiring a
--   row lock (no FOR UPDATE / FOR SHARE).
--
-- OPERATIONAL NOTE (DDL locking):
--   This migration builds non-CONCURRENT indexes + adds an ALTER
--   COLUMN + CHECK inside dbmate's single transaction. Tables are
--   empty at first deploy so locking is moot, but if a future
--   re-application happens against a populated marketplace, run
--   during a write pause — CONCURRENTLY isn't available in a
--   transactional migration block.
-- ============================================================================

-- Preflight: fail fast if the 6.0 inventory hooks + JWT helpers the
-- new wallet RPCs depend on are missing. Without these, the
-- migration would technically succeed and only fail at runtime.
DO $$
BEGIN
    IF to_regprocedure('inventory.service_listing_lock(uuid, uuid, bigint)') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.service_listing_lock(uuid, uuid, bigint) — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('inventory.caller_jwt_aal()') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.caller_jwt_aal() — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('inventory.is_2fa_required_for_listing(uuid)') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.is_2fa_required_for_listing(uuid) — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('private.proxy_market_caller_account()') IS NULL THEN
        RAISE EXCEPTION 'missing private.proxy_market_caller_account() — wallet marketplace proxies migration must be applied first';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. inventory.service_split_for_listing
--    Atomically: src.qty -= p_qty, INSERT new row in 'listing_escrow'
--    with the same kind/ref/source as src. src stays 'held' and
--    inside the partial unique index; the new row sits in
--    listing_escrow so it never collides with the held-stackable
--    invariant. Caller (wallet) then INSERTs wallet.listing with
--    item_id = returned new id.
--
--    p_qty MUST be strictly less than src.qty — a whole-row "split"
--    is a no-op the caller should handle via service_listing_lock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION inventory.service_split_for_listing(
    p_seller_account UUID,
    p_src_item_id    UUID,
    p_qty            BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_src    inventory.item%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF p_seller_account IS NULL OR p_src_item_id IS NULL THEN
        RAISE EXCEPTION 'seller_account, src_item_id are required' USING ERRCODE = '22004';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src
      FROM inventory.item
     WHERE id = p_src_item_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_src_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_src.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller', p_src_item_id USING ERRCODE = 'INV11';
    END IF;
    IF v_src.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state (state=%)',
            p_src_item_id, v_src.state USING ERRCODE = 'INV12';
    END IF;
    IF NOT v_src.is_stackable THEN
        RAISE EXCEPTION 'item % is instanced; cannot split', p_src_item_id
            USING ERRCODE = 'INV15';
    END IF;
    IF v_src.qty <= p_qty THEN
        RAISE EXCEPTION 'split qty % must be strictly less than source qty %',
            p_qty, v_src.qty USING ERRCODE = 'INV13';
    END IF;

    -- Status-guarded UPDATE. Row is already locked FOR UPDATE above,
    -- so the WHERE-recheck + RETURNING is purely defensive against
    -- future refactors that might weaken the lock chain. If the
    -- preconditions changed between the lock and the update, the
    -- RETURNING is empty and we raise.
    DECLARE
        v_updated_src_id UUID;
    BEGIN
        UPDATE inventory.item
           SET qty = qty - p_qty, updated_at = now()
         WHERE id = p_src_item_id
           AND owner_account = p_seller_account
           AND state = 'held'
           AND is_stackable
           AND qty > p_qty
        RETURNING id INTO v_updated_src_id;
        IF v_updated_src_id IS NULL THEN
            RAISE EXCEPTION 'split source % invariant violated between lock and update', p_src_item_id
                USING ERRCODE = 'INV12';
        END IF;
    END;

    -- Preserve v_src.nbt rather than hardcoding '{}'::jsonb. Today the
    -- is_stackable CHECK above guarantees v_src.nbt = '{}', so the two
    -- are equivalent — but mirroring the source row keeps this RPC
    -- correct if the stackable invariant is ever loosened.
    INSERT INTO inventory.item (
        owner_account, kind, ref, qty, nbt, state, source, source_ref
    ) VALUES (
        v_src.owner_account, v_src.kind, v_src.ref, p_qty,
        v_src.nbt, 'listing_escrow', v_src.source,
        jsonb_build_object(
            'split_from',        v_src.id::text,
            'parent_source_ref', v_src.source_ref
        )
    )
    RETURNING id INTO v_new_id;

    -- New row was minted directly into listing_escrow via a "virtual"
    -- transit_in -> listing_escrow transition. Carries split metadata
    -- so the audit stream can reconcile both halves.
    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (v_new_id, 'transit_in', 'listing_escrow', 'wallet',
            'split_for_listing',
            jsonb_build_object(
                'split_from',     v_src.id::text,
                'seller_account', p_seller_account,
                'qty',            p_qty,
                'previous_src_qty', v_src.qty,
                'new_src_qty',    v_src.qty - p_qty
            ));

    RETURN v_new_id;
END;
$$;

ALTER FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) TO service_role;
COMMENT ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) IS
    'Atomic split-for-listing helper. Splits a HELD stackable row, producing a new row directly in listing_escrow state (never held). Used by wallet.service_create_listing_with_item when a partial-stack listing is requested. Returns the new row id, which the caller must INSERT into wallet.listing.item_id. Refuses instanced rows and refuses whole-row splits (caller should service_listing_lock the source directly in that case).';

-- ---------------------------------------------------------------------------
-- 2. wallet.listing.item_id column + active-uniqueness + CHECK
--    Active listings MUST carry item_id. Legacy non-active rows keep
--    item_id NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE wallet.listing
    ADD COLUMN item_id UUID
        REFERENCES inventory.item(id) ON DELETE NO ACTION;

-- Hard preflight: refuse the cleanup if any pre-existing active legacy
-- listing has an active bid. Active bids mean real escrowed khash —
-- silently flipping bid status to 'refunded' without a ledger reversal
-- would strand the bidder's khash. The 6.1a foundation deliberately
-- skips ledger work; if a real bid exists, the migration aborts and
-- requires manual reconciliation before re-running.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM wallet.listing l
          JOIN wallet.bid     b ON b.listing_id = l.id
         WHERE l.status = 'active'
           AND l.item_id IS NULL
           AND b.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'legacy active listings with active bids exist; reconcile escrow manually before re-running 20260520114243';
    END IF;

    -- Catch corrupted current_bid_id pointers (listing claims a
    -- current bid but no matching active wallet.bid row exists).
    -- The cleanup below would silently null these out; surface them
    -- as a hard failure so they get manual review first.
    IF EXISTS (
        SELECT 1
          FROM wallet.listing l
         WHERE l.status = 'active'
           AND l.item_id IS NULL
           AND l.current_bid_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM wallet.bid b
                WHERE b.id = l.current_bid_id
                  AND b.listing_id = l.id
                  AND b.status = 'active'
           )
    ) THEN
        RAISE EXCEPTION
            'legacy active listings with stale current_bid_id pointers exist; manual reconciliation required';
    END IF;
END
$$;

-- Hard cut. Cancel every pre-existing ACTIVE listing — none of them
-- have item_id (column was just added), and going forward every
-- listing MUST flow through the inventory ledger via the
-- *_with_item path. The preflight above guarantees no active bids,
-- so no ledger work is needed; this is pure schema hygiene.
--
-- One audit row PER cancelled listing so reconciliation can replay
-- the exact set of legacy ids without a snapshot. CTE pipes the
-- RETURNING set into the audit_log INSERT.
WITH cancelled AS (
    UPDATE wallet.listing
       SET status              = 'cancelled',
           settled_at          = COALESCE(settled_at, now()),
           buyer_account       = NULL,
           current_bid         = NULL,
           current_bid_account = NULL,
           current_bid_id      = NULL
     WHERE status = 'active'
       AND item_id IS NULL
    RETURNING id, seller_account
)
INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
SELECT
    'marketplace.legacy_cleanup',
    'listing',
    id::TEXT,
    jsonb_build_object(
        'seller_account', seller_account,
        'migration',      '20260520114243_wallet_inventory_listing_wire',
        'reason',         'pre-inventory-ledger active listing cleared'
    )
FROM cancelled;

-- VALID CHECK: every active listing MUST now carry item_id. Legacy
-- service_create_listing(UUID, JSONB, ...) callers fail loudly on
-- INSERT — that's intentional and forces the 6.1b axum/Astro switch
-- to the *_with_item variants. Pre-existing non-active rows
-- (cancelled / expired / sold) keep item_id NULL untouched.
ALTER TABLE wallet.listing
    ADD CONSTRAINT wallet_listing_active_item_id_chk
        CHECK (status <> 'active' OR item_id IS NOT NULL);

CREATE UNIQUE INDEX wallet_listing_active_item_uq
    ON wallet.listing (item_id)
    WHERE status = 'active' AND item_id IS NOT NULL;

-- Expiry sweep support. service_expire_listings scans
-- (status='active' AND currency='khash' AND expires_at <= now())
-- ORDER BY expires_at, id. The existing wallet_listing_active_expires_idx
-- covers status='active' on expires_at, but a tighter partial index
-- with the id tiebreaker + currency predicate keeps the sweep cheap
-- as marketplace volume grows.
CREATE INDEX IF NOT EXISTS wallet_listing_active_khash_expiry_idx
    ON wallet.listing (expires_at, id)
    WHERE status = 'active'
      AND currency = 'khash'::wallet.currency_kind;

COMMENT ON COLUMN wallet.listing.item_id IS
    'inventory.item.id of the listed row. NULL only allowed on legacy non-active listings; new active listings MUST reference an inventory.item. Active-listing uniqueness ensures one open listing per item.';

-- ---------------------------------------------------------------------------
-- 3. wallet.service_create_listing_with_item
--    New authoritative listing creator. Takes (p_src_item_id, p_qty).
--    p_qty NULL or = src.qty: lock the whole source row.
--    p_qty < src.qty:        split via service_split_for_listing.
--    Stores back-compat item_ref JSONB derived from the inventory row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION wallet.service_create_listing_with_item(
    p_seller_account  UUID,
    p_src_item_id     UUID,
    p_qty             BIGINT,
    p_currency        wallet.currency_kind,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_src         inventory.item%ROWTYPE;
    v_currency    wallet.currency_kind := COALESCE(p_currency, 'khash'::wallet.currency_kind);
    v_now         TIMESTAMPTZ := transaction_timestamp();
    v_existing_id BIGINT;
    v_existing_item_id     UUID;
    v_existing_buy_now     BIGINT;
    v_existing_min_bid     BIGINT;
    v_existing_expires_at  TIMESTAMPTZ;
    v_existing_qty         BIGINT;
    v_listing_id  BIGINT;
    v_listing_qty BIGINT;
    v_listed_id   UUID;
    v_was_split   BOOLEAN := false;
    v_item_ref    JSONB;
BEGIN
    IF p_seller_account IS NULL OR p_src_item_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'seller_account, src_item_id, idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    PERFORM wallet.assert_user_account(p_seller_account);

    IF v_currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'marketplace v1 only supports khash' USING ERRCODE = 'P1010';
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
    IF p_buy_now_price IS NOT NULL AND p_min_bid IS NOT NULL
       AND p_min_bid > p_buy_now_price THEN
        RAISE EXCEPTION 'min_bid cannot exceed buy_now_price' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at IS NULL OR p_expires_at <= v_now THEN
        RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
    END IF;
    -- Upfront max-duration check. Table-level listing_max_duration_chk
    -- enforces the same cap via created_at + 30d, but raising here
    -- surfaces a clean 22023 instead of a raw check_violation.
    IF p_expires_at > v_now + interval '30 days' THEN
        RAISE EXCEPTION 'expires_at exceeds 30-day maximum listing duration'
            USING ERRCODE = '22023';
    END IF;
    IF p_qty IS NOT NULL AND p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    -- Replay with full payload validation. Reusing the same
    -- idempotency_key against different parameters is a caller bug;
    -- surface as P1012 instead of silently aliasing the original row.
    -- wallet_listing_seller_idempotency_uq (lives in the original
    -- 20260514113538_wallet_marketplace_schema migration) serializes
    -- concurrent same-key inserts at the table level.
    --
    -- Source-item check: the listing's item_id is either p_src_item_id
    -- itself (whole-row path) or a split-derived row whose source_ref
    -- ->>'split_from' points back at p_src_item_id (partial path).
    -- Both replay variants must resolve to the originally requested
    -- source.
    SELECT l.id, l.item_id, l.buy_now_price, l.min_bid, l.expires_at,
           COALESCE((l.item_ref ->> 'qty')::BIGINT, 0)
      INTO v_existing_id, v_existing_item_id, v_existing_buy_now,
           v_existing_min_bid, v_existing_expires_at, v_existing_qty
      FROM wallet.listing l
     WHERE l.seller_account = p_seller_account
       AND l.idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
        IF v_existing_buy_now    IS DISTINCT FROM p_buy_now_price
           OR v_existing_min_bid IS DISTINCT FROM p_min_bid
           OR v_existing_expires_at IS DISTINCT FROM p_expires_at THEN
            RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (price/expiry differs)',
                p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
        END IF;
        -- Qty + source-item identity check.
        -- NULL p_qty means "list the whole src row" — replay must point
        -- at the exact source (split-derived rows DON'T satisfy NULL
        -- replay because the original wasn't whole-row).
        -- Non-NULL p_qty (partial split) accepts either direct
        -- src_item_id OR a split-derived row tracing back via
        -- source_ref->>'split_from'.
        IF p_qty IS NULL THEN
            IF v_existing_item_id IS DISTINCT FROM p_src_item_id THEN
                RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (whole-row replay against split listing)',
                    p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
            END IF;
        ELSE
            IF v_existing_item_id IS DISTINCT FROM p_src_item_id
               AND NOT EXISTS (
                   SELECT 1 FROM inventory.item
                    WHERE id = v_existing_item_id
                      AND source_ref ->> 'split_from' = p_src_item_id::text
               ) THEN
                RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (src_item_id differs)',
                    p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
            END IF;
            IF v_existing_qty IS DISTINCT FROM p_qty THEN
                RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (qty differs)',
                    p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
            END IF;
        END IF;
        RETURN v_existing_id;
    END IF;

    -- Lock + validate the source row. We hold the row lock through
    -- both the optional split and the listing INSERT so a concurrent
    -- caller can't race the same source.
    SELECT * INTO v_src
      FROM inventory.item
     WHERE id = p_src_item_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_src_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_src.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller', p_src_item_id USING ERRCODE = 'INV11';
    END IF;
    IF v_src.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state (state=%)',
            p_src_item_id, v_src.state USING ERRCODE = 'INV12';
    END IF;

    -- Decide whole-row vs split. NULL qty or qty matching source =
    -- whole row. Otherwise must split (and src must be stackable +
    -- have strictly more qty than requested).
    IF p_qty IS NULL OR p_qty = v_src.qty THEN
        v_listing_qty := v_src.qty;
        v_listed_id   := v_src.id;
    ELSIF p_qty < v_src.qty THEN
        IF NOT v_src.is_stackable THEN
            RAISE EXCEPTION 'item % is instanced; partial listing not supported',
                p_src_item_id USING ERRCODE = 'INV15';
        END IF;
        v_listed_id := inventory.service_split_for_listing(
            p_seller_account, p_src_item_id, p_qty
        );
        v_listing_qty := p_qty;
        v_was_split := true;
    ELSE
        RAISE EXCEPTION 'qty % exceeds source qty %', p_qty, v_src.qty
            USING ERRCODE = 'INV13';
    END IF;

    -- Back-compat item_ref derived from the listed row.
    v_item_ref := jsonb_build_object(
        'kind',        v_src.kind,
        'id',          v_src.ref,
        'qty',         v_listing_qty,
        'instance_id', v_listed_id::text,
        'nbt',         v_src.nbt
    );

    INSERT INTO wallet.listing (
        seller_account, item_id, item_ref, currency,
        buy_now_price, min_bid, expires_at, idempotency_key
    ) VALUES (
        p_seller_account, v_listed_id, v_item_ref, v_currency,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    ) RETURNING id INTO v_listing_id;

    -- Whole-row path needs the explicit lock RPC. The split path
    -- already flipped the new row to listing_escrow; backfill the
    -- listing_id into source_ref so reconciliation tooling can
    -- traverse split-row escrow → owning listing without a separate
    -- join through wallet.listing.item_id.
    IF NOT v_was_split THEN
        PERFORM inventory.service_listing_lock(p_seller_account, v_listed_id, v_listing_id);
    ELSE
        -- COALESCE in case a future schema relaxation makes
        -- source_ref nullable; today the column is NOT NULL DEFAULT
        -- '{}'::jsonb so the COALESCE is defensive.
        UPDATE inventory.item
           SET source_ref = COALESCE(source_ref, '{}'::jsonb)
                            || jsonb_build_object(
                                   'listing_id',         v_listing_id,
                                   'listing_created_at', v_now
                               ),
               updated_at  = now()
         WHERE id = v_listed_id;
    END IF;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
    VALUES (
        'marketplace.listing_create', 'listing', v_listing_id::TEXT,
        jsonb_build_object(
            'seller_account', p_seller_account,
            'src_item_id',    p_src_item_id,
            'item_id',        v_listed_id,
            'qty',            v_listing_qty,
            'was_split',      v_was_split,
            'buy_now_price',  p_buy_now_price,
            'min_bid',        p_min_bid,
            'expires_at',     p_expires_at
        )
    );

    RETURN v_listing_id;
END;
$$;

ALTER FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO service_role;
COMMENT ON FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'SERVICE marketplace RPC. New authoritative listing creator. Takes (src_item_id, qty); qty NULL or = src.qty locks the whole row, qty < src.qty splits via inventory.service_split_for_listing. Successor to service_create_listing(UUID, JSONB, ...); legacy variant stays for axum/Astro back-compat until Phase 6.1c.';

-- ---------------------------------------------------------------------------
-- 4. public.proxy_market_create_listing_with_item
--    Authenticated wrapper. Enforces inventory.is_2fa_required_for_listing
--    aal2 gate + the high_value_khash_threshold check before calling
--    the wallet service.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proxy_market_create_listing_with_item(
    p_src_item_id     UUID,
    p_qty             BIGINT,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_seller    UUID := private.proxy_market_caller_account();
    v_aal       TEXT := inventory.caller_jwt_aal();
    v_threshold BIGINT;
    v_max_price BIGINT;
BEGIN
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;
    IF p_src_item_id IS NULL THEN
        RAISE EXCEPTION 'src_item_id is required' USING ERRCODE = '22004';
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
    -- Mirror the service-side 30-day cap so the proxy boundary
    -- surfaces a clean error before any service work runs.
    IF p_expires_at > statement_timestamp() + interval '30 days' THEN
        RAISE EXCEPTION 'expires_at exceeds 30-day maximum listing duration'
            USING ERRCODE = '22023';
    END IF;

    -- 2FA gate: if the account opted into require_2fa_for_listing,
    -- the JWT must carry aal=aal2. Don't leak the account UUID into
    -- the error message — caller already knows it's theirs, and the
    -- audit_log row carries the details for support.
    IF inventory.is_2fa_required_for_listing(v_seller)
       AND v_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'mfa_required for listing' USING ERRCODE = 'INV30';
    END IF;

    -- High-value gate. Compare max(buy_now_price, min_bid) against
    -- the configured threshold. threshold = 0 means "not configured".
    SELECT high_value_khash_threshold INTO v_threshold
      FROM inventory.account_security
     WHERE account = v_seller;
    v_threshold := COALESCE(v_threshold, 0);

    IF v_threshold > 0 THEN
        v_max_price := GREATEST(
            COALESCE(p_buy_now_price, 0),
            COALESCE(p_min_bid, 0)
        );
        IF v_max_price >= v_threshold
           AND v_aal IS DISTINCT FROM 'aal2' THEN
            RAISE EXCEPTION 'mfa_required for high-value listing'
                USING ERRCODE = 'INV30';
        END IF;
    END IF;

    RETURN wallet.service_create_listing_with_item(
        v_seller, p_src_item_id, p_qty, 'khash'::wallet.currency_kind,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    );
END;
$$;
ALTER FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'PUBLIC marketplace proxy. Authenticated wrapper for wallet.service_create_listing_with_item. Enforces inventory.is_2fa_required_for_listing aal2 gate and the high_value_khash_threshold gate. p_qty NULL = list whole row; p_qty < src.qty = split-and-list.';

-- ---------------------------------------------------------------------------
-- Legacy proxy_market_create_listing(JSONB, ...) deprecation
--   The legacy proxy from migration 20260516015242 still exists for
--   axum / Astro compile-time. With the new wallet_listing_active_item_id_chk
--   in place, the legacy INSERT would fail with a raw check_violation.
--   Replace the legacy proxy body with a clean P1011 error so callers
--   see "use the *_with_item path" instead of a constraint trip.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proxy_market_create_listing(
    p_item_ref        JSONB,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'legacy listing RPC disabled; use proxy_market_create_listing_with_item'
        USING ERRCODE = 'P1011';
END;
$$;

-- Restate the privilege contract explicitly. CREATE OR REPLACE
-- preserves grants/owner, but for a security-definer public RPC the
-- intent should be visible in this migration.
ALTER FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'DEPRECATED. Phase 6.1a stubbed this proxy to raise P1011 so axum/Astro see a clean migration error during the 6.1b cutover. Dropped entirely in Phase 6.1c.';

NOTIFY pgrst, 'reload schema';

-- migrate:down
-- ============================================================================
-- ⚠ OPERATIONAL WARNING ⚠
-- Rolling back this migration RE-INTRODUCES the stuck-escrow + legacy
-- listing path, removes wallet.listing.item_id, and resurrects the
-- raw check_violation behaviour of the legacy proxy. Hard-gated on
-- the GUC app.allow_marketplace_unsafe_down='on' so a stray dbmate
-- rollback against prod aborts before touching anything. Local test
-- harness opts in via PGOPTIONS — see test-migration.sh.
-- ============================================================================
DO $$
BEGIN
    IF current_setting('app.allow_marketplace_unsafe_down', true)
       IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION
            'refusing destructive marketplace rollback: set app.allow_marketplace_unsafe_down=on to proceed';
    END IF;
END
$$;

-- Hard data guard: never drop item_id while active item-backed
-- listings still exist. Dropping the column would orphan the
-- inventory escrow rows without releasing them. The GUC above
-- gates the rollback; this preflight covers the case where the
-- operator opts in but data isn't ready.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM wallet.listing
         WHERE status = 'active' AND item_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'refusing to drop wallet.listing.item_id: % active item-backed listings still exist; cancel or settle them before rolling back',
            (SELECT count(*) FROM wallet.listing
              WHERE status = 'active' AND item_id IS NOT NULL);
    END IF;
END
$$;

DROP FUNCTION IF EXISTS public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID);

DROP INDEX IF EXISTS wallet.wallet_listing_active_khash_expiry_idx;
DROP INDEX IF EXISTS wallet.wallet_listing_active_item_uq;
ALTER TABLE wallet.listing DROP CONSTRAINT IF EXISTS wallet_listing_active_item_id_chk;
ALTER TABLE wallet.listing DROP COLUMN IF EXISTS item_id;

DROP FUNCTION IF EXISTS inventory.service_split_for_listing(UUID, UUID, BIGINT);

-- Restore the pre-6.1a legacy proxy body so rollback leaves the
-- original public listing path functional rather than stuck at the
-- P1011 stub. Body lifted from 20260516015242_wallet_marketplace_proxies.sql.
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
    v_seller UUID := private.proxy_market_caller_account();
BEGIN
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
GRANT  EXECUTE ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'PUBLIC marketplace proxy. Authenticated create-listing wrapper. Resolves auth.uid() → seller wallet account, then calls wallet.service_create_listing with currency=khash.';

NOTIFY pgrst, 'reload schema';
