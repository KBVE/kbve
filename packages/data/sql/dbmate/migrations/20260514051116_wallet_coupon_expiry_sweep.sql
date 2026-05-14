-- migrate:up

-- wallet.sweep_expired_coupons — flip unredeemed coupons whose deadline
-- has passed from 'unredeemed' to 'expired'. Returns the number of rows
-- affected so the cron caller can observe sweep volume. Writes one
-- summary audit row per sweep when at least one row was flipped; empty
-- sweeps stay silent to keep audit_log tidy.
--
-- Idempotent: re-running is safe — the WHERE clause excludes anything
-- that is no longer 'unredeemed'. Concurrent callers are safe under
-- READ COMMITTED: the first transaction locks the matching rows; the
-- second re-checks the WHERE clause after waiting and skips rows that
-- are no longer 'unredeemed'.
--
-- Scale note: current coupon volume is low. If/when a single expiry
-- window can produce thousands of rows, swap this for a batched
-- p_limit variant using `FOR UPDATE SKIP LOCKED` so multiple cron
-- workers can share the work without one giant transaction.
--
-- Authority: service-role only. Scheduled via pg_cron at the bottom of
-- this migration — runs inside Postgres, no external manifest needed.
-- pg_cron is preloaded in supabase-cluster's shared_preload_libraries,
-- and the schedule registration block is guarded on extension presence
-- so the migration stays portable to local dev containers.

CREATE OR REPLACE FUNCTION wallet.sweep_expired_coupons()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now     TIMESTAMPTZ := statement_timestamp();
    v_count   BIGINT;
    v_min_id  BIGINT;
    v_max_id  BIGINT;
BEGIN
    WITH expired AS (
        UPDATE wallet.coupon
           SET status = 'expired'
         WHERE status = 'unredeemed'
           AND expires_at IS NOT NULL
           AND expires_at <= v_now
        RETURNING id
    )
    SELECT COUNT(*), MIN(id), MAX(id)
      INTO v_count, v_min_id, v_max_id
      FROM expired;

    IF v_count > 0 THEN
        INSERT INTO wallet.audit_log (
            action, target_type, target_id, metadata
        ) VALUES (
            'coupon.sweep_expired',
            'coupon',
            'batch',
            jsonb_build_object(
                'count',             v_count,
                'min_id',            v_min_id,
                'max_id',            v_max_id,
                'cutoff_expires_at', v_now,
                'swept_at',          v_now
            )
        );
    END IF;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION wallet.sweep_expired_coupons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.sweep_expired_coupons() TO service_role;
ALTER FUNCTION wallet.sweep_expired_coupons() OWNER TO service_role;

COMMENT ON FUNCTION wallet.sweep_expired_coupons() IS
    'Flips unredeemed coupons with expires_at <= now() to status=expired. Returns affected row count. Writes one summary audit_log row per non-empty sweep. Idempotent; safe to call from a cron loop.';

-- Index supporting the sweep's WHERE clause. Partial index keeps the
-- working set small as redeemed/expired/revoked rows accumulate.
CREATE INDEX IF NOT EXISTS wallet_coupon_unredeemed_expires_idx
    ON wallet.coupon (expires_at)
    WHERE status = 'unredeemed' AND expires_at IS NOT NULL;

-- Schedule the sweep via pg_cron when the extension is present (it is
-- preloaded on the supabase-cluster via shared_preload_libraries). The
-- IF-guard keeps the migration portable to local dev containers that
-- don't ship pg_cron — local test runs will simply skip scheduling.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Idempotent: unschedule any prior instance of this job name so
        -- re-running the migration doesn't accumulate duplicate jobs.
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'wallet-sweep-expired-coupons';
        PERFORM cron.schedule(
            'wallet-sweep-expired-coupons',
            '0 * * * *',
            $cron$SELECT wallet.sweep_expired_coupons();$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping wallet-sweep-expired-coupons schedule registration';
    END IF;
END;
$$;

-- migrate:down

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'wallet-sweep-expired-coupons';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS wallet.sweep_expired_coupons();
DROP INDEX IF EXISTS wallet.wallet_coupon_unredeemed_expires_idx;
