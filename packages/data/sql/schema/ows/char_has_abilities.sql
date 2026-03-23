-- OWS Schema: CharHasAbilities
SET search_path TO ows;

CREATE TABLE CharHasAbilities
(
    CustomerGUID               UUID          NOT NULL,
    CharHasAbilitiesID         SERIAL        NOT NULL,
    CharacterID                INT           NOT NULL,
    AbilityID                  INT           NOT NULL,
    AbilityLevel               INT DEFAULT 1 NOT NULL,
    CharHasAbilitiesCustomJSON TEXT          NULL,
    CONSTRAINT PK_CharHasAbilities
        PRIMARY KEY (CustomerGUID, CharHasAbilitiesID),
    CONSTRAINT FK_CharHasAbilities_CharacterID
        FOREIGN KEY (CustomerGUID, CharacterID) REFERENCES Characters (CustomerGUID, CharacterID)
);

-- Security: CharHasAbilities
ALTER TABLE CharHasAbilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharHasAbilities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharHasAbilities FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharHasAbilities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharHasAbilities TO ows;
