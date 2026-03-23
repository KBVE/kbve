-- OWS Schema: CharHasItems
SET search_path TO ows;

CREATE TABLE CharHasItems
(
    CustomerGUID  UUID               NOT NULL,
    CharacterID   INT                NOT NULL,
    CharHasItemID SERIAL             NOT NULL,
    ItemID        INT                NOT NULL,
    Quantity      INT DEFAULT 1      NOT NULL,
    Equipped      BOOLEAN DEFAULT FALSE NOT NULL,
    CONSTRAINT PK_CharHasItems
        PRIMARY KEY (CustomerGUID, CharacterID, CharHasItemID),
    CONSTRAINT FK_CharHasItems_CharacterID
        FOREIGN KEY (CustomerGUID, CharacterID) REFERENCES Characters (CustomerGUID, CharacterID)
);

-- Security: CharHasItems
ALTER TABLE CharHasItems ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharHasItems FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharHasItems FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharHasItems TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharHasItems TO ows;
