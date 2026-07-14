-- OWS Schema: deploy_state
-- Rollout state, one row per tenant: the authoritative server version target (a PVC path version,
-- not an image tag) plus rollout health. rolled=false = update pending (post-publish merge);
-- rolled=true = served (set by the orchestrator after a healthy soak, or by the one-shot
-- ReportBuild seed); health='unhealthy' = failed soak, surfaced on /health as deploy_healthy:false.
SET search_path TO ows;

CREATE TABLE deploy_state
(
    CustomerGUID  UUID    NOT NULL,
    TargetVersion TEXT    NOT NULL,
    Rolled        BOOLEAN NOT NULL DEFAULT false,
    Health        TEXT    NOT NULL DEFAULT 'healthy',
    UpdatedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT PK_DeployState
        PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_health CHECK (Health IN ('healthy','unhealthy'))
);

-- Security: deploy_state
ALTER TABLE deploy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON deploy_state FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON deploy_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON deploy_state TO ows;
CREATE POLICY ows_access ON deploy_state FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON deploy_state FOR ALL TO service_role USING (true) WITH CHECK (true);
