-- Companion test fixtures for 20260516094908_wallet_firecracker_billing.
-- Run via: ./test-migration.sh 20260516094908_wallet_firecracker_billing

-- SEED

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

DROP TABLE IF EXISTS public.__fc_billing_fixture;
CREATE TABLE public.__fc_billing_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__fc_billing_fixture (role, user_id) VALUES
    ('payer', gen_random_uuid()),
    ('broke', gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__fc_billing_fixture;

DO $$
DECLARE
    v_payer_acc UUID;
    v_broke_acc UUID;
BEGIN
    SELECT a.id INTO v_payer_acc
      FROM wallet.account a
      JOIN public.__fc_billing_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'payer';
    SELECT a.id INTO v_broke_acc
      FROM wallet.account a
      JOIN public.__fc_billing_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'broke';

    IF v_payer_acc IS NULL OR v_broke_acc IS NULL THEN
        RAISE EXCEPTION 'fail: fixture wallet accounts were not auto-provisioned';
    END IF;

    UPDATE wallet.balance SET credits = 1000 WHERE account_id = v_payer_acc;
    UPDATE wallet.balance SET credits = 25   WHERE account_id = v_broke_acc;
END;
$$;

-- ASSERT_AFTER_UP

DO $$
DECLARE
    v_payer_acc UUID;
    v_broke_acc UUID;
    v_hold      wallet.firecracker_hold;
    v_total     BIGINT;
    v_existing  wallet.firecracker_hold;
    v_balance   BIGINT;
    v_settle    RECORD;
BEGIN
    SELECT a.id INTO v_payer_acc
      FROM wallet.account a
      JOIN public.__fc_billing_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'payer';
    SELECT a.id INTO v_broke_acc
      FROM wallet.account a
      JOIN public.__fc_billing_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'broke';

    v_hold := wallet.firecracker_place_hold(v_payer_acc, 'fc-vm-aaa', 300);
    IF v_hold.amount <> 300 OR v_hold.account_id <> v_payer_acc THEN
        RAISE EXCEPTION 'fail: place_hold returned wrong row';
    END IF;

    v_total := wallet.firecracker_active_hold_total(v_payer_acc);
    IF v_total <> 300 THEN
        RAISE EXCEPTION 'fail: active_hold_total expected 300 got %', v_total;
    END IF;

    v_existing := wallet.firecracker_place_hold(v_payer_acc, 'fc-vm-aaa', 300);
    IF v_existing.vm_id <> v_hold.vm_id OR v_existing.created_at <> v_hold.created_at THEN
        RAISE EXCEPTION 'fail: place_hold not idempotent on identical payload';
    END IF;

    BEGIN
        PERFORM wallet.firecracker_place_hold(v_payer_acc, 'fc-vm-aaa', 999);
        RAISE EXCEPTION 'fail: mismatched payload should have raised 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;

    PERFORM wallet.firecracker_place_hold(v_payer_acc, 'fc-vm-bbb', 400);
    v_total := wallet.firecracker_active_hold_total(v_payer_acc);
    IF v_total <> 700 THEN
        RAISE EXCEPTION 'fail: active_hold_total expected 700 got %', v_total;
    END IF;

    BEGIN
        PERFORM wallet.firecracker_place_hold(v_payer_acc, 'fc-vm-ccc', 500);
        RAISE EXCEPTION 'fail: over-balance hold should have raised 53100';
    EXCEPTION
        WHEN insufficient_resources THEN
            NULL;
    END;

    SELECT * INTO v_settle FROM wallet.firecracker_settle(
        'fc-vm-aaa', 150, gen_random_uuid(), 'demo settle');
    IF v_settle.status <> 'settled' THEN
        RAISE EXCEPTION 'fail: settle status expected settled got %', v_settle.status;
    END IF;
    IF v_settle.debited_amount <> 150 OR v_settle.reserved_amount <> 300
       OR v_settle.released_amount <> 150 THEN
        RAISE EXCEPTION 'fail: settle amounts mismatched (got debited=%, reserved=%, released=%)',
            v_settle.debited_amount, v_settle.reserved_amount, v_settle.released_amount;
    END IF;
    IF v_settle.ledger_id IS NULL THEN
        RAISE EXCEPTION 'fail: settle ledger_id should be set';
    END IF;
    IF EXISTS (SELECT 1 FROM wallet.firecracker_hold WHERE vm_id = 'fc-vm-aaa') THEN
        RAISE EXCEPTION 'fail: settle did not remove the hold';
    END IF;

    SELECT credits INTO v_balance FROM wallet.balance WHERE account_id = v_payer_acc;
    IF v_balance <> 850 THEN
        RAISE EXCEPTION 'fail: balance expected 850 got %', v_balance;
    END IF;

    v_total := wallet.firecracker_active_hold_total(v_payer_acc);
    IF v_total <> 400 THEN
        RAISE EXCEPTION 'fail: post-settle active_hold_total expected 400 got %', v_total;
    END IF;

    SELECT * INTO v_settle FROM wallet.firecracker_settle(
        'fc-vm-ghost', 100, gen_random_uuid(), NULL);
    IF v_settle.status <> 'already_missing' THEN
        RAISE EXCEPTION 'fail: missing vm_id status expected already_missing got %', v_settle.status;
    END IF;
    IF v_settle.ledger_id IS NOT NULL OR v_settle.debited_amount <> 0 THEN
        RAISE EXCEPTION 'fail: already_missing must report zero amounts';
    END IF;

    SELECT * INTO v_settle FROM wallet.firecracker_settle(
        'fc-vm-bbb', 999_999_999, gen_random_uuid(), NULL);
    IF v_settle.status <> 'settled_capped' THEN
        RAISE EXCEPTION 'fail: overrun settle status expected settled_capped got %', v_settle.status;
    END IF;
    IF v_settle.debited_amount <> 400 OR v_settle.released_amount <> 0 THEN
        RAISE EXCEPTION 'fail: cap-at-hold expected debited=400 got %', v_settle.debited_amount;
    END IF;
    SELECT credits INTO v_balance FROM wallet.balance WHERE account_id = v_payer_acc;
    IF v_balance <> 450 THEN
        RAISE EXCEPTION 'fail: cap-at-hold expected balance 450 got %', v_balance;
    END IF;

    PERFORM wallet.firecracker_place_hold(v_payer_acc, 'fc-vm-mark', 200);
    v_existing := wallet.firecracker_update_watermark('fc-vm-mark', 50);
    IF v_existing.watermark <> 50 THEN
        RAISE EXCEPTION 'fail: watermark expected 50 got %', v_existing.watermark;
    END IF;
    v_existing := wallet.firecracker_update_watermark('fc-vm-mark', 9_999);
    IF v_existing.watermark <> 200 THEN
        RAISE EXCEPTION 'fail: watermark cap expected 200 got %', v_existing.watermark;
    END IF;
    v_existing := wallet.firecracker_update_watermark('fc-vm-mark', 10);
    IF v_existing.watermark <> 200 THEN
        RAISE EXCEPTION 'fail: watermark regressed to %', v_existing.watermark;
    END IF;

    BEGIN
        PERFORM wallet.firecracker_update_watermark('fc-vm-mark', NULL);
        RAISE EXCEPTION 'fail: NULL watermark should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_update_watermark('fc-vm-mark', -1);
        RAISE EXCEPTION 'fail: negative watermark should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_update_watermark('fc-vm-zzz', 1);
        RAISE EXCEPTION 'fail: missing vm_id should raise P0002';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> 'P0002' THEN
                RAISE;
            END IF;
    END;

    v_total := wallet.firecracker_active_hold_total(v_payer_acc);
    IF v_total <> 0 THEN
        RAISE EXCEPTION 'fail: post-watermark active_hold_total expected 0 got %', v_total;
    END IF;

    BEGIN
        PERFORM wallet.firecracker_place_hold(v_broke_acc, 'fc-vm-poor', 100);
        RAISE EXCEPTION 'fail: broke account hold should have raised 53100';
    EXCEPTION
        WHEN insufficient_resources THEN
            NULL;
    END;

    BEGIN
        PERFORM wallet.firecracker_place_hold(v_payer_acc, 'short', 1);
        RAISE EXCEPTION 'fail: short vm_id should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_place_hold(v_payer_acc, repeat('x', 129), 1);
        RAISE EXCEPTION 'fail: oversize vm_id should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN
                RAISE;
            END IF;
    END;

    SELECT * INTO v_settle FROM wallet.firecracker_settle(
        'fc-vm-mark', 0, gen_random_uuid(), NULL);
    IF v_settle.status <> 'released_zero_charge' THEN
        RAISE EXCEPTION 'fail: zero-amount settle status expected released_zero_charge got %', v_settle.status;
    END IF;
    IF v_settle.debited_amount <> 0 OR v_settle.released_amount <> 200
       OR v_settle.ledger_id IS NOT NULL THEN
        RAISE EXCEPTION 'fail: released_zero_charge amounts mismatched';
    END IF;
END;
$$;

DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM wallet.firecracker_hold;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'fail: expected zero holds after cleanup got %', v_count;
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'wallet' AND c.relname = 'firecracker_hold'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.firecracker_hold still exists after rollback';
    END IF;
END;
$$;

DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'firecracker_active_hold_total',
        'firecracker_place_hold',
        'firecracker_settle',
        'firecracker_update_watermark'
    ] LOOP
        IF EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'wallet' AND p.proname = v_fn
        ) THEN
            RAISE EXCEPTION 'fail: function wallet.% still exists after rollback', v_fn;
        END IF;
    END LOOP;
END;
$$;

DROP TABLE IF EXISTS public.__fc_billing_fixture;
