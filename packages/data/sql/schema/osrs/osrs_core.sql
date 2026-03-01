-- ============================================================
-- OSRS CORE — Item catalog with equipment, drops, recipes, prices
--
-- Creates the osrs schema, all 9 tables, trigger functions,
-- indexes, and RLS policies. Service-role-only data store —
-- no anon/authenticated access at all.
--
-- Tables: items, equipment, bonuses, requirements,
--         drop_sources, recipes, recipe_materials,
--         prices, price_latest
--
-- Security:
--   - service_role has full access via RLS bypass
--   - anon/authenticated have NO schema usage, NO table access
--   - All trigger functions: REVOKE from PUBLIC, owned by service_role
--   - All SECURITY DEFINER functions: search_path=''
--
-- Prerequisite: pg_trgm extension (for fuzzy item name search)
-- ============================================================

BEGIN;

-- ===========================================
-- EXTENSION: pg_trgm (fuzzy text search)
-- ===========================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================
-- SCHEMA + PERMISSIONS
-- ===========================================

CREATE SCHEMA IF NOT EXISTS osrs;
ALTER SCHEMA osrs OWNER TO postgres;

GRANT USAGE ON SCHEMA osrs TO service_role;
REVOKE ALL ON SCHEMA osrs FROM PUBLIC;
REVOKE ALL ON SCHEMA osrs FROM anon, authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA osrs TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA osrs TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA osrs TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA osrs
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA osrs
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA osrs
    GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ===========================================
-- TABLE: osrs.items
-- Core item catalog — every OSRS item has an entry here.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.items (
    item_id    BIGINT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    examine    TEXT NOT NULL DEFAULT '',
    members    BOOLEAN NOT NULL DEFAULT false,
    icon       TEXT NOT NULL DEFAULT '',
    value      INTEGER NOT NULL DEFAULT 0,
    lowalch    INTEGER,
    highalch   INTEGER,
    ge_limit   INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_slug_unique UNIQUE (slug)
);

COMMENT ON TABLE osrs.items IS 'Core OSRS item catalog. Every item has an entry here.';
COMMENT ON COLUMN osrs.items.item_id IS 'OSRS item ID (from game data)';
COMMENT ON COLUMN osrs.items.slug IS 'URL-safe slug derived from item name';
COMMENT ON COLUMN osrs.items.ge_limit IS 'Grand Exchange buy limit per 4-hour window';

CREATE INDEX IF NOT EXISTS idx_osrs_items_name_trgm
    ON osrs.items USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_osrs_items_slug
    ON osrs.items (slug);
CREATE INDEX IF NOT EXISTS idx_osrs_items_members
    ON osrs.items (members);

ALTER TABLE osrs.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.items;
CREATE POLICY "service_role_full_access" ON osrs.items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Global revoke after first table creation
REVOKE ALL ON ALL TABLES IN SCHEMA osrs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA osrs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA osrs FROM PUBLIC, anon, authenticated;

-- ===========================================
-- TABLE: osrs.equipment
-- Equipment stats for wearable/wieldable items.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.equipment (
    item_id      BIGINT PRIMARY KEY REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    slot         TEXT,
    weapon_type  TEXT,
    weight       REAL,
    attack_speed INTEGER,
    attack_range INTEGER,
    tradeable    BOOLEAN,
    degradable   BOOLEAN,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.equipment IS 'Equipment metadata for wearable/wieldable items';
COMMENT ON COLUMN osrs.equipment.slot IS 'Equipment slot: head, cape, neck, ammo, weapon, body, shield, legs, hands, feet, ring, 2h';

ALTER TABLE osrs.equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.equipment;
CREATE POLICY "service_role_full_access" ON osrs.equipment
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.bonuses
-- Combat bonuses for equipment items.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.bonuses (
    item_id         BIGINT PRIMARY KEY REFERENCES osrs.equipment(item_id) ON DELETE CASCADE,
    attack_stab     INTEGER NOT NULL DEFAULT 0,
    attack_slash    INTEGER NOT NULL DEFAULT 0,
    attack_crush    INTEGER NOT NULL DEFAULT 0,
    attack_magic    INTEGER NOT NULL DEFAULT 0,
    attack_ranged   INTEGER NOT NULL DEFAULT 0,
    defence_stab    INTEGER NOT NULL DEFAULT 0,
    defence_slash   INTEGER NOT NULL DEFAULT 0,
    defence_crush   INTEGER NOT NULL DEFAULT 0,
    defence_magic   INTEGER NOT NULL DEFAULT 0,
    defence_ranged  INTEGER NOT NULL DEFAULT 0,
    melee_strength  INTEGER NOT NULL DEFAULT 0,
    ranged_strength INTEGER NOT NULL DEFAULT 0,
    magic_damage    INTEGER NOT NULL DEFAULT 0,
    prayer          INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.bonuses IS 'Combat bonuses for equipment. 1:1 with osrs.equipment.';

ALTER TABLE osrs.bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.bonuses;
CREATE POLICY "service_role_full_access" ON osrs.bonuses
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.requirements
-- Skill/quest requirements to equip items.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.requirements (
    item_id      BIGINT PRIMARY KEY REFERENCES osrs.equipment(item_id) ON DELETE CASCADE,
    attack       INTEGER,
    strength     INTEGER,
    defence      INTEGER,
    ranged       INTEGER,
    prayer       INTEGER,
    magic        INTEGER,
    runecraft    INTEGER,
    hitpoints    INTEGER,
    crafting     INTEGER,
    mining       INTEGER,
    smithing     INTEGER,
    fishing      INTEGER,
    cooking      INTEGER,
    firemaking   INTEGER,
    woodcutting  INTEGER,
    agility      INTEGER,
    herblore     INTEGER,
    thieving     INTEGER,
    fletching    INTEGER,
    slayer       INTEGER,
    farming      INTEGER,
    construction INTEGER,
    hunter       INTEGER,
    quest        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.requirements IS 'Skill/quest requirements to equip an item. 1:1 with osrs.equipment.';

ALTER TABLE osrs.requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.requirements;
CREATE POLICY "service_role_full_access" ON osrs.requirements
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.drop_sources
-- NPC/activity drop sources for items.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.drop_sources (
    id           BIGSERIAL PRIMARY KEY,
    item_id      BIGINT NOT NULL REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    source       TEXT NOT NULL,
    combat_level INTEGER,
    quantity     TEXT,
    rarity       TEXT,
    drop_rate    TEXT,
    members_only BOOLEAN,
    wilderness   BOOLEAN,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.drop_sources IS 'NPC/activity drop sources. Many-to-one with osrs.items.';

CREATE INDEX IF NOT EXISTS idx_osrs_drop_sources_item
    ON osrs.drop_sources (item_id);
CREATE INDEX IF NOT EXISTS idx_osrs_drop_sources_source
    ON osrs.drop_sources (source);

ALTER TABLE osrs.drop_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.drop_sources;
CREATE POLICY "service_role_full_access" ON osrs.drop_sources
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.recipes
-- Crafting/processing recipes that produce items.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.recipes (
    id        BIGSERIAL PRIMARY KEY,
    item_id   BIGINT NOT NULL REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    skill     TEXT,
    level     INTEGER,
    xp        REAL,
    facility  TEXT,
    ticks     INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.recipes IS 'Crafting/processing recipes. Many-to-one with osrs.items.';

CREATE INDEX IF NOT EXISTS idx_osrs_recipes_item
    ON osrs.recipes (item_id);
CREATE INDEX IF NOT EXISTS idx_osrs_recipes_skill
    ON osrs.recipes (skill);

ALTER TABLE osrs.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.recipes;
CREATE POLICY "service_role_full_access" ON osrs.recipes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.recipe_materials
-- Input materials for recipes.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.recipe_materials (
    id               BIGSERIAL PRIMARY KEY,
    recipe_id        BIGINT NOT NULL REFERENCES osrs.recipes(id) ON DELETE CASCADE,
    material_item_id INTEGER,
    item_name        TEXT NOT NULL,
    quantity         INTEGER NOT NULL DEFAULT 1,
    consumed         BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.recipe_materials IS 'Input materials for recipes. Many-to-one with osrs.recipes.';

CREATE INDEX IF NOT EXISTS idx_osrs_recipe_materials_recipe
    ON osrs.recipe_materials (recipe_id);

ALTER TABLE osrs.recipe_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.recipe_materials;
CREATE POLICY "service_role_full_access" ON osrs.recipe_materials
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.prices
-- Historical GE price snapshots.
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.prices (
    id          BIGSERIAL PRIMARY KEY,
    item_id     BIGINT NOT NULL REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    high_price  BIGINT,
    high_time   BIGINT,
    low_price   BIGINT,
    low_time    BIGINT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.prices IS 'Historical GE price snapshots. Many-to-one with osrs.items.';

CREATE INDEX IF NOT EXISTS idx_osrs_prices_item_time
    ON osrs.prices (item_id, captured_at DESC);

ALTER TABLE osrs.prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.prices;
CREATE POLICY "service_role_full_access" ON osrs.prices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: osrs.price_latest
-- Latest GE prices (one row per item, upserted).
-- ===========================================

CREATE TABLE IF NOT EXISTS osrs.price_latest (
    item_id    BIGINT PRIMARY KEY REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    high_price BIGINT,
    high_time  BIGINT,
    low_price  BIGINT,
    low_time   BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE osrs.price_latest IS 'Latest GE prices. 1:1 with osrs.items, upserted on each price fetch.';

ALTER TABLE osrs.price_latest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON osrs.price_latest;
CREATE POLICY "service_role_full_access" ON osrs.price_latest
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TRIGGER FUNCTIONS: updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION osrs.trg_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION osrs.trg_equipment_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION osrs.trg_bonuses_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION osrs.trg_requirements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION osrs.trg_drop_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION osrs.trg_recipes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION osrs.trg_price_latest_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Trigger function permissions
REVOKE ALL ON FUNCTION osrs.trg_items_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION osrs.trg_equipment_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION osrs.trg_bonuses_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION osrs.trg_requirements_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION osrs.trg_drop_sources_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION osrs.trg_recipes_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION osrs.trg_price_latest_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION osrs.trg_items_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION osrs.trg_equipment_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION osrs.trg_bonuses_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION osrs.trg_requirements_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION osrs.trg_drop_sources_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION osrs.trg_recipes_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION osrs.trg_price_latest_updated_at() TO service_role;

ALTER FUNCTION osrs.trg_items_updated_at() OWNER TO service_role;
ALTER FUNCTION osrs.trg_equipment_updated_at() OWNER TO service_role;
ALTER FUNCTION osrs.trg_bonuses_updated_at() OWNER TO service_role;
ALTER FUNCTION osrs.trg_requirements_updated_at() OWNER TO service_role;
ALTER FUNCTION osrs.trg_drop_sources_updated_at() OWNER TO service_role;
ALTER FUNCTION osrs.trg_recipes_updated_at() OWNER TO service_role;
ALTER FUNCTION osrs.trg_price_latest_updated_at() OWNER TO service_role;

-- ===========================================
-- TRIGGERS
-- ===========================================

DROP TRIGGER IF EXISTS trg_osrs_items_updated_at ON osrs.items;
CREATE TRIGGER trg_osrs_items_updated_at
    BEFORE UPDATE ON osrs.items
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_items_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_equipment_updated_at ON osrs.equipment;
CREATE TRIGGER trg_osrs_equipment_updated_at
    BEFORE UPDATE ON osrs.equipment
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_equipment_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_bonuses_updated_at ON osrs.bonuses;
CREATE TRIGGER trg_osrs_bonuses_updated_at
    BEFORE UPDATE ON osrs.bonuses
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_bonuses_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_requirements_updated_at ON osrs.requirements;
CREATE TRIGGER trg_osrs_requirements_updated_at
    BEFORE UPDATE ON osrs.requirements
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_requirements_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_drop_sources_updated_at ON osrs.drop_sources;
CREATE TRIGGER trg_osrs_drop_sources_updated_at
    BEFORE UPDATE ON osrs.drop_sources
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_drop_sources_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_recipes_updated_at ON osrs.recipes;
CREATE TRIGGER trg_osrs_recipes_updated_at
    BEFORE UPDATE ON osrs.recipes
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_recipes_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_price_latest_updated_at ON osrs.price_latest;
CREATE TRIGGER trg_osrs_price_latest_updated_at
    BEFORE UPDATE ON osrs.price_latest
    FOR EACH ROW EXECUTE FUNCTION osrs.trg_price_latest_updated_at();

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify schema exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'osrs'
    ) THEN
        RAISE EXCEPTION 'osrs schema creation failed';
    END IF;

    -- Verify all 9 tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'items') THEN
        RAISE EXCEPTION 'osrs.items table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'equipment') THEN
        RAISE EXCEPTION 'osrs.equipment table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'bonuses') THEN
        RAISE EXCEPTION 'osrs.bonuses table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'requirements') THEN
        RAISE EXCEPTION 'osrs.requirements table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'drop_sources') THEN
        RAISE EXCEPTION 'osrs.drop_sources table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'recipes') THEN
        RAISE EXCEPTION 'osrs.recipes table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'recipe_materials') THEN
        RAISE EXCEPTION 'osrs.recipe_materials table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'prices') THEN
        RAISE EXCEPTION 'osrs.prices table creation failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osrs' AND table_name = 'price_latest') THEN
        RAISE EXCEPTION 'osrs.price_latest table creation failed';
    END IF;

    -- Verify all 7 trigger functions exist
    PERFORM 'osrs.trg_items_updated_at()'::regprocedure;
    PERFORM 'osrs.trg_equipment_updated_at()'::regprocedure;
    PERFORM 'osrs.trg_bonuses_updated_at()'::regprocedure;
    PERFORM 'osrs.trg_requirements_updated_at()'::regprocedure;
    PERFORM 'osrs.trg_drop_sources_updated_at()'::regprocedure;
    PERFORM 'osrs.trg_recipes_updated_at()'::regprocedure;
    PERFORM 'osrs.trg_price_latest_updated_at()'::regprocedure;

    -- Verify anon has NO access
    IF has_schema_privilege('anon', 'osrs', 'USAGE') THEN
        RAISE EXCEPTION 'anon must NOT have USAGE on osrs schema';
    END IF;
    IF has_schema_privilege('authenticated', 'osrs', 'USAGE') THEN
        RAISE EXCEPTION 'authenticated must NOT have USAGE on osrs schema';
    END IF;

    -- Verify service_role has access
    IF NOT has_schema_privilege('service_role', 'osrs', 'USAGE') THEN
        RAISE EXCEPTION 'service_role must have USAGE on osrs schema';
    END IF;

    -- Verify trigger function ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'osrs.trg_items_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'osrs.trg_items_updated_at must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'osrs.trg_equipment_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'osrs.trg_equipment_updated_at must be owned by service_role';
    END IF;

    RAISE NOTICE 'osrs_core.sql: schema, 9 tables, 7 trigger functions verified successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
