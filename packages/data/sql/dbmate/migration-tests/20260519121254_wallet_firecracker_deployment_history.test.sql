-- Companion test fixtures for 20260519121254_wallet_firecracker_deployment_history.
-- Run via: ./test-migration.sh 20260519121254_wallet_firecracker_deployment_history

-- SEED

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

DROP TABLE IF EXISTS public.__fc_deploy_history_fixture;
CREATE TABLE public.__fc_deploy_history_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__fc_deploy_history_fixture (role, user_id) VALUES
    ('alice', gen_random_uuid()),
    ('bob',   gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__fc_deploy_history_fixture;

DO $$
DECLARE
    v_alice UUID;
    v_bob   UUID;
BEGIN
    SELECT a.id INTO v_alice
      FROM wallet.account a
      JOIN public.__fc_deploy_history_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'alice';
    SELECT a.id INTO v_bob
      FROM wallet.account a
      JOIN public.__fc_deploy_history_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'bob';

    IF v_alice IS NULL OR v_bob IS NULL THEN
        RAISE EXCEPTION 'fail: fixture wallet accounts were not auto-provisioned';
    END IF;

    UPDATE wallet.balance SET credits = 10000 WHERE account_id = v_alice;
    UPDATE wallet.balance SET credits = 10000 WHERE account_id = v_bob;
END;
$$;

-- ASSERT_AFTER_UP

DO $$
DECLARE
    v_alice         UUID;
    v_bob           UUID;
    v_row           wallet.firecracker_deployment;
    v_replay        wallet.firecracker_deployment;
    v_count         INT;
    v_stats         RECORD;
    v_ledger_alpha  BIGINT;
    v_ledger_beta   BIGINT;
    v_ledger_bob    BIGINT;
BEGIN
    SELECT a.id INTO v_alice
      FROM wallet.account a
      JOIN public.__fc_deploy_history_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'alice';
    SELECT a.id INTO v_bob
      FROM wallet.account a
      JOIN public.__fc_deploy_history_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'bob';

    v_row := wallet.firecracker_record_deployment(
        'fc-vm-alpha', v_alice, 'alpine-python-web', '/init', 8080,
        'staff', 1::smallint, 256, 0, '{}'::jsonb
    );
    IF v_row.id IS NULL OR v_row.account_id <> v_alice
       OR v_row.destroyed_at IS NOT NULL THEN
        RAISE EXCEPTION 'fail: record_deployment returned wrong row';
    END IF;

    v_replay := wallet.firecracker_record_deployment(
        'fc-vm-alpha', v_alice, 'alpine-python-web', '/init', 8080,
        'staff', 1::smallint, 256, 0, '{}'::jsonb
    );
    IF v_replay.id <> v_row.id OR v_replay.created_at <> v_row.created_at THEN
        RAISE EXCEPTION 'fail: idempotent replay returned a new row';
    END IF;

    -- Live vm_id reused with a different deployment spec → 40001.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-alpha', v_alice, 'alpine-node-web', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: mismatched rootfs retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-alpha', v_alice, 'alpine-python-web', '/init', 9090,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: mismatched http_port retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-alpha', v_alice, 'alpine-python-web', '/init', 8080,
            'staff', 2::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: mismatched vcpu_count retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-alpha', v_alice, 'alpine-python-web', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{"tag":"different"}'::jsonb
        );
        RAISE EXCEPTION 'fail: mismatched spec retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;

    -- Function-level field validation: vcpu_count out of range.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-vcpu', v_alice, 'alpine', '/init', 8080,
            'staff', 99::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: vcpu_count=99 should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-mem', v_alice, 'alpine', '/init', 8080,
            'staff', 1::smallint, 32, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: mem_size_mib=32 should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-port', v_alice, 'alpine', '/init', 0,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: http_port=0 should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-ttl', v_alice, 'alpine', '/init', 8080,
            'staff', 1::smallint, 256, -1, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: idle_ttl_secs=-1 should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-alpha', v_bob, 'alpine-python-web', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: cross-account live vm_id should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;

    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'short', v_alice, 'alpine', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: short vm_id should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-vis', v_alice, 'alpine', '/init', 8080,
            'private', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: invalid visibility should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- vm_id format guard: spaces are not in the allowed charset.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'has spaces here', v_alice, 'alpine', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: vm_id with spaces should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- rootfs format guard: uppercase rejected.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-rootfs', v_alice, 'Alpine', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: uppercase rootfs should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- entrypoint format + traversal guards.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-entry', v_alice, 'alpine', 'has spaces', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: entrypoint with spaces should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-entry2', v_alice, 'alpine', '/usr/../etc/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: entrypoint with ".." should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- rootfs path traversal guard: '..' and '//' rejected.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-traverse', v_alice, 'images/../etc', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: rootfs containing ".." should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-dblslash', v_alice, 'images//double', '/init', 8080,
            'staff', 1::smallint, 256, 0, '{}'::jsonb
        );
        RAISE EXCEPTION 'fail: rootfs containing "//" should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- spec must be a JSON object — arrays and scalars rejected.
    BEGIN
        PERFORM wallet.firecracker_record_deployment(
            'fc-vm-bad-spec', v_alice, 'alpine', '/init', 8080,
            'staff', 1::smallint, 256, 0, '[1,2,3]'::jsonb
        );
        RAISE EXCEPTION 'fail: array spec should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    v_ledger_alpha := wallet.service_debit(
        v_alice, 'credits'::wallet.currency_kind, 150,
        'firecracker_session'::wallet.source_kind,
        'fc-vm-alpha settle', 'firecracker', NULL,
        gen_random_uuid()
    );

    v_row := wallet.firecracker_mark_destroyed(
        'fc-vm-alpha', 'user', v_ledger_alpha, 150
    );
    IF v_row.destroyed_at IS NULL OR v_row.destroy_reason <> 'user' THEN
        RAISE EXCEPTION 'fail: mark_destroyed did not set destroyed fields';
    END IF;
    IF v_row.credits_spent <> 150 THEN
        RAISE EXCEPTION 'fail: credits_spent expected 150 got %', v_row.credits_spent;
    END IF;
    IF v_row.settled_ledger_id <> v_ledger_alpha THEN
        RAISE EXCEPTION 'fail: settled_ledger_id expected % got %',
            v_ledger_alpha, v_row.settled_ledger_id;
    END IF;

    -- Retry-safe: a second destroy with no live row returns the already-destroyed
    -- row when the args match (workers / pod-shutdown retries become no-ops).
    v_row := wallet.firecracker_mark_destroyed(
        'fc-vm-alpha', 'user', v_ledger_alpha, 150
    );
    IF v_row.destroyed_at IS NULL OR v_row.destroy_reason <> 'user' THEN
        RAISE EXCEPTION 'fail: retry destroy should return already-destroyed row';
    END IF;
    IF v_row.credits_spent <> 150 THEN
        RAISE EXCEPTION 'fail: retry destroy must not overwrite credits_spent, got %', v_row.credits_spent;
    END IF;

    -- Retry with NULL settlement against a settled row → mismatch → 40001.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed('fc-vm-alpha', 'user', NULL, NULL);
        RAISE EXCEPTION 'fail: NULL-vs-set settlement retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;

    -- Retry with different reason against an existing destroyed row → 40001.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed(
            'fc-vm-alpha', 'admin', v_ledger_alpha, 150
        );
        RAISE EXCEPTION 'fail: mismatched destroy_reason retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;

    -- Retry with different credits against an existing destroyed row → 40001.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed(
            'fc-vm-alpha', 'user', v_ledger_alpha, 999
        );
        RAISE EXCEPTION 'fail: mismatched credits retry should raise 40001';
    EXCEPTION
        WHEN serialization_failure THEN
            NULL;
    END;

    -- mark_destroyed enforces same vm_id regex as record_deployment.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed(
            'has spaces here', 'user', NULL, NULL
        );
        RAISE EXCEPTION 'fail: mark_destroyed with malformed vm_id should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- P0002 only when no row (live or destroyed) exists for vm_id.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed('fc-vm-never-existed', 'user', NULL, NULL);
        RAISE EXCEPTION 'fail: destroy on unknown vm_id should raise P0002';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> 'P0002' THEN RAISE; END IF;
    END;

    -- Settlement consistency: ledger_id + credits_spent must be set together.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed('fc-vm-alpha', 'user', 99, NULL);
        RAISE EXCEPTION 'fail: settled_ledger_id without credits_spent should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_mark_destroyed('fc-vm-alpha', 'bogus', NULL, NULL);
        RAISE EXCEPTION 'fail: invalid destroy_reason should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM wallet.firecracker_mark_destroyed('fc-vm-alpha', 'user', NULL, -5);
        RAISE EXCEPTION 'fail: negative credits_spent should raise 22023';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22023' THEN RAISE; END IF;
    END;

    -- my_deployments + stats reject NULL account_id with 22004.
    BEGIN
        PERFORM * FROM wallet.firecracker_my_deployments(NULL, 10, 0, FALSE);
        RAISE EXCEPTION 'fail: my_deployments(NULL) should raise 22004';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22004' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM * FROM wallet.firecracker_deployment_stats(NULL);
        RAISE EXCEPTION 'fail: deployment_stats(NULL) should raise 22004';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '22004' THEN RAISE; END IF;
    END;

    -- After destroy, the same vm_id under a different account is fine.
    v_row := wallet.firecracker_record_deployment(
        'fc-vm-alpha', v_bob, 'alpine-python-web', '/init', 8080,
        'public', 1::smallint, 256, 0, '{}'::jsonb
    );
    IF v_row.account_id <> v_bob OR v_row.destroyed_at IS NOT NULL THEN
        RAISE EXCEPTION 'fail: re-deploy under bob did not produce a fresh live row';
    END IF;

    PERFORM wallet.firecracker_record_deployment(
        'fc-vm-beta', v_alice, 'alpine-python-web', '/init', 8080,
        'public', 2::smallint, 512, 3600, '{"tag":"build-42"}'::jsonb
    );
    PERFORM wallet.firecracker_record_deployment(
        'fc-vm-gamma', v_alice, 'alpine-node-web', '/init', 8080,
        'staff', 1::smallint, 256, 0, '{}'::jsonb
    );

    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_my_deployments(v_alice, 50, 0, FALSE);
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'fail: my_deployments(alice) expected 3 got %', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_my_deployments(v_alice, 50, 0, TRUE);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'fail: my_deployments(alice, live_only) expected 2 got %', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_my_deployments(v_alice, 1, 0, FALSE);
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: my_deployments limit=1 should return 1 row got %', v_count;
    END IF;

    -- limit clamps to 200 (passing 9999 should still cap at table size).
    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_my_deployments(v_alice, 9999, 0, FALSE);
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'fail: my_deployments limit clamp expected 3 got %', v_count;
    END IF;

    SELECT * INTO v_stats FROM wallet.firecracker_deployment_stats(v_alice);
    IF v_stats.total_deployments <> 3 THEN
        RAISE EXCEPTION 'fail: stats.total expected 3 got %', v_stats.total_deployments;
    END IF;
    IF v_stats.live_deployments <> 2 THEN
        RAISE EXCEPTION 'fail: stats.live expected 2 got %', v_stats.live_deployments;
    END IF;
    IF v_stats.total_credits_spent <> 150 THEN
        RAISE EXCEPTION 'fail: stats.credits expected 150 got %', v_stats.total_credits_spent;
    END IF;

    -- Partial unique guard: re-deploying a live vm_id (no destroy) under the
    -- same account must idempotently return the same row, not insert.
    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_deployment
        WHERE vm_id = 'fc-vm-beta';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: expected 1 row for fc-vm-beta got %', v_count;
    END IF;
    PERFORM wallet.firecracker_record_deployment(
        'fc-vm-beta', v_alice, 'alpine-python-web', '/init', 8080,
        'public', 2::smallint, 512, 3600, '{"tag":"build-42"}'::jsonb
    );
    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_deployment
        WHERE vm_id = 'fc-vm-beta';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: idempotent replay on fc-vm-beta inserted a duplicate (count=%)', v_count;
    END IF;

    -- Ledger ownership: a ledger entry owned by bob cannot settle alice's VM.
    v_ledger_bob := wallet.service_debit(
        v_bob, 'credits'::wallet.currency_kind, 25,
        'firecracker_session'::wallet.source_kind,
        'cross-account probe', 'firecracker', NULL,
        gen_random_uuid()
    );
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed(
            'fc-vm-gamma', 'idle_sweep', v_ledger_bob, 25
        );
        RAISE EXCEPTION 'fail: cross-account ledger should raise 23514';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '23514' THEN RAISE; END IF;
    END;

    -- Ledger that doesn't exist → 23503.
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed(
            'fc-vm-gamma', 'idle_sweep', 999999999, 25
        );
        RAISE EXCEPTION 'fail: missing ledger should raise 23503';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE <> '23503' THEN RAISE; END IF;
    END;

    v_ledger_beta := wallet.service_debit(
        v_alice, 'credits'::wallet.currency_kind, 50,
        'firecracker_session'::wallet.source_kind,
        'fc-vm-beta idle sweep', 'firecracker', NULL,
        gen_random_uuid()
    );
    PERFORM wallet.firecracker_mark_destroyed('fc-vm-beta', 'idle_sweep', v_ledger_beta, 50);

    -- settled_ledger_id is uniquely owned by the row that booked it; reusing
    -- the same id on another destroy must raise (partial unique index).
    BEGIN
        PERFORM wallet.firecracker_mark_destroyed('fc-vm-gamma', 'idle_sweep', v_ledger_beta, 50);
        RAISE EXCEPTION 'fail: reusing settled_ledger_id should violate unique index';
    EXCEPTION
        WHEN unique_violation THEN
            NULL;
    END;
    PERFORM wallet.firecracker_record_deployment(
        'fc-vm-beta', v_alice, 'alpine-python-web', '/init', 8080,
        'public', 2::smallint, 512, 3600, '{}'::jsonb
    );
    SELECT COUNT(*) INTO v_count
        FROM wallet.firecracker_deployment
        WHERE vm_id = 'fc-vm-beta';
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'fail: re-deploy after destroy expected 2 rows got %', v_count;
    END IF;
END;
$$;

DROP TABLE IF EXISTS public.__fc_deploy_history_fixture;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'wallet' AND c.relname = 'firecracker_deployment'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.firecracker_deployment still exists after rollback';
    END IF;
END;
$$;

DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'firecracker_record_deployment',
        'firecracker_mark_destroyed',
        'firecracker_my_deployments',
        'firecracker_deployment_stats'
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

DROP TABLE IF EXISTS public.__fc_deploy_history_fixture;
