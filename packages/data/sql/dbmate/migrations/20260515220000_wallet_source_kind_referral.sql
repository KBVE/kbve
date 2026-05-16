-- migrate:up

-- Add 'referral' to wallet.source_kind so the referral schema migration
-- (20260515221756_referral_schema_init.sql) can immediately cast values to
-- it inside its function bodies.
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on Postgres 12+
-- BUT the new value cannot be used in the same transaction it was added
-- in. dbmate wraps each migration file in one transaction, so the enum
-- add and its first cast site must live in separate migration files.
-- This migration handles the enum add; the next one consumes it.
ALTER TYPE wallet.source_kind ADD VALUE IF NOT EXISTS 'referral';

-- migrate:down

-- Intentionally a no-op. Postgres has no DROP VALUE for enum types, and
-- removing the value would orphan any ledger rows already tagged
-- 'referral'. Stripping a referral entry requires rewriting the ledger
-- row's source_kind out-of-band; do that with a dedicated script if it
-- is ever actually needed.
SELECT 1;
