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
