-- OWS Schema: CharInventory
SET search_path TO ows;

CREATE TABLE CharInventory
(
    CustomerGUID    UUID          NOT NULL,
    CharacterID     INT           NOT NULL,
    CharInventoryID SERIAL        NOT NULL,
    InventoryName   VARCHAR(50)   NOT NULL,
    InventorySize   INT           NOT NULL,
    InventoryWidth  INT DEFAULT 1 NOT NULL,
    InventoryHeight INT DEFAULT 1 NOT NULL,
    CONSTRAINT PK_CharInventory
        PRIMARY KEY (CustomerGUID, CharacterID, CharInventoryID)
);

-- Security: CharInventory
ALTER TABLE CharInventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharInventory FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharInventory FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharInventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharInventory TO ows;
