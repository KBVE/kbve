-- OWS Schema: Races
SET search_path TO ows;

CREATE TABLE Races
(
    CustomerGUID UUID        NOT NULL,
    RaceID       SERIAL      NOT NULL,
    RaceName     VARCHAR(50) NOT NULL,
    CONSTRAINT PK_Races
        PRIMARY KEY (CustomerGUID, RaceID)
);

-- Security: Races
ALTER TABLE Races ENABLE ROW LEVEL SECURITY;
ALTER TABLE Races FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Races FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Races TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Races TO ows;
