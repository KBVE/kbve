-- OWS Schema: CharAbilityBars
SET search_path TO ows;

CREATE TABLE CharAbilityBars
(
    CustomerGUID              UUID                   NOT NULL,
    CharAbilityBarID          SERIAL                 NOT NULL,
    CharacterID               INT                    NOT NULL,
    AbilityBarName            VARCHAR(50) DEFAULT '' NOT NULL,
    CharAbilityBarsCustomJSON TEXT                   NULL,
    MaxNumberOfSlots          INT         DEFAULT 1  NOT NULL,
    NumberOfUnlockedSlots     INT         DEFAULT 1  NOT NULL,
    CONSTRAINT PK_CharAbilityBars
        PRIMARY KEY (CustomerGUID, CharAbilityBarID)
);

-- Security: CharAbilityBars
ALTER TABLE CharAbilityBars ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharAbilityBars FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharAbilityBars FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharAbilityBars TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharAbilityBars TO ows;
