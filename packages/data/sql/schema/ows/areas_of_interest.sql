-- OWS Schema: AreasOfInterest
SET search_path TO ows;

CREATE TABLE AreasOfInterest
(
    CustomerGUID        UUID        NOT NULL,
    AreasOfInterestGUID UUID        NOT NULL,
    MapZoneID           INT         NOT NULL,
    AreaOfInterestName  VARCHAR(50) NOT NULL,
    Radius              FLOAT       NOT NULL,
    AreaOfInterestType  INT         NOT NULL,
    X                   FLOAT,
    Y                   FLOAT,
    Z                   FLOAT,
    RX                  FLOAT,
    RY                  FLOAT,
    RZ                  FLOAT,
    CustomData          TEXT,
    CONSTRAINT PK_AreasOfInterest
        PRIMARY KEY (CustomerGUID, AreasOfInterestGUID)
);

-- Security: AreasOfInterest
ALTER TABLE AreasOfInterest ENABLE ROW LEVEL SECURITY;
ALTER TABLE AreasOfInterest FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AreasOfInterest FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreasOfInterest TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreasOfInterest TO ows;
