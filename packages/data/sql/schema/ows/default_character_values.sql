-- OWS Schema: DefaultCharacterValues
SET search_path TO ows;

CREATE TABLE DefaultCharacterValues
(
    CustomerGUID              UUID                       NOT NULL,
    DefaultCharacterValuesID  SERIAL                     NOT NULL,
    DefaultSetName            VARCHAR(50)                NOT NULL,
    StartingMapName           VARCHAR(50)                NOT NULL,
    X                         FLOAT                      NOT NULL,
    Y                         FLOAT                      NOT NULL,
    Z                         FLOAT                      NOT NULL,
    RX                        FLOAT        DEFAULT 0     NOT NULL,
    RY                        FLOAT        DEFAULT 0     NOT NULL,
    RZ                        FLOAT        DEFAULT 0     NOT NULL,
    CONSTRAINT PK_DefaultCharacterValues
        PRIMARY KEY (DefaultCharacterValuesID, CustomerGUID)
);

-- Security: DefaultCharacterValues
ALTER TABLE DefaultCharacterValues ENABLE ROW LEVEL SECURITY;
ALTER TABLE DefaultCharacterValues FORCE ROW LEVEL SECURITY;
REVOKE ALL ON DefaultCharacterValues FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCharacterValues TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCharacterValues TO ows;
