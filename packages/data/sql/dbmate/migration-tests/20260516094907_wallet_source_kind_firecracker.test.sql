-- Companion test fixtures for 20260516094907_wallet_source_kind_firecracker.
-- Run via: ./test-migration.sh 20260516094907_wallet_source_kind_firecracker

-- SEED

SELECT 1;

-- ASSERT_AFTER_UP

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'source_kind'
          AND e.enumlabel = 'firecracker_session'
    ) THEN
        RAISE EXCEPTION 'fail: source_kind missing firecracker_session value';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'source_kind'
          AND e.enumlabel = 'firecracker_session'
    ) THEN
        RAISE EXCEPTION 'fail: enum value should remain after rollback (Postgres limitation; documented in migration)';
    END IF;
END;
$$;
