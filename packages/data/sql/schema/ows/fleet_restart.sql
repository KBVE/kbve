-- OWS Schema: fleet_restart
-- Fleet-restart control row: operator/dashboard-written (like admission_control), consumed by the
-- ROWS fleet_restart_reconcile job. One row per tenant. Active=true fans set_drain_state across
-- active instances and (when Lockout) holds the admission lockout until the fleet drains. Inert
-- when absent or Active=false. Clear with Active=false, never DELETE (the one-shot lockout lift
-- needs a readable row).
SET search_path TO ows;

CREATE TABLE fleet_restart
(
    CustomerGUID  UUID    NOT NULL,
    Active        BOOLEAN NOT NULL DEFAULT false,
    Reason        TEXT    NOT NULL DEFAULT 'fleet-restart',
    Urgency       SMALLINT NOT NULL DEFAULT 0,    -- 0 = when_able (non-aggressive); 1 = asap
    DropPlayers   BOOLEAN NOT NULL DEFAULT false, -- aggressive paths set true explicitly
    Stagger       BOOLEAN NOT NULL DEFAULT false,
    BatchSize     INT     NOT NULL DEFAULT 1,
    Lockout       BOOLEAN NOT NULL DEFAULT true, -- block new joins while active
    LockoutApplied BOOLEAN NOT NULL DEFAULT false,-- ownership: true while THIS restart holds the admission lockout
    StartedAt     TIMESTAMPTZ NOT NULL DEFAULT now(), -- stall-backstop clock
    DrainDeadline TIMESTAMPTZ NULL,              -- aggressive only; NULL = never force
    DrainedAt     TIMESTAMPTZ NULL,              -- barrier latch: set once by the reconcile when draining==0 AND gameservers==0; past this the drain fan-out STOPS (later instances are the new fleet). Reset to NULL on (re)activation.
    TargetVersion TEXT    NULL,                  -- reserved (version-selective drain; deferred)
    RequestID     UUID    NOT NULL DEFAULT gen_random_uuid(),
    CONSTRAINT PK_FleetRestart
        PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_urgency CHECK (Urgency IN (0,1)),
    CONSTRAINT chk_batchsize CHECK (BatchSize >= 1),
    -- Safe-by-default, structurally: force-disconnect and a deadline require aggressive.
    CONSTRAINT chk_safe_default   CHECK (Urgency = 1 OR DropPlayers = false),
    CONSTRAINT chk_deadline_aggr  CHECK (DrainDeadline IS NULL OR Urgency = 1)
);

-- Security: fleet_restart
ALTER TABLE fleet_restart ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_restart FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fleet_restart FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_restart TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_restart TO ows;
CREATE POLICY ows_access ON fleet_restart FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON fleet_restart FOR ALL TO service_role USING (true) WITH CHECK (true);
