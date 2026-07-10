-- migrate:up
SET search_path TO ows;

-- Fleet-restart control row: operator/dashboard-written (like admission_control), consumed by the
-- ROWS fleet_restart_reconcile job. One row per tenant. Active=true fans set_drain_state across
-- active instances and (when Lockout) holds the admission lockout until the fleet drains. Inert
-- when absent or Active=false — the feature ships dark. Clear a restart with Active=false, never
-- DELETE (a deleted row is unreadable, so the one-shot lockout lift can't run).
CREATE TABLE IF NOT EXISTS fleet_restart
(
    CustomerGUID  UUID    NOT NULL,
    Active        BOOLEAN NOT NULL DEFAULT false,
    Reason        TEXT    NOT NULL DEFAULT 'fleet-restart',
    Urgency       SMALLINT NOT NULL DEFAULT 0,    -- 0 = when_able (non-aggressive); 1 = asap
    DropPlayers   BOOLEAN NOT NULL DEFAULT false, -- aggressive paths set true explicitly
    Stagger       BOOLEAN NOT NULL DEFAULT false,
    BatchSize     INT     NOT NULL DEFAULT 1,
    Lockout       BOOLEAN NOT NULL DEFAULT true, -- block new joins while active
    LockoutApplied BOOLEAN NOT NULL DEFAULT false,-- ownership flag: true while THIS restart holds the admission lockout (so the reconcile only lifts what it set)
    StartedAt     TIMESTAMPTZ NOT NULL DEFAULT now(), -- when this restart went active; backs the stall backstop
    DrainDeadline TIMESTAMPTZ NULL,              -- aggressive only: force-deallocate overdue instances past this; NULL on the non-aggressive path (never forces)
    TargetVersion TEXT    NULL,                  -- reserved (version-selective drain; deferred)
    RequestID     UUID    NOT NULL,
    CONSTRAINT PK_FleetRestart PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_urgency CHECK (Urgency IN (0,1)),
    -- Safe-by-default is a HARD invariant. Column defaults alone don't stop a hand-written /
    -- partial-upsert row like (urgency=0, dropplayers=true) from force-disconnecting on the
    -- "non-aggressive" path. Make it structural: force-disconnect and a deadline require aggressive.
    CONSTRAINT chk_safe_default   CHECK (Urgency = 1 OR DropPlayers = false),
    CONSTRAINT chk_deadline_aggr  CHECK (DrainDeadline IS NULL OR Urgency = 1)
);

-- Security: mirror the ows-table pattern — block anon/authenticated/public, full access for the
-- ows + service_role roles. NOTE: these USING(true) policies provide no tenant isolation; that is
-- acceptable only because ROWS is single-tenant-per-deployment (customer_guid comes from config).
ALTER TABLE fleet_restart ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_restart FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fleet_restart FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_restart TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_restart TO ows;
CREATE POLICY ows_access ON fleet_restart FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON fleet_restart FOR ALL TO service_role USING (true) WITH CHECK (true);

-- migrate:down
SET search_path TO ows;
DROP TABLE IF EXISTS fleet_restart;
