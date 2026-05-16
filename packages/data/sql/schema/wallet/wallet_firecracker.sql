-- ============================================================================
-- WALLET FIRECRACKER — pre-flight hold + settle for fc-ctl session billing
--
-- Reference mirror of dbmate migrations:
--   20260516094907_wallet_source_kind_firecracker.sql  (enum value add)
--   20260516094908_wallet_firecracker_billing.sql      (table + functions)
--
-- Hand-authored review surface — do not run directly. Promote changes via a
-- new dbmate migration under ../../dbmate/migrations/.
--
-- Lifecycle (issue #11048):
--   1. fc-ctl /fc/deploy calls firecracker_place_hold(account, vm_id, max_cost).
--      Hold is a soft reservation; wallet.balance is untouched. Insufficient
--      balance raises SQLSTATE 53100.
--   2. fc-ctl accumulates billing::meter_tick in memory (Phase B, PR #11055).
--   3. Any teardown path calls firecracker_settle(vm_id, accumulated,
--      idempotency_key, reason). LEAST(accumulated, hold.amount) flows
--      through wallet.service_debit; the hold row is then deleted. Returns
--      a structured row with status + amounts for observability.
--
-- Idempotency contract:
--   * place_hold     idempotent on (vm_id, account_id, amount). Mismatch → 40001.
--   * settle         idempotent on idempotency_key (service_debit guards
--                    payload via replay_fingerprint). Missing vm_id →
--                    status='already_missing' with zeroed amounts.
--   * update_watermark monotonic — never regresses. Missing vm_id → P0002.
-- ============================================================================

CREATE TABLE wallet.firecracker_hold (
    vm_id           TEXT PRIMARY KEY CHECK (length(vm_id) BETWEEN 8 AND 128),
    account_id      UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    amount          BIGINT NOT NULL CHECK (amount > 0),
    watermark       BIGINT NOT NULL DEFAULT 0 CHECK (watermark >= 0 AND watermark <= amount),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX firecracker_hold_account_cover_idx
    ON wallet.firecracker_hold(account_id)
    INCLUDE (amount, watermark);

COMMENT ON TABLE wallet.firecracker_hold IS
    'Pre-flight credit reservation for a live firecracker VM/endpoint session. Removed on settle. updated_at tracks the last watermark mutation; idempotent place_hold replays do not bump it.';

CREATE OR REPLACE FUNCTION wallet.firecracker_active_hold_total(p_account_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT COALESCE(SUM(amount - watermark), 0)::BIGINT
    FROM wallet.firecracker_hold
    WHERE account_id = p_account_id;
$$;

CREATE OR REPLACE FUNCTION wallet.firecracker_place_hold(
    p_account_id    UUID,
    p_vm_id         TEXT,
    p_amount        BIGINT
)
RETURNS wallet.firecracker_hold
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_balance   BIGINT;
    v_holds     BIGINT;
    v_row       wallet.firecracker_hold;
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_vm_id IS NULL OR length(p_vm_id) NOT BETWEEN 8 AND 128 THEN
        RAISE EXCEPTION 'vm_id must be 8-128 chars' USING ERRCODE = '22023';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'hold amount must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_row FROM wallet.firecracker_hold WHERE vm_id = p_vm_id;
    IF FOUND THEN
        IF v_row.account_id <> p_account_id OR v_row.amount <> p_amount THEN
            RAISE EXCEPTION
                'vm_id reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row;
    END IF;

    PERFORM wallet.lock_account(p_account_id);

    SELECT credits INTO v_balance FROM wallet.balance
        WHERE account_id = p_account_id FOR UPDATE;
    IF v_balance IS NULL THEN
        RAISE EXCEPTION 'no balance row for account %', p_account_id
            USING ERRCODE = '23503';
    END IF;

    v_holds := wallet.firecracker_active_hold_total(p_account_id);

    IF (v_balance - v_holds) < p_amount THEN
        RAISE EXCEPTION
            'insufficient credits: balance=%, active_holds=%, needed=%',
            v_balance, v_holds, p_amount
            USING ERRCODE = '53100';
    END IF;

    INSERT INTO wallet.firecracker_hold (vm_id, account_id, amount)
    VALUES (p_vm_id, p_account_id, p_amount)
    ON CONFLICT (vm_id) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.vm_id IS NULL THEN
        SELECT * INTO v_row FROM wallet.firecracker_hold WHERE vm_id = p_vm_id;
        IF v_row.account_id <> p_account_id OR v_row.amount <> p_amount THEN
            RAISE EXCEPTION
                'vm_id reused with different payload'
                USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION wallet.firecracker_settle(
    p_vm_id             TEXT,
    p_final_amount      BIGINT,
    p_idempotency_key   UUID,
    p_reason            TEXT DEFAULT NULL
)
RETURNS TABLE (
    status              TEXT,
    ledger_id           BIGINT,
    account_id          UUID,
    reserved_amount     BIGINT,
    debited_amount      BIGINT,
    released_amount     BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account   UUID;
    v_hold      wallet.firecracker_hold;
    v_debit     BIGINT;
    v_release   BIGINT;
    v_ledger    BIGINT := NULL;
    v_status    TEXT;
BEGIN
    IF p_vm_id IS NULL OR length(p_vm_id) NOT BETWEEN 8 AND 128 THEN
        RAISE EXCEPTION 'vm_id must be 8-128 chars' USING ERRCODE = '22023';
    END IF;
    IF p_final_amount IS NULL OR p_final_amount < 0 THEN
        RAISE EXCEPTION 'final_amount must be >= 0' USING ERRCODE = '22023';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;

    SELECT h.account_id INTO v_account
    FROM wallet.firecracker_hold h
    WHERE h.vm_id = p_vm_id;

    IF v_account IS NULL THEN
        status := 'already_missing';
        ledger_id := NULL;
        account_id := NULL;
        reserved_amount := 0;
        debited_amount := 0;
        released_amount := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    PERFORM wallet.lock_account(v_account);

    SELECT * INTO v_hold FROM wallet.firecracker_hold WHERE vm_id = p_vm_id FOR UPDATE;
    IF NOT FOUND THEN
        status := 'already_missing';
        ledger_id := NULL;
        account_id := v_account;
        reserved_amount := 0;
        debited_amount := 0;
        released_amount := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    v_debit := LEAST(p_final_amount, v_hold.amount);
    v_release := v_hold.amount - v_debit;

    IF v_debit > 0 THEN
        v_ledger := wallet.service_debit(
            v_hold.account_id,
            'credits',
            v_debit,
            'firecracker_session',
            p_reason,
            'firecracker',
            NULL,
            p_idempotency_key
        );
        IF p_final_amount > v_hold.amount THEN
            v_status := 'settled_capped';
        ELSE
            v_status := 'settled';
        END IF;
    ELSE
        v_status := 'released_zero_charge';
    END IF;

    DELETE FROM wallet.firecracker_hold WHERE vm_id = p_vm_id;

    status := v_status;
    ledger_id := v_ledger;
    account_id := v_hold.account_id;
    reserved_amount := v_hold.amount;
    debited_amount := v_debit;
    released_amount := v_release;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION wallet.firecracker_update_watermark(
    p_vm_id     TEXT,
    p_watermark BIGINT
)
RETURNS wallet.firecracker_hold
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_row wallet.firecracker_hold;
BEGIN
    IF p_vm_id IS NULL OR length(p_vm_id) NOT BETWEEN 8 AND 128 THEN
        RAISE EXCEPTION 'vm_id must be 8-128 chars' USING ERRCODE = '22023';
    END IF;
    IF p_watermark IS NULL OR p_watermark < 0 THEN
        RAISE EXCEPTION 'watermark must be >= 0' USING ERRCODE = '22023';
    END IF;

    UPDATE wallet.firecracker_hold
       SET watermark  = LEAST(GREATEST(watermark, p_watermark), amount),
           updated_at = statement_timestamp()
     WHERE vm_id = p_vm_id
    RETURNING * INTO v_row;

    IF v_row.vm_id IS NULL THEN
        RAISE EXCEPTION 'firecracker hold not found for vm_id %', p_vm_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_row;
END;
$$;
