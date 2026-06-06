-- migrate:up
--
-- Phase 0 follow-up to the mc lot system:
--   1. Seed a starter schematic catalog so /api/v1/mc/lots/schematics
--      returns rows in prod (the catalog was empty after the schema
--      migration shipped — the dashboard had nothing to render).
--   2. Seed a small vacant-lot grid in `minecraft:overworld` so the
--      marketplace map and `proxy_list_vacant_lots` have something to
--      surface before the first real lot is created.
--   3. Schedule the queue janitor RPCs via pg_cron so stale claims and
--      orphaned transitional lots auto-recover without manual ops.
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING) so re-running the
-- migration on a database that already holds the rows is a no-op. The
-- pg_cron block uses unschedule-by-name first so duplicate jobs cannot
-- accumulate across migration replays.

-- ---------------------------------------------------------------------------
-- 1. Starter schematic catalog
-- ---------------------------------------------------------------------------
-- resource_path matches mc_schematic_resource_path_chk: 'schematics/<name>.<ext>'
INSERT INTO mc.schematic
    (schematic_id, name, category, tier,
     dims_x, dims_y, dims_z,
     price_credits, price_khash,
     resource_path, enabled)
VALUES
    ('starter:cottage',
     'Starter Cottage',  'house', 1,
     7,  6,  7,
     200, 0,
     'schematics/starter/cottage.nbt', TRUE),
    ('starter:cabin',
     'Wooden Cabin',     'house', 2,
     9,  7, 11,
     500, 0,
     'schematics/starter/cabin.nbt', TRUE),
    ('starter:tower_watch',
     'Watch Tower',      'tower', 2,
     5, 12,  5,
     650, 0,
     'schematics/starter/tower_watch.nbt', TRUE),
    ('starter:farm_wheat',
     'Wheat Farm',       'farm',  1,
     11, 4, 11,
     300, 0,
     'schematics/starter/farm_wheat.nbt', TRUE),
    ('starter:shop_corner',
     'Corner Shop',      'shop',  2,
     9,  6,  9,
     800, 0,
     'schematics/starter/shop_corner.nbt', TRUE),
    ('mid:castle_keep',
     'Castle Keep',      'castle', 5,
    25, 24, 25,
     0, 10,
     'schematics/mid/castle_keep.nbt', TRUE),
    ('mid:monument_obelisk',
     'Obelisk Monument', 'monument', 4,
     5, 16,  5,
     0, 2,
     'schematics/mid/monument_obelisk.nbt', TRUE),
    ('util:storage_silo',
     'Storage Silo',     'utility', 3,
     7, 14,  7,
     1200, 0,
     'schematics/util/storage_silo.nbt', TRUE)
ON CONFLICT (schematic_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Sample vacant lot grid
-- ---------------------------------------------------------------------------
-- 3x3 grid of 4-chunk lots centered roughly at (0, 0). Each cell spans
-- chunks [x, x+2) × [z, z+2) = 2x2 chunks = 32x32 blocks. Anchored at
-- sea level (Y=63 = top of the surface, NOT the water layer).
--
-- Pricing climbs with distance from origin so the central lots stay the
-- premium tier (slight market pressure to claim outer lots first).
INSERT INTO mc.lot
    (lot_id, world, chunk_x_range, chunk_z_range, anchor_y,
     price_credits, price_khash, state)
VALUES
    ('seed:lot:nw', 'minecraft:overworld', int4range(-4, -2), int4range(-4, -2), 63, 800, 0, 0),
    ('seed:lot:n',  'minecraft:overworld', int4range(-1,  1), int4range(-4, -2), 63, 1200, 0, 0),
    ('seed:lot:ne', 'minecraft:overworld', int4range( 2,  4), int4range(-4, -2), 63, 800, 0, 0),
    ('seed:lot:w',  'minecraft:overworld', int4range(-4, -2), int4range(-1,  1), 63, 1200, 0, 0),
    ('seed:lot:c',  'minecraft:overworld', int4range(-1,  1), int4range(-1,  1), 63, 2500, 0, 0),
    ('seed:lot:e',  'minecraft:overworld', int4range( 2,  4), int4range(-1,  1), 63, 1200, 0, 0),
    ('seed:lot:sw', 'minecraft:overworld', int4range(-4, -2), int4range( 2,  4), 63, 800, 0, 0),
    ('seed:lot:s',  'minecraft:overworld', int4range(-1,  1), int4range( 2,  4), 63, 1200, 0, 0),
    ('seed:lot:se', 'minecraft:overworld', int4range( 2,  4), int4range( 2,  4), 63, 800, 0, 0)
ON CONFLICT (lot_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Janitor schedule
-- ---------------------------------------------------------------------------
-- mc.service_requeue_stale_claims rolls workers' orphaned `apply_state=3`
-- rows back to `0` (queued) when their claim is older than the timeout.
-- mc.service_repair_orphan_transitional snaps lots that landed in state
-- IN (3, 4) without an active build_log row back to a settled value.
--
-- pg_cron runs as the role that called cron.schedule() — dbmate connects
-- as postgres, so the jobs run as postgres and reach the SECURITY DEFINER
-- RPCs directly. The IF guard keeps the migration portable to local dev
-- compose stacks that don't ship pg_cron.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname IN (
             'mc-lot-requeue-stale-claims',
             'mc-lot-repair-orphan-transitional'
         );

        -- Every 2 minutes: requeue claims older than 5 minutes, batched
        -- to 256 per run. The actor side of the RPC clamps internally.
        PERFORM cron.schedule(
            'mc-lot-requeue-stale-claims',
            '*/2 * * * *',
            $cron$SELECT mc.service_requeue_stale_claims(300, 256);$cron$
        );

        -- Every 10 minutes: scan for orphaned transitional lots and
        -- snap them back. dry_run = FALSE because the lot side already
        -- guards against destructive transitions via state CHECKs.
        PERFORM cron.schedule(
            'mc-lot-repair-orphan-transitional',
            '*/10 * * * *',
            $cron$SELECT mc.service_repair_orphan_transitional(FALSE);$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping mc-lot janitor schedule registration';
    END IF;
END;
$$;


-- migrate:down

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname IN (
             'mc-lot-requeue-stale-claims',
             'mc-lot-repair-orphan-transitional'
         );
    END IF;
END;
$$;

DELETE FROM mc.lot
 WHERE lot_id IN (
     'seed:lot:nw', 'seed:lot:n',  'seed:lot:ne',
     'seed:lot:w',  'seed:lot:c',  'seed:lot:e',
     'seed:lot:sw', 'seed:lot:s',  'seed:lot:se'
 )
   AND state = 0
   AND owner_user_id IS NULL;

DELETE FROM mc.schematic
 WHERE schematic_id IN (
     'starter:cottage', 'starter:cabin', 'starter:tower_watch',
     'starter:farm_wheat', 'starter:shop_corner',
     'mid:castle_keep',  'mid:monument_obelisk',
     'util:storage_silo'
 );
