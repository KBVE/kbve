-- OWS Schema: CharInventoryItems
SET search_path TO ows;

CREATE TABLE CharInventoryItems
(
    CustomerGUID          UUID                           NOT NULL,
    CharInventoryID       INT                            NOT NULL,
    CharInventoryItemID   SERIAL                         NOT NULL,
    ItemID                INT                            NOT NULL,
    InSlotNumber          INT                            NOT NULL,
    Quantity              INT                            NOT NULL,
    NumberOfUsesLeft      INT  DEFAULT 0                 NOT NULL,
    Condition             INT  DEFAULT 100               NOT NULL,
    CharInventoryItemGUID UUID DEFAULT gen_random_uuid() NOT NULL,
    CustomData            TEXT                           NULL,
    CONSTRAINT PK_CharInventoryItems
        PRIMARY KEY (CustomerGUID, CharInventoryID, CharInventoryItemID)
);

-- Security: CharInventoryItems
ALTER TABLE CharInventoryItems ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharInventoryItems FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharInventoryItems FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharInventoryItems TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharInventoryItems TO ows;
