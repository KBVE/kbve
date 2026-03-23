-- OWS Schema: WorldServers
SET search_path TO ows;

CREATE TABLE WorldServers
(
    CustomerGUID            UUID                     NOT NULL,
    WorldServerID           SERIAL                   NOT NULL,
    ServerIP                VARCHAR(50)              NOT NULL,
    MaxNumberOfInstances    INT                      NOT NULL,
    ActiveStartTime         TIMESTAMP                NULL,
    Port                    INT         DEFAULT 8181 NOT NULL,
    ServerStatus            SMALLINT    DEFAULT 0    NOT NULL,
    InternalServerIP        VARCHAR(50) DEFAULT ''   NOT NULL,
    StartingMapInstancePort INT         DEFAULT 7778 NOT NULL,
    ZoneServerGUID          UUID                     NULL,
    CONSTRAINT PK_WorldServers
        PRIMARY KEY (CustomerGUID, WorldServerID),
    CONSTRAINT AK_ZoneServers
        UNIQUE (CustomerGUID, ZoneServerGUID)
);

-- Security: WorldServers
ALTER TABLE WorldServers ENABLE ROW LEVEL SECURITY;
ALTER TABLE WorldServers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON WorldServers FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldServers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldServers TO ows;
