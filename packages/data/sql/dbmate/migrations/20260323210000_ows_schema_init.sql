-- migrate:up

-- OWS (Open World Server) schema initialization
-- Source: chuck/OWS/src/.docker/postgres/setup.sql + cumulative updates
-- 37 tables for the OWS game server framework

CREATE SCHEMA IF NOT EXISTS ows;
SET search_path TO ows;

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

CREATE TABLE DebugLog
(
    DebugLogID   SERIAL
        CONSTRAINT PK_DebugLogK
            PRIMARY KEY,
    DebugDate    TIMESTAMP,
    DebugDesc    TEXT,
    CustomerGUID UUID
);

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

CREATE TABLE OWSVersion
(
    OWSDBVersion VARCHAR(10) NULL
);

CREATE TABLE WorldSettings
(
    CustomerGUID    UUID   NOT NULL,
    WorldSettingsID SERIAL NOT NULL,
    StartTime       BIGINT NOT NULL,
    CONSTRAINT PK_WorldSettings
        PRIMARY KEY (CustomerGUID, WorldSettingsID)
);

CREATE TABLE AbilityTypes
(
    AbilityTypeID   SERIAL,
    AbilityTypeName VARCHAR(50) NOT NULL,
    CustomerGUID    UUID        NOT NULL,
    CONSTRAINT PK_AbilityTypes
        PRIMARY KEY (AbilityTypeID, CustomerGUID)
);

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

CREATE TABLE AreaOfInterestTypes
(
    AreaOfInterestTypeID   SERIAL
        CONSTRAINT PK_AreaOfInterestTypes
            PRIMARY KEY,
    AreaOfInterestTypeDesc VARCHAR(50) NOT NULL
);

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

CREATE TABLE CharOnMapInstance
(
    CustomerGUID  UUID NOT NULL,
    CharacterID   INT  NOT NULL,
    MapInstanceID INT  NOT NULL,
    CONSTRAINT PK_CharOnMapInstance
        PRIMARY KEY (CustomerGUID, CharacterID, MapInstanceID)
);

CREATE TABLE ChatGroups
(
    CustomerGUID  UUID        NOT NULL,
    ChatGroupID   SERIAL      NOT NULL,
    ChatGroupName VARCHAR(50) NOT NULL,
    CONSTRAINT PK_ChatGroups
        PRIMARY KEY (CustomerGUID, ChatGroupID)
);

CREATE TABLE ChatGroupUsers
(
    CustomerGUID UUID NOT NULL,
    ChatGroupID  INT  NOT NULL,
    CharacterID  INT  NOT NULL,
    CONSTRAINT PK_ChatGroupUsers
        PRIMARY KEY (CustomerGUID, ChatGroupID, CharacterID)
);

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

CREATE TABLE GlobalData
(
    CustomerGUID    UUID        NOT NULL,
    GlobalDataKey   VARCHAR(50) NOT NULL,
    GlobalDataValue TEXT        NOT NULL,
    CONSTRAINT PK_GlobalData
        PRIMARY KEY (CustomerGUID, GlobalDataKey)
);

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

CREATE TABLE PlayerGroupTypes
(
    PlayerGroupTypeID   INT         NOT NULL,
    PlayerGroupTypeDesc VARCHAR(50) NOT NULL,
    CONSTRAINT PK_PlayerGroupTypes
        PRIMARY KEY (PlayerGroupTypeID)
);

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

CREATE TABLE Races
(
    CustomerGUID UUID        NOT NULL,
    RaceID       SERIAL      NOT NULL,
    RaceName     VARCHAR(50) NOT NULL,
    CONSTRAINT PK_Races
        PRIMARY KEY (CustomerGUID, RaceID)
);

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


-- migrate:down

DROP SCHEMA IF EXISTS ows CASCADE;
