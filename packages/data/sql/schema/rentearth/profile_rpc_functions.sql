-- =============================================================================
-- VERIFIED AGAINST LIVE DB: 2026-02-11
-- Database: supabase (supabase-cluster-rw / kilobase namespace)
-- PostgreSQL 17.4
--
-- STATUS: Both functions (get_characters_for_profile, get_character_full_for_profile)
--   match live DB. Owned by service_role.
--
-- ADJUSTMENTS NEEDED: None identified.
-- Source: rentearth repo (proto/schema/migrations/20241231000001_profile_rpc_functions.sql)
-- =============================================================================
-- MIGRATION: Profile RPC Functions for KBVE.com Integration
-- =============================================================================
-- These functions are called by KBVE.com's Axum backend to fetch RentEarth
-- character data for user profile caching. They return flat table structures
-- optimized for Rust deserialization.
-- =============================================================================

-- =============================================================================
-- FUNCTION: rentearth.get_characters_for_profile
-- =============================================================================
-- Returns character summaries for profile display (character select style).
-- Used by KBVE.com profile cache - lighter weight than list_characters.
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.get_characters_for_profile(p_user_id uuid)
RETURNS TABLE (
    id uuid,
    slot smallint,
    first_name text,
    visual_type integer,
    archetype_flags bigint,
    level integer,
    experience bigint,
    gold bigint,
    current_zone text,
    health_current integer,
    health_max integer,
    last_login_at timestamptz,
    total_playtime_seconds bigint,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        c.id,
        c.slot,
        c.first_name,
        c.visual_type,
        c.archetype_flags,
        c.level,
        c.experience,
        COALESCE(i.gold, 0)::bigint AS gold,
        COALESCE(cs.current_zone, 'starting_area') AS current_zone,
        COALESCE(cs.health_current, 100) AS health_current,
        COALESCE(cs.health_max, 100) AS health_max,
        cs.last_login_at,
        EXTRACT(EPOCH FROM COALESCE(cs.total_playtime, INTERVAL '0 seconds'))::bigint AS total_playtime_seconds,
        c.created_at
    FROM rentearth.character c
    LEFT JOIN rentearth.character_stats cs ON cs.character_id = c.id
    LEFT JOIN rentearth.inventory i ON i.character_id = c.id
    WHERE c.user_id = p_user_id
    ORDER BY c.slot;
$$;

COMMENT ON FUNCTION rentearth.get_characters_for_profile(uuid) IS
    'Get character summaries for KBVE.com profile caching. Returns flat table for easy Rust deserialization.';

REVOKE ALL ON FUNCTION rentearth.get_characters_for_profile(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.get_characters_for_profile(uuid)
    TO service_role;
ALTER FUNCTION rentearth.get_characters_for_profile(uuid) OWNER TO service_role;

-- =============================================================================
-- FUNCTION: rentearth.get_character_full_for_profile
-- =============================================================================
-- Returns full character data including stats, position, and appearance.
-- Used for the "active character" display on profile pages.
-- Security: Requires p_user_id to validate ownership (defense-in-depth).
-- =============================================================================
CREATE OR REPLACE FUNCTION rentearth.get_character_full_for_profile(
    p_user_id uuid,
    p_character_id uuid
)
RETURNS TABLE (
    -- Summary fields
    id uuid,
    slot smallint,
    first_name text,
    visual_type integer,
    archetype_flags bigint,
    level integer,
    experience bigint,
    gold bigint,
    current_zone text,
    health_current integer,
    health_max integer,
    last_login_at timestamptz,
    total_playtime_seconds bigint,
    created_at timestamptz,
    -- Position
    world_x real,
    world_y real,
    world_z real,
    rotation_yaw real,
    -- Core stats (8 attributes)
    strength integer,
    agility integer,
    constitution integer,
    intelligence integer,
    wisdom integer,
    charisma integer,
    luck integer,
    faith integer,
    unspent_skill_points integer,
    -- Derived stats
    mana_current integer,
    mana_max integer,
    stamina_current integer,
    stamina_max integer,
    attack_power integer,
    spell_power integer,
    defense integer,
    magic_resist integer,
    speed real,
    crit_chance real,
    crit_damage real,
    combat_rating integer,
    -- Appearance
    skin_color smallint,
    body_type smallint,
    body_height smallint,
    face_shape smallint,
    eye_color smallint,
    eye_shape smallint,
    eyebrow_style smallint,
    eyebrow_color smallint,
    nose_style smallint,
    mouth_style smallint,
    hair_style smallint,
    hair_color smallint,
    facial_hair_style smallint,
    facial_hair_color smallint,
    scar_style smallint,
    tattoo_style smallint,
    voice_type smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        -- Summary
        c.id,
        c.slot,
        c.first_name,
        c.visual_type,
        c.archetype_flags,
        c.level,
        c.experience,
        COALESCE(i.gold, 0)::bigint AS gold,
        COALESCE(cs.current_zone, 'starting_area') AS current_zone,
        COALESCE(cs.health_current, 100) AS health_current,
        COALESCE(cs.health_max, 100) AS health_max,
        cs.last_login_at,
        EXTRACT(EPOCH FROM COALESCE(cs.total_playtime, INTERVAL '0 seconds'))::bigint AS total_playtime_seconds,
        c.created_at,
        -- Position
        COALESCE(cs.world_x, 0.0) AS world_x,
        COALESCE(cs.world_y, 0.0) AS world_y,
        COALESCE(cs.world_z, 0.0) AS world_z,
        COALESCE(cs.rotation_yaw, 0.0) AS rotation_yaw,
        -- Core stats
        COALESCE(cs.strength, 10) AS strength,
        COALESCE(cs.agility, 10) AS agility,
        COALESCE(cs.constitution, 10) AS constitution,
        COALESCE(cs.intelligence, 10) AS intelligence,
        COALESCE(cs.wisdom, 10) AS wisdom,
        COALESCE(cs.charisma, 10) AS charisma,
        COALESCE(cs.luck, 10) AS luck,
        COALESCE(cs.faith, 10) AS faith,
        COALESCE(cs.unspent_skill_points, 0) AS unspent_skill_points,
        -- Derived stats
        COALESCE(cs.mana_current, 100) AS mana_current,
        COALESCE(cs.mana_max, 100) AS mana_max,
        COALESCE(cs.stamina_current, 100) AS stamina_current,
        COALESCE(cs.stamina_max, 100) AS stamina_max,
        COALESCE(cs.attack_power, 10) AS attack_power,
        COALESCE(cs.spell_power, 10) AS spell_power,
        COALESCE(cs.defense, 10) AS defense,
        COALESCE(cs.magic_resist, 10) AS magic_resist,
        COALESCE(cs.speed, 5.0) AS speed,
        COALESCE(cs.crit_chance, 0.05) AS crit_chance,
        COALESCE(cs.crit_damage, 1.5) AS crit_damage,
        COALESCE(cs.combat_rating, 0) AS combat_rating,
        -- Appearance
        COALESCE(ca.skin_color, 0) AS skin_color,
        COALESCE(ca.body_type, 0) AS body_type,
        COALESCE(ca.body_height, 50) AS body_height,
        COALESCE(ca.face_shape, 0) AS face_shape,
        COALESCE(ca.eye_color, 0) AS eye_color,
        COALESCE(ca.eye_shape, 0) AS eye_shape,
        COALESCE(ca.eyebrow_style, 0) AS eyebrow_style,
        COALESCE(ca.eyebrow_color, 0) AS eyebrow_color,
        COALESCE(ca.nose_style, 0) AS nose_style,
        COALESCE(ca.mouth_style, 0) AS mouth_style,
        COALESCE(ca.hair_style, 0) AS hair_style,
        COALESCE(ca.hair_color, 0) AS hair_color,
        COALESCE(ca.facial_hair_style, 0) AS facial_hair_style,
        COALESCE(ca.facial_hair_color, 0) AS facial_hair_color,
        COALESCE(ca.scar_style, 0) AS scar_style,
        COALESCE(ca.tattoo_style, 0) AS tattoo_style,
        COALESCE(ca.voice_type, 0) AS voice_type
    FROM rentearth.character c
    LEFT JOIN rentearth.character_stats cs ON cs.character_id = c.id
    LEFT JOIN rentearth.inventory i ON i.character_id = c.id
    LEFT JOIN rentearth.character_appearance ca ON ca.character_id = c.id
    WHERE c.id = p_character_id
      AND c.user_id = p_user_id;  -- Ownership validation
$$;

COMMENT ON FUNCTION rentearth.get_character_full_for_profile(uuid, uuid) IS
    'Get full character data for KBVE.com profile active character display. Validates ownership via p_user_id.';

REVOKE ALL ON FUNCTION rentearth.get_character_full_for_profile(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rentearth.get_character_full_for_profile(uuid, uuid)
    TO service_role;
ALTER FUNCTION rentearth.get_character_full_for_profile(uuid, uuid) OWNER TO service_role;
