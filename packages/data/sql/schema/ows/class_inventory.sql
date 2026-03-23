-- OWS Schema: ClassInventory
SET search_path TO ows;

CREATE TABLE ClassInventory
(
    ClassInventoryID SERIAL      NOT NULL,
    CustomerGUID     UUID        NOT NULL,
    ClassID          INT         NOT NULL,
    InventoryName    VARCHAR(50) NOT NULL,
    InventorySize    INT         NOT NULL,
    InventoryWidth   INT         NOT NULL,
    InventoryHeight  INT         NOT NULL,
    CONSTRAINT PK_ClassInventory
        PRIMARY KEY (ClassInventoryID)
);

-- Security: ClassInventory
ALTER TABLE ClassInventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ClassInventory FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ClassInventory FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ClassInventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ClassInventory TO ows;
