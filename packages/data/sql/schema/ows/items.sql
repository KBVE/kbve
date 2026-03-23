-- OWS Schema: Items
SET search_path TO ows;

CREATE TABLE Items
(
    CustomerGUID         UUID                          NOT NULL,
    ItemID               SERIAL                        NOT NULL,
    ItemTypeID           INT                           NOT NULL,
    ItemName             VARCHAR(50)                   NOT NULL,
    ItemWeight           DECIMAL(18, 2) DEFAULT 0      NOT NULL,
    ItemCanStack         BOOLEAN            DEFAULT FALSE NOT NULL,
    ItemStackSize        SMALLINT       DEFAULT 0      NOT NULL,
    ItemIsUsable         BOOLEAN            DEFAULT FALSE NOT NULL,
    ItemIsConsumedOnUse  BOOLEAN            DEFAULT TRUE NOT NULL,
    CustomData           VARCHAR(2000)  DEFAULT ''     NOT NULL,
    DefaultNumberOfUses  INT            DEFAULT 0      NOT NULL,
    ItemValue            INT            DEFAULT 0      NOT NULL,
    ItemMesh             VARCHAR(200)   DEFAULT ''     NOT NULL,
    MeshToUseForPickup   VARCHAR(200)   DEFAULT ''     NOT NULL,
    TextureToUseForIcon  VARCHAR(200)   DEFAULT ''     NOT NULL,
    PremiumCurrencyPrice INT            DEFAULT 0      NOT NULL,
    FreeCurrencyPrice    INT            DEFAULT 0      NOT NULL,
    ItemTier             INT            DEFAULT 0      NOT NULL,
    ItemDescription      TEXT           DEFAULT ''     NOT NULL,
    ItemCode             VARCHAR(50)    DEFAULT ''     NOT NULL,
    ItemDuration         INT            DEFAULT 0      NOT NULL,
    CanBeDropped         BOOLEAN            DEFAULT TRUE NOT NULL,
    CanBeDestroyed       BOOLEAN            DEFAULT FALSE NOT NULL,
    WeaponActorClass     VARCHAR(200)   DEFAULT ''     NOT NULL,
    StaticMesh           VARCHAR(200)   DEFAULT ''     NOT NULL,
    SkeletalMesh         VARCHAR(200)   DEFAULT ''     NOT NULL,
    ItemQuality          SMALLINT       DEFAULT 0      NOT NULL,
    IconSlotWidth        INT            DEFAULT 1      NOT NULL,
    IconSlotHeight       INT            DEFAULT 1      NOT NULL,
    ItemMeshID           INT            DEFAULT 0      NOT NULL,
    CONSTRAINT PK_Items
        PRIMARY KEY (CustomerGUID, ItemID)
);

-- Security: Items
ALTER TABLE Items ENABLE ROW LEVEL SECURITY;
ALTER TABLE Items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Items FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Items TO ows;
