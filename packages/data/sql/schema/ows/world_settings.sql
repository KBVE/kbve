-- OWS Schema: WorldSettings
SET search_path TO ows;

CREATE TABLE WorldSettings
(
    CustomerGUID    UUID   NOT NULL,
    WorldSettingsID SERIAL NOT NULL,
    StartTime       BIGINT NOT NULL,
    CONSTRAINT PK_WorldSettings
        PRIMARY KEY (CustomerGUID, WorldSettingsID)
);

-- Security: WorldSettings
ALTER TABLE WorldSettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE WorldSettings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON WorldSettings FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldSettings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldSettings TO ows;
