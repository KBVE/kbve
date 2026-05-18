-- Tests for the inventory schema migration.
-- Sections (matching test-migration.sh): SEED, ASSERT_AFTER_UP, ASSERT_AFTER_DOWN

-- SEED
-- Seed auth.users; wallet trigger provisions wallet.account.
INSERT INTO auth.users (id) VALUES
    ('11111111-1111-1111-1111-111111111111'),
    ('22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- ASSERT_AFTER_UP

-- Resolve test account ids.
DO $$
DECLARE
    v_alice UUID;
    v_bob   UUID;
BEGIN
    SELECT id INTO v_alice FROM wallet.account
     WHERE kind = 'user' AND user_id = '11111111-1111-1111-1111-111111111111';
    SELECT id INTO v_bob   FROM wallet.account
     WHERE kind = 'user' AND user_id = '22222222-2222-2222-2222-222222222222';
    PERFORM set_config('test.alice', v_alice::text, false);
    PERFORM set_config('test.bob',   v_bob::text,   false);
END;
$$;

-- Register bridge secret.
SELECT inventory.service_register_bridge_secret(
    'mc_test_server',
    'this-is-a-test-secret-that-is-long-enough-32',
    'mc test server'
);

-- T1: stackable deposit merges
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_req1  BIGINT;
    v_req2  BIGINT;
    v_item1 UUID;
    v_item2 UUID;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_payload TEXT;
    v_sig TEXT;
    v_payload_hash TEXT;
BEGIN
    v_req1 := inventory.service_deposit_begin(v_alice, 'mc_item', 'cobblestone', 16, '{}'::jsonb, 'mc_test_server', jsonb_build_object('slot', 0), gen_random_uuid());
    v_payload := 'deposit:' || v_req1::text || ':hash_a';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item1 := inventory.service_deposit_settle(v_req1, encode(extensions.digest('hash_a', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);

    v_req2 := inventory.service_deposit_begin(v_alice, 'mc_item', 'cobblestone', 16, '{}'::jsonb, 'mc_test_server', jsonb_build_object('slot', 1), gen_random_uuid());
    v_payload := 'deposit:' || v_req2::text || ':hash_b';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item2 := inventory.service_deposit_settle(v_req2, encode(extensions.digest('hash_b', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);

    IF v_item1 <> v_item2 THEN
        RAISE EXCEPTION 'T1 stackable deposits did not merge';
    END IF;
    IF (SELECT qty FROM inventory.item WHERE id = v_item1) <> 32 THEN
        RAISE EXCEPTION 'T1 merged qty != 32';
    END IF;
END;
$$;

-- T2: instanced (nbt set) does NOT merge
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_req1 BIGINT; v_req2 BIGINT; v_item1 UUID; v_item2 UUID;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_nbt JSONB := jsonb_build_object('enchants', jsonb_build_array(jsonb_build_object('id','sharpness','level',5)));
BEGIN
    v_req1 := inventory.service_deposit_begin(v_alice, 'mc_item', 'diamond_sword', 1, v_nbt, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req1::text || ':hash_c';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item1 := inventory.service_deposit_settle(v_req1, encode(extensions.digest('hash_c', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);

    v_req2 := inventory.service_deposit_begin(v_alice, 'mc_item', 'diamond_sword', 1, v_nbt, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req2::text || ':hash_d';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item2 := inventory.service_deposit_settle(v_req2, encode(extensions.digest('hash_d', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);

    IF v_item1 = v_item2 THEN
        RAISE EXCEPTION 'T2 instanced deposits merged unexpectedly';
    END IF;
END;
$$;

-- T3: idempotent settle returns same id
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_req BIGINT; v_item1 UUID; v_item2 UUID;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
BEGIN
    v_req := inventory.service_deposit_begin(v_alice, 'mc_item', 'iron_ingot', 5, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':hash_e';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_item1 := inventory.service_deposit_settle(v_req, encode(extensions.digest('hash_e', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);
    v_item2 := inventory.service_deposit_settle(v_req, encode(extensions.digest('hash_e', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);
    IF v_item1 <> v_item2 THEN
        RAISE EXCEPTION 'T3 replay settle returned different ids';
    END IF;
END;
$$;

-- T4: HMAC rejection (right payload_sha256, wrong secret)
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_req BIGINT; v_caught BOOLEAN := false;
    v_payload TEXT := 'deposit:bad:payload';
    v_sha TEXT := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_bogus_sig TEXT := encode(extensions.hmac(v_payload::bytea, 'wrong-secret-but-long-enough-32-chars'::bytea, 'sha256'), 'hex');
BEGIN
    v_req := inventory.service_deposit_begin(v_alice, 'mc_item', 'oak_log', 1, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    BEGIN
        PERFORM inventory.service_deposit_settle(v_req, encode(extensions.digest('hash_bad', 'sha256'), 'hex'), 'wrong-secret-but-long-enough-32-chars', v_bogus_sig, v_sha, v_payload);
    EXCEPTION WHEN SQLSTATE 'INV06' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T4 bad HMAC did not raise';
    END IF;
END;
$$;

-- T4b: payload_sha256 mismatch
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_req BIGINT; v_caught BOOLEAN := false;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_payload TEXT := 'right:payload';
    v_wrong_sha TEXT := encode(extensions.digest('different', 'sha256'), 'hex');
    v_sig TEXT := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
BEGIN
    v_req := inventory.service_deposit_begin(v_alice, 'mc_item', 'oak_log', 1, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    BEGIN
        PERFORM inventory.service_deposit_settle(v_req, encode(extensions.digest('hash_mismatch_sha', 'sha256'), 'hex'), v_secret, v_sig, v_wrong_sha, v_payload);
    EXCEPTION WHEN SQLSTATE 'INV07' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T4b payload_sha256 mismatch did not raise';
    END IF;
END;
$$;

-- T5: partial withdraw splits stackable row
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_item UUID; v_held BIGINT; v_transit BIGINT;
BEGIN
    SELECT id INTO v_item FROM inventory.item
     WHERE owner_account = v_alice AND ref = 'cobblestone' AND state = 'held';
    PERFORM inventory.service_withdraw_begin(v_alice, v_item, 10, 'mc_test_server', '{}'::jsonb, gen_random_uuid());

    SELECT qty INTO v_held FROM inventory.item WHERE id = v_item;
    IF v_held <> 22 THEN
        RAISE EXCEPTION 'T5 original row qty=% (expected 22)', v_held;
    END IF;

    SELECT qty INTO v_transit FROM inventory.item
     WHERE owner_account = v_alice AND ref = 'cobblestone' AND state = 'transit_out';
    IF v_transit <> 10 THEN
        RAISE EXCEPTION 'T5 transit_out qty=% (expected 10)', v_transit;
    END IF;
END;
$$;

-- T6: listing lock + unlock
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_item UUID; v_state inventory.item_state;
BEGIN
    SELECT id INTO v_item FROM inventory.item
     WHERE owner_account = v_alice AND ref = 'diamond_sword' AND state = 'held'
     LIMIT 1;

    PERFORM inventory.service_listing_lock(v_alice, v_item, 9001);
    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'listing_escrow' THEN RAISE EXCEPTION 'T6 lock failed'; END IF;

    PERFORM inventory.service_listing_unlock(v_alice, v_item, 9001, 'test_cancel');
    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'held' THEN RAISE EXCEPTION 'T6 unlock failed'; END IF;
END;
$$;

-- T7: listing settle transfers ownership
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_bob   UUID := current_setting('test.bob')::uuid;
    v_item UUID; v_buyer_id UUID; v_state inventory.item_state; v_owner UUID;
BEGIN
    SELECT id INTO v_item FROM inventory.item
     WHERE owner_account = v_alice AND ref = 'diamond_sword' AND state = 'held'
     LIMIT 1;

    PERFORM inventory.service_listing_lock(v_alice, v_item, 9002);
    v_buyer_id := inventory.service_listing_settle(v_alice, v_item, 9002, v_bob);

    SELECT state INTO v_state FROM inventory.item WHERE id = v_item;
    IF v_state <> 'consumed' THEN RAISE EXCEPTION 'T7 seller side not consumed'; END IF;

    SELECT state, owner_account INTO v_state, v_owner FROM inventory.item WHERE id = v_buyer_id;
    IF v_state <> 'held' OR v_owner <> v_bob THEN
        RAISE EXCEPTION 'T7 buyer side wrong state/owner (state=%, owner=%)', v_state, v_owner;
    END IF;
END;
$$;

-- T8: receipt cross-collision
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req_a BIGINT; v_req_b BIGINT;
    v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_caught BOOLEAN := false;
BEGIN
    v_req_a := inventory.service_deposit_begin(v_alice, 'mc_item', 'redstone', 1, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_req_b := inventory.service_deposit_begin(v_alice, 'mc_item', 'redstone', 1, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());

    v_payload := 'deposit:' || v_req_a::text || ':hash_shared';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    PERFORM inventory.service_deposit_settle(v_req_a, encode(extensions.digest('hash_shared', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);

    BEGIN
        v_payload := 'deposit:' || v_req_b::text || ':hash_shared';
        v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
        v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
        PERFORM inventory.service_deposit_settle(v_req_b, encode(extensions.digest('hash_shared', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);
    EXCEPTION WHEN SQLSTATE 'INV03' THEN
        v_caught := true;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'T8 cross-receipt collision did not raise';
    END IF;
END;
$$;

-- T9: 2FA gate blocks withdraw when aal != aal2
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_item UUID;
    v_caught BOOLEAN := false;
BEGIN
    PERFORM inventory.service_set_security_policy(v_alice, true, false, 0);

    SELECT id INTO v_item FROM inventory.item
     WHERE owner_account = v_alice AND ref = 'cobblestone' AND state = 'held';

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111',
                           'aal', 'aal1', 'jti', 'aal1-session-1')::text,
        true);

    BEGIN
        PERFORM public.proxy_inventory_request_withdraw(v_item, 1, 'mc_test_server', gen_random_uuid());
    EXCEPTION WHEN SQLSTATE 'INV30' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T9 aal1 session bypassed 2FA gate';
    END IF;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111',
                           'aal', 'aal2', 'jti', 'aal2-session-1')::text,
        true);
    PERFORM public.proxy_inventory_request_withdraw(v_item, 1, 'mc_test_server', gen_random_uuid());

    PERFORM inventory.service_set_security_policy(v_alice, false, false, 0);
    PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

-- T11: listing settle merges stackable buyer-side instead of inserting duplicate
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_bob   UUID := current_setting('test.bob')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT; v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_alice_item UUID; v_bob_item UUID; v_settled UUID;
    v_bob_qty_before BIGINT; v_bob_qty_after BIGINT;
BEGIN
    -- Bob already holds a stackable cobblestone row from T1.
    SELECT id, qty INTO v_bob_item, v_bob_qty_before
      FROM inventory.item
     WHERE owner_account = v_bob AND ref = 'cobblestone' AND state = 'held' AND nbt = '{}'::jsonb;

    -- If bob has no cobblestone yet, prime him.
    IF v_bob_item IS NULL THEN
        v_req := inventory.service_deposit_begin(v_bob, 'mc_item', 'cobblestone', 4, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
        v_payload := 'deposit:' || v_req::text || ':hash_bob_prime';
        v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
        v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
        v_bob_item := inventory.service_deposit_settle(v_req, encode(extensions.digest('hash_bob_prime', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);
        v_bob_qty_before := 4;
    END IF;

    -- Alice deposits new cobblestone, locks for a listing, settle to bob.
    v_req := inventory.service_deposit_begin(v_alice, 'mc_item', 'cobblestone', 7, '{}'::jsonb, 'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':hash_alice_settle';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_alice_item := inventory.service_deposit_settle(v_req, encode(extensions.digest('hash_alice_settle', 'sha256'), 'hex'), v_secret, v_sig, v_payload_hash, v_payload);

    -- Alice's deposit merged into her existing stackable row; pick her current cobblestone row.
    SELECT id INTO v_alice_item
      FROM inventory.item
     WHERE owner_account = v_alice AND ref = 'cobblestone' AND state = 'held' AND nbt = '{}'::jsonb;

    -- For the test, lock the whole row to listing_escrow. Real wallets would
    -- split via the same path used by withdraw_begin, but lock-the-whole-row
    -- is enough to exercise the merge.
    PERFORM inventory.service_listing_lock(v_alice, v_alice_item, 9100);

    v_settled := inventory.service_listing_settle(v_alice, v_alice_item, 9100, v_bob);

    -- The bob row id should be unchanged (merged into existing).
    IF v_settled <> v_bob_item THEN
        RAISE EXCEPTION 'T11 stackable merge did not collapse into existing buyer row (settled=%, expected=%)',
            v_settled, v_bob_item;
    END IF;

    SELECT qty INTO v_bob_qty_after FROM inventory.item WHERE id = v_bob_item;
    IF v_bob_qty_after <= v_bob_qty_before THEN
        RAISE EXCEPTION 'T11 buyer qty did not grow (before=%, after=%)', v_bob_qty_before, v_bob_qty_after;
    END IF;
END;
$$;

-- T10: disabling 2FA policy itself requires aal2
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_caught BOOLEAN := false;
BEGIN
    PERFORM inventory.service_set_security_policy(v_alice, true, false, 0);

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111',
                           'aal', 'aal1')::text,
        true);
    BEGIN
        PERFORM public.proxy_inventory_set_security_policy(false, false, 0);
    EXCEPTION WHEN SQLSTATE 'INV30' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T10 aal1 disabled 2FA policy without challenge';
    END IF;

    PERFORM inventory.service_set_security_policy(v_alice, false, false, 0);
    PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

-- T14: deposit idempotency_key reuse with mismatched qty raises INV08
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_key   UUID := gen_random_uuid();
    v_caught BOOLEAN := false;
BEGIN
    PERFORM inventory.service_deposit_begin(
        v_alice, 'mc_item', 'gold_ingot', 8, '{}'::jsonb,
        'mc_test_server', '{}'::jsonb, v_key);
    BEGIN
        PERFORM inventory.service_deposit_begin(
            v_alice, 'mc_item', 'gold_ingot', 9, '{}'::jsonb,
            'mc_test_server', '{}'::jsonb, v_key);
    EXCEPTION WHEN SQLSTATE 'INV08' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T14 idempotency_key reuse with mismatched qty did not raise INV08';
    END IF;
END;
$$;

-- T15: withdraw replay (post-split) returns the same bridge_request_id
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT; v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_seed_item UUID; v_key UUID := gen_random_uuid();
    v_id1 BIGINT; v_id2 BIGINT;
BEGIN
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', 'lapis_lazuli', 30, '{}'::jsonb,
        'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t15_seed';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    v_seed_item := inventory.service_deposit_settle(
        v_req, encode(extensions.digest('t15_seed', 'sha256'), 'hex'),
        v_secret, v_sig, v_payload_hash, v_payload);

    v_id1 := inventory.service_withdraw_begin(
        v_alice, v_seed_item, 5, 'mc_test_server', '{}'::jsonb, v_key);
    -- Replay with same key: should return same bridge_request id even
    -- though the item passed in was the parent stack (now split).
    v_id2 := inventory.service_withdraw_begin(
        v_alice, v_seed_item, 5, 'mc_test_server', '{}'::jsonb, v_key);

    IF v_id1 <> v_id2 THEN
        RAISE EXCEPTION 'T15 withdraw replay returned different bridge ids (% vs %)',
            v_id1, v_id2;
    END IF;
END;
$$;

-- T16: listing_unlock merge that would overflow buyer-side qty raises INV16
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_huge_item UUID; v_listing_item UUID;
    v_caught BOOLEAN := false;
BEGIN
    -- Seed a near-overflow held row by direct service-role insert.
    INSERT INTO inventory.item (owner_account, kind, ref, qty, nbt, state, source, source_ref)
    VALUES (v_alice, 'mc_item', 't16_overflow', 9223372036854774500,
            '{}'::jsonb, 'held', 'test_seed', '{}'::jsonb)
    RETURNING id INTO v_huge_item;

    -- Seed a second stackable row in listing_escrow that would push the
    -- merged total past the 9223372036854775000 ceiling.
    INSERT INTO inventory.item (owner_account, kind, ref, qty, nbt, state, source, source_ref)
    VALUES (v_alice, 'mc_item', 't16_overflow', 1000,
            '{}'::jsonb, 'listing_escrow', 'test_seed', '{}'::jsonb)
    RETURNING id INTO v_listing_item;

    BEGIN
        PERFORM inventory.service_listing_unlock(v_alice, v_listing_item, 9999, 'test_overflow');
    EXCEPTION WHEN SQLSTATE 'INV16' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T16 listing_unlock overflow did not raise INV16';
    END IF;
END;
$$;

-- T17: deposit_settle into a near-overflow stackable raises INV16
--      via the race-safe ON CONFLICT WHERE clause.
DO $$
DECLARE
    v_alice UUID := current_setting('test.alice')::uuid;
    v_secret TEXT := 'this-is-a-test-secret-that-is-long-enough-32';
    v_req BIGINT; v_payload TEXT; v_sig TEXT; v_payload_hash TEXT;
    v_caught BOOLEAN := false;
BEGIN
    -- Seed a near-ceiling held row directly.
    INSERT INTO inventory.item (owner_account, kind, ref, qty, nbt, state, source, source_ref)
    VALUES (v_alice, 'mc_item', 't17_brim', 9223372036854774500,
            '{}'::jsonb, 'held', 'test_seed', '{}'::jsonb);

    -- Open and try to settle a deposit that would push past the ceiling.
    v_req := inventory.service_deposit_begin(
        v_alice, 'mc_item', 't17_brim', 1000, '{}'::jsonb,
        'mc_test_server', '{}'::jsonb, gen_random_uuid());
    v_payload := 'deposit:' || v_req::text || ':t17_overflow';
    v_sig := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
    v_payload_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    BEGIN
        PERFORM inventory.service_deposit_settle(
            v_req,
            encode(extensions.digest('t17_overflow', 'sha256'), 'hex'),
            v_secret, v_sig, v_payload_hash, v_payload);
    EXCEPTION WHEN SQLSTATE 'INV16' THEN
        v_caught := true;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'T17 deposit overflow did not raise INV16';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

-- Schema should be gone after rollback.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'inventory') THEN
        RAISE EXCEPTION 'inventory schema still present after down migration';
    END IF;
END;
$$;
