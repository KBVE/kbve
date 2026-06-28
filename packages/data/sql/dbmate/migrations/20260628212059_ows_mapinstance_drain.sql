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
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mapinstances_drainstate_check'
    ) THEN
        ALTER TABLE MapInstances
            ADD CONSTRAINT mapinstances_drainstate_check CHECK (DrainState IN (1, 2));
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
