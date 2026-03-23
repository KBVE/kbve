-- OWS Schema: MapInstances
SET search_path TO ows;

CREATE TABLE MapInstances
(
    CustomerGUID            UUID                    NOT NULL,
    MapInstanceID           SERIAL                  NOT NULL,
    WorldServerID           INT                     NOT NULL,
    MapID                   INT                     NOT NULL,
    Port                    INT                     NOT NULL,
    Status                  INT       DEFAULT 0     NOT NULL,
    PlayerGroupID           INT                     NULL,
    NumberOfReportedPlayers INT       DEFAULT 0     NOT NULL,
    LastUpdateFromServer    TIMESTAMP               NULL,
    LastServerEmptyDate     TIMESTAMP               NULL,
    CreateDate              TIMESTAMP DEFAULT NOW() NOT NULL,
    CONSTRAINT PK_MapInstances
        PRIMARY KEY (CustomerGUID, MapInstanceID)
);

-- Security: MapInstances
ALTER TABLE MapInstances ENABLE ROW LEVEL SECURITY;
ALTER TABLE MapInstances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON MapInstances FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON MapInstances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON MapInstances TO ows;
