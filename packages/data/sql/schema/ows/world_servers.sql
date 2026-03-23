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
