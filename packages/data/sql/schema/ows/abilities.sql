-- OWS Schema: Abilities
SET search_path TO ows;

CREATE TABLE Abilities
(
    CustomerGUID             UUID                    NOT NULL,
    AbilityID                SERIAL,
    AbilityName              VARCHAR(50)             NOT NULL,
    AbilityTypeID            INT                     NOT NULL,
    TextureToUseForIcon      VARCHAR(200) DEFAULT '' NOT NULL,
    Class                    INT,
    Race                     INT,
    AbilityCustomJSON        TEXT,
    GameplayAbilityClassName VARCHAR(200) DEFAULT '' NOT NULL,
    CONSTRAINT PK_Abilities
        PRIMARY KEY (CustomerGUID, AbilityID),
    CONSTRAINT FK_Abilities_AbilityTypes
        FOREIGN KEY (CustomerGUID, AbilityTypeID) REFERENCES AbilityTypes (CustomerGUID, AbilityTypeID)
);

-- Security: Abilities
ALTER TABLE Abilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE Abilities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Abilities FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Abilities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Abilities TO ows;
