-- Companion test fixtures for 20260709170000_store_topup_pod.
-- Run via: ./test-migration.sh 20260709170000_store_topup_pod
--
-- Locks in: Stripe top-up replay fingerprint + input validation, and the POD
-- atomic-claim / attach-eligibility invariants.
--
-- SEED seeds auth.users (accounts auto-provision) and funds the POD buyer so
-- the physical purchase succeeds. store schema exists (baseline migrations
-- applied before this one).

-- SEED
DROP TABLE IF EXISTS public.__store_topup_pod_fixture;
CREATE TABLE public.__store_topup_pod_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__store_topup_pod_fixture (role, user_id) VALUES
    ('topup_user', gen_random_uuid()),
    ('pod_buyer',  gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__store_topup_pod_fixture;

DO $$
DECLARE
    v_account UUID;
BEGIN
    SELECT id INTO v_account FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';
    PERFORM wallet.service_credit(
        v_account, 'credits'::wallet.currency_kind, 100000,
        'reward'::wallet.source_kind, 'store-pod-test funding',
        NULL, NULL, gen_random_uuid());
END;
$$;

-- ASSERT_AFTER_UP

-- 1. Top-up applies once (credits derived from the server pack), replays
--    idempotently (same event -> same ledger, one row), and a replay naming a
--    different pack fails loudly.
DO $$
DECLARE
    v_user UUID := (SELECT user_id FROM public.__store_topup_pod_fixture WHERE role = 'topup_user');
    v_l1   BIGINT;
    v_l2   BIGINT;
    v_n    INT;
    v_cr   BIGINT;
BEGIN
    v_l1 := store.service_apply_topup(v_user, 'evt_test_1', 'cs_test_1', 'small', 100, 'usd');
    v_l2 := store.service_apply_topup(v_user, 'evt_test_1', 'cs_test_1', 'small', 100, 'usd');
    IF v_l1 IS DISTINCT FROM v_l2 THEN
        RAISE EXCEPTION 'fail: topup replay returned a different ledger id';
    END IF;
    SELECT count(*), max(credits_granted) INTO v_n, v_cr
      FROM store.topup WHERE stripe_event_id = 'evt_test_1';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fail: expected one topup row, got %', v_n;
    END IF;
    -- Credits must be the pack's authoritative value (small = 100), not caller input.
    IF v_cr <> 100 THEN
        RAISE EXCEPTION 'fail: credits_granted % not derived from pack', v_cr;
    END IF;

    -- Same session, different pack (amount matches that pack) -> fingerprint
    -- mismatch (40001).
    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_test_1', 'cs_test_1', 'medium', 500, 'usd');
        RAISE EXCEPTION 'fail: contradictory topup replay was accepted';
    EXCEPTION WHEN sqlstate '40001' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 2. Top-up input validation: fiat regex, positive cents, whitespace event id,
--    unknown pack, and Stripe amount not matching the pack price.
DO $$
DECLARE
    v_user UUID := (SELECT user_id FROM public.__store_topup_pod_fixture WHERE role = 'topup_user');
BEGIN
    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_bad_fiat', 'cs_x', 'small', 100, 'dollars');
        RAISE EXCEPTION 'fail: invalid currency_fiat accepted';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_zero_cents', 'cs_y', 'small', 0, 'usd');
        RAISE EXCEPTION 'fail: zero amount_cents accepted';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

    BEGIN
        PERFORM store.service_apply_topup(v_user, '   ', 'cs_z', 'small', 100, 'usd');
        RAISE EXCEPTION 'fail: whitespace stripe_event_id accepted';
    EXCEPTION WHEN sqlstate '22004' THEN NULL; END;

    -- Unknown pack -> 22023 (never grants).
    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_bad_pack', 'cs_p', 'nonexistent', 100, 'usd');
        RAISE EXCEPTION 'fail: unknown pack accepted';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

    -- Stripe amount not matching the pack price -> 22023 (price tampering).
    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_bad_amt', 'cs_a', 'small', 999, 'usd');
        RAISE EXCEPTION 'fail: mismatched amount_cents accepted';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END;
$$;

-- POD fixtures: a paid physical order for the claim/attach tests.
INSERT INTO store.product (slug, title, price, currency, fulfillment)
VALUES ('test-pod', 'POD Product', 0, 'credits', 'physical')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO store.product_variant (product_id, sku, price)
SELECT product_id, 'SKU-POD', 10 FROM store.product WHERE slug = 'test-pod'
ON CONFLICT (sku) DO NOTHING;

-- 3. POD lease is atomic: the first lease stamps pod_claimed_at + a token, and
--    a second lease of the still-leased order is rejected (55006).
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_claim JSONB;
    v_at    TIMESTAMPTZ;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(
        v_acct, v_var, 1,
        jsonb_build_object('name','P','line1','9 St','city','C','postal_code','9','country','US'),
        gen_random_uuid());

    v_claim := store.service_order_for_pod(v_order, 'worker-1');
    IF (v_claim->>'claim_token') IS NULL THEN
        RAISE EXCEPTION 'fail: lease did not return a claim_token';
    END IF;
    SELECT pod_claimed_at INTO v_at FROM store.order WHERE order_id = v_order;
    IF v_at IS NULL THEN
        RAISE EXCEPTION 'fail: lease did not stamp pod_claimed_at';
    END IF;

    BEGIN
        PERFORM store.service_order_for_pod(v_order, 'worker-2');
        RAISE EXCEPTION 'fail: order was leased for POD twice';
    EXCEPTION WHEN sqlstate '55006' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 4. ack_pod_submission rejects an ineligible (refunded) order.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(
        v_acct, v_var, 1,
        jsonb_build_object('name','R','line1','8 St','city','C','postal_code','8','country','US'),
        gen_random_uuid());
    PERFORM store.service_refund_order(v_order, 'test');

    BEGIN
        PERFORM store.service_ack_pod_submission(v_order, gen_random_uuid(),
            jsonb_build_object('provider','printful','external_order_id','EXT-R'));
        RAISE EXCEPTION 'fail: ack accepted for a refunded order';
    EXCEPTION WHEN sqlstate 'P1001' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 5. External POD order id is unique across local orders (lease + ack each).
DO $$
DECLARE
    v_acct UUID;
    v_var  UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_o1   BIGINT;
    v_o2   BIGINT;
    v_t1   UUID;
    v_t2   UUID;
    v_ref  JSONB := jsonb_build_object('provider','printful','external_order_id','EXT-1');
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_o1 := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','U1','line1','7 St','city','C','postal_code','7','country','US'),
        gen_random_uuid());
    v_o2 := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','U2','line1','6 St','city','C','postal_code','6','country','US'),
        gen_random_uuid());

    v_t1 := (store.service_order_for_pod(v_o1, 'w')->>'claim_token')::uuid;
    v_t2 := (store.service_order_for_pod(v_o2, 'w')->>'claim_token')::uuid;
    PERFORM store.service_ack_pod_submission(v_o1, v_t1, v_ref);
    BEGIN
        PERFORM store.service_ack_pod_submission(v_o2, v_t2, v_ref);
        RAISE EXCEPTION 'fail: same external POD id acked on two orders';
    EXCEPTION WHEN unique_violation THEN
        NULL;  -- expected
    END;
END;
$$;

-- 6. ack requires the current lease token: a stale/wrong token is rejected.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','T','line1','5 St','city','C','postal_code','5','country','US'),
        gen_random_uuid());
    PERFORM store.service_order_for_pod(v_order, 'worker-1');

    BEGIN
        PERFORM store.service_ack_pod_submission(v_order, gen_random_uuid(),
            jsonb_build_object('provider','printful','external_order_id','EXT-2'));
        RAISE EXCEPTION 'fail: ack accepted a stale claim token';
    EXCEPTION WHEN sqlstate '55006' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 7. ack requires a complete provider identity (provider + external_order_id).
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_tok   UUID;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','I','line1','4 St','city','C','postal_code','4','country','US'),
        gen_random_uuid());
    v_tok := (store.service_order_for_pod(v_order, 'w')->>'claim_token')::uuid;

    BEGIN
        PERFORM store.service_ack_pod_submission(v_order, v_tok,
            jsonb_build_object('provider','printful'));
        RAISE EXCEPTION 'fail: ack accepted without external_order_id';
    EXCEPTION WHEN sqlstate '22023' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 8. ACK finalizes the lease: clears the claim token + expiry, stamps
--    pod_submitted_at and the provider identity (claimed_at kept for audit).
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_tok   UUID;
    v_row   store.order%ROWTYPE;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','F','line1','3 St','city','C','postal_code','3','country','US'),
        gen_random_uuid());
    v_tok := (store.service_order_for_pod(v_order, 'w')->>'claim_token')::uuid;
    PERFORM store.service_ack_pod_submission(v_order, v_tok,
        jsonb_build_object('provider','printful','external_order_id','EXT-FIN'));

    SELECT * INTO v_row FROM store.order WHERE order_id = v_order;
    IF v_row.pod_claim_token IS NOT NULL OR v_row.pod_claim_expires_at IS NOT NULL THEN
        RAISE EXCEPTION 'fail: ACK did not clear the lease token/expiry';
    END IF;
    IF v_row.pod_submitted_at IS NULL OR v_row.pod_external_order_id <> 'EXT-FIN'
       OR v_row.pod_claimed_at IS NULL THEN
        RAISE EXCEPTION 'fail: ACK did not finalize the submission';
    END IF;

    -- A finalized order can no longer be re-leased.
    BEGIN
        PERFORM store.service_order_for_pod(v_order, 'w2');
        RAISE EXCEPTION 'fail: re-leased an already-submitted order';
    EXCEPTION WHEN sqlstate '55006' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 9. Atomic POD shipment resolved BY PROVIDER IDENTITY: lease+ack sets the
--    provider id, then the shipment event (routed only by provider+external id)
--    advances the order to shipped; equivalent replay is false; a contradictory
--    replay (different tracking) is 40001; an unknown external id is an orphan.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_tok   UUID;
    v_new   BOOLEAN;
    v_dup   BOOLEAN;
    v_orph  BOOLEAN;
    v_st    store.order_status;
    v_oid   BIGINT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','S','line1','2 St','city','C','postal_code','2','country','US'),
        gen_random_uuid());
    v_tok := (store.service_order_for_pod(v_order, 'w')->>'claim_token')::uuid;
    PERFORM store.service_ack_pod_submission(v_order, v_tok,
        jsonb_build_object('provider','printful','external_order_id','EXT-SHIP'));
    PERFORM store.service_advance_order(v_order, 'processing'::store.order_status, '{}'::jsonb, 'proc');

    -- Routed only by (provider, external id) — no caller order id.
    v_new := store.service_apply_pod_shipment('printful', 'evt_ship_1', 'EXT-SHIP',
        jsonb_build_object('number','1Z'), jsonb_build_object('type','shipped'));
    IF NOT v_new THEN RAISE EXCEPTION 'fail: first shipment event not newly recorded'; END IF;
    SELECT status INTO v_st FROM store.order WHERE order_id = v_order;
    IF v_st <> 'shipped' THEN RAISE EXCEPTION 'fail: order not advanced to shipped (%).', v_st; END IF;
    -- Receipt resolved the correct order internally.
    SELECT order_id INTO v_oid FROM store.pod_webhook_event
     WHERE provider = 'printful' AND provider_event_id = 'evt_ship_1';
    IF v_oid IS DISTINCT FROM v_order THEN
        RAISE EXCEPTION 'fail: shipment receipt resolved wrong order (% vs %)', v_oid, v_order;
    END IF;

    -- Equivalent replay -> false, no error.
    v_dup := store.service_apply_pod_shipment('printful', 'evt_ship_1', 'EXT-SHIP',
        jsonb_build_object('number','1Z'), jsonb_build_object('type','shipped'));
    IF v_dup THEN RAISE EXCEPTION 'fail: replayed shipment event recorded as new'; END IF;

    -- Contradictory replay (same event id, different tracking) -> 40001.
    BEGIN
        PERFORM store.service_apply_pod_shipment('printful', 'evt_ship_1', 'EXT-SHIP',
            jsonb_build_object('number','9Z'), jsonb_build_object('type','shipped'));
        RAISE EXCEPTION 'fail: contradictory shipment replay accepted';
    EXCEPTION WHEN sqlstate '40001' THEN
        NULL;  -- expected
    END;

    -- Unknown external id -> retryable P1001 (no un-reconcilable orphan is
    -- persisted); nothing recorded.
    BEGIN
        PERFORM store.service_apply_pod_shipment('printful', 'evt_orphan_1', 'EXT-UNKNOWN',
            jsonb_build_object('number','7Z'), jsonb_build_object('type','shipped'));
        RAISE EXCEPTION 'fail: unmatched shipment event was accepted';
    EXCEPTION WHEN sqlstate 'P1001' THEN
        NULL;  -- expected (retryable)
    END;
    PERFORM 1 FROM store.pod_webhook_event WHERE provider_event_id = 'evt_orphan_1';
    IF FOUND THEN RAISE EXCEPTION 'fail: unmatched shipment event was persisted'; END IF;
END;
$$;

-- 10. A shipment landing on a still-PAID order is fast-forwarded through BOTH
--     declared transitions (paid->processing->shipped) as two order_events, so
--     the lifecycle audit trail is never skipped.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_tok   UUID;
    v_st    store.order_status;
    v_proc  INT;
    v_ship  INT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','FF','line1','1 St','city','C','postal_code','1','country','US'),
        gen_random_uuid());
    v_tok := (store.service_order_for_pod(v_order, 'w')->>'claim_token')::uuid;
    -- ACK sets the provider identity but leaves the order in 'paid' (no advance).
    PERFORM store.service_ack_pod_submission(v_order, v_tok,
        jsonb_build_object('provider','printful','external_order_id','EXT-FF'));
    SELECT status INTO v_st FROM store.order WHERE order_id = v_order;
    IF v_st <> 'paid' THEN RAISE EXCEPTION 'fail: order not still paid pre-shipment (%).', v_st; END IF;

    PERFORM store.service_apply_pod_shipment('printful', 'evt_ff_1', 'EXT-FF',
        jsonb_build_object('number','2Z'), jsonb_build_object('type','shipped'));

    SELECT status INTO v_st FROM store.order WHERE order_id = v_order;
    IF v_st <> 'shipped' THEN RAISE EXCEPTION 'fail: paid order not advanced to shipped (%).', v_st; END IF;

    SELECT count(*) INTO v_proc FROM store.order_event
     WHERE order_id = v_order AND from_status = 'paid' AND to_status = 'processing';
    SELECT count(*) INTO v_ship FROM store.order_event
     WHERE order_id = v_order AND from_status = 'processing' AND to_status = 'shipped';
    IF v_proc <> 1 OR v_ship <> 1 THEN
        RAISE EXCEPTION 'fail: fast-forward audit trail missing (paid->processing=%, processing->shipped=%)',
            v_proc, v_ship;
    END IF;
END;
$$;

-- 11. Two DISTINCT Stripe events for one Checkout Session credit exactly once:
--     the session-level dedupe returns the first event's ledger and never inserts
--     a second topup row (so one physical session = one credit).
DO $$
DECLARE
    v_user UUID := (SELECT user_id FROM public.__store_topup_pod_fixture WHERE role = 'topup_user');
    v_l1   BIGINT;
    v_l2   BIGINT;
    v_n    INT;
BEGIN
    v_l1 := store.service_apply_topup(v_user, 'evt_share_a', 'cs_share', 'small', 100, 'usd');
    v_l2 := store.service_apply_topup(v_user, 'evt_share_b', 'cs_share', 'small', 100, 'usd');
    IF v_l1 IS DISTINCT FROM v_l2 THEN
        RAISE EXCEPTION 'fail: distinct events on one session split into ledgers % / %', v_l1, v_l2;
    END IF;
    SELECT count(*) INTO v_n FROM store.topup WHERE stripe_session_id = 'cs_share';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fail: session credited % topup rows, expected 1', v_n;
    END IF;
END;
$$;

-- 12. service_update_pod_status merges status/metadata without touching the
--     order lifecycle, rejects a provider-identity change, and refuses an order
--     with no prior submission.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_bare  BIGINT;
    v_tok   UUID;
    v_row   store.order%ROWTYPE;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','UP','line1','0 St','city','C','postal_code','0','country','US'),
        gen_random_uuid());
    v_tok := (store.service_order_for_pod(v_order, 'w')->>'claim_token')::uuid;
    PERFORM store.service_ack_pod_submission(v_order, v_tok,
        jsonb_build_object('provider','printful','external_order_id','EXT-UPD'));

    PERFORM store.service_update_pod_status(v_order,
        jsonb_build_object('status','in_transit','tracking_url','http://x/1'));
    SELECT * INTO v_row FROM store.order WHERE order_id = v_order;
    IF v_row.pod_status <> 'in_transit' THEN
        RAISE EXCEPTION 'fail: pod_status not merged (%).', v_row.pod_status;
    END IF;
    IF v_row.pod_ref->>'tracking_url' <> 'http://x/1' THEN
        RAISE EXCEPTION 'fail: pod_ref metadata not shallow-merged';
    END IF;
    -- Lifecycle status is untouched by a POD metadata update (still shipped-or-earlier).
    IF v_row.status NOT IN ('paid', 'processing') THEN
        RAISE EXCEPTION 'fail: update_pod_status changed the order lifecycle (%).', v_row.status;
    END IF;

    -- Changing the provider identity via this path is rejected.
    BEGIN
        PERFORM store.service_update_pod_status(v_order,
            jsonb_build_object('external_order_id','EXT-OTHER'));
        RAISE EXCEPTION 'fail: provider identity mutated via update_pod_status';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

    -- An order with no prior submission cannot be status-updated.
    v_bare := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','NB','line1','A St','city','C','postal_code','A','country','US'),
        gen_random_uuid());
    BEGIN
        PERFORM store.service_update_pod_status(v_bare, jsonb_build_object('status','x'));
        RAISE EXCEPTION 'fail: status update accepted for an unsubmitted order';
    EXCEPTION WHEN sqlstate 'P1001' THEN NULL; END;
END;
$$;

-- ASSERT_AFTER_DOWN

-- Down drops the topup table + POD columns; store.order itself survives.
DO $$
BEGIN
    IF to_regclass('store.topup') IS NOT NULL THEN
        RAISE EXCEPTION 'fail: store.topup survived rollback';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'store' AND table_name = 'order'
                  AND column_name = 'pod_ref') THEN
        RAISE EXCEPTION 'fail: store.order.pod_ref survived rollback';
    END IF;
    IF to_regclass('store.order') IS NULL THEN
        RAISE EXCEPTION 'fail: store.order was dropped by topup_pod rollback';
    END IF;
END;
$$;
