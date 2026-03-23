-- migrate:up

-- OWS (Open World Server) schema initialization
-- Source: chuck/OWS/src/.docker/postgres/setup.sql + cumulative updates
-- 37 tables with RLS enabled, access restricted to service_role and ows

CREATE SCHEMA IF NOT EXISTS ows;
SET search_path TO ows;

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- Create ows role (LOGIN disabled — used via connection string, not interactive)
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ows') THEN
        CREATE ROLE ows NOLOGIN;
    END IF;
END $$;

-- Schema-level security: block anon/authenticated/public from ows schema
REVOKE ALL ON SCHEMA ows FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SCHEMA ows TO service_role;
GRANT USAGE ON SCHEMA ows TO ows;

CREATE TABLE DebugLog
(
    DebugLogID   SERIAL
        CONSTRAINT PK_DebugLogK
            PRIMARY KEY,
    DebugDate    TIMESTAMP,
    DebugDesc    TEXT,
    CustomerGUID UUID
);
-- Security: DebugLog
ALTER TABLE DebugLog ENABLE ROW LEVEL SECURITY;
ALTER TABLE DebugLog FORCE ROW LEVEL SECURITY;
REVOKE ALL ON DebugLog FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON DebugLog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON DebugLog TO ows;

CREATE TABLE Customers
(
    CustomerGUID       UUID        DEFAULT gen_random_uuid() NOT NULL
        CONSTRAINT PK_Customers
            PRIMARY KEY,
    CustomerName       VARCHAR(50)                           NOT NULL,
    CustomerEmail      VARCHAR(255)                          NOT NULL,
    CustomerPhone      VARCHAR(20),
    CustomerNotes      TEXT,
    EnableDebugLogging BOOLEAN         DEFAULT FALSE            NOT NULL,
    EnableAutoLoopBack BOOLEAN         DEFAULT TRUE            NOT NULL,
    DeveloperPaid      BOOLEAN         DEFAULT FALSE            NOT NULL,
    PublisherPaidDate  TIMESTAMP,
    StripeCustomerID   VARCHAR(50) DEFAULT ''                NOT NULL,
    FreeTrialStarted   TIMESTAMP,
    SupportUnicode     BOOLEAN         DEFAULT FALSE            NOT NULL,
    CreateDate         TIMESTAMP   DEFAULT NOW()             NOT NULL,
    NoPortForwarding   BOOLEAN         DEFAULT FALSE            NOT NULL
);
-- Security: Customers
ALTER TABLE Customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE Customers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Customers FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Customers TO ows;

CREATE TABLE OWSVersion
(
    OWSDBVersion VARCHAR(10) NULL
);
-- Security: OWSVersion
ALTER TABLE OWSVersion ENABLE ROW LEVEL SECURITY;
ALTER TABLE OWSVersion FORCE ROW LEVEL SECURITY;
REVOKE ALL ON OWSVersion FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON OWSVersion TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON OWSVersion TO ows;

CREATE TABLE WorldSettings
(
    CustomerGUID    UUID   NOT NULL,
    WorldSettingsID SERIAL NOT NULL,
    StartTime       BIGINT NOT NULL,
    CONSTRAINT PK_WorldSettings
        PRIMARY KEY (CustomerGUID, WorldSettingsID)
);
-- Security: WorldSettings
ALTER TABLE WorldSettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE WorldSettings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON WorldSettings FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldSettings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldSettings TO ows;

CREATE TABLE AbilityTypes
(
    AbilityTypeID   SERIAL,
    AbilityTypeName VARCHAR(50) NOT NULL,
    CustomerGUID    UUID        NOT NULL,
    CONSTRAINT PK_AbilityTypes
        PRIMARY KEY (AbilityTypeID, CustomerGUID)
);
-- Security: AbilityTypes
ALTER TABLE AbilityTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE AbilityTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AbilityTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AbilityTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AbilityTypes TO ows;

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

CREATE TABLE AreaOfInterestTypes
(
    AreaOfInterestTypeID   SERIAL
        CONSTRAINT PK_AreaOfInterestTypes
            PRIMARY KEY,
    AreaOfInterestTypeDesc VARCHAR(50) NOT NULL
);
-- Security: AreaOfInterestTypes
ALTER TABLE AreaOfInterestTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE AreaOfInterestTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AreaOfInterestTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreaOfInterestTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreaOfInterestTypes TO ows;

CREATE TABLE AreasOfInterest
(
    CustomerGUID        UUID        NOT NULL,
    AreasOfInterestGUID UUID        NOT NULL,
    MapZoneID           INT         NOT NULL,
    AreaOfInterestName  VARCHAR(50) NOT NULL,
    Radius              FLOAT       NOT NULL,
    AreaOfInterestType  INT         NOT NULL,
    X                   FLOAT,
    Y                   FLOAT,
    Z                   FLOAT,
    RX                  FLOAT,
    RY                  FLOAT,
    RZ                  FLOAT,
    CustomData          TEXT,
    CONSTRAINT PK_AreasOfInterest
        PRIMARY KEY (CustomerGUID, AreasOfInterestGUID)
);
-- Security: AreasOfInterest
ALTER TABLE AreasOfInterest ENABLE ROW LEVEL SECURITY;
ALTER TABLE AreasOfInterest FORCE ROW LEVEL SECURITY;
REVOKE ALL ON AreasOfInterest FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreasOfInterest TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON AreasOfInterest TO ows;

CREATE TABLE Users
(
    UserGUID     UUID      DEFAULT gen_random_uuid() NOT NULL
        CONSTRAINT PK_Users
            PRIMARY KEY,
    CustomerGUID UUID                                NOT NULL,
    FirstName    VARCHAR(50)                         NOT NULL,
    LastName     VARCHAR(50)                         NOT NULL,
    Email        VARCHAR(255)                        NOT NULL,
    PasswordHash VARCHAR(128)                        NOT NULL,
    CreateDate   TIMESTAMP DEFAULT NOW()             NOT NULL,
    LastAccess   TIMESTAMP DEFAULT NOW()             NOT NULL,
    Role         VARCHAR(10)                         NOT NULL,
    CONSTRAINT AK_User
        UNIQUE (CustomerGUID, Email, Role)
);
-- Security: Users
ALTER TABLE Users ENABLE ROW LEVEL SECURITY;
ALTER TABLE Users FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Users FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Users TO ows;

CREATE TABLE Characters
(
    CustomerGUID              UUID                        NOT NULL,
    CharacterID               SERIAL                      NOT NULL,
    UserGUID                  UUID                        NULL,
    Email                     VARCHAR(256)                NOT NULL,
    CharName                  VARCHAR(50)                 NOT NULL,
    MapName                   VARCHAR(50)                 NULL,
    X                         FLOAT                       NOT NULL,
    Y                         FLOAT                       NOT NULL,
    Z                         FLOAT                       NOT NULL,
    Perception                FLOAT                       NOT NULL,
    Acrobatics                FLOAT                       NOT NULL,
    Climb                     FLOAT                       NOT NULL,
    Stealth                   FLOAT                       NOT NULL,
    ServerIP                  VARCHAR(50)                 NULL,
    LastActivity              TIMESTAMP    DEFAULT NOW()  NOT NULL,
    RX                        FLOAT        DEFAULT 0      NOT NULL,
    RY                        FLOAT        DEFAULT 0      NOT NULL,
    RZ                        FLOAT        DEFAULT 0      NOT NULL,
    Spirit                    FLOAT        DEFAULT 0      NOT NULL,
    Magic                     FLOAT        DEFAULT 0      NOT NULL,
    TeamNumber                INT          DEFAULT 0      NOT NULL,
    Thirst                    FLOAT        DEFAULT 0      NOT NULL,
    Hunger                    FLOAT        DEFAULT 0      NOT NULL,
    Gold                      INT          DEFAULT 0      NOT NULL,
    Score                     INT          DEFAULT 0      NOT NULL,
    CharacterLevel            SMALLINT     DEFAULT 0      NOT NULL,
    Gender                    SMALLINT     DEFAULT 0      NOT NULL,
    XP                        INT          DEFAULT 0      NOT NULL,
    HitDie                    SMALLINT     DEFAULT 0      NOT NULL,
    Wounds                    FLOAT        DEFAULT 0      NOT NULL,
    Size                      SMALLINT     DEFAULT 0      NOT NULL,
    Weight                    FLOAT        DEFAULT 0      NOT NULL,
    MaxHealth                 FLOAT        DEFAULT 0      NOT NULL,
    Health                    FLOAT        DEFAULT 0      NOT NULL,
    HealthRegenRate           FLOAT        DEFAULT 0      NOT NULL,
    MaxMana                   FLOAT        DEFAULT 0      NOT NULL,
    Mana                      FLOAT        DEFAULT 0      NOT NULL,
    ManaRegenRate             FLOAT        DEFAULT 0      NOT NULL,
    MaxEnergy                 FLOAT        DEFAULT 0      NOT NULL,
    Energy                    FLOAT        DEFAULT 0      NOT NULL,
    EnergyRegenRate           FLOAT        DEFAULT 0      NOT NULL,
    MaxFatigue                FLOAT        DEFAULT 0      NOT NULL,
    Fatigue                   FLOAT        DEFAULT 0      NOT NULL,
    FatigueRegenRate          FLOAT        DEFAULT 0      NOT NULL,
    MaxStamina                FLOAT        DEFAULT 0      NOT NULL,
    Stamina                   FLOAT        DEFAULT 0      NOT NULL,
    StaminaRegenRate          FLOAT        DEFAULT 0      NOT NULL,
    MaxEndurance              FLOAT        DEFAULT 0      NOT NULL,
    Endurance                 FLOAT        DEFAULT 0      NOT NULL,
    EnduranceRegenRate        FLOAT        DEFAULT 0      NOT NULL,
    Strength                  FLOAT        DEFAULT 0      NOT NULL,
    Dexterity                 FLOAT        DEFAULT 0      NOT NULL,
    Constitution              FLOAT        DEFAULT 0      NOT NULL,
    Intellect                 FLOAT        DEFAULT 0      NOT NULL,
    Wisdom                    FLOAT        DEFAULT 0      NOT NULL,
    Charisma                  FLOAT        DEFAULT 0      NOT NULL,
    Agility                   FLOAT        DEFAULT 0      NOT NULL,
    Fortitude                 FLOAT        DEFAULT 0      NOT NULL,
    Reflex                    FLOAT        DEFAULT 0      NOT NULL,
    Willpower                 FLOAT        DEFAULT 0      NOT NULL,
    BaseAttack                FLOAT        DEFAULT 0      NOT NULL,
    BaseAttackBonus           FLOAT        DEFAULT 0      NOT NULL,
    AttackPower               FLOAT        DEFAULT 0      NOT NULL,
    AttackSpeed               FLOAT        DEFAULT 0      NOT NULL,
    CritChance                FLOAT        DEFAULT 0      NOT NULL,
    CritMultiplier            FLOAT        DEFAULT 0      NOT NULL,
    Haste                     FLOAT        DEFAULT 0      NOT NULL,
    SpellPower                FLOAT        DEFAULT 0      NOT NULL,
    SpellPenetration          FLOAT        DEFAULT 0      NOT NULL,
    Defense                   FLOAT        DEFAULT 0      NOT NULL,
    Dodge                     FLOAT        DEFAULT 0      NOT NULL,
    Parry                     FLOAT        DEFAULT 0      NOT NULL,
    Avoidance                 FLOAT        DEFAULT 0      NOT NULL,
    Versatility               FLOAT        DEFAULT 0      NOT NULL,
    Multishot                 FLOAT        DEFAULT 0      NOT NULL,
    Initiative                FLOAT        DEFAULT 0      NOT NULL,
    NaturalArmor              FLOAT        DEFAULT 0      NOT NULL,
    PhysicalArmor             FLOAT        DEFAULT 0      NOT NULL,
    BonusArmor                FLOAT        DEFAULT 0      NOT NULL,
    ForceArmor                FLOAT        DEFAULT 0      NOT NULL,
    MagicArmor                FLOAT        DEFAULT 0      NOT NULL,
    Resistance                FLOAT        DEFAULT 0      NOT NULL,
    ReloadSpeed               FLOAT        DEFAULT 0      NOT NULL,
    Range                     FLOAT        DEFAULT 0      NOT NULL,
    Speed                     FLOAT        DEFAULT 0      NOT NULL,
    Silver                    INT          DEFAULT 0      NOT NULL,
    Copper                    INT          DEFAULT 0      NOT NULL,
    FreeCurrency              INT          DEFAULT 0      NOT NULL,
    PremiumCurrency           INT          DEFAULT 0      NOT NULL,
    Fame                      FLOAT        DEFAULT 0      NOT NULL,
    Alignment                 FLOAT        DEFAULT 0      NOT NULL,
    Description               TEXT                        NULL,
    DefaultPawnClassPath      VARCHAR(200) DEFAULT ''     NOT NULL,
    IsInternalNetworkTestUser BOOLEAN          DEFAULT FALSE NOT NULL,
    ClassID                   INT                         NOT NULL,
    BaseMesh                  VARCHAR(100)                NULL,
    IsAdmin                   BOOLEAN          DEFAULT FALSE NOT NULL,
    IsModerator               BOOLEAN          DEFAULT FALSE NOT NULL,
    CreateDate                TIMESTAMP    DEFAULT NOW()  NOT NULL,
    CONSTRAINT PK_Chars
        PRIMARY KEY (CustomerGUID, CharacterID),
    CONSTRAINT FK_Characters_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID)
);
-- Security: Characters
ALTER TABLE Characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE Characters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Characters FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Characters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Characters TO ows;

CREATE TABLE CharHasAbilities
(
    CustomerGUID               UUID          NOT NULL,
    CharHasAbilitiesID         SERIAL        NOT NULL,
    CharacterID                INT           NOT NULL,
    AbilityID                  INT           NOT NULL,
    AbilityLevel               INT DEFAULT 1 NOT NULL,
    CharHasAbilitiesCustomJSON TEXT          NULL,
    CONSTRAINT PK_CharHasAbilities
        PRIMARY KEY (CustomerGUID, CharHasAbilitiesID),
    CONSTRAINT FK_CharHasAbilities_CharacterID
        FOREIGN KEY (CustomerGUID, CharacterID) REFERENCES Characters (CustomerGUID, CharacterID)
);
-- Security: CharHasAbilities
ALTER TABLE CharHasAbilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharHasAbilities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharHasAbilities FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharHasAbilities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharHasAbilities TO ows;

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

CREATE TABLE CharOnMapInstance
(
    CustomerGUID  UUID NOT NULL,
    CharacterID   INT  NOT NULL,
    MapInstanceID INT  NOT NULL,
    CONSTRAINT PK_CharOnMapInstance
        PRIMARY KEY (CustomerGUID, CharacterID, MapInstanceID)
);
-- Security: CharOnMapInstance
ALTER TABLE CharOnMapInstance ENABLE ROW LEVEL SECURITY;
ALTER TABLE CharOnMapInstance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CharOnMapInstance FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharOnMapInstance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CharOnMapInstance TO ows;

CREATE TABLE ChatGroups
(
    CustomerGUID  UUID        NOT NULL,
    ChatGroupID   SERIAL      NOT NULL,
    ChatGroupName VARCHAR(50) NOT NULL,
    CONSTRAINT PK_ChatGroups
        PRIMARY KEY (CustomerGUID, ChatGroupID)
);
-- Security: ChatGroups
ALTER TABLE ChatGroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ChatGroups FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ChatGroups FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroups TO ows;

CREATE TABLE ChatGroupUsers
(
    CustomerGUID UUID NOT NULL,
    ChatGroupID  INT  NOT NULL,
    CharacterID  INT  NOT NULL,
    CONSTRAINT PK_ChatGroupUsers
        PRIMARY KEY (CustomerGUID, ChatGroupID, CharacterID)
);
-- Security: ChatGroupUsers
ALTER TABLE ChatGroupUsers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ChatGroupUsers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ChatGroupUsers FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroupUsers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroupUsers TO ows;

CREATE TABLE ChatMessages
(
    CustomerGUID  UUID                    NOT NULL,
    ChatMessageID SERIAL                  NOT NULL,
    SentByCharID  INT                     NOT NULL,
    SentToCharID  INT                     NULL,
    ChatGroupID   INT                     NULL,
    ChatMessage   TEXT                    NOT NULL,
    MessageDate   TIMESTAMP DEFAULT NOW() NOT NULL,
    CONSTRAINT PK_ChatMessages
        PRIMARY KEY (CustomerGUID, ChatMessageID)
);
-- Security: ChatMessages
ALTER TABLE ChatMessages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ChatMessages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ChatMessages FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatMessages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatMessages TO ows;

CREATE TABLE Class
(
    CustomerGUID       UUID                   NOT NULL,
    ClassID            SERIAL                 NOT NULL,
    ClassName          VARCHAR(50) DEFAULT '' NOT NULL,
    StartingMapName    VARCHAR(50)            NOT NULL,
    X                  FLOAT                  NOT NULL,
    Y                  FLOAT                  NOT NULL,
    Z                  FLOAT                  NOT NULL,
    Perception         FLOAT                  NOT NULL,
    Acrobatics         FLOAT                  NOT NULL,
    Climb              FLOAT                  NOT NULL,
    Stealth            FLOAT                  NOT NULL,
    RX                 FLOAT                  NOT NULL,
    RY                 FLOAT                  NOT NULL,
    RZ                 FLOAT                  NOT NULL,
    Spirit             FLOAT                  NOT NULL,
    Magic              FLOAT                  NOT NULL,
    TeamNumber         INT                    NOT NULL,
    Thirst             FLOAT                  NOT NULL,
    Hunger             FLOAT                  NOT NULL,
    Gold               INT                    NOT NULL,
    Score              INT                    NOT NULL,
    CharacterLevel     SMALLINT               NOT NULL,
    Gender             SMALLINT               NOT NULL,
    XP                 INT                    NOT NULL,
    HitDie             SMALLINT               NOT NULL,
    Wounds             FLOAT                  NOT NULL,
    Size               SMALLINT               NOT NULL,
    Weight             FLOAT                  NOT NULL,
    MaxHealth          FLOAT                  NOT NULL,
    Health             FLOAT                  NOT NULL,
    HealthRegenRate    FLOAT                  NOT NULL,
    MaxMana            FLOAT                  NOT NULL,
    Mana               FLOAT                  NOT NULL,
    ManaRegenRate      FLOAT                  NOT NULL,
    MaxEnergy          FLOAT                  NOT NULL,
    Energy             FLOAT                  NOT NULL,
    EnergyRegenRate    FLOAT                  NOT NULL,
    MaxFatigue         FLOAT                  NOT NULL,
    Fatigue            FLOAT                  NOT NULL,
    FatigueRegenRate   FLOAT                  NOT NULL,
    MaxStamina         FLOAT                  NOT NULL,
    Stamina            FLOAT                  NOT NULL,
    StaminaRegenRate   FLOAT                  NOT NULL,
    MaxEndurance       FLOAT                  NOT NULL,
    Endurance          FLOAT                  NOT NULL,
    EnduranceRegenRate FLOAT                  NOT NULL,
    Strength           FLOAT                  NOT NULL,
    Dexterity          FLOAT                  NOT NULL,
    Constitution       FLOAT                  NOT NULL,
    Intellect          FLOAT                  NOT NULL,
    Wisdom             FLOAT                  NOT NULL,
    Charisma           FLOAT                  NOT NULL,
    Agility            FLOAT                  NOT NULL,
    Fortitude          FLOAT                  NOT NULL,
    Reflex             FLOAT                  NOT NULL,
    Willpower          FLOAT                  NOT NULL,
    BaseAttack         FLOAT                  NOT NULL,
    BaseAttackBonus    FLOAT                  NOT NULL,
    AttackPower        FLOAT                  NOT NULL,
    AttackSpeed        FLOAT                  NOT NULL,
    CritChance         FLOAT                  NOT NULL,
    CritMultiplier     FLOAT                  NOT NULL,
    Haste              FLOAT                  NOT NULL,
    SpellPower         FLOAT                  NOT NULL,
    SpellPenetration   FLOAT                  NOT NULL,
    Defense            FLOAT                  NOT NULL,
    Dodge              FLOAT                  NOT NULL,
    Parry              FLOAT                  NOT NULL,
    Avoidance          FLOAT                  NOT NULL,
    Versatility        FLOAT                  NOT NULL,
    Multishot          FLOAT                  NOT NULL,
    Initiative         FLOAT                  NOT NULL,
    NaturalArmor       FLOAT                  NOT NULL,
    PhysicalArmor      FLOAT                  NOT NULL,
    BonusArmor         FLOAT                  NOT NULL,
    ForceArmor         FLOAT                  NOT NULL,
    MagicArmor         FLOAT                  NOT NULL,
    Resistance         FLOAT                  NOT NULL,
    ReloadSpeed        FLOAT                  NOT NULL,
    Range              FLOAT                  NOT NULL,
    Speed              FLOAT                  NOT NULL,
    Silver             INT                    NOT NULL,
    Copper             INT                    NOT NULL,
    FreeCurrency       INT                    NOT NULL,
    PremiumCurrency    INT                    NOT NULL,
    Fame               FLOAT                  NOT NULL,
    Alignment          FLOAT                  NOT NULL,
    Description        TEXT                   NULL,
    CONSTRAINT PK_Class
        PRIMARY KEY (CustomerGUID, ClassID)
);
-- Security: Class
ALTER TABLE Class ENABLE ROW LEVEL SECURITY;
ALTER TABLE Class FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Class FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Class TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Class TO ows;

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

CREATE TABLE CustomCharacterData
(
    CustomerGUID          UUID        NOT NULL,
    CustomCharacterDataID SERIAL      NOT NULL,
    CharacterID           INT         NOT NULL,
    CustomFieldName       VARCHAR(50) NOT NULL,
    FieldValue            TEXT        NOT NULL,
    CONSTRAINT PK_CustomCharacterData
        PRIMARY KEY (CustomerGUID, CustomCharacterDataID),
    CONSTRAINT FK_CustomCharacterData_CharID
        FOREIGN KEY (CustomerGUID, CharacterID) REFERENCES Characters (CustomerGUID, CharacterID)
);
-- Security: CustomCharacterData
ALTER TABLE CustomCharacterData ENABLE ROW LEVEL SECURITY;
ALTER TABLE CustomCharacterData FORCE ROW LEVEL SECURITY;
REVOKE ALL ON CustomCharacterData FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON CustomCharacterData TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON CustomCharacterData TO ows;

CREATE TABLE DefaultCharacterValues
(
    CustomerGUID              UUID                       NOT NULL,
    DefaultCharacterValuesID  SERIAL                     NOT NULL,
    DefaultSetName            VARCHAR(50)                NOT NULL,
    StartingMapName           VARCHAR(50)                NOT NULL,
    X                         FLOAT                      NOT NULL,
    Y                         FLOAT                      NOT NULL,
    Z                         FLOAT                      NOT NULL,
    RX                        FLOAT        DEFAULT 0     NOT NULL,
    RY                        FLOAT        DEFAULT 0     NOT NULL,
    RZ                        FLOAT        DEFAULT 0     NOT NULL,
    CONSTRAINT PK_DefaultCharacterValues
        PRIMARY KEY (DefaultCharacterValuesID, CustomerGUID)
);
-- Security: DefaultCharacterValues
ALTER TABLE DefaultCharacterValues ENABLE ROW LEVEL SECURITY;
ALTER TABLE DefaultCharacterValues FORCE ROW LEVEL SECURITY;
REVOKE ALL ON DefaultCharacterValues FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCharacterValues TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCharacterValues TO ows;

CREATE TABLE DefaultCustomCharacterData
(
    CustomerGUID                 UUID                       NOT NULL,
    DefaultCustomCharacterDataID SERIAL                     NOT NULL,
    DefaultCharacterValuesID     INT                        NOT NULL,
    CustomFieldName              VARCHAR(50)                NOT NULL,
    FieldValue                   TEXT                       NOT NULL,
    CONSTRAINT PK_DefaultCustomCharacterData
        PRIMARY KEY (DefaultCustomCharacterDataID, CustomerGUID),
    CONSTRAINT FK_DefaultCustomCharacterData_DefaultCharacterValueID
        FOREIGN KEY (DefaultCharacterValuesID, CustomerGUID) REFERENCES DefaultCharacterValues (DefaultCharacterValuesID, CustomerGUID)
);
-- Security: DefaultCustomCharacterData
ALTER TABLE DefaultCustomCharacterData ENABLE ROW LEVEL SECURITY;
ALTER TABLE DefaultCustomCharacterData FORCE ROW LEVEL SECURITY;
REVOKE ALL ON DefaultCustomCharacterData FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCustomCharacterData TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON DefaultCustomCharacterData TO ows;

CREATE TABLE GlobalData
(
    CustomerGUID    UUID        NOT NULL,
    GlobalDataKey   VARCHAR(50) NOT NULL,
    GlobalDataValue TEXT        NOT NULL,
    CONSTRAINT PK_GlobalData
        PRIMARY KEY (CustomerGUID, GlobalDataKey)
);
-- Security: GlobalData
ALTER TABLE GlobalData ENABLE ROW LEVEL SECURITY;
ALTER TABLE GlobalData FORCE ROW LEVEL SECURITY;
REVOKE ALL ON GlobalData FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON GlobalData TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON GlobalData TO ows;

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
-- Security: ItemTypes
ALTER TABLE ItemTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ItemTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ItemTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ItemTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ItemTypes TO ows;

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

CREATE TABLE MapInstances
(
    CustomerGUID            UUID                    NOT NULL,
    MapInstanceID           SERIAL                  NOT NULL,
    WorldServerID           INT                     NOT NULL,
    MapID                   INT                     NOT NULL,
    Port                    INT                     NOT NULL,
    Status                  INT       DEFAULT 0     NOT NULL,
    PlayerGroupID           INT                     NULL,
    NumberOfReportedPlayers INT       DEFAULT 0     NOT NULL,
    LastUpdateFromServer    TIMESTAMP               NULL,
    LastServerEmptyDate     TIMESTAMP               NULL,
    CreateDate              TIMESTAMP DEFAULT NOW() NOT NULL,
    CONSTRAINT PK_MapInstances
        PRIMARY KEY (CustomerGUID, MapInstanceID)
);
-- Security: MapInstances
ALTER TABLE MapInstances ENABLE ROW LEVEL SECURITY;
ALTER TABLE MapInstances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON MapInstances FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON MapInstances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON MapInstances TO ows;

CREATE TABLE Maps
(
    CustomerGUID                UUID                    NOT NULL,
    MapID                       SERIAL                  NOT NULL,
    MapName                     VARCHAR(50)             NOT NULL,
    MapData                     BYTEA                   NULL,
    Width                       SMALLINT                NOT NULL,
    Height                      SMALLINT                NOT NULL,
    ZoneName                    VARCHAR(50)             NOT NULL,
    WorldCompContainsFilter     VARCHAR(100) DEFAULT '' NOT NULL,
    WorldCompListFilter         VARCHAR(200) DEFAULT '' NOT NULL,
    MapMode                     INT          DEFAULT 1  NOT NULL,
    SoftPlayerCap               INT          DEFAULT 60 NOT NULL,
    HardPlayerCap               INT          DEFAULT 80 NOT NULL,
    MinutesToShutdownAfterEmpty INT          DEFAULT 1  NOT NULL,
    CONSTRAINT PK_Maps
        PRIMARY KEY (CustomerGUID, MapID)
);
-- Security: Maps
ALTER TABLE Maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE Maps FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Maps FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Maps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Maps TO ows;

CREATE TABLE PlayerGroupTypes
(
    PlayerGroupTypeID   INT         NOT NULL,
    PlayerGroupTypeDesc VARCHAR(50) NOT NULL,
    CONSTRAINT PK_PlayerGroupTypes
        PRIMARY KEY (PlayerGroupTypeID)
);
-- Security: PlayerGroupTypes
ALTER TABLE PlayerGroupTypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE PlayerGroupTypes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON PlayerGroupTypes FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroupTypes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroupTypes TO ows;

CREATE TABLE PlayerGroup
(
    PlayerGroupID     SERIAL        NOT NULL,
    CustomerGUID      UUID          NOT NULL,
    PlayerGroupName   VARCHAR(50)   NOT NULL,
    PlayerGroupTypeID INT           NOT NULL,
    ReadyState        INT DEFAULT 0 NOT NULL,
    CreateDate        TIMESTAMP     NULL,
    CONSTRAINT PK_PlayerGroup
        PRIMARY KEY (CustomerGUID, PlayerGroupID),
    CONSTRAINT FK_PlayerGroup_PlayerGroupType
        FOREIGN KEY (PlayerGroupTypeID) REFERENCES PlayerGroupTypes (PlayerGroupTypeID)
);
-- Security: PlayerGroup
ALTER TABLE PlayerGroup ENABLE ROW LEVEL SECURITY;
ALTER TABLE PlayerGroup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON PlayerGroup FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroup TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON PlayerGroup TO ows;

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

CREATE TABLE Races
(
    CustomerGUID UUID        NOT NULL,
    RaceID       SERIAL      NOT NULL,
    RaceName     VARCHAR(50) NOT NULL,
    CONSTRAINT PK_Races
        PRIMARY KEY (CustomerGUID, RaceID)
);
-- Security: Races
ALTER TABLE Races ENABLE ROW LEVEL SECURITY;
ALTER TABLE Races FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Races FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Races TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Races TO ows;

CREATE TABLE UserSessions
(
    CustomerGUID          UUID                           NOT NULL,
    UserSessionGUID       UUID DEFAULT gen_random_uuid() NOT NULL,
    UserGUID              UUID                           NOT NULL,
    LoginDate             TIMESTAMP                      NOT NULL,
    SelectedCharacterName VARCHAR(50)                    NULL,
    CONSTRAINT PK_UserSessions
        PRIMARY KEY (CustomerGUID, UserSessionGUID),
    CONSTRAINT FK_UserSessions_UserGUID
        FOREIGN KEY (UserGUID) REFERENCES Users (UserGUID)
);
-- Security: UserSessions
ALTER TABLE UserSessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE UserSessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON UserSessions FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON UserSessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON UserSessions TO ows;

CREATE TABLE UsersInQueue
(
    CustomerGUID     UUID          NOT NULL,
    UserGUID         UUID          NOT NULL,
    QueueName        VARCHAR(20)   NOT NULL,
    JoinDT           TIMESTAMP     NOT NULL,
    MatchMakingScore INT DEFAULT 0 NOT NULL,
    CONSTRAINT PK_UsersInQueue
        PRIMARY KEY (CustomerGUID, UserGUID, QueueName)
);
-- Security: UsersInQueue
ALTER TABLE UsersInQueue ENABLE ROW LEVEL SECURITY;
ALTER TABLE UsersInQueue FORCE ROW LEVEL SECURITY;
REVOKE ALL ON UsersInQueue FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON UsersInQueue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON UsersInQueue TO ows;

CREATE TABLE WorldServers
(
    CustomerGUID            UUID                     NOT NULL,
    WorldServerID           SERIAL                   NOT NULL,
    ServerIP                VARCHAR(50)              NOT NULL,
    MaxNumberOfInstances    INT                      NOT NULL,
    ActiveStartTime         TIMESTAMP                NULL,
    Port                    INT         DEFAULT 8181 NOT NULL,
    ServerStatus            SMALLINT    DEFAULT 0    NOT NULL,
    InternalServerIP        VARCHAR(50) DEFAULT ''   NOT NULL,
    StartingMapInstancePort INT         DEFAULT 7778 NOT NULL,
    ZoneServerGUID          UUID                     NULL,
    CONSTRAINT PK_WorldServers
        PRIMARY KEY (CustomerGUID, WorldServerID),
    CONSTRAINT AK_ZoneServers
        UNIQUE (CustomerGUID, ZoneServerGUID)
);
-- Security: WorldServers
ALTER TABLE WorldServers ENABLE ROW LEVEL SECURITY;
ALTER TABLE WorldServers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON WorldServers FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldServers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON WorldServers TO ows;

-- Grant sequence access for SERIAL columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ows TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ows TO ows;

-- RLS policies: allow ows and service_role full access, block everyone else
CREATE POLICY ows_access ON DebugLog FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON DebugLog FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Customers FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON OWSVersion FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON OWSVersion FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON WorldSettings FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON WorldSettings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON AbilityTypes FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON AbilityTypes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Abilities FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Abilities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON AreaOfInterestTypes FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON AreaOfInterestTypes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON AreasOfInterest FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON AreasOfInterest FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Users FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Characters FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Characters FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharHasAbilities FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharHasAbilities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharAbilityBars FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharAbilityBars FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharAbilityBarAbilities FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharAbilityBarAbilities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharHasItems FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharHasItems FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharInventory FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharInventory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharInventoryItems FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharInventoryItems FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CharOnMapInstance FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CharOnMapInstance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON ChatGroups FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON ChatGroups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON ChatGroupUsers FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON ChatGroupUsers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON ChatMessages FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON ChatMessages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Class FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Class FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON ClassInventory FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON ClassInventory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON CustomCharacterData FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON CustomCharacterData FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON DefaultCharacterValues FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON DefaultCharacterValues FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON DefaultCustomCharacterData FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON DefaultCustomCharacterData FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON GlobalData FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON GlobalData FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON ItemTypes FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON ItemTypes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Items FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON MapInstances FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON MapInstances FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Maps FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Maps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON PlayerGroupTypes FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON PlayerGroupTypes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON PlayerGroup FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON PlayerGroup FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON PlayerGroupCharacters FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON PlayerGroupCharacters FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON Races FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON Races FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON UserSessions FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON UserSessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON UsersInQueue FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON UsersInQueue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ows_access ON WorldServers FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON WorldServers FOR ALL TO service_role USING (true) WITH CHECK (true);


-- migrate:down

DROP SCHEMA IF EXISTS ows CASCADE;
