-- migrate:up
SET search_path TO ows;

-- Whole-fleet version roll (apps/rows/docs/2026-08-30-rows-whole-fleet-version-roll.md).
--
-- deploy_state previously held only "what version do we want" (TargetVersion) and a boolean
-- "have we got there" (Rolled). That is not enough to drive a roll:
--
--   BootVersion — what a GameServer should load RIGHT NOW. The fleet launchers ask ROWS for
--   this at container start instead of picking the newest directory off the PVC themselves.
--   Without it the fleet is mixed for the whole publish→roll window: every pod created by
--   normal churn boots the new build while Allocated servers still serve the old one. ROWS
--   moves BootVersion to TargetVersion as the first step of a roll, so pods created while
--   waiting keep booting the old build and the fleet stays on one version throughout.
--
--   RollPhase — the roll is a multi-tick state machine and Rolled alone cannot represent it.
--   Mid-roll the fleet is empty and joins are locked out, so "zero active instances" reads
--   true again on the next tick; without a persisted phase the reconcile re-scales to zero
--   every 30s and kills the servers it just created.
--
-- Both are additive and nullable/defaulted, so an existing row keeps working: BootVersion NULL
-- means "no roll has happened yet", which the boot endpoint reports as unset.

ALTER TABLE deploy_state
    ADD COLUMN IF NOT EXISTS BootVersion TEXT NULL,
    ADD COLUMN IF NOT EXISTS RollPhase   TEXT NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS PhaseSince  TIMESTAMPTZ NOT NULL DEFAULT now();

-- idle      — nothing to do; BootVersion == TargetVersion, or no target set.
-- pending   — a newer TargetVersion exists; waiting for the game to be empty.
-- swapping  — lockout held, BootVersion moved, fleet scaled to 0, waiting for the
--             pre-scale GameServers to disappear.
-- settling  — lockout released, waiting for a GameServer to come up on the new version.
ALTER TABLE deploy_state
    DROP CONSTRAINT IF EXISTS chk_rollphase;
ALTER TABLE deploy_state
    ADD CONSTRAINT chk_rollphase
    CHECK (RollPhase IN ('idle', 'pending', 'swapping', 'settling'));

-- Backfill: an existing row was seeded by ReportBuild with the version a GameServer actually
-- loaded, so that version is by definition what pods should boot today.
UPDATE deploy_state SET BootVersion = TargetVersion WHERE BootVersion IS NULL;

-- migrate:down
SET search_path TO ows;

ALTER TABLE deploy_state DROP CONSTRAINT IF EXISTS chk_rollphase;
ALTER TABLE deploy_state
    DROP COLUMN IF EXISTS BootVersion,
    DROP COLUMN IF EXISTS RollPhase,
    DROP COLUMN IF EXISTS PhaseSince;
