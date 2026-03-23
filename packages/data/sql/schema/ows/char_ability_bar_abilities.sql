-- OWS Schema: CharAbilityBarAbilities
SET search_path TO ows;

CREATE TABLE CharAbilityBarAbilities
(
    CustomerGUID                      UUID          NOT NULL,
    CharAbilityBarAbilityID           SERIAL        NOT NULL,
    CharAbilityBarID                  INT           NOT NULL,
    CharHasAbilitiesID                INT           NOT NULL,
    CharAbilityBarAbilitiesCustomJSON TEXT          NULL,
    InSlotNumber                      INT DEFAULT 1 NOT NULL,
    CONSTRAINT PK_CharAbilityBarAbilities
        PRIMARY KEY (CustomerGUID, CharAbilityBarAbilityID),
    CONSTRAINT FK_CharAbilityBarAbilities_CharAbilityBarID
        FOREIGN KEY (CustomerGUID, CharAbilityBarID) REFERENCES CharAbilityBars (CustomerGUID, CharAbilityBarID),
    CONSTRAINT FK_CharAbilityBarAbilities_CharHasAbilities
        FOREIGN KEY (CustomerGUID, CharHasAbilitiesID) REFERENCES CharHasAbilities (CustomerGUID, CharHasAbilitiesID)
);

-- Security: CharAbilityBarAbilities
ALTER TABLE CharAbilityBarAbilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharAbilityBarAbilities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharAbilityBarAbilities FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharAbilityBarAbilities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharAbilityBarAbilities TO ows;
