-- OWS Schema: Maps
SET search_path TO ows;

CREATE TABLE Maps
(
    CustomerGUID                UUID                    NOT NULL,
    MapID                       SERIAL                  NOT NULL,
    MapName                     VARCHAR(50)             NOT NULL,
    MapData                     BYTEA                   NULL,
    Width                       SMALLINT                NOT NULL,
    Height                      SMALLINT                NOT NULL,
    ZoneName                    VARCHAR(50)             NOT NULL,
    WorldCompContainsFilter     VARCHAR(100) DEFAULT '' NOT NULL,
    WorldCompListFilter         VARCHAR(200) DEFAULT '' NOT NULL,
    MapMode                     INT          DEFAULT 1  NOT NULL,
    SoftPlayerCap               INT          DEFAULT 60 NOT NULL,
    HardPlayerCap               INT          DEFAULT 80 NOT NULL,
    MinutesToShutdownAfterEmpty INT          DEFAULT 1  NOT NULL,
    CONSTRAINT PK_Maps
        PRIMARY KEY (CustomerGUID, MapID)
);

-- Security: Maps
ALTER TABLE Maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE Maps FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Maps FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Maps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Maps TO ows;
