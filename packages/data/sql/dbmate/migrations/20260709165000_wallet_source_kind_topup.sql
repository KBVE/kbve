-- migrate:up

-- Add 'topup' to wallet.source_kind so the store topup migration
-- (20260709170000_store_topup.sql) can cast to it in its function bodies.
-- ALTER TYPE ... ADD VALUE is allowed in a txn on PG12+ but the value cannot
-- be used in the same txn, so the add and its first use live in separate
-- migration files (same convention as the referral / firecracker adds).
ALTER TYPE wallet.source_kind ADD VALUE IF NOT EXISTS 'topup';

-- migrate:down

-- No-op: Postgres has no DROP VALUE for enums, and removing 'topup' would
-- orphan any ledger rows already tagged with it.
SELECT 1;
