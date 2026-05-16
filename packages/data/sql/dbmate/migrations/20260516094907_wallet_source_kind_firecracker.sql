-- migrate:up

ALTER TYPE wallet.source_kind ADD VALUE IF NOT EXISTS 'firecracker_session';

-- migrate:down

-- Postgres does not support removing enum values without a full type rewrite.
-- Leaving 'firecracker_session' in place on rollback is harmless: it stays
-- inert until a later migration re-adds the dependent table.
SELECT 1;
