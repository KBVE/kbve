-- migrate:up
-- =============================================================================
-- VERIFIED AGAINST LIVE DB: 2026-02-11
-- Database: supabase (supabase-cluster-rw / kilobase namespace)
-- PostgreSQL 17.4
--
-- STATUS: All 12 tables (165 columns) and 20 functions match live DB.
--   RLS policies verified. Seed data for archetypes present.
--
-- ADJUSTMENTS NEEDED:
--   1. Function ownership: Most functions owned by service_role in live
--      DB except grant_skill_points_on_levelup (supabase_admin) and
--      trg_touch_updated_at (service_role). Consistent with SQL.
--   2. Source: Originally from rentearth repo
--      (proto/schema/migrations/20241208000001_initial_rentearth_schema.sql).
--      This is the consolidated source-of-truth copy.
-- =============================================================================
-- INITIAL RENT EARTH SCHEMA
-- =============================================================================
-- This migration creates the complete rentearth schema:
-- - Schema setup and privileges
-- - Core tables (archetypes, character, stats, inventory, progress)
-- - HOT/COLD table pattern (queryable vs protobuf blob)
-- - RLS policies
-- - Seed data for archetypes
-- - Triggers for updated_at
-- - RPC functions for Axum game server
--
-- Entity Model (applied to rentearth.character):
--   visual_type:      i32 enum  - 3D model/prefab to render
--   behavior_flags:   i64 bits  - How entity acts (HOSTILE, FRIENDLY, etc.)
--   emotional_flags:  i64 bits  - Current emotional state (HAPPY, ANGRY, etc.)
--   archetype_flags:  i64 bits  - Unlocked classes (WARRIOR, MAGE, MERCHANT, etc.)
--
-- Party System (Dwarf Fortress / RimWorld style):
--   - All characters exist simultaneously in the world
--   - Each has their own position, zone, stats, inventory
--   - Player picks which one to control at login
--   - Others run autonomously with AI behavior
--   - All characters saved independently on disconnect
-- =============================================================================

-- =============================================================
-- RENTEARTH SCHEMA + BASE PRIVILEGES
-- =============================================================
CREATE SCHEMA IF NOT EXISTS rentearth;
ALTER  SCHEMA rentearth OWNER TO postgres;

GRANT  USAGE ON SCHEMA rentearth TO service_role;
REVOKE ALL   ON SCHEMA rentearth FROM PUBLIC;
REVOKE ALL   ON SCHEMA rentearth FROM anon, authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA rentearth TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rentearth TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA rentearth TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rentearth
    GRANT ALL ON TABLES    TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rentearth
    GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rentearth
    GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA rentearth
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA rentearth
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA rentearth
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- =============================================================
-- TABLE: rentearth.archetypes (HOT - queryable metadata)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.archetypes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL UNIQUE,
    description     text NOT NULL DEFAULT '',
    archetype_flags bigint NOT NULL DEFAULT 0,
    unlock_flags    bigint NOT NULL DEFAULT 0,
    companion_slugs text[] NOT NULL DEFAULT '{}',
    sort_order      smallint NOT NULL DEFAULT 0,
    is_active       bool NOT NULL DEFAULT true,
    version         int NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT archetypes_slug_trim_chk
        CHECK (slug = btrim(slug) AND slug ~ '^[a-z][a-z0-9_]*$'),

    CONSTRAINT archetypes_slug_length_chk
        CHECK (char_length(slug) BETWEEN 1 AND 32)
);

COMMENT ON TABLE rentearth.archetypes IS
    'Character class definitions (HOT table). Queryable metadata for filtering and UI.';

CREATE INDEX IF NOT EXISTS idx_rentearth_archetypes_slug
    ON rentearth.archetypes (slug);

CREATE INDEX IF NOT EXISTS idx_rentearth_archetypes_active
    ON rentearth.archetypes (is_active) WHERE is_active = true;

-- =============================================================
-- TABLE: rentearth.archetype_states (COLD - ECS blob data)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.archetype_states (
    archetype_id    uuid PRIMARY KEY
        REFERENCES rentearth.archetypes(id)
        ON DELETE CASCADE,
    base_stats      bytea NOT NULL DEFAULT '\x'::bytea,
    stat_growth     bytea NOT NULL DEFAULT '\x'::bytea,
    prefab_local    text NOT NULL DEFAULT '',
    prefab_network  text NOT NULL DEFAULT '',
    icon_reference  text NOT NULL DEFAULT '',
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.archetype_states IS
    'Archetype ECS data (COLD table). Stats and Unity asset references for runtime.';

-- =============================================================
-- TABLE: rentearth.character
-- =============================================================
-- Entity Model Fields:
--   character_type:   What kind of entity (always PLAYER for this table)
--   visual_type:      Which 3D model/prefab to render
--   behavior_flags:   How the entity acts (bitfield)
--   emotional_flags:  Current emotional state (bitfield)
--   archetype_flags:  Unlocked classes/professions (bitfield)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.character (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL
                    REFERENCES auth.users(id)
                    ON DELETE CASCADE,
    slot        smallint NOT NULL CHECK (slot BETWEEN 0 AND 9),

    -- House Naming System:
    -- Display name format: "first_name of Haus username"
    -- Example: "Delta of Haus Fudster" where first_name='Delta', username='Fudster'
    -- Username comes from auth.users metadata (unique per Supabase UUID)
    -- first_name is character-specific (not required to be unique)
    first_name  text NOT NULL,

    -- Entity Model Fields
    visual_type      integer NOT NULL DEFAULT 0,   -- VisualType enum (0=HUMAN_MALE, 1=HUMAN_FEMALE, etc.)
    behavior_flags   bigint NOT NULL DEFAULT 2,    -- BehaviorFlags (default: FRIENDLY=2)
    emotional_flags  bigint NOT NULL DEFAULT 1,    -- EmotionalFlags (default: NEUTRAL=1)
    archetype_flags  bigint NOT NULL DEFAULT 0,    -- ArchetypeFlags bitfield (WARRIOR=1, MAGE=2, etc.)

    -- Progression
    level       integer NOT NULL DEFAULT 1 CHECK (level >= 1),
    experience  bigint  NOT NULL DEFAULT 0 CHECK (experience >= 0),

    -- Timestamps
    created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT character_first_name_trim_chk
        CHECK (first_name = btrim(first_name)),

    CONSTRAINT character_first_name_length_chk
        CHECK (char_length(first_name) BETWEEN 1 AND 32)
);

COMMENT ON TABLE rentearth.character IS
    'Per-player characters. Display name: "first_name of Haus username". user_id references Supabase auth.users.';
COMMENT ON COLUMN rentearth.character.slot IS 'Logical slot index per user (0-9).';
COMMENT ON COLUMN rentearth.character.first_name IS 'Character first name (e.g., "Delta"). Display as "Delta of Haus {username}". Max 32 chars.';
COMMENT ON COLUMN rentearth.character.visual_type IS 'VisualType enum: 0=HUMAN_MALE, 1=HUMAN_FEMALE, 2=SKELETON_WARRIOR, etc.';
COMMENT ON COLUMN rentearth.character.behavior_flags IS 'BehaviorFlags bitfield: HOSTILE=1, FRIENDLY=2, PASSIVE=4, etc.';
COMMENT ON COLUMN rentearth.character.emotional_flags IS 'EmotionalFlags bitfield: NEUTRAL=1, HAPPY=2, ANGRY=4, etc.';
COMMENT ON COLUMN rentearth.character.archetype_flags IS 'ArchetypeFlags bitfield: WARRIOR=1, MAGE=2, ROGUE=4, MERCHANT=8, etc.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rentearth_character_user_slot
    ON rentearth.character (user_id, slot);

CREATE INDEX IF NOT EXISTS idx_rentearth_character_user_id
    ON rentearth.character (user_id);

CREATE INDEX IF NOT EXISTS idx_rentearth_character_visual_type
    ON rentearth.character (visual_type);

-- =============================================================
-- TABLE: rentearth.character_stats (HOT - queryable stats + position)
-- =============================================================
-- Core Attributes + Derived Stats + Position
-- Source of truth for all queryable character data
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.character_stats (
    character_id    uuid PRIMARY KEY
        REFERENCES rentearth.character(id)
        ON DELETE CASCADE,

    -- Position (authoritative from Axum game server)
    world_x         real NOT NULL DEFAULT 0,
    world_y         real NOT NULL DEFAULT 0,
    world_z         real NOT NULL DEFAULT 0,
    rotation_yaw    real NOT NULL DEFAULT 0,

    -- Last safe position (for death/disconnect recovery)
    last_safe_x     real NOT NULL DEFAULT 0,
    last_safe_y     real NOT NULL DEFAULT 0,
    last_safe_z     real NOT NULL DEFAULT 0,

    -- =========================================================
    -- CORE ATTRIBUTES (Primary Stats - Player Investable)
    -- =========================================================
    -- DND-inspired: Min 8, Base 10, Soft cap 50, Hard cap 100
    -- Players allocate points: 20 bonus at creation + 1/level
    -- Can lower stats from 10 to 8 during creation for extra points
    strength        smallint NOT NULL DEFAULT 10
                        CHECK (strength BETWEEN 8 AND 100),
    agility         smallint NOT NULL DEFAULT 10
                        CHECK (agility BETWEEN 8 AND 100),
    constitution    smallint NOT NULL DEFAULT 10
                        CHECK (constitution BETWEEN 8 AND 100),
    intelligence    smallint NOT NULL DEFAULT 10
                        CHECK (intelligence BETWEEN 8 AND 100),
    wisdom          smallint NOT NULL DEFAULT 10
                        CHECK (wisdom BETWEEN 8 AND 100),
    charisma        smallint NOT NULL DEFAULT 10
                        CHECK (charisma BETWEEN 8 AND 100),
    luck            smallint NOT NULL DEFAULT 10
                        CHECK (luck BETWEEN 8 AND 100),
    faith           smallint NOT NULL DEFAULT 10
                        CHECK (faith BETWEEN 8 AND 100),

    -- Skill points available for allocation (20 bonus + 1/level)
    -- Level 1: 21 points (20 bonus + 1 for level)
    unspent_skill_points smallint NOT NULL DEFAULT 21
                        CHECK (unspent_skill_points >= 0),

    -- =========================================================
    -- VITAL STATS (Resource Pools)
    -- =========================================================
    -- Derived from attributes but cached here for queries
    -- health_max = 100 + (CON * 10) + (level * 5)
    health_current  integer NOT NULL DEFAULT 205,
    health_max      integer NOT NULL DEFAULT 205,
    -- mana_max = 50 + (INT * 8) + (WIS * 2) + (level * 3)
    mana_current    integer NOT NULL DEFAULT 153,
    mana_max        integer NOT NULL DEFAULT 153,
    -- stamina_max = 100 + (CON * 5) + (AGI * 3)
    stamina_current integer NOT NULL DEFAULT 180,
    stamina_max     integer NOT NULL DEFAULT 180,

    -- =========================================================
    -- COMBAT STATS (Derived from attributes + gear)
    -- =========================================================
    -- attack_power = 10 + (STR * 2) + weapon_damage
    attack_power    integer NOT NULL DEFAULT 30,
    -- spell_power = 10 + (INT * 2.5) + (WIS * 0.5)
    spell_power     integer NOT NULL DEFAULT 40,
    -- defense = 5 + (CON * 1) + (AGI * 0.5) + armor
    defense         integer NOT NULL DEFAULT 20,
    -- magic_resist = 5 + (WIS * 1.5) + (INT * 0.5)
    magic_resist    integer NOT NULL DEFAULT 25,
    -- speed = 5.0 + (AGI * 0.05)
    speed           real NOT NULL DEFAULT 5.5,

    -- =========================================================
    -- UTILITY STATS (Derived percentages)
    -- =========================================================
    -- crit_chance = 5% + (AGI * 0.2%) + (LCK * 0.15%)
    crit_chance     real NOT NULL DEFAULT 8.5,
    -- crit_damage = 150% + (STR * 1%)
    crit_damage     real NOT NULL DEFAULT 160.0,
    -- cooldown_reduction = 0% + (WIS * 0.5%)
    cooldown_reduction real NOT NULL DEFAULT 5.0,
    -- dodge_chance = 2% + (AGI * 0.15%) + (LCK * 0.1%)
    dodge_chance    real NOT NULL DEFAULT 4.5,

    -- =========================================================
    -- FAITH & LUCK STATS
    -- =========================================================
    -- healing_power = 10 + (FTH * 2) + (WIS * 0.5)
    healing_power   integer NOT NULL DEFAULT 35,
    -- holy_damage = 0 + (FTH * 1.5)
    holy_damage     integer NOT NULL DEFAULT 15,
    -- buff_duration = 100% + (FTH * 0.5%)
    buff_duration   real NOT NULL DEFAULT 105.0,
    -- debuff_resist = 5% + (FTH * 0.3%) + (WIS * 0.2%)
    debuff_resist   real NOT NULL DEFAULT 10.0,
    -- loot_bonus = 0% + (LCK * 0.5%)
    loot_bonus      real NOT NULL DEFAULT 5.0,
    -- rare_find = 0% + (LCK * 0.3%)
    rare_find       real NOT NULL DEFAULT 3.0,
    -- crafting_quality = 0% + (LCK * 0.4%) + (INT * 0.1%)
    crafting_quality real NOT NULL DEFAULT 5.0,

    -- =========================================================
    -- PROGRESSION & MATCHMAKING
    -- =========================================================
    -- Combat Rating for content gating and matchmaking
    -- CR = (level * 10) + (total_attr_points * 2) + (gear_score * 1.5)
    combat_rating   integer NOT NULL DEFAULT 10,

    -- Rested XP pool (2x XP bonus while pool > 0)
    -- Accumulates at 5% of level XP per hour offline
    rested_xp       bigint NOT NULL DEFAULT 0
                        CHECK (rested_xp >= 0),

    -- Zone tracking
    current_zone    text NOT NULL DEFAULT 'starting_area',

    -- Session tracking
    last_login_at   timestamptz,
    total_playtime  interval NOT NULL DEFAULT '0 seconds',

    -- Timestamp
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.character_stats IS
    'HOT table: Core attributes, derived stats, and position. All queryable character data.';
COMMENT ON COLUMN rentearth.character_stats.world_x IS 'World X position (authoritative from Axum).';
COMMENT ON COLUMN rentearth.character_stats.world_y IS 'World Y position (height).';
COMMENT ON COLUMN rentearth.character_stats.world_z IS 'World Z position.';
COMMENT ON COLUMN rentearth.character_stats.last_safe_x IS 'Last safe X position for respawn.';
COMMENT ON COLUMN rentearth.character_stats.last_safe_y IS 'Last safe Y position for respawn.';
COMMENT ON COLUMN rentearth.character_stats.last_safe_z IS 'Last safe Z position for respawn.';
COMMENT ON COLUMN rentearth.character_stats.strength IS
    'STR: Physical power, melee damage, carrying capacity. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.agility IS
    'AGI: Speed, evasion, ranged accuracy, attack speed. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.constitution IS
    'CON: Health pool, stamina, physical resistance. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.intelligence IS
    'INT: Mana pool, spell damage, crafting efficiency. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.wisdom IS
    'WIS: Mana regen, cooldown reduction, perception. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.charisma IS
    'CHA: Prices, NPC relations, party buffs, summon power. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.luck IS
    'LCK: Drop rates, crit chance, rare spawns, crafting quality. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.faith IS
    'FTH: Healing power, holy damage, buff duration, debuff resist. Base 10, cap 100.';
COMMENT ON COLUMN rentearth.character_stats.unspent_skill_points IS
    'Available skill points. 20 bonus at creation + 1/level. Level 1 starts with 21.';
COMMENT ON COLUMN rentearth.character_stats.combat_rating IS
    'Aggregate power level for matchmaking and content gating.';
COMMENT ON COLUMN rentearth.character_stats.rested_xp IS
    'Accumulated rested XP pool. Provides 2x XP until depleted.';
COMMENT ON COLUMN rentearth.character_stats.current_zone IS 'Current zone/area identifier.';

CREATE INDEX IF NOT EXISTS idx_rentearth_character_stats_zone
    ON rentearth.character_stats (current_zone);

CREATE INDEX IF NOT EXISTS idx_rentearth_character_stats_position
    ON rentearth.character_stats (world_x, world_z);

CREATE INDEX IF NOT EXISTS idx_rentearth_character_stats_combat_rating
    ON rentearth.character_stats (combat_rating);

-- =============================================================
-- TABLE: rentearth.character_state (COLD - runtime protobuf blob)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.character_state (
    character_id uuid PRIMARY KEY
        REFERENCES rentearth.character(id)
        ON DELETE CASCADE,
    state_proto  bytea NOT NULL DEFAULT '\x'::bytea,
    session_revision bigint NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.character_state IS
    'COLD table: Opaque runtime state serialized as protobuf (buffs, cooldowns, combat state).';
COMMENT ON COLUMN rentearth.character_state.state_proto IS
    'Serialized CharacterState protobuf consumed by Unity/Rust during login.';

-- =============================================================
-- TABLE: rentearth.inventory (1:1 with character)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.inventory (
    character_id uuid PRIMARY KEY
        REFERENCES rentearth.character(id)
        ON DELETE CASCADE,
    items_proto  bytea NOT NULL DEFAULT '\x'::bytea,
    gold         bigint NOT NULL DEFAULT 0 CHECK (gold >= 0),
    last_revision bigint NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.inventory IS
    'Authoritative per-character inventory payload stored as protobuf.';
COMMENT ON COLUMN rentearth.inventory.items_proto IS
    'Serialized Inventory protobuf payload (bag slots + equipment).';

-- =============================================================
-- TABLE: rentearth.character_progress (HOT - queryable progression)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.character_progress (
    character_id    uuid PRIMARY KEY
        REFERENCES rentearth.character(id)
        ON DELETE CASCADE,
    story_flags     bigint NOT NULL DEFAULT 0,
    dialogue_flags  bigint NOT NULL DEFAULT 0,
    tutorial_flags  bigint NOT NULL DEFAULT 0,
    achievement_flags bigint NOT NULL DEFAULT 0,
    -- Faction reputation (queryable for gating)
    rep_farmers     smallint NOT NULL DEFAULT 0,
    rep_merchants   smallint NOT NULL DEFAULT 0,
    rep_explorers   smallint NOT NULL DEFAULT 0,
    rep_craftsmen   smallint NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.character_progress IS
    'HOT table: Queryable progression flags and reputation thresholds.';

-- =============================================================
-- TABLE: rentearth.character_progress_state (COLD - protobuf blobs)
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.character_progress_state (
    character_id    uuid PRIMARY KEY
        REFERENCES rentearth.character(id)
        ON DELETE CASCADE,
    dialogue_history bytea NOT NULL DEFAULT '\x'::bytea,
    reputation_data  bytea NOT NULL DEFAULT '\x'::bytea,
    quest_state      bytea NOT NULL DEFAULT '\x'::bytea,
    npc_storylines   bytea NOT NULL DEFAULT '\x'::bytea,
    updated_at       timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.character_progress_state IS
    'COLD table: Serialized protobuf blobs for detailed progression data.';

-- =============================================================
-- TABLE: rentearth.character_appearance (1:1 with character)
-- =============================================================
-- Stores all customization options from CharacterAppearance proto.
-- Separate table to avoid bloating character table with 20+ columns.
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.character_appearance (
    character_id uuid PRIMARY KEY
        REFERENCES rentearth.character(id)
        ON DELETE CASCADE,

    -- Body
    skin_color      smallint NOT NULL DEFAULT 0 CHECK (skin_color BETWEEN 0 AND 15),
    body_type       smallint NOT NULL DEFAULT 0 CHECK (body_type BETWEEN 0 AND 4),
    body_height     smallint NOT NULL DEFAULT 50 CHECK (body_height BETWEEN 0 AND 100),

    -- Face
    face_shape      smallint NOT NULL DEFAULT 0 CHECK (face_shape BETWEEN 0 AND 7),
    eye_color       smallint NOT NULL DEFAULT 0 CHECK (eye_color BETWEEN 0 AND 15),
    eye_shape       smallint NOT NULL DEFAULT 0 CHECK (eye_shape BETWEEN 0 AND 7),
    eyebrow_style   smallint NOT NULL DEFAULT 0 CHECK (eyebrow_style BETWEEN 0 AND 7),
    eyebrow_color   smallint NOT NULL DEFAULT 0 CHECK (eyebrow_color BETWEEN 0 AND 15),
    nose_style      smallint NOT NULL DEFAULT 0 CHECK (nose_style BETWEEN 0 AND 7),
    mouth_style     smallint NOT NULL DEFAULT 0 CHECK (mouth_style BETWEEN 0 AND 7),

    -- Hair
    hair_style      smallint NOT NULL DEFAULT 0 CHECK (hair_style BETWEEN 0 AND 31),
    hair_color      smallint NOT NULL DEFAULT 0 CHECK (hair_color BETWEEN 0 AND 15),

    -- Facial hair
    facial_hair_style smallint NOT NULL DEFAULT 0 CHECK (facial_hair_style BETWEEN 0 AND 15),
    facial_hair_color smallint NOT NULL DEFAULT 0 CHECK (facial_hair_color BETWEEN 0 AND 15),

    -- Extras
    scar_style      smallint NOT NULL DEFAULT 0 CHECK (scar_style BETWEEN 0 AND 7),
    tattoo_style    smallint NOT NULL DEFAULT 0 CHECK (tattoo_style BETWEEN 0 AND 15),
    tattoo_color    smallint NOT NULL DEFAULT 0 CHECK (tattoo_color BETWEEN 0 AND 15),

    -- Accessories
    accessory_1     smallint NOT NULL DEFAULT 0,
    accessory_2     smallint NOT NULL DEFAULT 0,

    -- Voice
    voice_type      smallint NOT NULL DEFAULT 0 CHECK (voice_type BETWEEN 0 AND 7),

    -- Timestamps
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE rentearth.character_appearance IS
    'Character customization data (1:1 with character). Maps to CharacterAppearance proto.';

-- =============================================================
-- TABLE: rentearth.item_definitions (reference data)
-- =============================================================
-- Master item catalog. Items in inventory reference these by slug.
-- HOT table for querying item properties during gameplay.
-- =============================================================
CREATE TABLE IF NOT EXISTS rentearth.item_definitions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL UNIQUE,
    display_name    text NOT NULL,
    description     text NOT NULL DEFAULT '',

    -- Category & Rarity (enums from proto)
    category        smallint NOT NULL DEFAULT 0,  -- ItemCategory enum
    rarity          smallint NOT NULL DEFAULT 0,  -- ItemRarity enum (base rarity)
    bind_type       smallint NOT NULL DEFAULT 0,  -- BindType enum

    -- Stacking
    max_stack       integer NOT NULL DEFAULT 1 CHECK (max_stack >= 1),
    is_tradeable    boolean NOT NULL DEFAULT true,

    -- Equipment properties (if category = EQUIPMENT)
    equipment_slot  smallint,                     -- EquipmentSlot enum (NULL if not equipment)
    required_level  smallint NOT NULL DEFAULT 1,
    required_archetype_flags bigint NOT NULL DEFAULT 0,  -- 0 = any class can use

    -- Base stats (for equipment)
    base_attack     integer NOT NULL DEFAULT 0,
    base_defense    integer NOT NULL DEFAULT 0,
    base_health     integer NOT NULL DEFAULT 0,
    base_mana       integer NOT NULL DEFAULT 0,
    base_speed      real NOT NULL DEFAULT 0,

    -- Durability (NULL = no durability)
    base_durability integer,

    -- Socket count by rarity (for gems)
    socket_count    smallint NOT NULL DEFAULT 0 CHECK (socket_count BETWEEN 0 AND 3),

    -- Consumable properties
    cooldown_ms     integer NOT NULL DEFAULT 0,
    use_effect_id   text,                         -- Reference to effect system

    -- Economy
    buy_price       bigint NOT NULL DEFAULT 0,
    sell_price      bigint NOT NULL DEFAULT 0,

    -- Unity asset references
    icon_path       text NOT NULL DEFAULT '',
    prefab_path     text NOT NULL DEFAULT '',
    mesh_path       text NOT NULL DEFAULT '',     -- For equipment visuals

    -- Versioning
    version         integer NOT NULL DEFAULT 1,
    is_active       boolean NOT NULL DEFAULT true,

    -- Timestamps
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT item_slug_format_chk
        CHECK (slug = btrim(slug) AND slug ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT item_slug_length_chk
        CHECK (char_length(slug) BETWEEN 1 AND 64)
);

COMMENT ON TABLE rentearth.item_definitions IS
    'Master item catalog. Referenced by item_slug in inventory items.';
COMMENT ON COLUMN rentearth.item_definitions.category IS 'ItemCategory: 0=EQUIPMENT, 1=CONSUMABLE, 2=MATERIAL, 3=QUEST, 4=CURRENCY, 5=KEY, 6=TOOL, 7=GEM, 8=ENCHANT';
COMMENT ON COLUMN rentearth.item_definitions.rarity IS 'ItemRarity: 0=COMMON, 1=UNCOMMON, 2=RARE, 3=EPIC, 4=LEGENDARY';
COMMENT ON COLUMN rentearth.item_definitions.bind_type IS 'BindType: 0=NONE, 1=ON_PICKUP, 2=ON_EQUIP, 3=SOULBOUND';
COMMENT ON COLUMN rentearth.item_definitions.equipment_slot IS 'EquipmentSlot: 0=HEAD, 1=CHEST, 2=HANDS, 3=LEGS, 4=FEET, 5=WEAPON, 6=OFFHAND, 7-8=RINGS, 9=NECKLACE, 10=BACK';

CREATE INDEX IF NOT EXISTS idx_item_definitions_slug
    ON rentearth.item_definitions (slug);

CREATE INDEX IF NOT EXISTS idx_item_definitions_category
    ON rentearth.item_definitions (category) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_item_definitions_equipment_slot
    ON rentearth.item_definitions (equipment_slot) WHERE equipment_slot IS NOT NULL AND is_active = true;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE rentearth.archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.archetype_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.character ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.character_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.character_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.character_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.character_progress_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.character_appearance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.item_definitions ENABLE ROW LEVEL SECURITY;

-- Service role full access (used by Axum game server)
CREATE POLICY "service_role_all"
    ON rentearth.archetypes FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.archetype_states FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.character FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.character_stats FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.character_state FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.inventory FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.character_progress FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.character_progress_state FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.character_appearance FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.item_definitions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Authenticated user read access
CREATE POLICY "authenticated_read_archetypes"
    ON rentearth.archetypes FOR SELECT TO authenticated
    USING (is_active = true);

CREATE POLICY "players_view_characters"
    ON rentearth.character FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "players_view_own_stats"
    ON rentearth.character_stats FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rentearth.character AS c
            WHERE c.id = rentearth.character_stats.character_id
              AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "players_view_own_inventory"
    ON rentearth.inventory FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rentearth.character AS c
            WHERE c.id = rentearth.inventory.character_id
              AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "players_view_character_state"
    ON rentearth.character_state FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rentearth.character AS c
            WHERE c.id = rentearth.character_state.character_id
              AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "players_view_character_progress"
    ON rentearth.character_progress FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rentearth.character AS c
            WHERE c.id = rentearth.character_progress.character_id
              AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "players_view_character_appearance"
    ON rentearth.character_appearance FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM rentearth.character AS c
            WHERE c.id = rentearth.character_appearance.character_id
              AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "authenticated_read_items"
    ON rentearth.item_definitions FOR SELECT TO authenticated
    USING (is_active = true);

-- Revoke from anon/public
REVOKE ALL ON rentearth.archetypes FROM PUBLIC, anon;
REVOKE ALL ON rentearth.archetype_states FROM PUBLIC, anon;
REVOKE ALL ON rentearth.character FROM PUBLIC, anon;
REVOKE ALL ON rentearth.character_stats FROM PUBLIC, anon;
REVOKE ALL ON rentearth.character_state FROM PUBLIC, anon;
REVOKE ALL ON rentearth.inventory FROM PUBLIC, anon;
REVOKE ALL ON rentearth.character_progress FROM PUBLIC, anon;
REVOKE ALL ON rentearth.character_progress_state FROM PUBLIC, anon;
REVOKE ALL ON rentearth.character_appearance FROM PUBLIC, anon;
REVOKE ALL ON rentearth.item_definitions FROM PUBLIC, anon;

-- =============================================================
-- SEED DATA: Archetypes
-- =============================================================
-- Archetype flags match proto definitions:
--   WARRIOR=1, MAGE=2, ROGUE=4, MERCHANT=8, CRAFTSMAN=16,
--   FARMER=32, EXPLORER=64, HEALER=128, RANGER=256, BARD=512,
--   NECROMANCER=1024, PALADIN=2048
-- =============================================================
INSERT INTO rentearth.archetypes (slug, description, archetype_flags, unlock_flags, companion_slugs, sort_order)
VALUES
    -- Combat archetypes
    ('warrior', 'A powerful melee combatant. Warriors excel at close-quarters combat, heavy armor, and protecting allies.',
     1, 0, ARRAY['mage', 'healer'], 1),
    ('mage', 'A master of arcane arts. Mages wield devastating spells and manipulate the elements.',
     2, 0, ARRAY['warrior', 'healer'], 2),
    ('rogue', 'A stealthy opportunist. Rogues specialize in critical strikes, evasion, and surprise attacks.',
     4, 0, ARRAY['ranger', 'bard'], 3),
    ('healer', 'A devoted support class. Healers restore health, remove ailments, and buff allies.',
     128, 0, ARRAY['warrior', 'mage'], 4),
    ('ranger', 'A master of ranged combat and nature. Rangers excel with bows and animal companions.',
     256, 0, ARRAY['rogue', 'explorer'], 5),
    ('paladin', 'A holy warrior. Paladins combine martial prowess with divine magic.',
     2048, 0, ARRAY['warrior', 'healer'], 6),
    ('necromancer', 'A wielder of dark magic. Necromancers command undead and drain life force.',
     1024, 0, ARRAY['mage', 'rogue'], 7),
    ('bard', 'A charismatic performer. Bards use music and stories to inspire allies and confuse enemies.',
     512, 0, ARRAY['rogue', 'merchant'], 8),

    -- Non-combat archetypes
    ('merchant', 'A savvy trader. Merchants specialize in buying low, selling high, and establishing trade routes.',
     8, 0, ARRAY['craftsman', 'explorer'], 9),
    ('craftsman', 'A skilled artisan. Craftsmen build structures, forge tools, and create valuable goods.',
     16, 0, ARRAY['merchant', 'farmer'], 10),
    ('farmer', 'A cultivator of the land. Farmers excel at growing crops, tending animals, and resource gathering.',
     32, 0, ARRAY['craftsman', 'merchant'], 11),
    ('explorer', 'An adventurous pioneer. Explorers discover new territories, map unknown lands, and find hidden treasures.',
     64, 0, ARRAY['ranger', 'merchant'], 12)
ON CONFLICT (slug) DO UPDATE
SET description = EXCLUDED.description,
    archetype_flags = EXCLUDED.archetype_flags,
    unlock_flags = EXCLUDED.unlock_flags,
    companion_slugs = EXCLUDED.companion_slugs,
    sort_order = EXCLUDED.sort_order,
    version = rentearth.archetypes.version + 1,
    updated_at = timezone('utc', now());

INSERT INTO rentearth.archetype_states (archetype_id, prefab_local, prefab_network, icon_reference)
SELECT a.id,
    'Assets/RentEarth/Prefabs/Characters/Local/LocalPlayer_' || initcap(a.slug) || '.prefab',
    'Assets/RentEarth/Prefabs/Characters/Network/NetworkEntity_' || initcap(a.slug) || '.prefab',
    'Assets/RentEarth/UI/Icons/Archetypes/' || a.slug || '.png'
FROM rentearth.archetypes a
ON CONFLICT (archetype_id) DO UPDATE
SET prefab_local = EXCLUDED.prefab_local,
    prefab_network = EXCLUDED.prefab_network,
    icon_reference = EXCLUDED.icon_reference,
    updated_at = timezone('utc', now());

-- =============================================================
-- SEED DATA: Starter Items
-- =============================================================
-- Category: 0=EQUIPMENT, 1=CONSUMABLE, 2=MATERIAL, 3=QUEST, 4=CURRENCY
-- Rarity: 0=COMMON, 1=UNCOMMON, 2=RARE, 3=EPIC, 4=LEGENDARY
-- BindType: 0=NONE, 1=ON_PICKUP, 2=ON_EQUIP, 3=SOULBOUND
-- EquipmentSlot: 0=HEAD, 1=CHEST, 2=HANDS, 3=LEGS, 4=FEET, 5=WEAPON
-- =============================================================

INSERT INTO rentearth.item_definitions (slug, display_name, description, category, rarity, bind_type, equipment_slot, required_level, base_attack, base_defense, base_durability, buy_price, sell_price, icon_path, prefab_path, mesh_path)
VALUES
    -- Starter Weapons (category=0, slot=5)
    ('wooden_sword', 'Wooden Sword', 'A basic training sword made of wood.', 0, 0, 0, 5, 1, 5, 0, 50, 10, 2, 'UI/Icons/Items/wooden_sword.png', 'Prefabs/Items/Weapons/wooden_sword.prefab', 'Models/Items/Weapons/wooden_sword.fbx'),
    ('rusty_dagger', 'Rusty Dagger', 'An old dagger showing signs of rust.', 0, 0, 0, 5, 1, 4, 0, 40, 8, 1, 'UI/Icons/Items/rusty_dagger.png', 'Prefabs/Items/Weapons/rusty_dagger.prefab', 'Models/Items/Weapons/rusty_dagger.fbx'),
    ('wooden_staff', 'Wooden Staff', 'A simple wooden staff for apprentice mages.', 0, 0, 0, 5, 1, 3, 0, 60, 10, 2, 'UI/Icons/Items/wooden_staff.png', 'Prefabs/Items/Weapons/wooden_staff.prefab', 'Models/Items/Weapons/wooden_staff.fbx'),
    ('hunting_bow', 'Hunting Bow', 'A basic bow used for hunting small game.', 0, 0, 0, 5, 1, 4, 0, 45, 12, 3, 'UI/Icons/Items/hunting_bow.png', 'Prefabs/Items/Weapons/hunting_bow.prefab', 'Models/Items/Weapons/hunting_bow.fbx'),

    -- Starter Armor (category=0)
    ('cloth_shirt', 'Cloth Shirt', 'A simple cloth shirt offering minimal protection.', 0, 0, 0, 1, 1, 0, 2, 30, 5, 1, 'UI/Icons/Items/cloth_shirt.png', 'Prefabs/Items/Armor/cloth_shirt.prefab', 'Models/Items/Armor/cloth_shirt.fbx'),
    ('cloth_pants', 'Cloth Pants', 'Basic cloth pants for everyday wear.', 0, 0, 0, 3, 1, 0, 1, 30, 5, 1, 'UI/Icons/Items/cloth_pants.png', 'Prefabs/Items/Armor/cloth_pants.prefab', 'Models/Items/Armor/cloth_pants.fbx'),
    ('leather_boots', 'Leather Boots', 'Sturdy leather boots for travel.', 0, 0, 0, 4, 1, 0, 2, 40, 8, 2, 'UI/Icons/Items/leather_boots.png', 'Prefabs/Items/Armor/leather_boots.prefab', 'Models/Items/Armor/leather_boots.fbx'),
    ('leather_gloves', 'Leather Gloves', 'Simple leather gloves.', 0, 0, 0, 2, 1, 0, 1, 30, 6, 1, 'UI/Icons/Items/leather_gloves.png', 'Prefabs/Items/Armor/leather_gloves.prefab', 'Models/Items/Armor/leather_gloves.fbx'),

    -- Consumables (category=1)
    ('health_potion_small', 'Small Health Potion', 'Restores 25 health points.', 1, 0, 0, NULL, 1, 0, 0, NULL, 15, 5, 'UI/Icons/Items/health_potion_small.png', 'Prefabs/Items/Consumables/health_potion_small.prefab', ''),
    ('mana_potion_small', 'Small Mana Potion', 'Restores 25 mana points.', 1, 0, 0, NULL, 1, 0, 0, NULL, 15, 5, 'UI/Icons/Items/mana_potion_small.png', 'Prefabs/Items/Consumables/mana_potion_small.prefab', ''),
    ('bread', 'Bread', 'A loaf of fresh bread. Restores stamina.', 1, 0, 0, NULL, 1, 0, 0, NULL, 3, 1, 'UI/Icons/Items/bread.png', 'Prefabs/Items/Consumables/bread.prefab', ''),
    ('water_flask', 'Water Flask', 'Clean drinking water.', 1, 0, 0, NULL, 1, 0, 0, NULL, 2, 1, 'UI/Icons/Items/water_flask.png', 'Prefabs/Items/Consumables/water_flask.prefab', ''),

    -- Materials (category=2)
    ('wood', 'Wood', 'A piece of wood. Used for crafting.', 2, 0, 0, NULL, 1, 0, 0, NULL, 1, 0, 'UI/Icons/Items/wood.png', 'Prefabs/Items/Materials/wood.prefab', ''),
    ('stone', 'Stone', 'A small stone. Used for crafting.', 2, 0, 0, NULL, 1, 0, 0, NULL, 1, 0, 'UI/Icons/Items/stone.png', 'Prefabs/Items/Materials/stone.prefab', ''),
    ('iron_ore', 'Iron Ore', 'Raw iron ore. Can be smelted.', 2, 0, 0, NULL, 1, 0, 0, NULL, 5, 1, 'UI/Icons/Items/iron_ore.png', 'Prefabs/Items/Materials/iron_ore.prefab', ''),
    ('leather', 'Leather', 'Tanned animal hide.', 2, 0, 0, NULL, 1, 0, 0, NULL, 3, 1, 'UI/Icons/Items/leather.png', 'Prefabs/Items/Materials/leather.prefab', ''),
    ('cloth', 'Cloth', 'A piece of woven fabric.', 2, 0, 0, NULL, 1, 0, 0, NULL, 2, 0, 'UI/Icons/Items/cloth.png', 'Prefabs/Items/Materials/cloth.prefab', ''),
    ('herb', 'Herb', 'A common herb used in alchemy.', 2, 0, 0, NULL, 1, 0, 0, NULL, 2, 0, 'UI/Icons/Items/herb.png', 'Prefabs/Items/Materials/herb.prefab', ''),

    -- Currency items (category=4)
    ('gold_coin', 'Gold Coin', 'The standard currency of the realm.', 4, 0, 0, NULL, 1, 0, 0, NULL, 1, 1, 'UI/Icons/Items/gold_coin.png', 'Prefabs/Items/Currency/gold_coin.prefab', '')
ON CONFLICT (slug) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    rarity = EXCLUDED.rarity,
    bind_type = EXCLUDED.bind_type,
    equipment_slot = EXCLUDED.equipment_slot,
    required_level = EXCLUDED.required_level,
    base_attack = EXCLUDED.base_attack,
    base_defense = EXCLUDED.base_defense,
    base_durability = EXCLUDED.base_durability,
    buy_price = EXCLUDED.buy_price,
    sell_price = EXCLUDED.sell_price,
    icon_path = EXCLUDED.icon_path,
    prefab_path = EXCLUDED.prefab_path,
    mesh_path = EXCLUDED.mesh_path,
    version = rentearth.item_definitions.version + 1,
    updated_at = timezone('utc', now());

-- Update max_stack for stackable items
UPDATE rentearth.item_definitions SET max_stack = 99 WHERE category IN (1, 2, 4);  -- Consumables, Materials, Currency

-- =============================================================
-- HELPER FUNCTION: TOUCH updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION rentearth.trg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION rentearth.trg_touch_updated_at()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.trg_touch_updated_at()
    TO service_role;
ALTER FUNCTION rentearth.trg_touch_updated_at() OWNER TO service_role;

-- =============================================================
-- TRIGGERS: updated_at auto-touch
-- =============================================================
DROP TRIGGER IF EXISTS trg_rentearth_archetypes_touch_updated_at ON rentearth.archetypes;
CREATE TRIGGER trg_rentearth_archetypes_touch_updated_at
BEFORE UPDATE ON rentearth.archetypes
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_archetype_states_touch_updated_at ON rentearth.archetype_states;
CREATE TRIGGER trg_rentearth_archetype_states_touch_updated_at
BEFORE UPDATE ON rentearth.archetype_states
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_character_touch_updated_at ON rentearth.character;
CREATE TRIGGER trg_rentearth_character_touch_updated_at
BEFORE UPDATE ON rentearth.character
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_character_stats_touch_updated_at ON rentearth.character_stats;
CREATE TRIGGER trg_rentearth_character_stats_touch_updated_at
BEFORE UPDATE ON rentearth.character_stats
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_character_state_touch_updated_at ON rentearth.character_state;
CREATE TRIGGER trg_rentearth_character_state_touch_updated_at
BEFORE UPDATE ON rentearth.character_state
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_inventory_touch_updated_at ON rentearth.inventory;
CREATE TRIGGER trg_rentearth_inventory_touch_updated_at
BEFORE UPDATE ON rentearth.inventory
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_character_progress_touch_updated_at ON rentearth.character_progress;
CREATE TRIGGER trg_rentearth_character_progress_touch_updated_at
BEFORE UPDATE ON rentearth.character_progress
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_character_progress_state_touch_updated_at ON rentearth.character_progress_state;
CREATE TRIGGER trg_rentearth_character_progress_state_touch_updated_at
BEFORE UPDATE ON rentearth.character_progress_state
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_character_appearance_touch_updated_at ON rentearth.character_appearance;
CREATE TRIGGER trg_rentearth_character_appearance_touch_updated_at
BEFORE UPDATE ON rentearth.character_appearance
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_rentearth_item_definitions_touch_updated_at ON rentearth.item_definitions;
CREATE TRIGGER trg_rentearth_item_definitions_touch_updated_at
BEFORE UPDATE ON rentearth.item_definitions
FOR EACH ROW EXECUTE FUNCTION rentearth.trg_touch_updated_at();

-- =============================================================================
-- RPC FUNCTIONS
-- =============================================================================

-- =============================================================================
-- FUNCTION: rentearth.create_character
-- =============================================================================
-- House Naming System:
--   - p_first_name: Character's first name (e.g., "Delta")
--   - p_username: Player's username from Supabase (e.g., "Fudster")
--   - Display name constructed as: "first_name of Haus username"
--   - Example: "Delta of Haus Fudster"
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.create_character(
    p_user_id uuid,
    p_slot integer,
    p_first_name text,
    p_username text,
    p_archetype_slug text,
    p_visual_type integer DEFAULT 0,
    p_spawn_x real DEFAULT 0,
    p_spawn_y real DEFAULT 0,
    p_spawn_z real DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_character_id uuid;
    v_archetype_flags bigint;
    v_display_name text;
    v_result json;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_slot < 0 OR p_slot > 9 THEN
        RAISE EXCEPTION 'Invalid slot: must be 0-9';
    END IF;

    IF p_first_name IS NULL OR btrim(p_first_name) = '' THEN
        RAISE EXCEPTION 'Character first name cannot be empty';
    END IF;

    IF char_length(btrim(p_first_name)) > 32 THEN
        RAISE EXCEPTION 'Character first name too long (max 32 characters)';
    END IF;

    IF p_username IS NULL OR btrim(p_username) = '' THEN
        RAISE EXCEPTION 'Username is required for House naming';
    END IF;

    IF p_visual_type < 0 OR p_visual_type > 7 THEN
        RAISE EXCEPTION 'Invalid visual_type: must be 0-7';
    END IF;

    IF p_archetype_slug IS NULL OR btrim(p_archetype_slug) = '' THEN
        RAISE EXCEPTION 'Archetype slug cannot be empty';
    END IF;

    SELECT archetype_flags INTO v_archetype_flags
    FROM rentearth.archetypes
    WHERE slug = btrim(p_archetype_slug) AND is_active = true;

    IF v_archetype_flags IS NULL THEN
        RAISE EXCEPTION 'Invalid archetype: %', p_archetype_slug;
    END IF;

    IF EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE user_id = p_user_id AND slot = p_slot
    ) THEN
        RAISE EXCEPTION 'Slot % is already in use', p_slot;
    END IF;

    INSERT INTO rentearth.character (
        user_id, slot, first_name,
        visual_type, behavior_flags, emotional_flags, archetype_flags
    )
    VALUES (
        p_user_id, p_slot, btrim(p_first_name),
        p_visual_type, 2, 1, v_archetype_flags
    )
    RETURNING id INTO v_character_id;

    INSERT INTO rentearth.character_stats (
        character_id, world_x, world_y, world_z,
        last_safe_x, last_safe_y, last_safe_z, last_login_at
    )
    VALUES (
        v_character_id, p_spawn_x, p_spawn_y, p_spawn_z,
        p_spawn_x, p_spawn_y, p_spawn_z, timezone('utc', now())
    );

    INSERT INTO rentearth.inventory (character_id) VALUES (v_character_id);
    INSERT INTO rentearth.character_state (character_id) VALUES (v_character_id);
    INSERT INTO rentearth.character_progress (character_id) VALUES (v_character_id);
    INSERT INTO rentearth.character_progress_state (character_id) VALUES (v_character_id);
    INSERT INTO rentearth.character_appearance (character_id) VALUES (v_character_id);

    -- Construct display name: "first_name of Haus username"
    v_display_name := btrim(p_first_name) || ' of Haus ' || btrim(p_username);

    SELECT json_build_object(
        'id', c.id, 'slot', c.slot,
        'first_name', c.first_name,
        'username', btrim(p_username),
        'display_name', v_display_name,
        'visual_type', c.visual_type, 'behavior_flags', c.behavior_flags,
        'emotional_flags', c.emotional_flags, 'archetype_flags', c.archetype_flags,
        'level', c.level, 'experience', c.experience,
        'world_x', cs.world_x, 'world_y', cs.world_y, 'world_z', cs.world_z,
        'created_at', c.created_at
    ) INTO v_result
    FROM rentearth.character c
    JOIN rentearth.character_stats cs ON cs.character_id = c.id
    WHERE c.id = v_character_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.create_character(uuid, integer, text, text, text, integer, real, real, real) IS
    'Create a new character with House naming system. Display name: "first_name of Haus username". Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.create_character(uuid, integer, text, text, text, integer, real, real, real)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.create_character(uuid, integer, text, text, text, integer, real, real, real)
    TO service_role;
ALTER FUNCTION rentearth.create_character(uuid, integer, text, text, text, integer, real, real, real) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.load_character
-- =============================================================================
-- House Naming System:
--   - Returns first_name and username separately
--   - display_name is constructed as: "first_name of Haus username"
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.load_character(p_user_id uuid, p_slot integer, p_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_slot < 0 OR p_slot > 9 THEN
        RAISE EXCEPTION 'Invalid slot: must be 0-9';
    END IF;

    IF p_username IS NULL OR btrim(p_username) = '' THEN
        RAISE EXCEPTION 'Username is required for House naming';
    END IF;

    SELECT json_build_object(
        'id', c.id, 'user_id', c.user_id, 'slot', c.slot,
        'first_name', c.first_name,
        'username', btrim(p_username),
        'display_name', c.first_name || ' of Haus ' || btrim(p_username),
        'visual_type', c.visual_type, 'behavior_flags', c.behavior_flags,
        'emotional_flags', c.emotional_flags, 'archetype_flags', c.archetype_flags,
        'level', c.level, 'experience', c.experience,
        'created_at', c.created_at, 'updated_at', c.updated_at,
        'stats', json_build_object(
            'world_x', COALESCE(cs.world_x, 0), 'world_y', COALESCE(cs.world_y, 0),
            'world_z', COALESCE(cs.world_z, 0), 'rotation_yaw', COALESCE(cs.rotation_yaw, 0),
            'last_safe_x', COALESCE(cs.last_safe_x, 0), 'last_safe_y', COALESCE(cs.last_safe_y, 0),
            'last_safe_z', COALESCE(cs.last_safe_z, 0),
            'health_current', COALESCE(cs.health_current, 100), 'health_max', COALESCE(cs.health_max, 100),
            'mana_current', COALESCE(cs.mana_current, 100), 'mana_max', COALESCE(cs.mana_max, 100),
            'stamina_current', COALESCE(cs.stamina_current, 100), 'stamina_max', COALESCE(cs.stamina_max, 100),
            'attack_power', COALESCE(cs.attack_power, 10), 'defense', COALESCE(cs.defense, 10),
            'speed', COALESCE(cs.speed, 5.0), 'current_zone', COALESCE(cs.current_zone, 'starting_area'),
            'last_login_at', cs.last_login_at, 'total_playtime', cs.total_playtime
        ),
        'inventory', json_build_object(
            'items_proto', encode(COALESCE(i.items_proto, '\x'::bytea), 'base64'),
            'gold', COALESCE(i.gold, 0), 'last_revision', COALESCE(i.last_revision, 0)
        ),
        'state', json_build_object(
            'state_proto', encode(COALESCE(cst.state_proto, '\x'::bytea), 'base64'),
            'session_revision', COALESCE(cst.session_revision, 0)
        ),
        'progression', json_build_object(
            'story_flags', COALESCE(cp.story_flags, 0), 'dialogue_flags', COALESCE(cp.dialogue_flags, 0),
            'tutorial_flags', COALESCE(cp.tutorial_flags, 0), 'achievement_flags', COALESCE(cp.achievement_flags, 0),
            'rep_farmers', COALESCE(cp.rep_farmers, 0), 'rep_merchants', COALESCE(cp.rep_merchants, 0),
            'rep_explorers', COALESCE(cp.rep_explorers, 0), 'rep_craftsmen', COALESCE(cp.rep_craftsmen, 0)
        ),
        'progression_state', json_build_object(
            'dialogue_history', encode(COALESCE(cps.dialogue_history, '\x'::bytea), 'base64'),
            'reputation_data', encode(COALESCE(cps.reputation_data, '\x'::bytea), 'base64'),
            'quest_state', encode(COALESCE(cps.quest_state, '\x'::bytea), 'base64'),
            'npc_storylines', encode(COALESCE(cps.npc_storylines, '\x'::bytea), 'base64')
        )
    ) INTO v_result
    FROM rentearth.character c
    LEFT JOIN rentearth.character_stats cs ON cs.character_id = c.id
    LEFT JOIN rentearth.inventory i ON i.character_id = c.id
    LEFT JOIN rentearth.character_state cst ON cst.character_id = c.id
    LEFT JOIN rentearth.character_progress cp ON cp.character_id = c.id
    LEFT JOIN rentearth.character_progress_state cps ON cps.character_id = c.id
    WHERE c.user_id = p_user_id AND c.slot = p_slot;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.load_character(uuid, integer, text) IS
    'Load character data with House naming. Returns first_name, username, and display_name. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.load_character(uuid, integer, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.load_character(uuid, integer, text)
    TO service_role;
ALTER FUNCTION rentearth.load_character(uuid, integer, text) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.load_party
-- Load ALL characters for a user (party system - Dwarf Fortress / RimWorld style)
-- =============================================================================
-- House Naming System:
--   - Returns first_name, username, and display_name for each character
--   - display_name is constructed as: "first_name of Haus username"
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.load_party(p_user_id uuid, p_username text, p_primary_slot integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_username IS NULL OR btrim(p_username) = '' THEN
        RAISE EXCEPTION 'Username is required for House naming';
    END IF;

    IF p_primary_slot IS NOT NULL AND p_primary_slot BETWEEN 0 AND 9 THEN
        UPDATE rentearth.character_stats cs
        SET last_login_at = timezone('utc', now())
        FROM rentearth.character c
        WHERE c.id = cs.character_id AND c.user_id = p_user_id AND c.slot = p_primary_slot;
    END IF;

    SELECT COALESCE(json_agg(
        json_build_object(
            'id', c.id, 'user_id', c.user_id, 'slot', c.slot,
            'first_name', c.first_name,
            'username', btrim(p_username),
            'display_name', c.first_name || ' of Haus ' || btrim(p_username),
            'visual_type', c.visual_type, 'behavior_flags', c.behavior_flags,
            'emotional_flags', c.emotional_flags, 'archetype_flags', c.archetype_flags,
            'level', c.level, 'experience', c.experience,
            'created_at', c.created_at, 'updated_at', c.updated_at,
            'stats', json_build_object(
                'world_x', COALESCE(cs.world_x, 0), 'world_y', COALESCE(cs.world_y, 0),
                'world_z', COALESCE(cs.world_z, 0), 'rotation_yaw', COALESCE(cs.rotation_yaw, 0),
                'last_safe_x', COALESCE(cs.last_safe_x, 0), 'last_safe_y', COALESCE(cs.last_safe_y, 0),
                'last_safe_z', COALESCE(cs.last_safe_z, 0),
                'health_current', COALESCE(cs.health_current, 100), 'health_max', COALESCE(cs.health_max, 100),
                'mana_current', COALESCE(cs.mana_current, 100), 'mana_max', COALESCE(cs.mana_max, 100),
                'stamina_current', COALESCE(cs.stamina_current, 100), 'stamina_max', COALESCE(cs.stamina_max, 100),
                'attack_power', COALESCE(cs.attack_power, 10), 'defense', COALESCE(cs.defense, 10),
                'speed', COALESCE(cs.speed, 5.0), 'current_zone', COALESCE(cs.current_zone, 'starting_area'),
                'last_login_at', cs.last_login_at, 'total_playtime', cs.total_playtime
            ),
            'inventory', json_build_object(
                'items_proto', encode(COALESCE(i.items_proto, '\x'::bytea), 'base64'),
                'gold', COALESCE(i.gold, 0), 'last_revision', COALESCE(i.last_revision, 0)
            ),
            'state', json_build_object(
                'state_proto', encode(COALESCE(cst.state_proto, '\x'::bytea), 'base64'),
                'session_revision', COALESCE(cst.session_revision, 0)
            ),
            'progression', json_build_object(
                'story_flags', COALESCE(cp.story_flags, 0), 'dialogue_flags', COALESCE(cp.dialogue_flags, 0),
                'tutorial_flags', COALESCE(cp.tutorial_flags, 0), 'achievement_flags', COALESCE(cp.achievement_flags, 0),
                'rep_farmers', COALESCE(cp.rep_farmers, 0), 'rep_merchants', COALESCE(cp.rep_merchants, 0),
                'rep_explorers', COALESCE(cp.rep_explorers, 0), 'rep_craftsmen', COALESCE(cp.rep_craftsmen, 0)
            ),
            'progression_state', json_build_object(
                'dialogue_history', encode(COALESCE(cps.dialogue_history, '\x'::bytea), 'base64'),
                'reputation_data', encode(COALESCE(cps.reputation_data, '\x'::bytea), 'base64'),
                'quest_state', encode(COALESCE(cps.quest_state, '\x'::bytea), 'base64'),
                'npc_storylines', encode(COALESCE(cps.npc_storylines, '\x'::bytea), 'base64')
            )
        ) ORDER BY c.slot
    ), '[]'::json) INTO v_result
    FROM rentearth.character c
    LEFT JOIN rentearth.character_stats cs ON cs.character_id = c.id
    LEFT JOIN rentearth.inventory i ON i.character_id = c.id
    LEFT JOIN rentearth.character_state cst ON cst.character_id = c.id
    LEFT JOIN rentearth.character_progress cp ON cp.character_id = c.id
    LEFT JOIN rentearth.character_progress_state cps ON cps.character_id = c.id
    WHERE c.user_id = p_user_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.load_party(uuid, text, integer) IS
    'Load all characters for party system with House naming. Returns first_name, username, display_name. Called by Axum.';

REVOKE ALL ON FUNCTION rentearth.load_party(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.load_party(uuid, text, integer)
    TO service_role;
ALTER FUNCTION rentearth.load_party(uuid, text, integer) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.list_characters
-- =============================================================================
-- House Naming System:
--   - Returns first_name, username, and display_name for each character
--   - display_name is constructed as: "first_name of Haus username"
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.list_characters(p_user_id uuid, p_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_username IS NULL OR btrim(p_username) = '' THEN
        RAISE EXCEPTION 'Username is required for House naming';
    END IF;

    SELECT COALESCE(json_agg(
        json_build_object(
            'id', c.id, 'slot', c.slot,
            'first_name', c.first_name,
            'username', btrim(p_username),
            'display_name', c.first_name || ' of Haus ' || btrim(p_username),
            'visual_type', c.visual_type, 'behavior_flags', c.behavior_flags,
            'emotional_flags', c.emotional_flags, 'archetype_flags', c.archetype_flags,
            'level', c.level, 'experience', c.experience, 'gold', COALESCE(i.gold, 0),
            'current_zone', COALESCE(cs.current_zone, 'starting_area'),
            'health_current', COALESCE(cs.health_current, 100), 'health_max', COALESCE(cs.health_max, 100),
            'last_login_at', cs.last_login_at, 'total_playtime', cs.total_playtime,
            'created_at', c.created_at, 'updated_at', c.updated_at
        ) ORDER BY c.slot
    ), '[]'::json) INTO v_result
    FROM rentearth.character c
    LEFT JOIN rentearth.inventory i ON i.character_id = c.id
    LEFT JOIN rentearth.character_stats cs ON cs.character_id = c.id
    WHERE c.user_id = p_user_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.list_characters(uuid, text) IS
    'List all characters for character select with House naming. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.list_characters(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.list_characters(uuid, text)
    TO service_role;
ALTER FUNCTION rentearth.list_characters(uuid, text) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.save_character_state
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.save_character_state(
    p_user_id uuid,
    p_character_id uuid,
    p_state_proto text DEFAULT NULL,
    p_world_x real DEFAULT NULL, p_world_y real DEFAULT NULL, p_world_z real DEFAULT NULL,
    p_rotation_yaw real DEFAULT NULL,
    p_last_safe_x real DEFAULT NULL, p_last_safe_y real DEFAULT NULL, p_last_safe_z real DEFAULT NULL,
    p_health_current integer DEFAULT NULL, p_mana_current integer DEFAULT NULL, p_stamina_current integer DEFAULT NULL,
    p_current_zone text DEFAULT NULL,
    p_level integer DEFAULT NULL, p_experience bigint DEFAULT NULL,
    p_playtime_delta interval DEFAULT NULL,
    p_behavior_flags bigint DEFAULT NULL, p_emotional_flags bigint DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_state_bytes bytea;
BEGIN
    -- Validate ownership: character must belong to the specified user
    IF NOT EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE id = p_character_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Character % does not belong to user %', p_character_id, p_user_id;
    END IF;

    IF p_state_proto IS NOT NULL AND p_state_proto != '' THEN
        v_state_bytes := decode(p_state_proto, 'base64');
    END IF;

    IF v_state_bytes IS NOT NULL THEN
        INSERT INTO rentearth.character_state (character_id, state_proto, session_revision)
        VALUES (p_character_id, v_state_bytes, 1)
        ON CONFLICT (character_id) DO UPDATE
        SET state_proto = v_state_bytes,
            session_revision = rentearth.character_state.session_revision + 1,
            updated_at = timezone('utc', now());
    END IF;

    INSERT INTO rentearth.character_stats (
        character_id, world_x, world_y, world_z, rotation_yaw,
        last_safe_x, last_safe_y, last_safe_z,
        health_current, mana_current, stamina_current, current_zone, total_playtime
    )
    VALUES (
        p_character_id,
        COALESCE(p_world_x, 0), COALESCE(p_world_y, 0), COALESCE(p_world_z, 0), COALESCE(p_rotation_yaw, 0),
        COALESCE(p_last_safe_x, 0), COALESCE(p_last_safe_y, 0), COALESCE(p_last_safe_z, 0),
        COALESCE(p_health_current, 100), COALESCE(p_mana_current, 100), COALESCE(p_stamina_current, 100),
        COALESCE(p_current_zone, 'starting_area'), COALESCE(p_playtime_delta, '0 seconds')
    )
    ON CONFLICT (character_id) DO UPDATE
    SET world_x = COALESCE(p_world_x, rentearth.character_stats.world_x),
        world_y = COALESCE(p_world_y, rentearth.character_stats.world_y),
        world_z = COALESCE(p_world_z, rentearth.character_stats.world_z),
        rotation_yaw = COALESCE(p_rotation_yaw, rentearth.character_stats.rotation_yaw),
        last_safe_x = COALESCE(p_last_safe_x, rentearth.character_stats.last_safe_x),
        last_safe_y = COALESCE(p_last_safe_y, rentearth.character_stats.last_safe_y),
        last_safe_z = COALESCE(p_last_safe_z, rentearth.character_stats.last_safe_z),
        health_current = COALESCE(p_health_current, rentearth.character_stats.health_current),
        mana_current = COALESCE(p_mana_current, rentearth.character_stats.mana_current),
        stamina_current = COALESCE(p_stamina_current, rentearth.character_stats.stamina_current),
        current_zone = COALESCE(p_current_zone, rentearth.character_stats.current_zone),
        total_playtime = rentearth.character_stats.total_playtime + COALESCE(p_playtime_delta, '0 seconds'),
        updated_at = timezone('utc', now());

    IF p_level IS NOT NULL OR p_experience IS NOT NULL OR p_behavior_flags IS NOT NULL OR p_emotional_flags IS NOT NULL THEN
        UPDATE rentearth.character
        SET level = COALESCE(p_level, level),
            experience = COALESCE(p_experience, experience),
            behavior_flags = COALESCE(p_behavior_flags, behavior_flags),
            emotional_flags = COALESCE(p_emotional_flags, emotional_flags),
            updated_at = timezone('utc', now())
        WHERE id = p_character_id;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION rentearth.save_character_state(uuid, uuid, text, real, real, real, real, real, real, real, integer, integer, integer, text, integer, bigint, interval, bigint, bigint) IS
    'Save character state with ownership validation. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.save_character_state(uuid, uuid, text, real, real, real, real, real, real, real, integer, integer, integer, text, integer, bigint, interval, bigint, bigint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.save_character_state(uuid, uuid, text, real, real, real, real, real, real, real, integer, integer, integer, text, integer, bigint, interval, bigint, bigint)
    TO service_role;
ALTER FUNCTION rentearth.save_character_state(uuid, uuid, text, real, real, real, real, real, real, real, integer, integer, integer, text, integer, bigint, interval, bigint, bigint) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.save_inventory
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.save_inventory(
    p_user_id uuid,
    p_character_id uuid,
    p_items_proto text,
    p_gold bigint DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_items_bytes bytea;
BEGIN
    -- Validate ownership: character must belong to the specified user
    IF NOT EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE id = p_character_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Character % does not belong to user %', p_character_id, p_user_id;
    END IF;

    IF p_items_proto IS NOT NULL AND p_items_proto != '' THEN
        v_items_bytes := decode(p_items_proto, 'base64');
    ELSE
        v_items_bytes := '\x'::bytea;
    END IF;

    INSERT INTO rentearth.inventory (character_id, items_proto, gold, last_revision)
    VALUES (p_character_id, v_items_bytes, COALESCE(p_gold, 0), 1)
    ON CONFLICT (character_id) DO UPDATE
    SET items_proto = v_items_bytes,
        gold = COALESCE(p_gold, rentearth.inventory.gold),
        last_revision = rentearth.inventory.last_revision + 1,
        updated_at = timezone('utc', now());

    RETURN true;
END;
$$;

COMMENT ON FUNCTION rentearth.save_inventory(uuid, uuid, text, bigint) IS
    'Save character inventory with ownership validation. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.save_inventory(uuid, uuid, text, bigint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.save_inventory(uuid, uuid, text, bigint)
    TO service_role;
ALTER FUNCTION rentearth.save_inventory(uuid, uuid, text, bigint) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.delete_character
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.delete_character(p_user_id uuid, p_slot integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF p_slot < 0 OR p_slot > 9 THEN
        RAISE EXCEPTION 'Invalid slot: must be 0-9';
    END IF;

    DELETE FROM rentearth.character
    WHERE user_id = p_user_id AND slot = p_slot;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count > 0;
END;
$$;

COMMENT ON FUNCTION rentearth.delete_character(uuid, integer) IS
    'Delete a character by user_id and slot. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.delete_character(uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.delete_character(uuid, integer)
    TO service_role;
ALTER FUNCTION rentearth.delete_character(uuid, integer) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.list_archetypes
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.list_archetypes()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    SELECT COALESCE(json_agg(
        json_build_object(
            'id', a.id, 'slug', a.slug, 'description', a.description,
            'archetype_flags', a.archetype_flags, 'unlock_flags', a.unlock_flags,
            'companion_slugs', a.companion_slugs, 'sort_order', a.sort_order, 'version', a.version,
            'base_stats', encode(COALESCE(s.base_stats, '\x'::bytea), 'base64'),
            'stat_growth', encode(COALESCE(s.stat_growth, '\x'::bytea), 'base64'),
            'prefab_local', COALESCE(s.prefab_local, ''),
            'prefab_network', COALESCE(s.prefab_network, ''),
            'icon_reference', COALESCE(s.icon_reference, '')
        ) ORDER BY a.sort_order, a.slug
    ), '[]'::json) INTO v_result
    FROM rentearth.archetypes a
    LEFT JOIN rentearth.archetype_states s ON s.archetype_id = a.id
    WHERE a.is_active = true;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.list_archetypes() IS
    'List all active archetypes for character creation.';

REVOKE ALL ON FUNCTION rentearth.list_archetypes()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.list_archetypes()
    TO service_role;
ALTER FUNCTION rentearth.list_archetypes() OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.get_appearance
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.get_appearance(p_user_id uuid, p_character_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    -- Validate ownership: character must belong to the specified user
    IF NOT EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE id = p_character_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Character % does not belong to user %', p_character_id, p_user_id;
    END IF;

    SELECT json_build_object(
        'skin_color', a.skin_color,
        'body_type', a.body_type,
        'body_height', a.body_height,
        'face_shape', a.face_shape,
        'eye_color', a.eye_color,
        'eye_shape', a.eye_shape,
        'eyebrow_style', a.eyebrow_style,
        'eyebrow_color', a.eyebrow_color,
        'nose_style', a.nose_style,
        'mouth_style', a.mouth_style,
        'hair_style', a.hair_style,
        'hair_color', a.hair_color,
        'facial_hair_style', a.facial_hair_style,
        'facial_hair_color', a.facial_hair_color,
        'scar_style', a.scar_style,
        'tattoo_style', a.tattoo_style,
        'tattoo_color', a.tattoo_color,
        'accessory_1', a.accessory_1,
        'accessory_2', a.accessory_2,
        'voice_type', a.voice_type
    ) INTO v_result
    FROM rentearth.character_appearance a
    WHERE a.character_id = p_character_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.get_appearance(uuid, uuid) IS
    'Get character appearance with ownership validation. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.get_appearance(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.get_appearance(uuid, uuid)
    TO service_role;
ALTER FUNCTION rentearth.get_appearance(uuid, uuid) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.save_appearance
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.save_appearance(
    p_user_id uuid,
    p_character_id uuid,
    p_skin_color smallint DEFAULT NULL,
    p_body_type smallint DEFAULT NULL,
    p_body_height smallint DEFAULT NULL,
    p_face_shape smallint DEFAULT NULL,
    p_eye_color smallint DEFAULT NULL,
    p_eye_shape smallint DEFAULT NULL,
    p_eyebrow_style smallint DEFAULT NULL,
    p_eyebrow_color smallint DEFAULT NULL,
    p_nose_style smallint DEFAULT NULL,
    p_mouth_style smallint DEFAULT NULL,
    p_hair_style smallint DEFAULT NULL,
    p_hair_color smallint DEFAULT NULL,
    p_facial_hair_style smallint DEFAULT NULL,
    p_facial_hair_color smallint DEFAULT NULL,
    p_scar_style smallint DEFAULT NULL,
    p_tattoo_style smallint DEFAULT NULL,
    p_tattoo_color smallint DEFAULT NULL,
    p_accessory_1 smallint DEFAULT NULL,
    p_accessory_2 smallint DEFAULT NULL,
    p_voice_type smallint DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate ownership: character must belong to the specified user
    IF NOT EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE id = p_character_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Character % does not belong to user %', p_character_id, p_user_id;
    END IF;

    UPDATE rentearth.character_appearance
    SET skin_color = COALESCE(p_skin_color, skin_color),
        body_type = COALESCE(p_body_type, body_type),
        body_height = COALESCE(p_body_height, body_height),
        face_shape = COALESCE(p_face_shape, face_shape),
        eye_color = COALESCE(p_eye_color, eye_color),
        eye_shape = COALESCE(p_eye_shape, eye_shape),
        eyebrow_style = COALESCE(p_eyebrow_style, eyebrow_style),
        eyebrow_color = COALESCE(p_eyebrow_color, eyebrow_color),
        nose_style = COALESCE(p_nose_style, nose_style),
        mouth_style = COALESCE(p_mouth_style, mouth_style),
        hair_style = COALESCE(p_hair_style, hair_style),
        hair_color = COALESCE(p_hair_color, hair_color),
        facial_hair_style = COALESCE(p_facial_hair_style, facial_hair_style),
        facial_hair_color = COALESCE(p_facial_hair_color, facial_hair_color),
        scar_style = COALESCE(p_scar_style, scar_style),
        tattoo_style = COALESCE(p_tattoo_style, tattoo_style),
        tattoo_color = COALESCE(p_tattoo_color, tattoo_color),
        accessory_1 = COALESCE(p_accessory_1, accessory_1),
        accessory_2 = COALESCE(p_accessory_2, accessory_2),
        voice_type = COALESCE(p_voice_type, voice_type),
        updated_at = timezone('utc', now())
    WHERE character_id = p_character_id;

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION rentearth.save_appearance(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint) IS
    'Update character appearance with ownership validation. Called by Axum with service_role.';

REVOKE ALL ON FUNCTION rentearth.save_appearance(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.save_appearance(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint)
    TO service_role;
ALTER FUNCTION rentearth.save_appearance(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.list_items
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.list_items(
    p_category smallint DEFAULT NULL,
    p_equipment_slot smallint DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    SELECT COALESCE(json_agg(
        json_build_object(
            'id', i.id,
            'slug', i.slug,
            'display_name', i.display_name,
            'description', i.description,
            'category', i.category,
            'rarity', i.rarity,
            'bind_type', i.bind_type,
            'max_stack', i.max_stack,
            'is_tradeable', i.is_tradeable,
            'equipment_slot', i.equipment_slot,
            'required_level', i.required_level,
            'required_archetype_flags', i.required_archetype_flags,
            'base_attack', i.base_attack,
            'base_defense', i.base_defense,
            'base_health', i.base_health,
            'base_mana', i.base_mana,
            'base_speed', i.base_speed,
            'base_durability', i.base_durability,
            'socket_count', i.socket_count,
            'cooldown_ms', i.cooldown_ms,
            'use_effect_id', i.use_effect_id,
            'buy_price', i.buy_price,
            'sell_price', i.sell_price,
            'icon_path', i.icon_path,
            'prefab_path', i.prefab_path,
            'mesh_path', i.mesh_path,
            'version', i.version
        ) ORDER BY i.category, i.slug
    ), '[]'::json) INTO v_result
    FROM rentearth.item_definitions i
    WHERE i.is_active = true
      AND (p_category IS NULL OR i.category = p_category)
      AND (p_equipment_slot IS NULL OR i.equipment_slot = p_equipment_slot);

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.list_items(smallint, smallint) IS
    'List all active items, optionally filtered by category or equipment slot.';

REVOKE ALL ON FUNCTION rentearth.list_items(smallint, smallint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.list_items(smallint, smallint)
    TO service_role;
ALTER FUNCTION rentearth.list_items(smallint, smallint) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.get_item
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.get_item(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    SELECT json_build_object(
        'id', i.id,
        'slug', i.slug,
        'display_name', i.display_name,
        'description', i.description,
        'category', i.category,
        'rarity', i.rarity,
        'bind_type', i.bind_type,
        'max_stack', i.max_stack,
        'is_tradeable', i.is_tradeable,
        'equipment_slot', i.equipment_slot,
        'required_level', i.required_level,
        'required_archetype_flags', i.required_archetype_flags,
        'base_attack', i.base_attack,
        'base_defense', i.base_defense,
        'base_health', i.base_health,
        'base_mana', i.base_mana,
        'base_speed', i.base_speed,
        'base_durability', i.base_durability,
        'socket_count', i.socket_count,
        'cooldown_ms', i.cooldown_ms,
        'use_effect_id', i.use_effect_id,
        'buy_price', i.buy_price,
        'sell_price', i.sell_price,
        'icon_path', i.icon_path,
        'prefab_path', i.prefab_path,
        'mesh_path', i.mesh_path,
        'version', i.version
    ) INTO v_result
    FROM rentearth.item_definitions i
    WHERE i.slug = p_slug AND i.is_active = true;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.get_item(text) IS
    'Get item definition by slug.';

REVOKE ALL ON FUNCTION rentearth.get_item(text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.get_item(text)
    TO service_role;
ALTER FUNCTION rentearth.get_item(text) OWNER TO service_role;

-- =============================================================
-- TABLE: rentearth.world_config (Terrain generation parameters)
-- =============================================================
-- Single row per world, stores terrain generation parameters.
-- terrain_config is a serialized WorldTerrainConfig proto (terrain.proto)
-- Both server and client use identical FastNoise params for deterministic generation.
CREATE TABLE IF NOT EXISTS rentearth.world_config (
    world_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    world_seed      bigint NOT NULL,
    terrain_config  bytea NOT NULL,                          -- Serialized WorldTerrainConfig proto
    chunk_size      integer NOT NULL DEFAULT 128,
    world_bounds    integer[] NOT NULL DEFAULT '{-4, 4, -4, 4}', -- [min_x, max_x, min_z, max_z] in chunks
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT world_config_chunk_size_chk
        CHECK (chunk_size > 0 AND chunk_size <= 256),

    CONSTRAINT world_config_world_bounds_length_chk
        CHECK (array_length(world_bounds, 1) = 4)
);

COMMENT ON TABLE rentearth.world_config IS
    'World terrain configuration. Stores FastNoise params for deterministic terrain generation.';

CREATE INDEX IF NOT EXISTS idx_rentearth_world_config_seed
    ON rentearth.world_config (world_seed);

-- =============================================================
-- TABLE: rentearth.chunk_modifications (Player terrain changes)
-- =============================================================
-- Sparse storage: only chunks with player modifications are stored.
-- mod_data is a serialized ChunkModifications proto (terrain.proto)
-- Base terrain is procedurally generated; this stores deltas (terraforming, buildings).
CREATE TABLE IF NOT EXISTS rentearth.chunk_modifications (
    chunk_x         integer NOT NULL,
    chunk_z         integer NOT NULL,
    world_id        uuid NOT NULL REFERENCES rentearth.world_config(world_id) ON DELETE CASCADE,
    mod_data        bytea NOT NULL,                          -- Serialized ChunkModifications proto
    modified_at     timestamptz NOT NULL DEFAULT timezone('utc', now()),
    modified_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (world_id, chunk_x, chunk_z)
);

COMMENT ON TABLE rentearth.chunk_modifications IS
    'Player modifications to terrain chunks. Sparse storage - only modified chunks have rows.';

CREATE INDEX IF NOT EXISTS idx_rentearth_chunk_mods_coords
    ON rentearth.chunk_modifications (chunk_x, chunk_z);

CREATE INDEX IF NOT EXISTS idx_rentearth_chunk_mods_modified
    ON rentearth.chunk_modifications (modified_at DESC);

-- =============================================================
-- ROW LEVEL SECURITY: World tables
-- =============================================================
ALTER TABLE rentearth.world_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentearth.chunk_modifications ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_all"
    ON rentearth.world_config FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all"
    ON rentearth.chunk_modifications FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Authenticated users can read world config (needed for terrain generation)
CREATE POLICY "authenticated_read_world_config"
    ON rentearth.world_config FOR SELECT TO authenticated
    USING (true);

-- Authenticated users can read chunk modifications (needed for terrain rendering)
CREATE POLICY "authenticated_read_chunk_mods"
    ON rentearth.chunk_modifications FOR SELECT TO authenticated
    USING (true);

-- Revoke from anon/public
REVOKE ALL ON rentearth.world_config FROM PUBLIC, anon;
REVOKE ALL ON rentearth.chunk_modifications FROM PUBLIC, anon;

-- =============================================================
-- FUNCTION: rentearth.get_world_config
-- Load world configuration (terrain params, bounds, etc.)
-- =============================================================
CREATE OR REPLACE FUNCTION rentearth.get_world_config(p_world_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    -- If no world_id provided, get the first (default) world
    IF p_world_id IS NULL THEN
        SELECT w.world_id INTO p_world_id
        FROM rentearth.world_config w
        ORDER BY w.created_at ASC
        LIMIT 1;
    END IF;

    IF p_world_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT json_build_object(
        'world_id', w.world_id,
        'world_seed', w.world_seed,
        'terrain_config', encode(w.terrain_config, 'base64'),
        'chunk_size', w.chunk_size,
        'world_bounds', w.world_bounds,
        'created_at', w.created_at
    ) INTO v_result
    FROM rentearth.world_config w
    WHERE w.world_id = p_world_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.get_world_config(uuid) IS
    'Load world terrain configuration. Returns base64-encoded proto for terrain_config.';

REVOKE ALL ON FUNCTION rentearth.get_world_config(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.get_world_config(uuid)
    TO service_role;
ALTER FUNCTION rentearth.get_world_config(uuid) OWNER TO service_role;

-- =============================================================
-- FUNCTION: rentearth.get_chunk_modifications
-- Load modifications for chunks in view (sparse - only returns modified chunks)
-- =============================================================
CREATE OR REPLACE FUNCTION rentearth.get_chunk_modifications(
    p_world_id uuid,
    p_chunk_coords integer[]  -- Array of [x1, z1, x2, z2, ...] pairs
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result json;
BEGIN
    IF p_world_id IS NULL OR p_chunk_coords IS NULL THEN
        RETURN '[]'::json;
    END IF;

    -- Convert array to coordinate pairs and query
    SELECT COALESCE(json_agg(
        json_build_object(
            'chunk_x', cm.chunk_x,
            'chunk_z', cm.chunk_z,
            'mod_data', encode(cm.mod_data, 'base64'),
            'modified_at', cm.modified_at
        )
    ), '[]'::json) INTO v_result
    FROM rentearth.chunk_modifications cm
    WHERE cm.world_id = p_world_id
      AND EXISTS (
          SELECT 1
          FROM generate_series(1, array_length(p_chunk_coords, 1), 2) AS i
          WHERE cm.chunk_x = p_chunk_coords[i]
            AND cm.chunk_z = p_chunk_coords[i + 1]
      );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.get_chunk_modifications(uuid, integer[]) IS
    'Load terrain modifications for specified chunks. Returns only chunks that have modifications.';

REVOKE ALL ON FUNCTION rentearth.get_chunk_modifications(uuid, integer[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.get_chunk_modifications(uuid, integer[])
    TO service_role;
ALTER FUNCTION rentearth.get_chunk_modifications(uuid, integer[]) OWNER TO service_role;

-- =============================================================
-- FUNCTION: rentearth.save_chunk_modification
-- Save player modification to a terrain chunk
-- =============================================================
CREATE OR REPLACE FUNCTION rentearth.save_chunk_modification(
    p_world_id uuid,
    p_chunk_x integer,
    p_chunk_z integer,
    p_mod_data bytea,
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_world_id IS NULL OR p_mod_data IS NULL THEN
        RETURN false;
    END IF;

    INSERT INTO rentearth.chunk_modifications (world_id, chunk_x, chunk_z, mod_data, modified_by, modified_at)
    VALUES (p_world_id, p_chunk_x, p_chunk_z, p_mod_data, p_user_id, timezone('utc', now()))
    ON CONFLICT (world_id, chunk_x, chunk_z)
    DO UPDATE SET
        mod_data = EXCLUDED.mod_data,
        modified_by = EXCLUDED.modified_by,
        modified_at = timezone('utc', now());

    RETURN true;
END;
$$;

COMMENT ON FUNCTION rentearth.save_chunk_modification(uuid, integer, integer, bytea, uuid) IS
    'Save or update terrain modification for a chunk. Upserts if chunk already has modifications.';

REVOKE ALL ON FUNCTION rentearth.save_chunk_modification(uuid, integer, integer, bytea, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.save_chunk_modification(uuid, integer, integer, bytea, uuid)
    TO service_role;
ALTER FUNCTION rentearth.save_chunk_modification(uuid, integer, integer, bytea, uuid) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.recalculate_derived_stats
-- =============================================================================
-- Recalculate all derived stats from core attributes
-- Called after attribute changes, level ups, or gear changes
--
-- DESIGN PRINCIPLE: Level doesn't affect stats directly - it just gives more
-- skill points to allocate. This keeps formulas simple and predictable.
--
-- Derived Stats Formulas (matching C# CharacterStatsData):
--   Vital Stats:
--     health_max = (CON * 10) + FTH
--     mana_max = (INT * 8) + (WIS * 2)
--     stamina_max = (CON * 5) + (AGI * 3)
--
--   Combat Stats:
--     attack_power = STR * 2
--     spell_power = (INT * 2.5) + (WIS * 0.5)
--     defense = CON + (STR * 0.5)
--     magic_resist = (WIS * 1.5) + (FTH * 0.5)
--     speed = 5.0 + (AGI * 0.05)
--
--   Utility Stats:
--     crit_chance = 5% + (AGI * 0.2%) + (LCK * 0.15%)
--     crit_damage = 150% + STR
--     cooldown_reduction = WIS * 0.5%
--     dodge_chance = 2% + (AGI * 0.15%) + (LCK * 0.1%)
--
--   Faith & Luck Stats:
--     healing_power = (FTH * 2) + (WIS * 0.5)
--     holy_damage = FTH * 1.5
--     buff_duration = 100% + (CHA * 0.5%)
--     debuff_resist = 5% + (WIS * 0.3%) + (FTH * 0.2%)
--     loot_bonus = LCK * 0.5%
--     rare_find = LCK * 0.3%
--     crafting_quality = (INT * 0.4%) + (LCK * 0.1%)
--
--   Combat Rating:
--     CR = (total_attrs - 80) * 2  (no level scaling)
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.recalculate_derived_stats(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_str smallint;
    v_agi smallint;
    v_con smallint;
    v_int smallint;
    v_wis smallint;
    v_cha smallint;
    v_lck smallint;
    v_fth smallint;
BEGIN
    -- Fetch current attributes (8 core attributes - level not needed for formulas)
    SELECT cs.strength, cs.agility, cs.constitution,
           cs.intelligence, cs.wisdom, cs.charisma,
           cs.luck, cs.faith
    INTO v_str, v_agi, v_con, v_int, v_wis, v_cha, v_lck, v_fth
    FROM rentearth.character_stats cs
    WHERE cs.character_id = p_character_id;

    IF v_str IS NULL THEN
        RAISE EXCEPTION 'Character not found: %', p_character_id;
    END IF;

    -- Update all derived stats (formulas match C# CharacterStatsData)
    UPDATE rentearth.character_stats
    SET
        -- Vital stats (no level scaling - level gives points to allocate)
        health_max = (v_con * 10) + v_fth,
        mana_max = (v_int * 8) + (v_wis * 2),
        stamina_max = (v_con * 5) + (v_agi * 3),

        -- Combat stats (gear bonuses added separately by Axum)
        attack_power = v_str * 2,
        spell_power = FLOOR(v_int * 2.5 + v_wis * 0.5)::integer,
        defense = v_con + FLOOR(v_str * 0.5)::integer,
        magic_resist = FLOOR(v_wis * 1.5 + v_fth * 0.5)::integer,
        speed = 5.0 + (v_agi * 0.05),

        -- Utility stats (percentages)
        crit_chance = 5.0 + (v_agi * 0.2) + (v_lck * 0.15),
        crit_damage = 150.0 + v_str,
        cooldown_reduction = v_wis * 0.5,
        dodge_chance = 2.0 + (v_agi * 0.15) + (v_lck * 0.1),

        -- Faith & Luck stats
        healing_power = (v_fth * 2) + FLOOR(v_wis * 0.5)::integer,
        holy_damage = FLOOR(v_fth * 1.5)::integer,
        buff_duration = 100.0 + (v_cha * 0.5),  -- CHA affects buff duration
        debuff_resist = 5.0 + (v_wis * 0.3) + (v_fth * 0.2),
        loot_bonus = v_lck * 0.5,
        rare_find = v_lck * 0.3,
        crafting_quality = (v_int * 0.4) + (v_lck * 0.1),

        -- Combat rating (no level scaling - purely attribute based)
        combat_rating = (v_str + v_agi + v_con + v_int + v_wis + v_cha + v_lck + v_fth - 80) * 2,

        updated_at = timezone('utc', now())
    WHERE character_id = p_character_id;
END;
$$;

COMMENT ON FUNCTION rentearth.recalculate_derived_stats(uuid) IS
    'Recalculate all derived stats from core attributes and level. Called after allocations or level ups.';

REVOKE ALL ON FUNCTION rentearth.recalculate_derived_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.recalculate_derived_stats(uuid) TO service_role;
ALTER FUNCTION rentearth.recalculate_derived_stats(uuid) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.allocate_skill_point
-- =============================================================================
-- Allocate a single skill point to a core attribute
-- Returns the new attribute value or raises an exception
--
-- Core Attributes (8 total):
--   STR, AGI, CON, INT, WIS, CHA, LCK, FTH
--   Min 8, Base 10, Soft cap 50, Hard cap 100
--
-- Point System:
--   - 20 bonus points at character creation
--   - 1 point per level
--   - Level 1 starts with 21 unspent (20 bonus + 1 for level)
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.allocate_skill_point(
    p_user_id uuid,
    p_character_id uuid,
    p_attribute text  -- 'strength', 'agility', 'constitution', 'intelligence', 'wisdom', 'charisma', 'luck', 'faith'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_points smallint;
    v_current_value smallint;
    v_new_value smallint;
    v_result json;
BEGIN
    -- Validate ownership: character must belong to the specified user
    IF NOT EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE id = p_character_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Character % does not belong to user %', p_character_id, p_user_id;
    END IF;

    -- Validate attribute name (8 core attributes)
    IF p_attribute NOT IN ('strength', 'agility', 'constitution', 'intelligence', 'wisdom', 'charisma', 'luck', 'faith') THEN
        RAISE EXCEPTION 'Invalid attribute: %', p_attribute;
    END IF;

    -- Get current unspent points
    SELECT unspent_skill_points INTO v_current_points
    FROM rentearth.character_stats
    WHERE character_id = p_character_id
    FOR UPDATE;

    IF v_current_points IS NULL THEN
        RAISE EXCEPTION 'Character not found: %', p_character_id;
    END IF;

    IF v_current_points < 1 THEN
        RAISE EXCEPTION 'No skill points available';
    END IF;

    -- Get current attribute value
    EXECUTE format('SELECT %I FROM rentearth.character_stats WHERE character_id = $1', p_attribute)
    INTO v_current_value
    USING p_character_id;

    IF v_current_value >= 100 THEN
        RAISE EXCEPTION 'Attribute % is already at maximum (100)', p_attribute;
    END IF;

    v_new_value := v_current_value + 1;

    -- Update attribute and deduct point
    EXECUTE format('
        UPDATE rentearth.character_stats
        SET %I = $1,
            unspent_skill_points = unspent_skill_points - 1,
            updated_at = timezone(''utc'', now())
        WHERE character_id = $2
    ', p_attribute)
    USING v_new_value, p_character_id;

    -- Recalculate derived stats
    PERFORM rentearth.recalculate_derived_stats(p_character_id);

    -- Return result
    SELECT json_build_object(
        'attribute', p_attribute,
        'old_value', v_current_value,
        'new_value', v_new_value,
        'remaining_points', v_current_points - 1
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.allocate_skill_point(uuid, uuid, text) IS
    'Allocate one skill point with ownership validation. Validates limits and recalculates derived stats.';

REVOKE ALL ON FUNCTION rentearth.allocate_skill_point(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.allocate_skill_point(uuid, uuid, text) TO service_role;
ALTER FUNCTION rentearth.allocate_skill_point(uuid, uuid, text) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.respec_attributes
-- =============================================================================
-- Full attribute respec - reset all 8 core attributes to base 10
-- Returns level + 20 points to unspent pool (20 creation bonus + 1/level)
-- Costs gold (default 1000)
--
-- Point System:
--   - 20 bonus points at character creation
--   - 1 point per level
--   - Respec returns: level + 20 points
--
-- Respec Options (by parameter):
--   - Full respec: 1000 gold (default)
--   - Free respec: 0 gold (for tutorials, etc.)
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.respec_attributes(
    p_user_id uuid,
    p_character_id uuid,
    p_gold_cost bigint DEFAULT 1000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_gold bigint;
    v_level integer;
    v_points_to_return integer;
    v_result json;
BEGIN
    -- Validate ownership: character must belong to the specified user
    IF NOT EXISTS (
        SELECT 1 FROM rentearth.character
        WHERE id = p_character_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Character % does not belong to user %', p_character_id, p_user_id;
    END IF;

    -- Check gold
    SELECT gold INTO v_current_gold
    FROM rentearth.inventory
    WHERE character_id = p_character_id
    FOR UPDATE;

    IF v_current_gold IS NULL THEN
        RAISE EXCEPTION 'Character inventory not found';
    END IF;

    IF v_current_gold < p_gold_cost THEN
        RAISE EXCEPTION 'Insufficient gold. Need %, have %', p_gold_cost, v_current_gold;
    END IF;

    -- Get character level
    SELECT level INTO v_level
    FROM rentearth.character
    WHERE id = p_character_id;

    IF v_level IS NULL THEN
        RAISE EXCEPTION 'Character not found';
    END IF;

    -- Calculate points to return: 20 bonus + level
    v_points_to_return := 20 + v_level;

    -- Deduct gold
    UPDATE rentearth.inventory
    SET gold = gold - p_gold_cost,
        updated_at = timezone('utc', now())
    WHERE character_id = p_character_id;

    -- Reset all 8 attributes to base 10 and return all points
    UPDATE rentearth.character_stats
    SET strength = 10,
        agility = 10,
        constitution = 10,
        intelligence = 10,
        wisdom = 10,
        charisma = 10,
        luck = 10,
        faith = 10,
        unspent_skill_points = v_points_to_return,
        updated_at = timezone('utc', now())
    WHERE character_id = p_character_id;

    -- Recalculate derived stats
    PERFORM rentearth.recalculate_derived_stats(p_character_id);

    SELECT json_build_object(
        'success', true,
        'gold_spent', p_gold_cost,
        'points_refunded', v_points_to_return
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rentearth.respec_attributes(uuid, uuid, bigint) IS
    'Full attribute respec with ownership validation. Resets all 8 attributes to 10, returns level + 20 points. Costs gold.';

REVOKE ALL ON FUNCTION rentearth.respec_attributes(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.respec_attributes(uuid, uuid, bigint) TO service_role;
ALTER FUNCTION rentearth.respec_attributes(uuid, uuid, bigint) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.grant_skill_points_on_levelup
-- =============================================================================
-- Trigger function: Grant 1 skill point when character levels up
-- Also recalculates derived stats (health_max, mana_max, etc. scale with level)
--
-- Point System:
--   - 20 bonus points at character creation
--   - 1 point per level (not 3)
--   - Level 1 starts with 21 unspent (20 bonus + 1 for level)
--
-- Total Points by Level:
--   Level 1:  21 (20 bonus + 1)
--   Level 50: 70 (20 bonus + 50)
--   Level 99: 119 (20 bonus + 99)
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.grant_skill_points_on_levelup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_levels_gained integer;
BEGIN
    -- Calculate levels gained (1 point per level)
    v_levels_gained := NEW.level - OLD.level;

    IF v_levels_gained > 0 THEN
        UPDATE rentearth.character_stats
        SET unspent_skill_points = unspent_skill_points + v_levels_gained,
            updated_at = timezone('utc', now())
        WHERE character_id = NEW.id;

        -- Recalculate derived stats for new level
        PERFORM rentearth.recalculate_derived_stats(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION rentearth.grant_skill_points_on_levelup() IS
    'Trigger function: Grants 1 skill point per level gained and recalculates derived stats.';

-- Create trigger on character table for level up
DROP TRIGGER IF EXISTS trg_character_levelup ON rentearth.character;
CREATE TRIGGER trg_character_levelup
    AFTER UPDATE OF level ON rentearth.character
    FOR EACH ROW
    WHEN (NEW.level > OLD.level)
    EXECUTE FUNCTION rentearth.grant_skill_points_on_levelup();

-- =============================================================
-- SANITY CHECK BLOCK
-- =============================================================
DO $$
DECLARE
    conflict_count bigint;
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Ensure no duplicate slots per user
    SELECT COUNT(*) INTO conflict_count
    FROM (
        SELECT user_id, slot
        FROM rentearth.character
        GROUP BY user_id, slot
        HAVING COUNT(*) > 1
    ) dup;

    IF conflict_count > 0 THEN
        RAISE EXCEPTION 'rentearth.character has duplicate (user_id, slot) pairs: %', conflict_count;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- migrate:down
-- =============================================================
-- ROLLBACK: Drop entire rentearth schema
-- =============================================================
DROP SCHEMA IF EXISTS rentearth CASCADE;
