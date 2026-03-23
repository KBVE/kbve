-- OWS Schema: AreaOfInterestTypes
SET search_path TO ows;

CREATE TABLE AreaOfInterestTypes
(
    AreaOfInterestTypeID   SERIAL
        CONSTRAINT PK_AreaOfInterestTypes
            PRIMARY KEY,
    AreaOfInterestTypeDesc VARCHAR(50) NOT NULL
);

-- Security: AreaOfInterestTypes
ALTER TABLE AreaOfInterestTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE AreaOfInterestTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AreaOfInterestTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreaOfInterestTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreaOfInterestTypes TO ows;
