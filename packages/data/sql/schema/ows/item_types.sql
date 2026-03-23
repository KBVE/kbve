-- OWS Schema: ItemTypes
SET search_path TO ows;

CREATE TABLE ItemTypes
(
    CustomerGUID      UUID               NOT NULL,
    ItemTypeID        SERIAL             NOT NULL,
    ItemTypeDesc      VARCHAR(50)        NOT NULL,
    UserItemType      SMALLINT DEFAULT 0 NOT NULL,
    EquipmentType     SMALLINT DEFAULT 0 NOT NULL,
    ItemQuality       SMALLINT DEFAULT 0 NOT NULL,
    EquipmentSlotType SMALLINT DEFAULT 0 NOT NULL,
    CONSTRAINT PK_ItemTypes
        PRIMARY KEY (CustomerGUID, ItemTypeID)
);
