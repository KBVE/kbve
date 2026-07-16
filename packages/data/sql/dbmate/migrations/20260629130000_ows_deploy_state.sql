-- migrate:up
SET search_path TO ows;

-- Rollout state, one row per tenant: the authoritative server version target (a PVC path version,
-- not an image tag) plus rollout health. Written rolled=false by the post-publish gate when a new
-- version merges; rolled=true by the deploy orchestrator only after a healthy soak;
-- health='unhealthy' on a failed soak (surfaced on /health as deploy_healthy:false). Read by
-- /health (unreal_version = the launcher's download target) and /fleet-restart/pending.
--
-- SEED NOTE: the tenant guid is not known at migration time (it is per-deployment env), so the
-- "seed the currently-served version" requirement is met by a one-shot ROWS upsert instead: the
-- ReportBuild path upserts (guid, reported_version, rolled=true) ON CONFLICT DO NOTHING, so the
-- row exists as soon as a GameServer checks in and never overwrites a real roll.
CREATE TABLE IF NOT EXISTS deploy_state
(
    CustomerGUID  UUID    NOT NULL,
    TargetVersion TEXT    NOT NULL,
    Rolled        BOOLEAN NOT NULL DEFAULT false,
    Health        TEXT    NOT NULL DEFAULT 'healthy',
    UpdatedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT PK_DeployState PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_health CHECK (Health IN ('healthy','unhealthy'))
);

ALTER TABLE deploy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON deploy_state FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON deploy_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON deploy_state TO ows;
-- Guarded: CREATE POLICY has no IF NOT EXISTS (see the fleet_restart migration note).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'ows'
                   AND tablename = 'deploy_state' AND policyname = 'ows_access') THEN
        CREATE POLICY ows_access ON deploy_state FOR ALL TO ows USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'ows'
                   AND tablename = 'deploy_state' AND policyname = 'service_role_access') THEN
        CREATE POLICY service_role_access ON deploy_state FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- migrate:down
SET search_path TO ows;
DROP TABLE IF EXISTS deploy_state;
