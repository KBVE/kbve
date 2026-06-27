-- OWS Schema: Maps
SET search_path TO ows;

CREATE TABLE Maps
(
    CustomerGUID                UUID                    NOT NULL,
    MapID                       SERIAL                  NOT NULL,
    MapName                     VARCHAR(50)             NOT NULL,
    MapData                     BYTEA                   NULL,
    -- DEFAULT 0 so ZonesRepo::add_zone (which omits Width/Height) yields a valid
    -- candidate tuple; NOT NULL is checked before ON CONFLICT arbitration. The
    -- map-registration path sets real dimensions; DO UPDATE never touches these.
    Width                       SMALLINT     DEFAULT 0  NOT NULL,
    Height                      SMALLINT     DEFAULT 0  NOT NULL,
    ZoneName                    VARCHAR(50)             NOT NULL,
    WorldCompContainsFilter     VARCHAR(100) DEFAULT '' NOT NULL,
    WorldCompListFilter         VARCHAR(200) DEFAULT '' NOT NULL,
    MapMode                     INT          DEFAULT 1  NOT NULL,
    SoftPlayerCap               INT          DEFAULT 60 NOT NULL,
    HardPlayerCap               INT          DEFAULT 80 NOT NULL,
    MinutesToShutdownAfterEmpty INT          DEFAULT 1  NOT NULL,
    CONSTRAINT PK_Maps
        PRIMARY KEY (CustomerGUID, MapID),
    -- Natural per-tenant key backing the `ON CONFLICT (customerguid, mapname)`
    -- upsert in ZonesRepo::add_zone.
    CONSTRAINT UQ_Maps_MapName
        UNIQUE (CustomerGUID, MapName)
);

-- Security: Maps
ALTER TABLE Maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE Maps FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Maps FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Maps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Maps TO ows;
