-- migrate:up
SET search_path TO ows;

ALTER TABLE MapInstances
    ADD COLUMN IF NOT EXISTS DrainState       SMALLINT  NULL,
    ADD COLUMN IF NOT EXISTS DrainUrgency     SMALLINT  NULL,
    ADD COLUMN IF NOT EXISTS DrainDropPlayers BOOLEAN   NULL,
    ADD COLUMN IF NOT EXISTS DrainReason      TEXT      NULL,
    ADD COLUMN IF NOT EXISTS DrainRequestID   UUID      NULL,
    ADD COLUMN IF NOT EXISTS DrainDeadline    TIMESTAMP NULL;

-- NULL = not draining; 1 = draining; 2 = saving. 0 is rejected (dead semantic).
-- Guarded because Postgres ADD CONSTRAINT has no IF NOT EXISTS (a re-run would otherwise error).
-- Added NOT VALID then VALIDATE separately: a plain ADD CONSTRAINT CHECK takes ACCESS EXCLUSIVE and
-- full-scans the table (blocking all reads/writes for the scan). NOT VALID adds the constraint with
-- only a brief catalog lock (and still enforces it for new/updated rows); VALIDATE then checks
-- existing rows under SHARE UPDATE EXCLUSIVE, which does NOT block concurrent reads/writes. All
-- existing rows have DrainState NULL (CHECK-satisfied) so validation is trivial, but the lighter
-- lock keeps a large MapInstances safe to migrate live.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mapinstances_drainstate_check'
    ) THEN
        ALTER TABLE MapInstances
            ADD CONSTRAINT mapinstances_drainstate_check CHECK (DrainState IN (1, 2)) NOT VALID;
        ALTER TABLE MapInstances VALIDATE CONSTRAINT mapinstances_drainstate_check;
    END IF;
END $$;

-- migrate:down
SET search_path TO ows;

ALTER TABLE MapInstances DROP CONSTRAINT IF EXISTS mapinstances_drainstate_check;

ALTER TABLE MapInstances
    DROP COLUMN IF EXISTS DrainState,
    DROP COLUMN IF EXISTS DrainUrgency,
    DROP COLUMN IF EXISTS DrainDropPlayers,
    DROP COLUMN IF EXISTS DrainReason,
    DROP COLUMN IF EXISTS DrainRequestID,
    DROP COLUMN IF EXISTS DrainDeadline;
