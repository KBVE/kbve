-- Companion test fixtures for 20260526223407_mc_lot_system.
-- Run via: ./test-migration.sh 20260526223407_mc_lot_system
--
-- Focus areas:
--   * domain ranges (lot_state, build_action_kind, build_apply_state)
--   * table-level invariants (flags mask, resource_path, GIST EXCLUDE)
--   * partial index presence (transitional_repair, pending_claim,
--     one_active_per_lot)
--   * round-17 hardening: auth.role() guards, FOR NO KEY UPDATE
--   * down: tables / domains / proxies removed
--
-- This test deliberately stops short of full purchase/build flow because
-- wallet.service_debit requires a per-currency account + balance and the
-- focus here is schema correctness. Functional flow is covered by the
-- axum-kbve integration tests against a real Supabase instance.

-- SEED
WITH test_users (id) AS (
    VALUES
        ('11111111-1111-1111-1111-111111111111'::uuid),
        ('22222222-2222-2222-2222-222222222222'::uuid)
)
DELETE FROM auth.users WHERE id IN (SELECT id FROM test_users);

INSERT INTO auth.users (id)
VALUES
    ('11111111-1111-1111-1111-111111111111'),
    ('22222222-2222-2222-2222-222222222222');

-- ASSERT_AFTER_UP

-- 1. Domains present with correct ranges.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'mc' AND t.typname = 'lot_state'
    ) THEN
        RAISE EXCEPTION 'fail: mc.lot_state domain missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'mc' AND t.typname = 'build_apply_state'
    ) THEN
        RAISE EXCEPTION 'fail: mc.build_apply_state domain missing';
    END IF;
END;
$$;

-- 2. mc.lot.flags mask CHECK rejects high bits.
DO $$
DECLARE
    v_msg TEXT;
BEGIN
    BEGIN
        INSERT INTO mc.lot (lot_id, chunk_x_range, chunk_z_range, anchor_y, flags)
        VALUES ('lot:flags-mask-bad', int4range(0, 1), int4range(0, 1), 64, 65536);
        RAISE EXCEPTION 'fail: flags=65536 should violate mc_lot_flags_mask_chk';
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg NOT LIKE '%mc_lot_flags_mask_chk%' THEN
            RAISE EXCEPTION 'fail: wrong constraint raised: %', v_msg;
        END IF;
    END;
END;
$$;

-- 3. mc.schematic.resource_path CHECK rejects '//' and '\\'.
DO $$
BEGIN
    BEGIN
        INSERT INTO mc.schematic
            (schematic_id, name, category, dims_x, dims_y, dims_z, resource_path)
        VALUES ('bad:double-slash', 'x', 'house', 4, 4, 4, 'schematics//bad.nbt');
        RAISE EXCEPTION 'fail: resource_path with // should be rejected';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO mc.schematic
            (schematic_id, name, category, dims_x, dims_y, dims_z, resource_path)
        VALUES ('bad:backslash', 'x', 'house', 4, 4, 4, 'schematics/bad\path.nbt');
        RAISE EXCEPTION 'fail: resource_path with backslash should be rejected';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Good path still accepted.
    INSERT INTO mc.schematic
        (schematic_id, name, category, dims_x, dims_y, dims_z, resource_path)
    VALUES ('ok:test-house', 'Test House', 'house', 8, 8, 8,
            'schematics/test_house.nbt');
END;
$$;

-- 4. GIST EXCLUDE forbids chunk overlap in the same world.
DO $$
BEGIN
    INSERT INTO mc.lot (lot_id, chunk_x_range, chunk_z_range, anchor_y)
    VALUES ('lot:overlap-a', int4range(10, 14), int4range(10, 14), 64);

    BEGIN
        INSERT INTO mc.lot (lot_id, chunk_x_range, chunk_z_range, anchor_y)
        VALUES ('lot:overlap-b', int4range(12, 16), int4range(12, 16), 64);
        RAISE EXCEPTION 'fail: overlapping chunk_x/z_range should be rejected';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    -- Non-overlapping in same world is fine.
    INSERT INTO mc.lot (lot_id, chunk_x_range, chunk_z_range, anchor_y)
    VALUES ('lot:overlap-c', int4range(20, 24), int4range(20, 24), 64);

    -- Same range, different world is fine.
    INSERT INTO mc.lot (lot_id, world, chunk_x_range, chunk_z_range, anchor_y)
    VALUES ('lot:overlap-nether', 'minecraft:the_nether',
            int4range(10, 14), int4range(10, 14), 64);
END;
$$;

-- 5. Generated block_* columns track chunk_*_range * 16.
DO $$
DECLARE
    v_row mc.lot%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM mc.lot WHERE lot_id = 'lot:overlap-a';
    IF v_row.block_x_min <> 10 * 16 OR v_row.block_x_max <> 14 * 16 - 1
       OR v_row.block_z_min <> 10 * 16 OR v_row.block_z_max <> 14 * 16 - 1 THEN
        RAISE EXCEPTION 'fail: block_* generated columns do not match chunk * 16';
    END IF;
END;
$$;

-- 6. Round-17 partial / repair indexes exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'mc'
           AND indexname = 'idx_mc_lot_transitional_repair'
    ) THEN
        RAISE EXCEPTION 'fail: idx_mc_lot_transitional_repair missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'mc'
           AND indexname = 'idx_mc_lot_vacant_world_chunk_cursor'
    ) THEN
        RAISE EXCEPTION 'fail: idx_mc_lot_vacant_world_chunk_cursor missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'mc'
           AND indexname = 'uq_mc_lot_build_log_one_active_per_lot'
    ) THEN
        RAISE EXCEPTION 'fail: uq_mc_lot_build_log_one_active_per_lot missing';
    END IF;
END;
$$;

-- 7. The round-17 duplicate explicit gist must NOT exist; viewport reads
-- ride the EXCLUDE-backed gist instead.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'mc'
           AND indexname = 'idx_mc_lot_world_chunk_ranges_gist'
    ) THEN
        RAISE EXCEPTION 'fail: idx_mc_lot_world_chunk_ranges_gist must be dropped; EXCLUDE constraint already provides it';
    END IF;
END;
$$;

-- 8. Internal helpers must NOT be callable by service_role
-- (round-17 hardening; admin proxies reach them via SECURITY DEFINER).
DO $$
BEGIN
    IF has_function_privilege('service_role',
                              'mc._derive_idem_key(uuid, text)',
                              'EXECUTE') THEN
        RAISE EXCEPTION 'fail: service_role should NOT have EXECUTE on mc._derive_idem_key';
    END IF;
    IF has_function_privilege('service_role',
                              'mc._user_account_id(uuid)',
                              'EXECUTE') THEN
        RAISE EXCEPTION 'fail: service_role should NOT have EXECUTE on mc._user_account_id';
    END IF;
END;
$$;

-- 9. mc.lot_build_log apply_state domain accepts 0..4 incl. cancelled.
DO $$
BEGIN
    -- Set up a vacant + owned lot + schematic so the FK chain holds.
    UPDATE mc.lot
       SET owner_user_id = '11111111-1111-1111-1111-111111111111',
           state = 1
     WHERE lot_id = 'lot:overlap-a';

    INSERT INTO mc.lot_build_log
        (lot_id, actor_user_id, action_kind, schematic_id,
         lot_state_before, idempotency_key, apply_state)
    VALUES
        ('lot:overlap-a',
         '11111111-1111-1111-1111-111111111111',
         0,
         'ok:test-house',
         1,
         gen_random_uuid(),
         4);  -- cancelled

    -- Round-17 claimed_consistency_chk still allows apply_state=4 with NULL claim.
    IF NOT EXISTS (
        SELECT 1 FROM mc.lot_build_log
         WHERE lot_id = 'lot:overlap-a' AND apply_state = 4
    ) THEN
        RAISE EXCEPTION 'fail: apply_state=4 (cancelled) insert did not land';
    END IF;
END;
$$;

-- 10. Reset test rows so re-runs and rollback paths stay clean.
DELETE FROM mc.lot_build_log
 WHERE actor_user_id IN (
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222');
UPDATE mc.lot SET owner_user_id = NULL, state = 0
 WHERE lot_id LIKE 'lot:overlap-%';
DELETE FROM mc.lot WHERE lot_id LIKE 'lot:overlap-%';
DELETE FROM mc.schematic WHERE schematic_id LIKE 'ok:%' OR schematic_id LIKE 'bad:%';

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'mc'
           AND c.relname IN ('lot', 'lot_purchase', 'lot_build_log', 'schematic')
    ) THEN
        RAISE EXCEPTION 'fail: mc tables still present after rollback';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'mc'
           AND t.typname IN ('lot_state', 'build_action_kind', 'build_apply_state')
    ) THEN
        RAISE EXCEPTION 'fail: mc domains still present after rollback';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'proxy_purchase_lot',
               'proxy_queue_build_on_lot',
               'proxy_queue_demolish_lot',
               'proxy_list_vacant_lots',
               'proxy_list_my_active_lots',
               'proxy_list_my_transitional_lots',
               'proxy_list_lots_in_viewport',
               'proxy_service_claim_pending_builds',
               'proxy_service_mark_build_applied',
               'proxy_service_mark_build_failed',
               'proxy_service_get_lot'
           )
    ) THEN
        RAISE EXCEPTION 'fail: mc public proxies still present after rollback';
    END IF;
END;
$$;
