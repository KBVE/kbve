-- migrate:up

-- Read surface for the "what did I buy / what do I own" dashboard pages, plus
-- the receipt snapshots that surface needs to be honest.
--
-- A digital buy writes store.purchase + inventory.item and NEVER a
-- store."order" row (only store.service_buy_physical writes those), so:
--   1. digital receipts had no read proxy at all — an account could own items,
--      have been charged, and still read an empty order history;
--   2. store.purchase recorded no presentation fields, so a read had to join
--      store.product LIVE. store.product.title is mutable (only slug is
--      trigger-immutable), so renaming a product would silently rewrite
--      historical receipts. store."order" already snapshots these columns;
--      store.purchase now matches that contract;
--   3. the physical-order proxy existed but returned only ids and totals,
--      hiding the snapshots store."order" already stored — a client could
--      render "Order #12" and nothing about WHAT was bought.
--
-- Inventory needs nothing here: public.proxy_inventory_list_held already
-- covers the caller's held + listing_escrow rows.

-- ---------------------------------------------------------------------------
-- 1. Receipt snapshots on store.purchase. Added nullable, backfilled from the
--    catalog (the best available source for rows written before this), then
--    pinned NOT NULL so every future receipt carries its own copy.
-- ---------------------------------------------------------------------------
ALTER TABLE store.purchase
    ADD COLUMN IF NOT EXISTS product_slug  TEXT,
    ADD COLUMN IF NOT EXISTS product_title TEXT;

-- IF NOT EXISTS matches on NAME only: a column left by a previous partial
-- deployment could be the wrong type and would be silently accepted. Fail loud
-- instead of building the snapshot contract on unknown state.
DO $$
DECLARE
    v_bad TEXT;
BEGIN
    SELECT string_agg(column_name || ' is ' || data_type, ', ')
      INTO v_bad
      FROM information_schema.columns
     WHERE table_schema = 'store' AND table_name = 'purchase'
       AND column_name IN ('product_slug', 'product_title')
       AND data_type <> 'text';
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'purchase snapshot columns have unexpected types: %', v_bad
            USING ERRCODE = '42804';
    END IF;
END;
$$;

UPDATE store.purchase pu
   SET product_slug  = COALESCE(pu.product_slug, pr.slug),
       product_title = COALESCE(pu.product_title, pr.title)
  FROM store.product pr
 WHERE pr.product_id = pu.product_id
   AND (pu.product_slug IS NULL OR pu.product_title IS NULL);

-- Preflight the NOT NULL so a failure names the cause instead of surfacing a
-- bare not-null violation. purchase.product_id is a NO ACTION FK and
-- product.slug/title are NOT NULL, so this should be unreachable — which is
-- exactly why an unreachable-but-tripped assertion is worth reading.
DO $$
DECLARE
    v_unpopulated BIGINT;
    v_orphans     BIGINT;
BEGIN
    SELECT count(*) INTO v_unpopulated
      FROM store.purchase
     WHERE product_slug IS NULL OR product_title IS NULL;

    IF v_unpopulated > 0 THEN
        SELECT count(*) INTO v_orphans
          FROM store.purchase pu
          LEFT JOIN store.product pr ON pr.product_id = pu.product_id
         WHERE pr.product_id IS NULL;
        RAISE EXCEPTION
            'cannot enforce purchase receipt snapshots: % rows unpopulated (% of them orphaned from store.product)',
            v_unpopulated, v_orphans
            USING ERRCODE = '23502';
    END IF;
END;
$$;

ALTER TABLE store.purchase
    ALTER COLUMN product_slug  SET NOT NULL,
    ALTER COLUMN product_title SET NOT NULL;

-- purchase_id DESC belongs in the index, not just the ORDER BY: the keyset
-- cursor breaks created_at ties on purchase_id, and two receipts share a
-- timestamp whenever one statement writes both. The old two-column index is a
-- prefix of this one, so it is redundant once this exists.
--
-- Build the replacement BEFORE dropping the old one so pagination is never
-- unindexed. No IF NOT EXISTS on the CREATE: that checks the name, not the
-- column list, so a stale index squatting this temporary name would be renamed
-- into place as though it were correct. Dropping the temporary name first is
-- safe because the migration is transactional and the live two-column index
-- stays until the new one is built.
DROP INDEX IF EXISTS store.store_purchase_account_created_id_idx;
CREATE INDEX store_purchase_account_created_id_idx
    ON store.purchase (account_id, created_at DESC, purchase_id DESC);
DROP INDEX IF EXISTS store.store_purchase_account_created_idx;
ALTER INDEX store.store_purchase_account_created_id_idx
    RENAME TO store_purchase_account_created_idx;

-- ---------------------------------------------------------------------------
-- 2. Populate the snapshots on write. v_product is already in scope; this is
--    the same inline-snapshot approach service_buy_physical uses.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION store.service_buy(
    p_account         UUID,
    p_slug            TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_product         store.product%ROWTYPE;
    v_existing        UUID;
    v_receipt_product UUID;
    v_receipt_item    UUID;
    v_ledger_id       BIGINT;
    v_item_id         UUID;
    v_charged         BIGINT := 0;
    v_result_kind     TEXT := 'minted';
    v_inserted        INTEGER;
BEGIN
    IF p_account IS NULL OR p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, slug and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    -- Two advisory locks in a canonical order (key BEFORE slug — same order in
    -- every call, so no deadlock). The key lock serializes concurrent requests
    -- sharing an idempotency_key even across different products, so the durable
    -- receipt is authoritative. The slug lock serializes same-product buys so the
    -- one-copy ownership guard is race-safe. Both held for the txn; the unique
    -- indexes are backstops.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy.key:' || p_account::text || ':' || p_idempotency_key::text, 0)
    );
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy:' || p_account::text || ':' || p_slug, 0)
    );

    -- Resolve the product by slug at ANY status: a durable replay must return
    -- the recorded item even after the product was hidden/retired. Only a fresh
    -- purchase (below) requires an active product.
    SELECT * INTO v_product
      FROM store.product
     WHERE slug = p_slug;
    IF v_product.product_id IS NULL THEN
        RAISE EXCEPTION 'store product % not found', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Durable key idempotency: a recorded receipt returns the same item
    -- without re-charging, even if the item was later sold/transferred/
    -- consumed or the product was retired. Reusing a key for a DIFFERENT
    -- product is rejected. Checked BEFORE the active-status gate.
    SELECT product_id, item_id INTO v_receipt_product, v_receipt_item
      FROM store.purchase
     WHERE account_id = p_account AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_receipt_product <> v_product.product_id THEN
            RAISE EXCEPTION 'idempotency_key reused for a different product'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_receipt_item;
    END IF;

    -- A NEW purchase requires an active product.
    IF v_product.status <> 'active' THEN
        RAISE EXCEPTION 'store product % not active', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Dupe guard: one copy per account. held or escrowed both count as owned.
    SELECT id INTO v_existing
      FROM inventory.item
     WHERE owner_account = p_account
       AND kind = 'store_product'
       AND ref = p_slug
       AND state IN ('held', 'listing_escrow')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        -- Already owned: no debit, no mint. Recorded as a zero-charge
        -- 'already_owned' result so the receipt never misrepresents the catalog
        -- price as an amount paid.
        v_item_id     := v_existing;
        v_result_kind := 'already_owned';
        v_charged     := 0;
    ELSE
        -- Free products (price 0) skip the debit: wallet.service_debit rejects
        -- non-positive amounts. Paid products debit authoritatively.
        IF v_product.price > 0 THEN
            v_ledger_id := wallet.service_debit(
                p_account,
                v_product.currency,
                v_product.price,
                'purchase'::wallet.source_kind,
                'store purchase: ' || v_product.slug,
                'store_product:' || v_product.slug,
                NULL,
                p_idempotency_key
            );
            v_charged := v_product.price;
        END IF;

        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            p_account, 'store_product', v_product.slug, 1,
            jsonb_build_object(
                'product_id', v_product.product_id,
                'title',      v_product.title,
                'asset_ref',  v_product.asset_ref
            ),
            'held', 'store',
            jsonb_build_object(
                'product_id', v_product.product_id,
                'slug',       v_product.slug,
                'ledger_id',  v_ledger_id
            )
        )
        RETURNING id INTO v_item_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (
            v_item_id, 'transit_in', 'held', 'store', 'store_purchase',
            jsonb_build_object(
                'product_id', v_product.product_id,
                'slug',       v_product.slug,
                'price',      v_product.price,
                'currency',   v_product.currency,
                'free',       (v_product.price = 0),
                'ledger_id',  v_ledger_id
            )
        );
    END IF;

    -- Record the durable receipt for this key (both fresh-mint and
    -- already-owned paths), so a later replay returns this exact item. price is
    -- the amount actually charged, not the catalog price.
    INSERT INTO store.purchase (
        account_id, product_id, item_id, product_slug, product_title,
        price, currency, ledger_id, result_kind, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, v_item_id,
        v_product.slug, v_product.title, v_charged,
        v_product.currency, v_ledger_id, v_result_kind, p_idempotency_key
    )
    ON CONFLICT (account_id, idempotency_key) DO NOTHING;

    -- The key advisory lock plus the receipt lookup above mean a conflict here
    -- should be unreachable from this function. If one happens anyway (a direct
    -- write, or a caller that skipped the lock), do not swallow it silently:
    -- confirm the existing receipt agrees with what this call just did, and
    -- fail as a serialization error when it does not. A benign duplicate — same
    -- product, same item — stays quiet, so the happy path is unchanged.
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
        SELECT product_id, item_id
          INTO STRICT v_receipt_product, v_receipt_item
          FROM store.purchase
         WHERE account_id = p_account AND idempotency_key = p_idempotency_key;
        IF v_receipt_product <> v_product.product_id
           OR v_receipt_item <> v_item_id THEN
            RAISE EXCEPTION
                'purchase receipt conflict after serialized buy (recorded product %, item %; this call product %, item %)',
                v_receipt_product, v_receipt_item, v_product.product_id, v_item_id
                USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN v_item_id;
END;
$$;
-- ---------------------------------------------------------------------------
-- 3. Digital receipts. Mirrors proxy_store_my_orders_readonly: caller-scoped,
--    keyset-paginated, STABLE SECURITY DEFINER with a pinned empty search_path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proxy_store_my_purchases_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    purchase_id BIGINT,
    product_id  UUID,
    slug        TEXT,
    title       TEXT,
    item_id     UUID,
    price       BIGINT,
    currency    TEXT,
    result_kind TEXT,
    ledger_id   BIGINT,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
    v_limit   INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT pu.purchase_id, pu.product_id, pu.product_slug, pu.product_title,
           pu.item_id, pu.price, pu.currency::text, pu.result_kind::text,
           pu.ledger_id, pu.created_at
      FROM store.purchase pu
     WHERE pu.account_id = v_account
       AND (p_before_created_at IS NULL
            OR pu.created_at < p_before_created_at
            OR (pu.created_at = p_before_created_at AND pu.purchase_id < p_before_id))
     ORDER BY pu.created_at DESC, pu.purchase_id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) ROWS 50;
ALTER FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
REVOKE ALL ON FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'PUBLIC store proxy. Caller-scoped (auth.uid()) digital purchase receipts, newest first. Complements proxy_store_my_orders_readonly, which only covers physical/both orders.';

-- ---------------------------------------------------------------------------
-- 4. Order snapshots. DROP + CREATE rather than CREATE OR REPLACE: the
--    RETURNS TABLE signature changes, and Postgres refuses to replace a
--    function's return type.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT);

CREATE FUNCTION public.proxy_store_my_orders_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    order_id       BIGINT,
    product_id     UUID,
    variant_id     UUID,
    qty            BIGINT,
    product_slug   TEXT,
    product_title  TEXT,
    variant_sku    TEXT,
    unit_price     BIGINT,
    currency       TEXT,
    fulfillment    TEXT,
    credits_amount BIGINT,
    status         store.order_status,
    tracking       JSONB,
    created_at     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
    v_limit   INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT o.order_id, o.product_id, o.variant_id, o.qty,
           o.product_slug, o.product_title, o.variant_sku, o.unit_price,
           o.currency::text, o.fulfillment::text, o.credits_amount,
           o.status, o.tracking, o.created_at, o.updated_at
      FROM store.order o
     WHERE o.account_id = v_account
       AND (p_before_created_at IS NULL
            OR o.created_at < p_before_created_at
            OR (o.created_at = p_before_created_at AND o.order_id < p_before_id))
     ORDER BY o.created_at DESC, o.order_id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) ROWS 50;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
REVOKE ALL ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'PUBLIC store proxy. Caller-scoped (auth.uid()) physical/both order history, newest first. product_slug / product_title / variant_sku / unit_price / currency / fulfillment are immutable buy-time snapshots, not live catalog reads.';


-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT);

-- store.service_buy is restored to the pre-snapshot INSERT further below; the
-- snapshot columns are dropped last so that restore cannot reference them.

-- Restore the pre-snapshot order proxy verbatim.
DROP FUNCTION IF EXISTS public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT);

CREATE FUNCTION public.proxy_store_my_orders_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    order_id       BIGINT,
    product_id     UUID,
    variant_id     UUID,
    qty            BIGINT,
    credits_amount BIGINT,
    status         store.order_status,
    tracking       JSONB,
    created_at     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
    v_limit   INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT o.order_id, o.product_id, o.variant_id, o.qty, o.credits_amount,
           o.status, o.tracking, o.created_at, o.updated_at
      FROM store.order o
     WHERE o.account_id = v_account
       AND (p_before_created_at IS NULL
            OR o.created_at < p_before_created_at
            OR (o.created_at = p_before_created_at AND o.order_id < p_before_id))
     ORDER BY o.created_at DESC, o.order_id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) ROWS 50;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
REVOKE ALL ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;

-- Restore the pre-snapshot store.service_buy INSERT.
CREATE OR REPLACE FUNCTION store.service_buy(
    p_account         UUID,
    p_slug            TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_product         store.product%ROWTYPE;
    v_existing        UUID;
    v_receipt_product UUID;
    v_receipt_item    UUID;
    v_ledger_id       BIGINT;
    v_item_id         UUID;
    v_charged         BIGINT := 0;
    v_result_kind     TEXT := 'minted';
BEGIN
    IF p_account IS NULL OR p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, slug and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    -- Two advisory locks in a canonical order (key BEFORE slug — same order in
    -- every call, so no deadlock). The key lock serializes concurrent requests
    -- sharing an idempotency_key even across different products, so the durable
    -- receipt is authoritative. The slug lock serializes same-product buys so the
    -- one-copy ownership guard is race-safe. Both held for the txn; the unique
    -- indexes are backstops.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy.key:' || p_account::text || ':' || p_idempotency_key::text, 0)
    );
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy:' || p_account::text || ':' || p_slug, 0)
    );

    -- Resolve the product by slug at ANY status: a durable replay must return
    -- the recorded item even after the product was hidden/retired. Only a fresh
    -- purchase (below) requires an active product.
    SELECT * INTO v_product
      FROM store.product
     WHERE slug = p_slug;
    IF v_product.product_id IS NULL THEN
        RAISE EXCEPTION 'store product % not found', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Durable key idempotency: a recorded receipt returns the same item
    -- without re-charging, even if the item was later sold/transferred/
    -- consumed or the product was retired. Reusing a key for a DIFFERENT
    -- product is rejected. Checked BEFORE the active-status gate.
    SELECT product_id, item_id INTO v_receipt_product, v_receipt_item
      FROM store.purchase
     WHERE account_id = p_account AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_receipt_product <> v_product.product_id THEN
            RAISE EXCEPTION 'idempotency_key reused for a different product'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_receipt_item;
    END IF;

    -- A NEW purchase requires an active product.
    IF v_product.status <> 'active' THEN
        RAISE EXCEPTION 'store product % not active', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Dupe guard: one copy per account. held or escrowed both count as owned.
    SELECT id INTO v_existing
      FROM inventory.item
     WHERE owner_account = p_account
       AND kind = 'store_product'
       AND ref = p_slug
       AND state IN ('held', 'listing_escrow')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        -- Already owned: no debit, no mint. Recorded as a zero-charge
        -- 'already_owned' result so the receipt never misrepresents the catalog
        -- price as an amount paid.
        v_item_id     := v_existing;
        v_result_kind := 'already_owned';
        v_charged     := 0;
    ELSE
        -- Free products (price 0) skip the debit: wallet.service_debit rejects
        -- non-positive amounts. Paid products debit authoritatively.
        IF v_product.price > 0 THEN
            v_ledger_id := wallet.service_debit(
                p_account,
                v_product.currency,
                v_product.price,
                'purchase'::wallet.source_kind,
                'store purchase: ' || v_product.slug,
                'store_product:' || v_product.slug,
                NULL,
                p_idempotency_key
            );
            v_charged := v_product.price;
        END IF;

        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            p_account, 'store_product', v_product.slug, 1,
            jsonb_build_object(
                'product_id', v_product.product_id,
                'title',      v_product.title,
                'asset_ref',  v_product.asset_ref
            ),
            'held', 'store',
            jsonb_build_object(
                'product_id', v_product.product_id,
                'slug',       v_product.slug,
                'ledger_id',  v_ledger_id
            )
        )
        RETURNING id INTO v_item_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (
            v_item_id, 'transit_in', 'held', 'store', 'store_purchase',
            jsonb_build_object(
                'product_id', v_product.product_id,
                'slug',       v_product.slug,
                'price',      v_product.price,
                'currency',   v_product.currency,
                'free',       (v_product.price = 0),
                'ledger_id',  v_ledger_id
            )
        );
    END IF;

    -- Record the durable receipt for this key (both fresh-mint and
    -- already-owned paths), so a later replay returns this exact item. price is
    -- the amount actually charged, not the catalog price.
    INSERT INTO store.purchase (
        account_id, product_id, item_id, price, currency, ledger_id, result_kind, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, v_item_id, v_charged,
        v_product.currency, v_ledger_id, v_result_kind, p_idempotency_key
    )
    ON CONFLICT (account_id, idempotency_key) DO NOTHING;

    RETURN v_item_id;
END;
$$;

-- Restore the two-column keyset index.
DROP INDEX IF EXISTS store.store_purchase_account_created_idx;
CREATE INDEX store_purchase_account_created_idx
    ON store.purchase (account_id, created_at DESC);

-- Columns last: the restored service_buy above must no longer reference them.
ALTER TABLE store.purchase
    DROP COLUMN IF EXISTS product_title,
    DROP COLUMN IF EXISTS product_slug;
