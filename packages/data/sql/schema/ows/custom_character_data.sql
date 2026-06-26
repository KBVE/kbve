-- OWS Schema: CustomCharacterData
SET search_path TO ows;

CREATE TABLE CustomCharacterData
(
    CustomerGUID          UUID        NOT NULL,
    CustomCharacterDataID SERIAL      NOT NULL,
    CharacterID           INT         NOT NULL,
    CustomFieldName       VARCHAR(50) NOT NULL,
    FieldValue            TEXT        NOT NULL,
    CONSTRAINT PK_CustomCharacterData
        PRIMARY KEY (CustomerGUID, CustomCharacterDataID),
    CONSTRAINT FK_CustomCharacterData_CharID
        FOREIGN KEY (CustomerGUID, CharacterID) REFERENCES Characters (CustomerGUID, CharacterID),
    -- Natural key backing the `ON CONFLICT (customerguid, characterid, customfieldname)`
    -- upsert in CharsRepo::add_or_update_custom_data.
    CONSTRAINT UQ_CustomCharacterData_Field
        UNIQUE (CustomerGUID, CharacterID, CustomFieldName)
);

-- Security: CustomCharacterData
ALTER TABLE CustomCharacterData ENABLE ROW LEVEL SECURITY;
ALTER TABLE CustomCharacterData FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CustomCharacterData FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CustomCharacterData TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CustomCharacterData TO ows;
