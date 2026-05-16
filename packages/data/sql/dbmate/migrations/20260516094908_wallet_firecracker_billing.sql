-- migrate:up

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
REVOKE ALL ON FUNCTION wallet.firecracker_active_hold_total(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.firecracker_active_hold_total(UUID) TO service_role;
ALTER FUNCTION wallet.firecracker_active_hold_total(UUID) OWNER TO service_role;

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
REVOKE ALL ON FUNCTION wallet.firecracker_place_hold(UUID, TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.firecracker_place_hold(UUID, TEXT, BIGINT) TO service_role;
ALTER FUNCTION wallet.firecracker_place_hold(UUID, TEXT, BIGINT) OWNER TO service_role;

COMMENT ON FUNCTION wallet.firecracker_place_hold(UUID, TEXT, BIGINT) IS
    'Idempotent on (vm_id, account_id, amount). Performs an optimistic vm_id replay check before locking for cheap network retries; first-time placement then serializes by account advisory lock, balance row lock, and INSERT ... ON CONFLICT (vm_id) DO NOTHING (the loser re-reads and verifies payload). Mismatch on reuse raises 40001. Shortfall against (balance - active_holds) raises 53100 BEFORE inserting.';

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
REVOKE ALL ON FUNCTION wallet.firecracker_settle(TEXT, BIGINT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.firecracker_settle(TEXT, BIGINT, UUID, TEXT) TO service_role;
ALTER FUNCTION wallet.firecracker_settle(TEXT, BIGINT, UUID, TEXT) OWNER TO service_role;

COMMENT ON FUNCTION wallet.firecracker_settle(TEXT, BIGINT, UUID, TEXT) IS
    'Returns a structured row. status in (settled, settled_capped, released_zero_charge, already_missing). settled_capped fires when p_final_amount > hold.amount — the function still debits the full hold but surfaces the metering overrun for ops. Lock order: initial hold lookup discovers account_id, then wallet.lock_account(account_id) is the account-level serialization boundary before hold lock FOR UPDATE, debit, ledger insert, and hold delete. Idempotency: while the hold exists, wallet.service_debit dedups on p_idempotency_key via replay_fingerprint. After a successful settle the hold is deleted; retries with the same key return already_missing with ledger_id=NULL — callers needing receipt replay must persist the first response.';

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
REVOKE ALL ON FUNCTION wallet.firecracker_update_watermark(TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.firecracker_update_watermark(TEXT, BIGINT) TO service_role;
ALTER FUNCTION wallet.firecracker_update_watermark(TEXT, BIGINT) OWNER TO service_role;

COMMENT ON FUNCTION wallet.firecracker_update_watermark(TEXT, BIGINT) IS
    'Monotonic — supplied watermark replaces the stored one only when larger, then clamps to [0, amount]. NULL / negative inputs raise 22023. Missing vm_id raises P0002 (no_data_found).';

-- migrate:down

DROP FUNCTION IF EXISTS wallet.firecracker_update_watermark(TEXT, BIGINT);
DROP FUNCTION IF EXISTS wallet.firecracker_settle(TEXT, BIGINT, UUID, TEXT);
DROP FUNCTION IF EXISTS wallet.firecracker_place_hold(UUID, TEXT, BIGINT);
DROP FUNCTION IF EXISTS wallet.firecracker_active_hold_total(UUID);
DROP TABLE IF EXISTS wallet.firecracker_hold;
