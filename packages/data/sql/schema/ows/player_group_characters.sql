-- OWS Schema: PlayerGroupCharacters
SET search_path TO ows;

CREATE TABLE PlayerGroupCharacters
(
    PlayerGroupID INT                     NOT NULL,
    CustomerGUID  UUID                    NOT NULL,
    CharacterID   INT                     NOT NULL,
    DateAdded     TIMESTAMP DEFAULT NOW() NOT NULL,
    TeamNumber    INT       DEFAULT 0     NOT NULL,
    CONSTRAINT PK_PlayerGroupCharacters
        PRIMARY KEY (PlayerGroupID, CustomerGUID, CharacterID)
);

-- Security: PlayerGroupCharacters
ALTER TABLE PlayerGroupCharacters ENABLE ROW LEVEL SECURITY;
ALTER TABLE PlayerGroupCharacters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON PlayerGroupCharacters FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroupCharacters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroupCharacters TO ows;
