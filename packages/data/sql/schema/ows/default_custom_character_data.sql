-- OWS Schema: DefaultCustomCharacterData
SET search_path TO ows;

CREATE TABLE DefaultCustomCharacterData
(
    CustomerGUID                 UUID                       NOT NULL,
    DefaultCustomCharacterDataID SERIAL                     NOT NULL,
    DefaultCharacterValuesID     INT                        NOT NULL,
    CustomFieldName              VARCHAR(50)                NOT NULL,
    FieldValue                   TEXT                       NOT NULL,
    CONSTRAINT PK_DefaultCustomCharacterData
        PRIMARY KEY (DefaultCustomCharacterDataID, CustomerGUID),
    CONSTRAINT FK_DefaultCustomCharacterData_DefaultCharacterValueID
        FOREIGN KEY (DefaultCharacterValuesID, CustomerGUID) REFERENCES DefaultCharacterValues (DefaultCharacterValuesID, CustomerGUID)
);

-- Security: DefaultCustomCharacterData
ALTER TABLE DefaultCustomCharacterData ENABLE ROW LEVEL SECURITY;
ALTER TABLE DefaultCustomCharacterData FORCE ROW LEVEL SECURITY;
REVOKE ALL ON DefaultCustomCharacterData FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCustomCharacterData TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCustomCharacterData TO ows;
