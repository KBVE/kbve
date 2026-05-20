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

-- ============================================================================
-- DEPLOYMENT HISTORY — append-only journal for /fc/deploy
--
-- Mirror of dbmate migration 20260519121254_wallet_firecracker_deployment_history.
-- ============================================================================

CREATE TABLE wallet.firecracker_deployment (
    id                  BIGSERIAL PRIMARY KEY,
    vm_id               TEXT NOT NULL CHECK (
        length(vm_id) BETWEEN 8 AND 128
        AND vm_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
    account_id          UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    rootfs              TEXT NOT NULL CHECK (
        length(rootfs) BETWEEN 1 AND 64
        AND rootfs ~ '^[a-z0-9][a-z0-9._/-]*$'
        AND rootfs NOT LIKE '%..%'
        AND rootfs NOT LIKE '%//%'
    ),
    entrypoint          TEXT NOT NULL CHECK (
        length(entrypoint) BETWEEN 1 AND 128
        AND entrypoint ~ '^[A-Za-z0-9/][A-Za-z0-9._:/-]*$'
        AND entrypoint NOT LIKE '%..%'
        AND entrypoint NOT LIKE '%//%'
    ),
    http_port           INTEGER NOT NULL CHECK (http_port BETWEEN 1 AND 65535),
    visibility          TEXT NOT NULL CHECK (visibility IN ('staff', 'public')),
    vcpu_count          SMALLINT NOT NULL CHECK (vcpu_count BETWEEN 1 AND 16),
    mem_size_mib        INTEGER NOT NULL CHECK (mem_size_mib BETWEEN 64 AND 16384),
    idle_ttl_secs       INTEGER NOT NULL DEFAULT 0 CHECK (idle_ttl_secs >= 0),
    spec                JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(spec) = 'object'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    destroyed_at        TIMESTAMPTZ,
    destroy_reason      TEXT CHECK (destroy_reason IN ('user', 'idle_sweep', 'crash', 'pod_shutdown', 'admin')),
    settled_ledger_id   BIGINT REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    credits_spent       BIGINT CHECK (credits_spent IS NULL OR credits_spent >= 0),

    CONSTRAINT deployment_destroyed_chk CHECK (
        (destroyed_at IS NULL AND destroy_reason IS NULL)
        OR (destroyed_at IS NOT NULL AND destroy_reason IS NOT NULL)
    ),
    CONSTRAINT deployment_destroyed_after_created_chk CHECK (
        destroyed_at IS NULL OR destroyed_at >= created_at
    ),
    CONSTRAINT deployment_settlement_chk CHECK (
        (settled_ledger_id IS NULL AND credits_spent IS NULL)
        OR (settled_ledger_id IS NOT NULL AND credits_spent IS NOT NULL)
    )
);

CREATE INDEX firecracker_deployment_account_recent_idx
    ON wallet.firecracker_deployment(account_id, created_at DESC, id DESC);
CREATE INDEX firecracker_deployment_account_live_idx
    ON wallet.firecracker_deployment(account_id, created_at DESC, id DESC)
    WHERE destroyed_at IS NULL;
CREATE INDEX firecracker_deployment_vm_id_idx
    ON wallet.firecracker_deployment(vm_id);
CREATE UNIQUE INDEX firecracker_deployment_live_uq
    ON wallet.firecracker_deployment(vm_id)
    WHERE destroyed_at IS NULL;
CREATE UNIQUE INDEX firecracker_deployment_settled_ledger_uq
    ON wallet.firecracker_deployment(settled_ledger_id)
    WHERE settled_ledger_id IS NOT NULL;

COMMENT ON TABLE wallet.firecracker_deployment IS
    'Append-only journal of firecracker persistent endpoint deploys. One live row per vm_id at a time (partial unique). destroyed_at + destroy_reason set on teardown. visibility is metadata only — public listing requires a dedicated future RPC.';

COMMENT ON COLUMN wallet.firecracker_deployment.credits_spent IS
    'Credits debited from the deployment account at teardown (LEAST(meter, hold.amount) from wallet.firecracker_settle). NULL until the row is destroyed AND the settle wrote a ledger entry.';

COMMENT ON COLUMN wallet.firecracker_deployment.entrypoint IS
    'In-guest executable path passed to the Firecracker rootfs init (e.g. /init, /usr/bin/python3). Leading "/" is intentional — this is a filesystem path inside the VM, not a logical registry key. Path traversal sequences ("..", "//") are rejected.';

REVOKE ALL ON TABLE wallet.firecracker_deployment FROM PUBLIC, anon, authenticated;

COMMENT ON INDEX wallet.firecracker_deployment_live_uq IS
    'Guarantees only one live deployment per vm_id. Destroyed historical rows may reuse vm_id.';
COMMENT ON INDEX wallet.firecracker_deployment_settled_ledger_uq IS
    'Prevents one wallet ledger settlement from being attributed to multiple firecracker deployments.';

CREATE OR REPLACE FUNCTION wallet.firecracker_record_deployment(
    p_vm_id         TEXT,
    p_account_id    UUID,
    p_rootfs        TEXT,
    p_entrypoint    TEXT,
    p_http_port     INTEGER,
    p_visibility    TEXT,
    p_vcpu_count    SMALLINT,
    p_mem_size_mib  INTEGER,
    p_idle_ttl_secs INTEGER,
    p_spec          JSONB DEFAULT '{}'::jsonb
)
RETURNS wallet.firecracker_deployment
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_row           wallet.firecracker_deployment;
    v_constraint    TEXT;
    v_spec          JSONB := COALESCE(p_spec, '{}'::jsonb);
BEGIN
    IF p_vm_id IS NULL
       OR length(p_vm_id) NOT BETWEEN 8 AND 128
       OR p_vm_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' THEN
        RAISE EXCEPTION 'invalid vm_id' USING ERRCODE = '22023';
    END IF;
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_rootfs IS NULL
       OR length(p_rootfs) NOT BETWEEN 1 AND 64
       OR p_rootfs !~ '^[a-z0-9][a-z0-9._/-]*$'
       OR p_rootfs LIKE '%..%'
       OR p_rootfs LIKE '%//%' THEN
        RAISE EXCEPTION 'invalid rootfs' USING ERRCODE = '22023';
    END IF;
    IF p_entrypoint IS NULL
       OR length(p_entrypoint) NOT BETWEEN 1 AND 128
       OR p_entrypoint !~ '^[A-Za-z0-9/][A-Za-z0-9._:/-]*$'
       OR p_entrypoint LIKE '%..%'
       OR p_entrypoint LIKE '%//%' THEN
        RAISE EXCEPTION 'invalid entrypoint' USING ERRCODE = '22023';
    END IF;
    IF p_http_port IS NULL OR p_http_port NOT BETWEEN 1 AND 65535 THEN
        RAISE EXCEPTION 'invalid http_port' USING ERRCODE = '22023';
    END IF;
    IF p_visibility NOT IN ('staff', 'public') THEN
        RAISE EXCEPTION 'visibility must be staff or public' USING ERRCODE = '22023';
    END IF;
    IF p_vcpu_count IS NULL OR p_vcpu_count NOT BETWEEN 1 AND 16 THEN
        RAISE EXCEPTION 'invalid vcpu_count' USING ERRCODE = '22023';
    END IF;
    IF p_mem_size_mib IS NULL OR p_mem_size_mib NOT BETWEEN 64 AND 16384 THEN
        RAISE EXCEPTION 'invalid mem_size_mib' USING ERRCODE = '22023';
    END IF;
    IF p_idle_ttl_secs IS NULL OR p_idle_ttl_secs < 0 THEN
        RAISE EXCEPTION 'invalid idle_ttl_secs' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_spec) <> 'object' THEN
        RAISE EXCEPTION 'spec must be a JSON object' USING ERRCODE = '22023';
    END IF;

    BEGIN
        INSERT INTO wallet.firecracker_deployment (
            vm_id, account_id, rootfs, entrypoint, http_port, visibility,
            vcpu_count, mem_size_mib, idle_ttl_secs, spec
        ) VALUES (
            p_vm_id, p_account_id, p_rootfs, p_entrypoint, p_http_port, p_visibility,
            p_vcpu_count, p_mem_size_mib, p_idle_ttl_secs, v_spec
        )
        RETURNING * INTO v_row;
        RETURN v_row;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint <> 'firecracker_deployment_live_uq' THEN
            RAISE;
        END IF;
        SELECT * INTO v_row FROM wallet.firecracker_deployment
            WHERE vm_id = p_vm_id AND destroyed_at IS NULL
            ORDER BY created_at DESC, id DESC LIMIT 1
            FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION
                'unique_violation but no live row for vm_id % — concurrent destroy?',
                p_vm_id
                USING ERRCODE = '40001';
        END IF;
        IF v_row.account_id <> p_account_id THEN
            RAISE EXCEPTION
                'vm_id live under different account'
                USING ERRCODE = '40001';
        END IF;
        IF v_row.rootfs        <> p_rootfs
           OR v_row.entrypoint    <> p_entrypoint
           OR v_row.http_port     <> p_http_port
           OR v_row.visibility    <> p_visibility
           OR v_row.vcpu_count    <> p_vcpu_count
           OR v_row.mem_size_mib  <> p_mem_size_mib
           OR v_row.idle_ttl_secs <> p_idle_ttl_secs
           OR v_row.spec IS DISTINCT FROM v_spec THEN
            RAISE EXCEPTION
                'vm_id live with different deployment spec'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row;
    END;
END;
$$;

CREATE OR REPLACE FUNCTION wallet.firecracker_mark_destroyed(
    p_vm_id             TEXT,
    p_destroy_reason    TEXT,
    p_settled_ledger_id BIGINT DEFAULT NULL,
    p_credits_spent     BIGINT DEFAULT NULL
)
RETURNS wallet.firecracker_deployment
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_row           wallet.firecracker_deployment;
    v_ledger_owner  UUID;
    v_live_id       BIGINT;
BEGIN
    IF p_vm_id IS NULL
       OR length(p_vm_id) NOT BETWEEN 8 AND 128
       OR p_vm_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' THEN
        RAISE EXCEPTION 'invalid vm_id' USING ERRCODE = '22023';
    END IF;
    IF p_destroy_reason NOT IN ('user', 'idle_sweep', 'crash', 'pod_shutdown', 'admin') THEN
        RAISE EXCEPTION 'invalid destroy_reason' USING ERRCODE = '22023';
    END IF;
    IF p_credits_spent IS NOT NULL AND p_credits_spent < 0 THEN
        RAISE EXCEPTION 'credits_spent must be >= 0' USING ERRCODE = '22023';
    END IF;
    IF (p_settled_ledger_id IS NULL) <> (p_credits_spent IS NULL) THEN
        RAISE EXCEPTION
            'settled_ledger_id and credits_spent must be set together'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_row FROM wallet.firecracker_deployment
        WHERE vm_id = p_vm_id AND destroyed_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 1
        FOR UPDATE;

    IF FOUND THEN
        v_live_id := v_row.id;

        IF p_settled_ledger_id IS NOT NULL THEN
            SELECT l.account_id INTO v_ledger_owner FROM wallet.ledger l
                WHERE l.id = p_settled_ledger_id;
            IF v_ledger_owner IS NULL THEN
                RAISE EXCEPTION 'settled_ledger_id % not found', p_settled_ledger_id
                    USING ERRCODE = '23503';
            END IF;
            IF v_ledger_owner <> v_row.account_id THEN
                RAISE EXCEPTION
                    'settled ledger does not belong to deployment account'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        UPDATE wallet.firecracker_deployment
           SET destroyed_at       = statement_timestamp(),
               destroy_reason     = p_destroy_reason,
               settled_ledger_id  = p_settled_ledger_id,
               credits_spent      = p_credits_spent
         WHERE id = v_live_id
           AND destroyed_at IS NULL
        RETURNING * INTO v_row;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'concurrent destroy beat us to row %', v_live_id
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row;
    END IF;

    SELECT * INTO v_row FROM wallet.firecracker_deployment
        WHERE vm_id = p_vm_id AND destroyed_at IS NOT NULL
        ORDER BY destroyed_at DESC, id DESC LIMIT 1;
    IF FOUND THEN
        IF v_row.destroy_reason <> p_destroy_reason THEN
            RAISE EXCEPTION
                'deployment already destroyed with different reason'
                USING ERRCODE = '40001';
        END IF;
        IF v_row.settled_ledger_id IS DISTINCT FROM p_settled_ledger_id
           OR v_row.credits_spent IS DISTINCT FROM p_credits_spent THEN
            RAISE EXCEPTION
                'deployment already destroyed with different settlement'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row;
    END IF;

    RAISE EXCEPTION 'no deployment for vm_id %', p_vm_id
        USING ERRCODE = 'P0002';
END;
$$;

CREATE OR REPLACE FUNCTION wallet.firecracker_my_deployments(
    p_account_id    UUID,
    p_limit         INTEGER DEFAULT 50,
    p_offset        INTEGER DEFAULT 0,
    p_live_only     BOOLEAN DEFAULT FALSE
)
RETURNS SETOF wallet.firecracker_deployment
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id is required' USING ERRCODE = '22004';
    END IF;

    RETURN QUERY
        SELECT *
        FROM wallet.firecracker_deployment
        WHERE account_id = p_account_id
          AND (NOT p_live_only OR destroyed_at IS NULL)
        ORDER BY created_at DESC, id DESC
        LIMIT GREATEST(LEAST(p_limit, 200), 1)
        OFFSET GREATEST(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION wallet.firecracker_deployment_stats(p_account_id UUID)
RETURNS TABLE (
    total_deployments       BIGINT,
    live_deployments        BIGINT,
    total_credits_spent     BIGINT,
    earliest_deployment_at  TIMESTAMPTZ,
    latest_deployment_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id is required' USING ERRCODE = '22004';
    END IF;

    RETURN QUERY
        SELECT
            COUNT(*)::BIGINT,
            COUNT(*) FILTER (WHERE destroyed_at IS NULL)::BIGINT,
            COALESCE(SUM(credits_spent), 0)::BIGINT,
            MIN(created_at),
            MAX(created_at)
        FROM wallet.firecracker_deployment
        WHERE account_id = p_account_id;
END;
$$;
