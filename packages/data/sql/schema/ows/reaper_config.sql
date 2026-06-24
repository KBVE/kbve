-- OWS Schema: ReaperConfig
-- Per-tenant overrides for the empty-server reaper knobs. One row per tenant; every value column
-- is NULLable (NULL = fall back to the rows env/default). The reaper merges this over its env
-- baseline each cycle (DB wins per field), so enable/disable/tuning needs no redeploy.
SET search_path TO ows;

CREATE TABLE ReaperConfig
(
    CustomerGUID      UUID    NOT NULL,
    Enabled           BOOLEAN NULL,
    NeverReported     BOOLEAN NULL,
    RequireHeartbeat  BOOLEAN NULL,
    BootGraceSecs     BIGINT  NULL,
    BufferSecs        BIGINT  NULL,
    StaleSecs         BIGINT  NULL,
    MinEmptySecs      BIGINT  NULL,
    CONSTRAINT PK_ReaperConfig
        PRIMARY KEY (CustomerGUID)
);

-- Security: ReaperConfig
ALTER TABLE ReaperConfig ENABLE ROW LEVEL SECURITY;
ALTER TABLE ReaperConfig FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ReaperConfig FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ReaperConfig TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ReaperConfig TO ows;
CREATE POLICY ows_access ON ReaperConfig FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON ReaperConfig FOR ALL TO service_role USING (true) WITH CHECK (true);
