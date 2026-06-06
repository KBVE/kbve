-- migrate:up
--
-- Schedule the queue janitor RPCs via pg_cron so stale claims and
-- orphaned transitional lots auto-recover without manual ops.
--
-- Catalog + sample-lot seed data deliberately lives in MDX under
-- apps/kbve/astro-kbve/src/content/docs/mc/schematics/ and is published
-- through the static site rather than this migration. Real lots are
-- created by admin tooling against the deployed mc.lot table.
--
-- pg_cron runs the job AS THE ROLE THAT CALLED cron.schedule(). dbmate
-- connects as postgres, so the jobs run as postgres and reach the
-- SECURITY DEFINER RPCs directly. The IF guard keeps the migration
-- portable to local dev compose stacks that don't ship pg_cron.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Idempotent: unschedule any prior instance so re-running the
        -- migration can't accumulate duplicate jobs.
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname IN (
             'mc-lot-requeue-stale-claims',
             'mc-lot-repair-orphan-transitional'
         );

        -- Every 2 minutes: requeue claims older than 5 minutes, batched
        -- to 256 per run. The RPC clamps internally.
        PERFORM cron.schedule(
            'mc-lot-requeue-stale-claims',
            '*/2 * * * *',
            $cron$SELECT mc.service_requeue_stale_claims(300, 256);$cron$
        );

        -- Every 10 minutes: scan for orphaned transitional lots and
        -- snap them back. dry_run = FALSE; the lot side already guards
        -- against destructive transitions via state CHECKs.
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
