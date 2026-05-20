-- Tests for wallet ↔ inventory listing wire foundation.

-- SEED
INSERT INTO auth.users (id) VALUES
    ('33333333-3333-3333-3333-333333333333'),
    ('44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

-- ASSERT_AFTER_UP

DO $$
DECLARE
    v_alice UUID;
    v_bob   UUID;
BEGIN
    SELECT id INTO v_alice FROM wallet.account
     WHERE kind = 'user' AND user_id = '33333333-3333-3333-3333-333333333333';
    SELECT id INTO v_bob   FROM wallet.account
     WHERE kind = 'user' AND user_id = '44444444-4444-4444-4444-444444444444';
    PERFORM set_config('test.alice', v_alice::text, false);
    PERFORM set_config('test.bob',   v_bob::text,   false);
END;
$$;

SELECT inventory.service_register_bridge_secret(
    'mc_listing_test',
    'this-is-a-test-secret-that-is-long-enough-32',
    'listing test bridge'
);

-- Deposit a stackable 64-row for Alice. Use random ref per test run to
-- avoid stackable-merge accumulation across re-runs (6.0 schema persists
-- between dbmate test-migration invocations).
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_item UUID;
    v_ref  TEXT := 'oak_planks_' || gen_random_uuid()::text;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', v_ref, 64, '{}'::jsonb,
        'mc_listing_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':listing_test_stack';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('listing_test_stack_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);
    PERFORM set_config('test.alice_stack_item', v_item::text, false);
END;
$$;

-- T1: service_split_for_listing happy path — 64 split into src=48 + escrow=16.
DO $$
DECLARE
    v_alice    UUID := current_setting('test.alice')::uuid;
    v_src      UUID := current_setting('test.alice_stack_item')::uuid;
    v_new      UUID;
    v_src_qty  BIGINT;
    v_new_qty  BIGINT;
    v_new_state inventory.item_state;
BEGIN
    v_new := inventory.service_split_for_listing(v_alice, v_src, 16);
    SELECT qty INTO v_src_qty FROM inventory.item WHERE id = v_src;
    SELECT qty, state INTO v_new_qty, v_new_state FROM inventory.item WHERE id = v_new;
    IF v_src_qty <> 48 THEN
        RAISE EXCEPTION 'T1 source qty=% expected 48', v_src_qty;
    END IF;
    IF v_new_qty <> 16 THEN
        RAISE EXCEPTION 'T1 new qty=% expected 16', v_new_qty;
    END IF;
    IF v_new_state <> 'listing_escrow' THEN
        RAISE EXCEPTION 'T1 new state=% expected listing_escrow', v_new_state;
    END IF;
END;
$$;

-- T2: split rejects whole-row.
DO $$
DECLARE
    v_alice  UUID := current_setting('test.alice')::uuid;
    v_src    UUID := current_setting('test.alice_stack_item')::uuid;
    v_caught BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM inventory.service_split_for_listing(v_alice, v_src, 48);
    EXCEPTION WHEN SQLSTATE 'INV13' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T2 whole-row split did not raise INV13';
    END IF;
END;
$$;

-- T3: split rejects instanced item.
DO $$
DECLARE
    v_alice  UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req    BIGINT; v_item UUID; v_caught BOOLEAN := false;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', 'enchanted_pickaxe', 1,
        jsonb_build_object('enchants', jsonb_build_array(jsonb_build_object('id','efficiency','level',5))),
        'mc_listing_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':instanced';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('instanced_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    BEGIN
        PERFORM inventory.service_split_for_listing(v_alice, v_item, 1);
    EXCEPTION WHEN SQLSTATE 'INV15' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T3 instanced split did not raise INV15';
    END IF;
END;
$$;

-- T4: wallet.listing.item_id required for status='active'.
DO $$
DECLARE
    v_alice  UUID := current_setting('test.alice')::uuid;
    v_caught BOOLEAN := false;
BEGIN
    BEGIN
        INSERT INTO wallet.listing (
            seller_account, item_ref, currency,
            buy_now_price, expires_at, idempotency_key
        ) VALUES (
            v_alice,
            jsonb_build_object('kind','mc_item','id','no_inv'),
            'khash', 100, now() + interval '1 hour', gen_random_uuid()
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T4 active listing without item_id was accepted';
    END IF;
END;
$$;

-- T5: service_create_listing_with_item, whole-row path — locks the entire row.
DO $$
DECLARE
    v_alice    UUID := current_setting('test.alice')::uuid;
    v_secret   TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req      BIGINT; v_item UUID; v_listing BIGINT;
    v_state    inventory.item_state;
    v_listing_item UUID;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', 't5_diamond_sword', 1,
        jsonb_build_object('enchants', jsonb_build_array(jsonb_build_object('id','sharpness','level',3))),
        'mc_listing_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t5';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('t5_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    v_listing := wallet.service_create_listing_with_item(
        v_alice, v_item, NULL, 'khash'::wallet.currency_kind,
        500, NULL, now() + interval '1 hour', gen_random_uuid()
    );
    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'listing_escrow' THEN
        RAISE EXCEPTION 'T5 whole-row item not in listing_escrow (state=%)', v_state;
    END IF;
    SELECT item_id INTO v_listing_item FROM wallet.listing WHERE id = v_listing;
    IF v_listing_item <> v_item THEN
        RAISE EXCEPTION 'T5 listing.item_id mismatch';
    END IF;
END;
$$;

-- T6: service_create_listing_with_item, split path — listing references new escrow row.
DO $$
DECLARE
    v_alice    UUID := current_setting('test.alice')::uuid;
    v_src      UUID := current_setting('test.alice_stack_item')::uuid;
    v_listing  BIGINT;
    v_src_state inventory.item_state;
    v_src_qty   BIGINT;
    v_listing_item UUID;
    v_listing_qty BIGINT;
    v_listing_state inventory.item_state;
BEGIN
    -- src currently has 48 after T1's split.
    v_listing := wallet.service_create_listing_with_item(
        v_alice, v_src, 10, 'khash'::wallet.currency_kind,
        200, NULL, now() + interval '1 hour', gen_random_uuid()
    );
    SELECT state, qty INTO v_src_state, v_src_qty FROM inventory.item WHERE id = v_src;
    IF v_src_state <> 'held' OR v_src_qty <> 38 THEN
        RAISE EXCEPTION 'T6 source state/qty=%/%; expected held/38', v_src_state, v_src_qty;
    END IF;
    SELECT item_id INTO v_listing_item FROM wallet.listing WHERE id = v_listing;
    SELECT state, qty INTO v_listing_state, v_listing_qty FROM inventory.item WHERE id = v_listing_item;
    IF v_listing_state <> 'listing_escrow' OR v_listing_qty <> 10 THEN
        RAISE EXCEPTION 'T6 listing item state/qty=%/%; expected listing_escrow/10',
            v_listing_state, v_listing_qty;
    END IF;
END;
$$;

-- T7: cross-owner listing refused.
DO $$
DECLARE
    v_bob    UUID := current_setting('test.bob')::uuid;
    v_src    UUID := current_setting('test.alice_stack_item')::uuid;
    v_caught BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM wallet.service_create_listing_with_item(
            v_bob, v_src, NULL, 'khash'::wallet.currency_kind,
            100, NULL, now() + interval '1 hour', gen_random_uuid()
        );
    EXCEPTION WHEN SQLSTATE 'INV11' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T7 cross-owner listing did not raise INV11';
    END IF;
END;
$$;

-- T8: aal2 gate via proxy_market_create_listing_with_item.
DO $$
DECLARE
    v_alice    UUID := current_setting('test.alice')::uuid;
    v_secret   TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req      BIGINT; v_item UUID; v_caught BOOLEAN := false;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', 't8_listing', 1, '{}'::jsonb,
        'mc_listing_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t8';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('t8_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    PERFORM inventory.service_set_security_policy(v_alice, false, true, 0);

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333',
                           'aal', 'aal1')::text,
        true);
    BEGIN
        PERFORM public.proxy_market_create_listing_with_item(
            v_item, NULL, 100, NULL, now() + interval '1 hour', gen_random_uuid()
        );
    EXCEPTION WHEN SQLSTATE 'INV30' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T8 aal1 bypassed listing 2FA';
    END IF;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333',
                           'aal', 'aal2')::text,
        true);
    PERFORM public.proxy_market_create_listing_with_item(
        v_item, NULL, 100, NULL, now() + interval '1 hour', gen_random_uuid()
    );

    PERFORM inventory.service_set_security_policy(v_alice, false, false, 0);
    PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

-- T9: high_value_khash_threshold gate.
DO $$
DECLARE
    v_alice    UUID := current_setting('test.alice')::uuid;
    v_secret   TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req      BIGINT; v_item UUID; v_caught BOOLEAN := false;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', 't9_highvalue', 1, '{}'::jsonb,
        'mc_listing_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t9';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('t9_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    PERFORM inventory.service_set_security_policy(v_alice, false, false, 1000);

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333',
                           'aal', 'aal1')::text,
        true);
    BEGIN
        PERFORM public.proxy_market_create_listing_with_item(
            v_item, NULL, 1500, NULL, now() + interval '1 hour', gen_random_uuid()
        );
    EXCEPTION WHEN SQLSTATE 'INV30' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T9 high-value listing bypassed aal2 gate';
    END IF;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333',
                           'aal', 'aal2')::text,
        true);
    PERFORM public.proxy_market_create_listing_with_item(
        v_item, NULL, 1500, NULL, now() + interval '1 hour', gen_random_uuid()
    );

    PERFORM inventory.service_set_security_policy(v_alice, false, false, 0);
    PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
         WHERE attrelid = 'wallet.listing'::regclass
           AND attname = 'item_id'
           AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'wallet.listing.item_id still present after down';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'inventory' AND p.proname = 'service_split_for_listing'
    ) THEN
        RAISE EXCEPTION 'inventory.service_split_for_listing still present after down';
    END IF;
END;
$$;
