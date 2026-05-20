-- Tests for the wallet listing ↔ inventory settle/cancel/expire hooks.

-- SEED
INSERT INTO auth.users (id) VALUES
    ('55555555-5555-5555-5555-555555555555'),
    ('66666666-6666-6666-6666-666666666666')
ON CONFLICT DO NOTHING;

-- ASSERT_AFTER_UP

DO $$
DECLARE
    v_alice UUID;
    v_bob   UUID;
BEGIN
    SELECT id INTO v_alice FROM wallet.account
     WHERE kind = 'user' AND user_id = '55555555-5555-5555-5555-555555555555';
    SELECT id INTO v_bob   FROM wallet.account
     WHERE kind = 'user' AND user_id = '66666666-6666-6666-6666-666666666666';
    PERFORM set_config('test.alice', v_alice::text, false);
    PERFORM set_config('test.bob',   v_bob::text,   false);
END;
$$;

SELECT inventory.service_register_bridge_secret(
    'mc_settle_test',
    'this-is-a-test-secret-that-is-long-enough-32',
    'settle test bridge'
);

-- Helper: deposit a stackable for Alice; returns item id via session var.
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_item UUID;
    v_ref  TEXT := 'settle_test_' || gen_random_uuid()::text;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', v_ref, 32, '{}'::jsonb,
        'mc_settle_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':settle_seed';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('settle_seed_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);
    PERFORM set_config('test.alice_item', v_item::text, false);
END;
$$;

-- T1: cancel a listing releases the item back to held.
DO $$
DECLARE
    v_alice    UUID := current_setting('test.alice')::uuid;
    v_item     UUID := current_setting('test.alice_item')::uuid;
    v_listing  BIGINT;
    v_state    inventory.item_state;
BEGIN
    v_listing := wallet.service_create_listing_with_item(
        v_alice, v_item, NULL, 'khash'::wallet.currency_kind,
        500, NULL, now() + interval '1 hour', gen_random_uuid()
    );
    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'listing_escrow' THEN
        RAISE EXCEPTION 'T1 pre-cancel state=% expected listing_escrow', v_state;
    END IF;

    PERFORM wallet.service_cancel_listing(v_listing, v_alice, 'test_cancel');

    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'held' THEN
        RAISE EXCEPTION 'T1 post-cancel state=% expected held', v_state;
    END IF;
END;
$$;

-- T2: buy-now settle hands the item to the buyer (state=held under buyer).
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_bob   UUID := current_setting('test.bob')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_item UUID;
    v_listing BIGINT;
    v_bid BIGINT;
    v_buyer_holdings INT;
    v_listing_item_state inventory.item_state;
    v_ref TEXT := 'buynow_' || gen_random_uuid()::text;
BEGIN
    -- Fresh held row for Alice.
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', v_ref, 1, '{}'::jsonb,
        'mc_settle_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t2';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('t2_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    -- Credit Bob enough khash to buy-now.
    PERFORM wallet.service_credit(
        v_bob, 'khash'::wallet.currency_kind, 10000,
        'admin'::wallet.source_kind, 'test seed', NULL, NULL,
        gen_random_uuid()
    );

    v_listing := wallet.service_create_listing_with_item(
        v_alice, v_item, NULL, 'khash'::wallet.currency_kind,
        100, NULL, now() + interval '1 hour', gen_random_uuid()
    );

    v_bid := wallet.service_buy_now(v_listing, v_bob, gen_random_uuid());

    -- Seller's row is consumed.
    SELECT state INTO v_listing_item_state FROM inventory.item WHERE id = v_item;
    IF v_listing_item_state <> 'consumed' THEN
        RAISE EXCEPTION 'T2 seller item state=% expected consumed', v_listing_item_state;
    END IF;

    -- Buyer now owns an inventory.item for that ref.
    SELECT count(*)::int INTO v_buyer_holdings
      FROM inventory.item
     WHERE owner_account = v_bob AND ref = v_ref AND state = 'held';
    IF v_buyer_holdings = 0 THEN
        RAISE EXCEPTION 'T2 buyer did not receive item; no held rows for ref=%', v_ref;
    END IF;
END;
$$;

-- T3: expire-no-bid sweep returns the item to the seller as held.
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_item UUID;
    v_listing BIGINT;
    v_state inventory.item_state;
    v_sweep_total BIGINT;
    v_sweep_settled BIGINT;
    v_sweep_expired BIGINT;
    v_ref TEXT := 'expire_' || gen_random_uuid()::text;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', v_ref, 1, '{}'::jsonb,
        'mc_settle_test', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t3';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item := inventory.service_deposit_settle(
        v_req,
        encode(extensions.digest('t3_' || gen_random_uuid()::text, 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    v_listing := wallet.service_create_listing_with_item(
        v_alice, v_item, NULL, 'khash'::wallet.currency_kind,
        500, NULL, now() + interval '1 hour', gen_random_uuid()
    );

    -- Force-expire by backdating both created_at + expires_at so the
    -- duration CHECK (expires_at >= created_at + 1h) stays satisfied.
    UPDATE wallet.listing
       SET created_at = now() - interval '3 hours',
           expires_at = now() - interval '1 second'
     WHERE id = v_listing;

    SELECT total, settled, expired
      INTO v_sweep_total, v_sweep_settled, v_sweep_expired
      FROM wallet.service_expire_listings(100);

    IF v_sweep_expired < 1 THEN
        RAISE EXCEPTION 'T3 expire sweep reported %/%/%; expected at least one expired',
            v_sweep_total, v_sweep_settled, v_sweep_expired;
    END IF;

    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'held' THEN
        RAISE EXCEPTION 'T3 post-expire item state=% expected held', v_state;
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
DECLARE
    v_src text;
BEGIN
    -- Down should restore the legacy bodies (no inventory.service_listing_*
    -- references). Grep prosrc for the call we added.
    SELECT prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'wallet' AND p.proname = 'service_settle_listing'
     LIMIT 1;
    IF v_src LIKE '%inventory.service_listing_settle%' THEN
        RAISE EXCEPTION 'service_settle_listing still calls inventory hook after down';
    END IF;
END;
$$;
