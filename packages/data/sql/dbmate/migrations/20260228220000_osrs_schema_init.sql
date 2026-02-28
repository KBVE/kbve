-- migrate:up

-- ============================================================
-- OSRS SCHEMA — Initial migration
--
-- Creates the full osrs schema: items, equipment, bonuses,
-- requirements, drop_sources, recipes, recipe_materials,
-- prices, price_latest tables with all functions,
-- triggers, RLS policies, and permission grants.
--
-- Source of truth: packages/data/proto/kbve/osrs.proto
--                  apps/kbve/astro-kbve/src/data/schema/osrs/IOSRSSchema.ts
-- ============================================================

-- pg_trgm for fuzzy item name search
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

ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA osrs
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ========== TABLE: osrs.items ==========

CREATE TABLE IF NOT EXISTS osrs.items (
    item_id   BIGINT PRIMARY KEY,
    name      TEXT NOT NULL,
    slug      TEXT NOT NULL,
    examine   TEXT NOT NULL DEFAULT '',
    members   BOOLEAN NOT NULL DEFAULT false,
    icon      TEXT NOT NULL DEFAULT '',
    value     INTEGER NOT NULL DEFAULT 0,
    lowalch   INTEGER,
    highalch  INTEGER,
    ge_limit  INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_osrs_items_name_trgm ON osrs.items USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_osrs_items_slug ON osrs.items (slug);
CREATE INDEX IF NOT EXISTS idx_osrs_items_members ON osrs.items (members);

ALTER TABLE osrs.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.items;
CREATE POLICY "service_role_full_access" ON osrs.items FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON ALL TABLES IN SCHEMA osrs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA osrs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA osrs FROM PUBLIC, anon, authenticated;

-- ========== TABLE: osrs.equipment ==========

CREATE TABLE IF NOT EXISTS osrs.equipment (
    item_id       BIGINT PRIMARY KEY REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    slot          TEXT,
    weapon_type   TEXT,
    weight        REAL,
    attack_speed  INTEGER,
    attack_range  INTEGER,
    tradeable     BOOLEAN,
    degradable    BOOLEAN,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE osrs.equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.equipment;
CREATE POLICY "service_role_full_access" ON osrs.equipment FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.bonuses ==========

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

ALTER TABLE osrs.bonuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.bonuses;
CREATE POLICY "service_role_full_access" ON osrs.bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.requirements ==========

CREATE TABLE IF NOT EXISTS osrs.requirements (
    item_id       BIGINT PRIMARY KEY REFERENCES osrs.equipment(item_id) ON DELETE CASCADE,
    attack        INTEGER,
    strength      INTEGER,
    defence       INTEGER,
    ranged        INTEGER,
    prayer        INTEGER,
    magic         INTEGER,
    runecraft     INTEGER,
    hitpoints     INTEGER,
    crafting      INTEGER,
    mining        INTEGER,
    smithing      INTEGER,
    fishing       INTEGER,
    cooking       INTEGER,
    firemaking    INTEGER,
    woodcutting   INTEGER,
    agility       INTEGER,
    herblore      INTEGER,
    thieving      INTEGER,
    fletching     INTEGER,
    slayer        INTEGER,
    farming       INTEGER,
    construction  INTEGER,
    hunter        INTEGER,
    quest         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE osrs.requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.requirements;
CREATE POLICY "service_role_full_access" ON osrs.requirements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.drop_sources ==========

CREATE TABLE IF NOT EXISTS osrs.drop_sources (
    id            BIGSERIAL PRIMARY KEY,
    item_id       BIGINT NOT NULL REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    source        TEXT NOT NULL,
    combat_level  INTEGER,
    quantity      TEXT,
    rarity        TEXT,
    drop_rate     TEXT,
    members_only  BOOLEAN,
    wilderness    BOOLEAN,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osrs_drop_sources_item ON osrs.drop_sources (item_id);
CREATE INDEX IF NOT EXISTS idx_osrs_drop_sources_source ON osrs.drop_sources (source);

ALTER TABLE osrs.drop_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.drop_sources;
CREATE POLICY "service_role_full_access" ON osrs.drop_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.recipes ==========

CREATE TABLE IF NOT EXISTS osrs.recipes (
    id            BIGSERIAL PRIMARY KEY,
    item_id       BIGINT NOT NULL REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    skill         TEXT,
    level         INTEGER,
    xp            REAL,
    facility      TEXT,
    ticks         INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osrs_recipes_item ON osrs.recipes (item_id);
CREATE INDEX IF NOT EXISTS idx_osrs_recipes_skill ON osrs.recipes (skill);

ALTER TABLE osrs.recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.recipes;
CREATE POLICY "service_role_full_access" ON osrs.recipes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.recipe_materials ==========

CREATE TABLE IF NOT EXISTS osrs.recipe_materials (
    id            BIGSERIAL PRIMARY KEY,
    recipe_id     BIGINT NOT NULL REFERENCES osrs.recipes(id) ON DELETE CASCADE,
    material_item_id INTEGER,
    item_name     TEXT NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 1,
    consumed      BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osrs_recipe_materials_recipe ON osrs.recipe_materials (recipe_id);

ALTER TABLE osrs.recipe_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.recipe_materials;
CREATE POLICY "service_role_full_access" ON osrs.recipe_materials FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.prices ==========

CREATE TABLE IF NOT EXISTS osrs.prices (
    id            BIGSERIAL PRIMARY KEY,
    item_id       BIGINT NOT NULL REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    high_price    BIGINT,
    high_time     BIGINT,
    low_price     BIGINT,
    low_time      BIGINT,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osrs_prices_item_time ON osrs.prices (item_id, captured_at DESC);

ALTER TABLE osrs.prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.prices;
CREATE POLICY "service_role_full_access" ON osrs.prices FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: osrs.price_latest ==========

CREATE TABLE IF NOT EXISTS osrs.price_latest (
    item_id       BIGINT PRIMARY KEY REFERENCES osrs.items(item_id) ON DELETE CASCADE,
    high_price    BIGINT,
    high_time     BIGINT,
    low_price     BIGINT,
    low_time      BIGINT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE osrs.price_latest ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON osrs.price_latest;
CREATE POLICY "service_role_full_access" ON osrs.price_latest FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TRIGGERS: updated_at ==========

CREATE OR REPLACE FUNCTION osrs.trg_items_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION osrs.trg_equipment_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION osrs.trg_bonuses_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION osrs.trg_requirements_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION osrs.trg_drop_sources_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION osrs.trg_recipes_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION osrs.trg_price_latest_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_osrs_items_updated_at ON osrs.items;
CREATE TRIGGER trg_osrs_items_updated_at BEFORE UPDATE ON osrs.items FOR EACH ROW EXECUTE FUNCTION osrs.trg_items_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_equipment_updated_at ON osrs.equipment;
CREATE TRIGGER trg_osrs_equipment_updated_at BEFORE UPDATE ON osrs.equipment FOR EACH ROW EXECUTE FUNCTION osrs.trg_equipment_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_bonuses_updated_at ON osrs.bonuses;
CREATE TRIGGER trg_osrs_bonuses_updated_at BEFORE UPDATE ON osrs.bonuses FOR EACH ROW EXECUTE FUNCTION osrs.trg_bonuses_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_requirements_updated_at ON osrs.requirements;
CREATE TRIGGER trg_osrs_requirements_updated_at BEFORE UPDATE ON osrs.requirements FOR EACH ROW EXECUTE FUNCTION osrs.trg_requirements_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_drop_sources_updated_at ON osrs.drop_sources;
CREATE TRIGGER trg_osrs_drop_sources_updated_at BEFORE UPDATE ON osrs.drop_sources FOR EACH ROW EXECUTE FUNCTION osrs.trg_drop_sources_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_recipes_updated_at ON osrs.recipes;
CREATE TRIGGER trg_osrs_recipes_updated_at BEFORE UPDATE ON osrs.recipes FOR EACH ROW EXECUTE FUNCTION osrs.trg_recipes_updated_at();

DROP TRIGGER IF EXISTS trg_osrs_price_latest_updated_at ON osrs.price_latest;
CREATE TRIGGER trg_osrs_price_latest_updated_at BEFORE UPDATE ON osrs.price_latest FOR EACH ROW EXECUTE FUNCTION osrs.trg_price_latest_updated_at();

-- ========== SERVICE FUNCTIONS ==========

-- Upsert a full item with all nested data (equipment, bonuses, requirements, drops, recipes)
CREATE OR REPLACE FUNCTION osrs.service_upsert_item(p_data JSONB) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_item_id BIGINT; v_equip JSONB; v_bonuses JSONB; v_reqs JSONB; v_drops JSONB; v_recipes JSONB; v_recipe JSONB; v_recipe_id BIGINT; v_mats JSONB;
BEGIN
    v_item_id := (p_data->>'id')::BIGINT;
    IF v_item_id IS NULL THEN RAISE EXCEPTION 'id is required in item data' USING ERRCODE = '22023'; END IF;

    -- Upsert core item
    INSERT INTO osrs.items (item_id, name, slug, examine, members, icon, value, lowalch, highalch, ge_limit)
    VALUES (v_item_id, COALESCE(p_data->>'name', ''), COALESCE(p_data->>'slug', ''), COALESCE(p_data->>'examine', ''), COALESCE((p_data->>'members')::BOOLEAN, false), COALESCE(p_data->>'icon', ''), COALESCE((p_data->>'value')::INTEGER, 0), (p_data->>'lowalch')::INTEGER, (p_data->>'highalch')::INTEGER, (p_data->>'ge_limit')::INTEGER)
    ON CONFLICT (item_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, examine = EXCLUDED.examine, members = EXCLUDED.members, icon = EXCLUDED.icon, value = EXCLUDED.value, lowalch = EXCLUDED.lowalch, highalch = EXCLUDED.highalch, ge_limit = EXCLUDED.ge_limit;

    -- Equipment
    v_equip := p_data->'equipment';
    IF v_equip IS NOT NULL AND jsonb_typeof(v_equip) = 'object' THEN
        INSERT INTO osrs.equipment (item_id, slot, weapon_type, weight, attack_speed, attack_range, tradeable, degradable)
        VALUES (v_item_id, v_equip->>'slot', v_equip->>'weapon_type', (v_equip->>'weight')::REAL, (v_equip->>'attack_speed')::INTEGER, (v_equip->>'attack_range')::INTEGER, (v_equip->>'tradeable')::BOOLEAN, (v_equip->>'degradable')::BOOLEAN)
        ON CONFLICT (item_id) DO UPDATE SET slot = EXCLUDED.slot, weapon_type = EXCLUDED.weapon_type, weight = EXCLUDED.weight, attack_speed = EXCLUDED.attack_speed, attack_range = EXCLUDED.attack_range, tradeable = EXCLUDED.tradeable, degradable = EXCLUDED.degradable;

        -- Bonuses
        v_bonuses := v_equip->'bonuses';
        IF v_bonuses IS NOT NULL AND jsonb_typeof(v_bonuses) = 'object' THEN
            INSERT INTO osrs.bonuses (item_id, attack_stab, attack_slash, attack_crush, attack_magic, attack_ranged, defence_stab, defence_slash, defence_crush, defence_magic, defence_ranged, melee_strength, ranged_strength, magic_damage, prayer)
            VALUES (v_item_id, COALESCE((v_bonuses->>'attack_stab')::INTEGER, 0), COALESCE((v_bonuses->>'attack_slash')::INTEGER, 0), COALESCE((v_bonuses->>'attack_crush')::INTEGER, 0), COALESCE((v_bonuses->>'attack_magic')::INTEGER, 0), COALESCE((v_bonuses->>'attack_ranged')::INTEGER, 0), COALESCE((v_bonuses->>'defence_stab')::INTEGER, 0), COALESCE((v_bonuses->>'defence_slash')::INTEGER, 0), COALESCE((v_bonuses->>'defence_crush')::INTEGER, 0), COALESCE((v_bonuses->>'defence_magic')::INTEGER, 0), COALESCE((v_bonuses->>'defence_ranged')::INTEGER, 0), COALESCE((v_bonuses->>'melee_strength')::INTEGER, 0), COALESCE((v_bonuses->>'ranged_strength')::INTEGER, 0), COALESCE((v_bonuses->>'magic_damage')::INTEGER, 0), COALESCE((v_bonuses->>'prayer')::INTEGER, 0))
            ON CONFLICT (item_id) DO UPDATE SET attack_stab = EXCLUDED.attack_stab, attack_slash = EXCLUDED.attack_slash, attack_crush = EXCLUDED.attack_crush, attack_magic = EXCLUDED.attack_magic, attack_ranged = EXCLUDED.attack_ranged, defence_stab = EXCLUDED.defence_stab, defence_slash = EXCLUDED.defence_slash, defence_crush = EXCLUDED.defence_crush, defence_magic = EXCLUDED.defence_magic, defence_ranged = EXCLUDED.defence_ranged, melee_strength = EXCLUDED.melee_strength, ranged_strength = EXCLUDED.ranged_strength, magic_damage = EXCLUDED.magic_damage, prayer = EXCLUDED.prayer;
        END IF;

        -- Requirements
        v_reqs := v_equip->'requirements';
        IF v_reqs IS NOT NULL AND jsonb_typeof(v_reqs) = 'object' THEN
            INSERT INTO osrs.requirements (item_id, attack, strength, defence, ranged, prayer, magic, runecraft, hitpoints, crafting, mining, smithing, fishing, cooking, firemaking, woodcutting, agility, herblore, thieving, fletching, slayer, farming, construction, hunter, quest)
            VALUES (v_item_id, (v_reqs->>'attack')::INTEGER, (v_reqs->>'strength')::INTEGER, (v_reqs->>'defence')::INTEGER, (v_reqs->>'ranged')::INTEGER, (v_reqs->>'prayer')::INTEGER, (v_reqs->>'magic')::INTEGER, (v_reqs->>'runecraft')::INTEGER, (v_reqs->>'hitpoints')::INTEGER, (v_reqs->>'crafting')::INTEGER, (v_reqs->>'mining')::INTEGER, (v_reqs->>'smithing')::INTEGER, (v_reqs->>'fishing')::INTEGER, (v_reqs->>'cooking')::INTEGER, (v_reqs->>'firemaking')::INTEGER, (v_reqs->>'woodcutting')::INTEGER, (v_reqs->>'agility')::INTEGER, (v_reqs->>'herblore')::INTEGER, (v_reqs->>'thieving')::INTEGER, (v_reqs->>'fletching')::INTEGER, (v_reqs->>'slayer')::INTEGER, (v_reqs->>'farming')::INTEGER, (v_reqs->>'construction')::INTEGER, (v_reqs->>'hunter')::INTEGER, v_reqs->>'quest')
            ON CONFLICT (item_id) DO UPDATE SET attack = EXCLUDED.attack, strength = EXCLUDED.strength, defence = EXCLUDED.defence, ranged = EXCLUDED.ranged, prayer = EXCLUDED.prayer, magic = EXCLUDED.magic, runecraft = EXCLUDED.runecraft, hitpoints = EXCLUDED.hitpoints, crafting = EXCLUDED.crafting, mining = EXCLUDED.mining, smithing = EXCLUDED.smithing, fishing = EXCLUDED.fishing, cooking = EXCLUDED.cooking, firemaking = EXCLUDED.firemaking, woodcutting = EXCLUDED.woodcutting, agility = EXCLUDED.agility, herblore = EXCLUDED.herblore, thieving = EXCLUDED.thieving, fletching = EXCLUDED.fletching, slayer = EXCLUDED.slayer, farming = EXCLUDED.farming, construction = EXCLUDED.construction, hunter = EXCLUDED.hunter, quest = EXCLUDED.quest;
        END IF;
    END IF;

    -- Drop sources (replace all)
    v_drops := p_data->'drop_sources';
    IF v_drops IS NOT NULL AND jsonb_typeof(v_drops) = 'array' AND jsonb_array_length(v_drops) > 0 THEN
        DELETE FROM osrs.drop_sources WHERE item_id = v_item_id;
        INSERT INTO osrs.drop_sources (item_id, source, combat_level, quantity, rarity, drop_rate, members_only, wilderness)
        SELECT v_item_id, d->>'source', (d->>'combat_level')::INTEGER, d->>'quantity', d->>'rarity', d->>'drop_rate', (d->>'members_only')::BOOLEAN, (d->>'wilderness')::BOOLEAN
        FROM jsonb_array_elements(v_drops) AS d;
    END IF;

    -- Recipes (replace all)
    v_recipes := p_data->'recipes';
    IF v_recipes IS NOT NULL AND jsonb_typeof(v_recipes) = 'array' AND jsonb_array_length(v_recipes) > 0 THEN
        DELETE FROM osrs.recipes WHERE item_id = v_item_id;
        FOR v_recipe IN SELECT * FROM jsonb_array_elements(v_recipes)
        LOOP
            INSERT INTO osrs.recipes (item_id, skill, level, xp, facility, ticks)
            VALUES (v_item_id, v_recipe->>'skill', (v_recipe->>'level')::INTEGER, (v_recipe->>'xp')::REAL, v_recipe->>'facility', (v_recipe->>'ticks')::INTEGER)
            RETURNING id INTO v_recipe_id;

            v_mats := v_recipe->'materials';
            IF v_mats IS NOT NULL AND jsonb_typeof(v_mats) = 'array' AND jsonb_array_length(v_mats) > 0 THEN
                INSERT INTO osrs.recipe_materials (recipe_id, material_item_id, item_name, quantity, consumed)
                SELECT v_recipe_id, (m->>'item_id')::INTEGER, COALESCE(m->>'item_name', ''), COALESCE((m->>'quantity')::INTEGER, 1), COALESCE((m->>'consumed')::BOOLEAN, true)
                FROM jsonb_array_elements(v_mats) AS m;
            END IF;
        END LOOP;
    END IF;

    RETURN v_item_id;
END; $$;

-- Bulk upsert GE prices (historical + latest)
CREATE OR REPLACE FUNCTION osrs.service_save_prices(p_prices JSONB) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count INTEGER;
BEGIN
    IF p_prices IS NULL OR jsonb_typeof(p_prices) <> 'array' THEN RAISE EXCEPTION 'p_prices must be a JSONB array' USING ERRCODE = '22023'; END IF;
    IF jsonb_array_length(p_prices) = 0 THEN RETURN 0; END IF;
    IF jsonb_array_length(p_prices) > 5000 THEN RAISE EXCEPTION 'Batch size exceeds limit of 5000 prices' USING ERRCODE = '22023'; END IF;

    -- Insert into historical prices
    INSERT INTO osrs.prices (item_id, high_price, high_time, low_price, low_time)
    SELECT (p->>'item_id')::BIGINT, (p->>'high_price')::BIGINT, (p->>'high_time')::BIGINT, (p->>'low_price')::BIGINT, (p->>'low_time')::BIGINT
    FROM jsonb_array_elements(p_prices) AS p
    WHERE (p->>'item_id')::BIGINT IS NOT NULL;

    -- Upsert latest prices
    INSERT INTO osrs.price_latest (item_id, high_price, high_time, low_price, low_time)
    SELECT (p->>'item_id')::BIGINT, (p->>'high_price')::BIGINT, (p->>'high_time')::BIGINT, (p->>'low_price')::BIGINT, (p->>'low_time')::BIGINT
    FROM jsonb_array_elements(p_prices) AS p
    WHERE (p->>'item_id')::BIGINT IS NOT NULL
    ON CONFLICT (item_id) DO UPDATE SET high_price = EXCLUDED.high_price, high_time = EXCLUDED.high_time, low_price = EXCLUDED.low_price, low_time = EXCLUDED.low_time;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

-- Get a full item with all nested data as JSONB
CREATE OR REPLACE FUNCTION osrs.service_get_item(p_item_id BIGINT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result JSONB; v_equip JSONB; v_bonuses JSONB; v_reqs JSONB; v_drops JSONB; v_recipes JSONB; v_price JSONB;
BEGIN
    -- Core item
    SELECT jsonb_build_object('id', i.item_id, 'name', i.name, 'slug', i.slug, 'examine', i.examine, 'members', i.members, 'icon', i.icon, 'value', i.value, 'lowalch', i.lowalch, 'highalch', i.highalch, 'ge_limit', i.ge_limit)
    INTO v_result FROM osrs.items i WHERE i.item_id = p_item_id;

    IF v_result IS NULL THEN RETURN NULL; END IF;

    -- Equipment
    SELECT jsonb_build_object('slot', e.slot, 'weapon_type', e.weapon_type, 'weight', e.weight, 'attack_speed', e.attack_speed, 'attack_range', e.attack_range, 'tradeable', e.tradeable, 'degradable', e.degradable)
    INTO v_equip FROM osrs.equipment e WHERE e.item_id = p_item_id;

    IF v_equip IS NOT NULL THEN
        -- Bonuses
        SELECT jsonb_build_object('attack_stab', b.attack_stab, 'attack_slash', b.attack_slash, 'attack_crush', b.attack_crush, 'attack_magic', b.attack_magic, 'attack_ranged', b.attack_ranged, 'defence_stab', b.defence_stab, 'defence_slash', b.defence_slash, 'defence_crush', b.defence_crush, 'defence_magic', b.defence_magic, 'defence_ranged', b.defence_ranged, 'melee_strength', b.melee_strength, 'ranged_strength', b.ranged_strength, 'magic_damage', b.magic_damage, 'prayer', b.prayer)
        INTO v_bonuses FROM osrs.bonuses b WHERE b.item_id = p_item_id;
        IF v_bonuses IS NOT NULL THEN v_equip := v_equip || jsonb_build_object('bonuses', v_bonuses); END IF;

        -- Requirements
        SELECT jsonb_strip_nulls(jsonb_build_object('attack', r.attack, 'strength', r.strength, 'defence', r.defence, 'ranged', r.ranged, 'prayer', r.prayer, 'magic', r.magic, 'runecraft', r.runecraft, 'hitpoints', r.hitpoints, 'crafting', r.crafting, 'mining', r.mining, 'smithing', r.smithing, 'fishing', r.fishing, 'cooking', r.cooking, 'firemaking', r.firemaking, 'woodcutting', r.woodcutting, 'agility', r.agility, 'herblore', r.herblore, 'thieving', r.thieving, 'fletching', r.fletching, 'slayer', r.slayer, 'farming', r.farming, 'construction', r.construction, 'hunter', r.hunter, 'quest', r.quest))
        INTO v_reqs FROM osrs.requirements r WHERE r.item_id = p_item_id;
        IF v_reqs IS NOT NULL THEN v_equip := v_equip || jsonb_build_object('requirements', v_reqs); END IF;

        v_result := v_result || jsonb_build_object('equipment', v_equip);
    END IF;

    -- Drop sources
    SELECT jsonb_agg(jsonb_build_object('source', d.source, 'combat_level', d.combat_level, 'quantity', d.quantity, 'rarity', d.rarity, 'drop_rate', d.drop_rate, 'members_only', d.members_only, 'wilderness', d.wilderness))
    INTO v_drops FROM osrs.drop_sources d WHERE d.item_id = p_item_id;
    IF v_drops IS NOT NULL THEN v_result := v_result || jsonb_build_object('drop_sources', v_drops); END IF;

    -- Recipes with materials
    SELECT jsonb_agg(jsonb_build_object('skill', rec.skill, 'level', rec.level, 'xp', rec.xp, 'facility', rec.facility, 'ticks', rec.ticks, 'materials', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', rm.material_item_id, 'item_name', rm.item_name, 'quantity', rm.quantity, 'consumed', rm.consumed)) FROM osrs.recipe_materials rm WHERE rm.recipe_id = rec.id), '[]'::JSONB)))
    INTO v_recipes FROM osrs.recipes rec WHERE rec.item_id = p_item_id;
    IF v_recipes IS NOT NULL THEN v_result := v_result || jsonb_build_object('recipes', v_recipes); END IF;

    -- Latest price
    SELECT jsonb_build_object('high_price', pl.high_price, 'high_time', pl.high_time, 'low_price', pl.low_price, 'low_time', pl.low_time)
    INTO v_price FROM osrs.price_latest pl WHERE pl.item_id = p_item_id;
    IF v_price IS NOT NULL THEN v_result := v_result || jsonb_build_object('price', v_price); END IF;

    RETURN v_result;
END; $$;

-- Search items by name using trigram similarity
CREATE OR REPLACE FUNCTION osrs.service_search_items(p_query TEXT, p_limit INTEGER DEFAULT 20) RETURNS TABLE (item_id BIGINT, name TEXT, slug TEXT, members BOOLEAN, icon TEXT, similarity REAL) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_limit INTEGER;
BEGIN
    IF p_query IS NULL OR p_query = '' THEN RAISE EXCEPTION 'search query cannot be empty' USING ERRCODE = '22023'; END IF;
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    RETURN QUERY SELECT i.item_id, i.name, i.slug, i.members, i.icon, similarity(i.name, p_query) AS sim FROM osrs.items i WHERE i.name % p_query ORDER BY sim DESC, i.name LIMIT v_limit;
END; $$;

-- ========== PERMISSION GRANTS ==========

-- Trigger functions
DO $$ BEGIN
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
END $$;

-- Service functions (service_role only)
DO $$ BEGIN
    REVOKE ALL ON FUNCTION osrs.service_upsert_item(JSONB) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION osrs.service_save_prices(JSONB) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION osrs.service_get_item(BIGINT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION osrs.service_search_items(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION osrs.service_upsert_item(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION osrs.service_save_prices(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION osrs.service_get_item(BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION osrs.service_search_items(TEXT, INTEGER) TO service_role;
END $$;

-- Ownership (all functions owned by service_role)
DO $$ BEGIN
    ALTER FUNCTION osrs.trg_items_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.trg_equipment_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.trg_bonuses_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.trg_requirements_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.trg_drop_sources_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.trg_recipes_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.trg_price_latest_updated_at() OWNER TO service_role;
    ALTER FUNCTION osrs.service_upsert_item(JSONB) OWNER TO service_role;
    ALTER FUNCTION osrs.service_save_prices(JSONB) OWNER TO service_role;
    ALTER FUNCTION osrs.service_get_item(BIGINT) OWNER TO service_role;
    ALTER FUNCTION osrs.service_search_items(TEXT, INTEGER) OWNER TO service_role;
END $$;

-- migrate:down

-- Drop all tables (CASCADE removes dependent functions, triggers, policies, indexes)
DROP TABLE IF EXISTS osrs.recipe_materials CASCADE;
DROP TABLE IF EXISTS osrs.recipes CASCADE;
DROP TABLE IF EXISTS osrs.drop_sources CASCADE;
DROP TABLE IF EXISTS osrs.price_latest CASCADE;
DROP TABLE IF EXISTS osrs.prices CASCADE;
DROP TABLE IF EXISTS osrs.requirements CASCADE;
DROP TABLE IF EXISTS osrs.bonuses CASCADE;
DROP TABLE IF EXISTS osrs.equipment CASCADE;
DROP TABLE IF EXISTS osrs.items CASCADE;

-- Drop remaining standalone functions
DROP FUNCTION IF EXISTS osrs.service_upsert_item(JSONB);
DROP FUNCTION IF EXISTS osrs.service_save_prices(JSONB);
DROP FUNCTION IF EXISTS osrs.service_get_item(BIGINT);
DROP FUNCTION IF EXISTS osrs.service_search_items(TEXT, INTEGER);

DROP SCHEMA IF EXISTS osrs CASCADE;
