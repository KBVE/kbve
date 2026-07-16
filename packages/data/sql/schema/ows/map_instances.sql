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
    GameServerName          VARCHAR(253)            NULL,
    DrainState              SMALLINT                NULL,
    DrainUrgency            SMALLINT                NULL,
    DrainDropPlayers        BOOLEAN                 NULL,
    DrainReason             TEXT                    NULL,
    DrainRequestID          UUID                    NULL,
    DrainDeadline           TIMESTAMP               NULL,
    CreateDate              TIMESTAMP DEFAULT NOW() NOT NULL,
    CONSTRAINT PK_MapInstances
        PRIMARY KEY (CustomerGUID, MapInstanceID),
    CONSTRAINT mapinstances_drainstate_check
        CHECK (DrainState IN (1, 2))
);

-- Index: reaper candidate scan (active rows only, ordered by empty-date then id)
CREATE INDEX IF NOT EXISTS idx_mapinstances_active
    ON MapInstances (CustomerGUID, LastServerEmptyDate, MapInstanceID)
    WHERE Status > 0;

-- Index: fleet-restart drainable scan (active, not-yet-draining rows, ordered by id — matches
-- list_drainable_instances exactly; built CONCURRENTLY by migration 20260629120100)
CREATE INDEX IF NOT EXISTS idx_mapinstances_drainable
    ON MapInstances (CustomerGUID, MapInstanceID)
    WHERE Status > 0 AND DrainState IS NULL;

-- Security: MapInstances
ALTER TABLE MapInstances ENABLE ROW LEVEL SECURITY;
ALTER TABLE MapInstances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON MapInstances FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON MapInstances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON MapInstances TO ows;
