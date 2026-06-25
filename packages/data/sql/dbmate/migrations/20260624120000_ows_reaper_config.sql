-- migrate:up
SET search_path TO ows;

-- Per-tenant overrides for the empty-server reaper knobs. One row per tenant (PK customerguid);
-- every value column is NULLable so a tenant can override any subset — NULL means "fall back to
-- the rows env/default value". The reaper reads this each cycle and merges over its env baseline
-- (DB wins per field), so enable/disable/tuning is a DB change, no redeploy required.
CREATE TABLE IF NOT EXISTS reaperconfig
(
    CustomerGUID      UUID    NOT NULL,
    Enabled           BOOLEAN NULL,
    NeverReported     BOOLEAN NULL,
    RequireHeartbeat  BOOLEAN NULL,
    BootGraceSecs     BIGINT  NULL,
    BufferSecs        BIGINT  NULL,
    StaleSecs         BIGINT  NULL,
    MinEmptySecs      BIGINT  NULL,
    EmptyFreshSecs    BIGINT  NULL,
    CONSTRAINT PK_ReaperConfig PRIMARY KEY (CustomerGUID)
);

-- Security: mirror the ows-table pattern — block anon/authenticated/public, full access for the
-- ows + service_role roles (tenant isolation is enforced app-side via WHERE customerguid).
ALTER TABLE reaperconfig ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaperconfig FORCE ROW LEVEL SECURITY;
REVOKE ALL ON reaperconfig FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON reaperconfig TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reaperconfig TO ows;
CREATE POLICY ows_access ON reaperconfig FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON reaperconfig FOR ALL TO service_role USING (true) WITH CHECK (true);

-- migrate:down
SET search_path TO ows;

DROP TABLE IF EXISTS reaperconfig;
