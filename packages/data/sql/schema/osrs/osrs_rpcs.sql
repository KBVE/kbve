-- ============================================================
-- OSRS RPC FUNCTIONS
-- Service-role-only RPC functions for OSRS item data operations.
-- Called by Deno edge functions or axum services via service_role.
--
-- Functions:
--   service_upsert_item(JSONB)         — Upsert item with all nested data
--   service_save_prices(JSONB)         — Bulk upsert GE prices
--   service_get_item(BIGINT)           — Get full item as JSONB
--   service_search_items(TEXT, INTEGER) — Fuzzy search by name (pg_trgm)
--
-- Security:
--   - All functions: SECURITY DEFINER, search_path='', service_role only
--   - anon/authenticated have NO execute permissions
--
-- Depends on: osrs_core.sql (all 9 tables)
-- ============================================================

BEGIN;

-- ===========================================
-- RPC: service_upsert_item
-- Upsert a full item with all nested data
-- (equipment, bonuses, requirements, drops, recipes)
-- ===========================================

CREATE OR REPLACE FUNCTION osrs.service_upsert_item(p_data JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item_id  BIGINT;
    v_equip    JSONB;
    v_bonuses  JSONB;
    v_reqs     JSONB;
    v_drops    JSONB;
    v_recipes  JSONB;
    v_recipe   JSONB;
    v_recipe_id BIGINT;
    v_mats     JSONB;
BEGIN
    v_item_id := (p_data->>'id')::BIGINT;
    IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'id is required in item data' USING ERRCODE = '22023';
    END IF;

    -- Upsert core item
    INSERT INTO osrs.items (
        item_id, name, slug, examine, members, icon, value, lowalch, highalch, ge_limit
    )
    VALUES (
        v_item_id,
        COALESCE(p_data->>'name', ''),
        COALESCE(p_data->>'slug', ''),
        COALESCE(p_data->>'examine', ''),
        COALESCE((p_data->>'members')::BOOLEAN, false),
        COALESCE(p_data->>'icon', ''),
        COALESCE((p_data->>'value')::INTEGER, 0),
        (p_data->>'lowalch')::INTEGER,
        (p_data->>'highalch')::INTEGER,
        (p_data->>'ge_limit')::INTEGER
    )
    ON CONFLICT (item_id) DO UPDATE SET
        name     = EXCLUDED.name,
        slug     = EXCLUDED.slug,
        examine  = EXCLUDED.examine,
        members  = EXCLUDED.members,
        icon     = EXCLUDED.icon,
        value    = EXCLUDED.value,
        lowalch  = EXCLUDED.lowalch,
        highalch = EXCLUDED.highalch,
        ge_limit = EXCLUDED.ge_limit;

    -- Equipment
    v_equip := p_data->'equipment';
    IF v_equip IS NOT NULL AND jsonb_typeof(v_equip) = 'object' THEN
        INSERT INTO osrs.equipment (
            item_id, slot, weapon_type, weight, attack_speed, attack_range, tradeable, degradable
        )
        VALUES (
            v_item_id,
            v_equip->>'slot',
            v_equip->>'weapon_type',
            (v_equip->>'weight')::REAL,
            (v_equip->>'attack_speed')::INTEGER,
            (v_equip->>'attack_range')::INTEGER,
            (v_equip->>'tradeable')::BOOLEAN,
            (v_equip->>'degradable')::BOOLEAN
        )
        ON CONFLICT (item_id) DO UPDATE SET
            slot         = EXCLUDED.slot,
            weapon_type  = EXCLUDED.weapon_type,
            weight       = EXCLUDED.weight,
            attack_speed = EXCLUDED.attack_speed,
            attack_range = EXCLUDED.attack_range,
            tradeable    = EXCLUDED.tradeable,
            degradable   = EXCLUDED.degradable;

        -- Bonuses (nested under equipment)
        v_bonuses := v_equip->'bonuses';
        IF v_bonuses IS NOT NULL AND jsonb_typeof(v_bonuses) = 'object' THEN
            INSERT INTO osrs.bonuses (
                item_id,
                attack_stab, attack_slash, attack_crush, attack_magic, attack_ranged,
                defence_stab, defence_slash, defence_crush, defence_magic, defence_ranged,
                melee_strength, ranged_strength, magic_damage, prayer
            )
            VALUES (
                v_item_id,
                COALESCE((v_bonuses->>'attack_stab')::INTEGER, 0),
                COALESCE((v_bonuses->>'attack_slash')::INTEGER, 0),
                COALESCE((v_bonuses->>'attack_crush')::INTEGER, 0),
                COALESCE((v_bonuses->>'attack_magic')::INTEGER, 0),
                COALESCE((v_bonuses->>'attack_ranged')::INTEGER, 0),
                COALESCE((v_bonuses->>'defence_stab')::INTEGER, 0),
                COALESCE((v_bonuses->>'defence_slash')::INTEGER, 0),
                COALESCE((v_bonuses->>'defence_crush')::INTEGER, 0),
                COALESCE((v_bonuses->>'defence_magic')::INTEGER, 0),
                COALESCE((v_bonuses->>'defence_ranged')::INTEGER, 0),
                COALESCE((v_bonuses->>'melee_strength')::INTEGER, 0),
                COALESCE((v_bonuses->>'ranged_strength')::INTEGER, 0),
                COALESCE((v_bonuses->>'magic_damage')::INTEGER, 0),
                COALESCE((v_bonuses->>'prayer')::INTEGER, 0)
            )
            ON CONFLICT (item_id) DO UPDATE SET
                attack_stab     = EXCLUDED.attack_stab,
                attack_slash    = EXCLUDED.attack_slash,
                attack_crush    = EXCLUDED.attack_crush,
                attack_magic    = EXCLUDED.attack_magic,
                attack_ranged   = EXCLUDED.attack_ranged,
                defence_stab    = EXCLUDED.defence_stab,
                defence_slash   = EXCLUDED.defence_slash,
                defence_crush   = EXCLUDED.defence_crush,
                defence_magic   = EXCLUDED.defence_magic,
                defence_ranged  = EXCLUDED.defence_ranged,
                melee_strength  = EXCLUDED.melee_strength,
                ranged_strength = EXCLUDED.ranged_strength,
                magic_damage    = EXCLUDED.magic_damage,
                prayer          = EXCLUDED.prayer;
        END IF;

        -- Requirements (nested under equipment)
        v_reqs := v_equip->'requirements';
        IF v_reqs IS NOT NULL AND jsonb_typeof(v_reqs) = 'object' THEN
            INSERT INTO osrs.requirements (
                item_id,
                attack, strength, defence, ranged, prayer, magic,
                runecraft, hitpoints, crafting, mining, smithing,
                fishing, cooking, firemaking, woodcutting,
                agility, herblore, thieving, fletching,
                slayer, farming, construction, hunter, quest
            )
            VALUES (
                v_item_id,
                (v_reqs->>'attack')::INTEGER,
                (v_reqs->>'strength')::INTEGER,
                (v_reqs->>'defence')::INTEGER,
                (v_reqs->>'ranged')::INTEGER,
                (v_reqs->>'prayer')::INTEGER,
                (v_reqs->>'magic')::INTEGER,
                (v_reqs->>'runecraft')::INTEGER,
                (v_reqs->>'hitpoints')::INTEGER,
                (v_reqs->>'crafting')::INTEGER,
                (v_reqs->>'mining')::INTEGER,
                (v_reqs->>'smithing')::INTEGER,
                (v_reqs->>'fishing')::INTEGER,
                (v_reqs->>'cooking')::INTEGER,
                (v_reqs->>'firemaking')::INTEGER,
                (v_reqs->>'woodcutting')::INTEGER,
                (v_reqs->>'agility')::INTEGER,
                (v_reqs->>'herblore')::INTEGER,
                (v_reqs->>'thieving')::INTEGER,
                (v_reqs->>'fletching')::INTEGER,
                (v_reqs->>'slayer')::INTEGER,
                (v_reqs->>'farming')::INTEGER,
                (v_reqs->>'construction')::INTEGER,
                (v_reqs->>'hunter')::INTEGER,
                v_reqs->>'quest'
            )
            ON CONFLICT (item_id) DO UPDATE SET
                attack       = EXCLUDED.attack,
                strength     = EXCLUDED.strength,
                defence      = EXCLUDED.defence,
                ranged       = EXCLUDED.ranged,
                prayer       = EXCLUDED.prayer,
                magic        = EXCLUDED.magic,
                runecraft    = EXCLUDED.runecraft,
                hitpoints    = EXCLUDED.hitpoints,
                crafting     = EXCLUDED.crafting,
                mining       = EXCLUDED.mining,
                smithing     = EXCLUDED.smithing,
                fishing      = EXCLUDED.fishing,
                cooking      = EXCLUDED.cooking,
                firemaking   = EXCLUDED.firemaking,
                woodcutting  = EXCLUDED.woodcutting,
                agility      = EXCLUDED.agility,
                herblore     = EXCLUDED.herblore,
                thieving     = EXCLUDED.thieving,
                fletching    = EXCLUDED.fletching,
                slayer       = EXCLUDED.slayer,
                farming      = EXCLUDED.farming,
                construction = EXCLUDED.construction,
                hunter       = EXCLUDED.hunter,
                quest        = EXCLUDED.quest;
        END IF;
    END IF;

    -- Drop sources (replace all for this item)
    v_drops := p_data->'drop_sources';
    IF v_drops IS NOT NULL AND jsonb_typeof(v_drops) = 'array' AND jsonb_array_length(v_drops) > 0 THEN
        DELETE FROM osrs.drop_sources WHERE item_id = v_item_id;
        INSERT INTO osrs.drop_sources (
            item_id, source, combat_level, quantity, rarity, drop_rate, members_only, wilderness
        )
        SELECT
            v_item_id,
            d->>'source',
            (d->>'combat_level')::INTEGER,
            d->>'quantity',
            d->>'rarity',
            d->>'drop_rate',
            (d->>'members_only')::BOOLEAN,
            (d->>'wilderness')::BOOLEAN
        FROM jsonb_array_elements(v_drops) AS d;
    END IF;

    -- Recipes (replace all for this item)
    v_recipes := p_data->'recipes';
    IF v_recipes IS NOT NULL AND jsonb_typeof(v_recipes) = 'array' AND jsonb_array_length(v_recipes) > 0 THEN
        DELETE FROM osrs.recipes WHERE item_id = v_item_id;
        FOR v_recipe IN SELECT * FROM jsonb_array_elements(v_recipes)
        LOOP
            INSERT INTO osrs.recipes (item_id, skill, level, xp, facility, ticks)
            VALUES (
                v_item_id,
                v_recipe->>'skill',
                (v_recipe->>'level')::INTEGER,
                (v_recipe->>'xp')::REAL,
                v_recipe->>'facility',
                (v_recipe->>'ticks')::INTEGER
            )
            RETURNING id INTO v_recipe_id;

            v_mats := v_recipe->'materials';
            IF v_mats IS NOT NULL AND jsonb_typeof(v_mats) = 'array' AND jsonb_array_length(v_mats) > 0 THEN
                INSERT INTO osrs.recipe_materials (
                    recipe_id, material_item_id, item_name, quantity, consumed
                )
                SELECT
                    v_recipe_id,
                    (m->>'item_id')::INTEGER,
                    COALESCE(m->>'item_name', ''),
                    COALESCE((m->>'quantity')::INTEGER, 1),
                    COALESCE((m->>'consumed')::BOOLEAN, true)
                FROM jsonb_array_elements(v_mats) AS m;
            END IF;
        END LOOP;
    END IF;

    RETURN v_item_id;
END;
$$;

COMMENT ON FUNCTION osrs.service_upsert_item IS
    'Upsert a full item with equipment, bonuses, requirements, drop sources, and recipes from JSONB.';

REVOKE ALL ON FUNCTION osrs.service_upsert_item(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION osrs.service_upsert_item(JSONB) TO service_role;
ALTER FUNCTION osrs.service_upsert_item(JSONB) OWNER TO service_role;

-- ===========================================
-- RPC: service_save_prices
-- Bulk upsert GE prices (historical + latest)
-- ===========================================

CREATE OR REPLACE FUNCTION osrs.service_save_prices(p_prices JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_prices IS NULL OR jsonb_typeof(p_prices) <> 'array' THEN
        RAISE EXCEPTION 'p_prices must be a JSONB array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_prices) = 0 THEN
        RETURN 0;
    END IF;
    IF jsonb_array_length(p_prices) > 5000 THEN
        RAISE EXCEPTION 'Batch size exceeds limit of 5000 prices' USING ERRCODE = '22023';
    END IF;

    -- Insert into historical prices
    INSERT INTO osrs.prices (item_id, high_price, high_time, low_price, low_time)
    SELECT
        (p->>'item_id')::BIGINT,
        (p->>'high_price')::BIGINT,
        (p->>'high_time')::BIGINT,
        (p->>'low_price')::BIGINT,
        (p->>'low_time')::BIGINT
    FROM jsonb_array_elements(p_prices) AS p
    WHERE (p->>'item_id')::BIGINT IS NOT NULL;

    -- Upsert latest prices
    INSERT INTO osrs.price_latest (item_id, high_price, high_time, low_price, low_time)
    SELECT
        (p->>'item_id')::BIGINT,
        (p->>'high_price')::BIGINT,
        (p->>'high_time')::BIGINT,
        (p->>'low_price')::BIGINT,
        (p->>'low_time')::BIGINT
    FROM jsonb_array_elements(p_prices) AS p
    WHERE (p->>'item_id')::BIGINT IS NOT NULL
    ON CONFLICT (item_id) DO UPDATE SET
        high_price = EXCLUDED.high_price,
        high_time  = EXCLUDED.high_time,
        low_price  = EXCLUDED.low_price,
        low_time   = EXCLUDED.low_time;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION osrs.service_save_prices IS
    'Bulk upsert GE prices into historical + latest tables. Max 5000 per batch.';

REVOKE ALL ON FUNCTION osrs.service_save_prices(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION osrs.service_save_prices(JSONB) TO service_role;
ALTER FUNCTION osrs.service_save_prices(JSONB) OWNER TO service_role;

-- ===========================================
-- RPC: service_get_item
-- Get a full item with all nested data as JSONB
-- ===========================================

CREATE OR REPLACE FUNCTION osrs.service_get_item(p_item_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result  JSONB;
    v_equip   JSONB;
    v_bonuses JSONB;
    v_reqs    JSONB;
    v_drops   JSONB;
    v_recipes JSONB;
    v_price   JSONB;
BEGIN
    -- Core item
    SELECT jsonb_build_object(
        'id', i.item_id, 'name', i.name, 'slug', i.slug,
        'examine', i.examine, 'members', i.members, 'icon', i.icon,
        'value', i.value, 'lowalch', i.lowalch, 'highalch', i.highalch,
        'ge_limit', i.ge_limit
    )
    INTO v_result
    FROM osrs.items i
    WHERE i.item_id = p_item_id;

    IF v_result IS NULL THEN RETURN NULL; END IF;

    -- Equipment
    SELECT jsonb_build_object(
        'slot', e.slot, 'weapon_type', e.weapon_type, 'weight', e.weight,
        'attack_speed', e.attack_speed, 'attack_range', e.attack_range,
        'tradeable', e.tradeable, 'degradable', e.degradable
    )
    INTO v_equip
    FROM osrs.equipment e
    WHERE e.item_id = p_item_id;

    IF v_equip IS NOT NULL THEN
        -- Bonuses
        SELECT jsonb_build_object(
            'attack_stab', b.attack_stab, 'attack_slash', b.attack_slash,
            'attack_crush', b.attack_crush, 'attack_magic', b.attack_magic,
            'attack_ranged', b.attack_ranged, 'defence_stab', b.defence_stab,
            'defence_slash', b.defence_slash, 'defence_crush', b.defence_crush,
            'defence_magic', b.defence_magic, 'defence_ranged', b.defence_ranged,
            'melee_strength', b.melee_strength, 'ranged_strength', b.ranged_strength,
            'magic_damage', b.magic_damage, 'prayer', b.prayer
        )
        INTO v_bonuses
        FROM osrs.bonuses b
        WHERE b.item_id = p_item_id;

        IF v_bonuses IS NOT NULL THEN
            v_equip := v_equip || jsonb_build_object('bonuses', v_bonuses);
        END IF;

        -- Requirements
        SELECT jsonb_strip_nulls(jsonb_build_object(
            'attack', r.attack, 'strength', r.strength, 'defence', r.defence,
            'ranged', r.ranged, 'prayer', r.prayer, 'magic', r.magic,
            'runecraft', r.runecraft, 'hitpoints', r.hitpoints,
            'crafting', r.crafting, 'mining', r.mining, 'smithing', r.smithing,
            'fishing', r.fishing, 'cooking', r.cooking, 'firemaking', r.firemaking,
            'woodcutting', r.woodcutting, 'agility', r.agility, 'herblore', r.herblore,
            'thieving', r.thieving, 'fletching', r.fletching, 'slayer', r.slayer,
            'farming', r.farming, 'construction', r.construction,
            'hunter', r.hunter, 'quest', r.quest
        ))
        INTO v_reqs
        FROM osrs.requirements r
        WHERE r.item_id = p_item_id;

        IF v_reqs IS NOT NULL THEN
            v_equip := v_equip || jsonb_build_object('requirements', v_reqs);
        END IF;

        v_result := v_result || jsonb_build_object('equipment', v_equip);
    END IF;

    -- Drop sources
    SELECT jsonb_agg(jsonb_build_object(
        'source', d.source, 'combat_level', d.combat_level,
        'quantity', d.quantity, 'rarity', d.rarity,
        'drop_rate', d.drop_rate, 'members_only', d.members_only,
        'wilderness', d.wilderness
    ))
    INTO v_drops
    FROM osrs.drop_sources d
    WHERE d.item_id = p_item_id;

    IF v_drops IS NOT NULL THEN
        v_result := v_result || jsonb_build_object('drop_sources', v_drops);
    END IF;

    -- Recipes with materials
    SELECT jsonb_agg(jsonb_build_object(
        'skill', rec.skill, 'level', rec.level, 'xp', rec.xp,
        'facility', rec.facility, 'ticks', rec.ticks,
        'materials', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'item_id', rm.material_item_id, 'item_name', rm.item_name,
                'quantity', rm.quantity, 'consumed', rm.consumed
            ))
            FROM osrs.recipe_materials rm WHERE rm.recipe_id = rec.id),
            '[]'::JSONB
        )
    ))
    INTO v_recipes
    FROM osrs.recipes rec
    WHERE rec.item_id = p_item_id;

    IF v_recipes IS NOT NULL THEN
        v_result := v_result || jsonb_build_object('recipes', v_recipes);
    END IF;

    -- Latest price
    SELECT jsonb_build_object(
        'high_price', pl.high_price, 'high_time', pl.high_time,
        'low_price', pl.low_price, 'low_time', pl.low_time
    )
    INTO v_price
    FROM osrs.price_latest pl
    WHERE pl.item_id = p_item_id;

    IF v_price IS NOT NULL THEN
        v_result := v_result || jsonb_build_object('price', v_price);
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION osrs.service_get_item IS
    'Get a full item with equipment, bonuses, requirements, drops, recipes, and latest price as JSONB.';

REVOKE ALL ON FUNCTION osrs.service_get_item(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION osrs.service_get_item(BIGINT) TO service_role;
ALTER FUNCTION osrs.service_get_item(BIGINT) OWNER TO service_role;

-- ===========================================
-- RPC: service_search_items
-- Fuzzy search items by name using pg_trgm
-- ===========================================

CREATE OR REPLACE FUNCTION osrs.service_search_items(
    p_query TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    item_id    BIGINT,
    name       TEXT,
    slug       TEXT,
    members    BOOLEAN,
    icon       TEXT,
    similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit INTEGER;
BEGIN
    IF p_query IS NULL OR p_query = '' THEN
        RAISE EXCEPTION 'search query cannot be empty' USING ERRCODE = '22023';
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);

    RETURN QUERY
    SELECT i.item_id, i.name, i.slug, i.members, i.icon,
           similarity(i.name, p_query) AS sim
    FROM osrs.items i
    WHERE i.name % p_query
    ORDER BY sim DESC, i.name
    LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION osrs.service_search_items IS
    'Fuzzy search items by name using pg_trgm. Returns up to p_limit results sorted by similarity.';

REVOKE ALL ON FUNCTION osrs.service_search_items(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION osrs.service_search_items(TEXT, INTEGER) TO service_role;
ALTER FUNCTION osrs.service_search_items(TEXT, INTEGER) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify all 4 service functions exist
    PERFORM 'osrs.service_upsert_item(jsonb)'::regprocedure;
    PERFORM 'osrs.service_save_prices(jsonb)'::regprocedure;
    PERFORM 'osrs.service_get_item(bigint)'::regprocedure;
    PERFORM 'osrs.service_search_items(text,integer)'::regprocedure;

    -- Verify service_role has EXECUTE on all 4
    IF NOT has_function_privilege('service_role', 'osrs.service_upsert_item(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on osrs.service_upsert_item';
    END IF;
    IF NOT has_function_privilege('service_role', 'osrs.service_save_prices(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on osrs.service_save_prices';
    END IF;
    IF NOT has_function_privilege('service_role', 'osrs.service_get_item(bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on osrs.service_get_item';
    END IF;
    IF NOT has_function_privilege('service_role', 'osrs.service_search_items(text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have EXECUTE on osrs.service_search_items';
    END IF;

    -- Verify anon does NOT have EXECUTE on any
    IF has_function_privilege('anon', 'osrs.service_upsert_item(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on osrs.service_upsert_item';
    END IF;
    IF has_function_privilege('anon', 'osrs.service_save_prices(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on osrs.service_save_prices';
    END IF;
    IF has_function_privilege('anon', 'osrs.service_get_item(bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on osrs.service_get_item';
    END IF;
    IF has_function_privilege('anon', 'osrs.service_search_items(text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have EXECUTE on osrs.service_search_items';
    END IF;

    -- Verify all owned by service_role
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'osrs.service_upsert_item(jsonb)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'osrs.service_upsert_item must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'osrs.service_save_prices(jsonb)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'osrs.service_save_prices must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'osrs.service_get_item(bigint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'osrs.service_get_item must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'osrs.service_search_items(text,integer)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'osrs.service_search_items must be owned by service_role';
    END IF;

    RAISE NOTICE 'osrs_rpcs.sql: all 4 service functions verified successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
