-- OWS Schema: CharOnMapInstance
SET search_path TO ows;

CREATE TABLE CharOnMapInstance
(
    CustomerGUID  UUID NOT NULL,
    CharacterID   INT  NOT NULL,
    MapInstanceID INT  NOT NULL,
    CONSTRAINT PK_CharOnMapInstance
        PRIMARY KEY (CustomerGUID, CharacterID, MapInstanceID)
);

-- Security: CharOnMapInstance
ALTER TABLE CharOnMapInstance ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharOnMapInstance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharOnMapInstance FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharOnMapInstance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharOnMapInstance TO ows;
