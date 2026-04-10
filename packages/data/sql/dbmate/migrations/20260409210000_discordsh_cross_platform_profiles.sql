-- migrate:up
-- ============================================================
-- CROSS-PLATFORM PROFILE EXTENSION
--
-- Adds columns to discordsh.dungeon_profiles for:
--   1. skills       — JSONB SkillProfile (already used by bot, now persisted in DB)
--   2. faction_standing — JSONB {faction_id: rep_points} map
--   3. auth_user_id — optional FK to auth.users for isometric game account linking
--
-- Also updates the service_load_profile and service_upsert_profile RPCs
-- to include the new columns.
--
-- Design: isometric players without a linked Discord account play as guests
-- (no persistence). Linking a Supabase auth account to a Discord profile
-- enables cross-platform persistence.
-- ============================================================

-- ===========================================
-- ADD NEW COLUMNS
-- ===========================================

ALTER TABLE discordsh.dungeon_profiles
    ADD COLUMN IF NOT EXISTS skills          JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS faction_standing JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS auth_user_id    UUID UNIQUE,
    -- Mode lock: prevents simultaneous Discord + isometric play (data race prevention)
    ADD COLUMN IF NOT EXISTS active_mode            TEXT
        CHECK (active_mode IS NULL OR active_mode IN ('discord', 'isometric')),
    ADD COLUMN IF NOT EXISTS active_mode_session_id TEXT,
    ADD COLUMN IF NOT EXISTS active_mode_started_at TIMESTAMPTZ;

COMMENT ON COLUMN discordsh.dungeon_profiles.skills IS
    'Serialized bevy_skills::SkillProfile — shared across Discord and isometric game';
COMMENT ON COLUMN discordsh.dungeon_profiles.faction_standing IS
    'Faction reputation: {"crystal-order": 25, "shadow-court": -10, "deep-wardens": 50}';
COMMENT ON COLUMN discordsh.dungeon_profiles.auth_user_id IS
    'Optional link to auth.users(id) — enables isometric game to load this profile via JWT';
COMMENT ON COLUMN discordsh.dungeon_profiles.active_mode IS
    'Currently active play mode: discord or isometric. NULL means no active session. '
    'Enforced via service_claim_mode/service_release_mode RPCs to prevent data races '
    'when the same player has Discord dungeon and isometric game open simultaneously.';
COMMENT ON COLUMN discordsh.dungeon_profiles.active_mode_session_id IS
    'Opaque session identifier owned by the claiming client. Used by service_release_mode '
    'to verify the caller still owns the lock before releasing.';
COMMENT ON COLUMN discordsh.dungeon_profiles.active_mode_started_at IS
    'When the active mode was claimed. Stale claims (older than MODE_LOCK_TTL_MINUTES) '
    'can be force-overridden by the next claimant.';

-- Index for isometric game profile lookup by auth user
CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_profiles_auth_user
    ON discordsh.dungeon_profiles (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

-- ===========================================
-- UPDATE: service_load_profile — add new columns to output
--
-- Postgres does not allow CREATE OR REPLACE FUNCTION to change the return
-- type of an existing function, so we DROP first then recreate.
-- ===========================================

DROP FUNCTION IF EXISTS discordsh.service_load_profile(BIGINT);

CREATE OR REPLACE FUNCTION discordsh.service_load_profile(
    p_discord_id BIGINT
)
RETURNS TABLE(
    discord_id BIGINT,
    discord_name TEXT,
    class_id SMALLINT,
    level SMALLINT,
    xp INT,
    xp_to_next INT,
    gold INT,
    lifetime_kills INT,
    lifetime_gold_earned INT,
    lifetime_rooms_cleared INT,
    lifetime_bosses_defeated INT,
    lifetime_deaths INT,
    lifetime_victories INT,
    lifetime_escapes INT,
    weapon TEXT,
    armor_gear TEXT,
    inventory JSONB,
    completed_quests TEXT[],
    skills JSONB,
    faction_standing JSONB,
    auth_user_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.discord_id,
        p.discord_name,
        p.class_id,
        p.level,
        p.xp,
        p.xp_to_next,
        p.gold,
        p.lifetime_kills,
        p.lifetime_gold_earned,
        p.lifetime_rooms_cleared,
        p.lifetime_bosses_defeated,
        p.lifetime_deaths,
        p.lifetime_victories,
        p.lifetime_escapes,
        p.weapon,
        p.armor_gear,
        p.inventory,
        p.completed_quests,
        p.skills,
        p.faction_standing,
        p.auth_user_id,
        p.created_at,
        p.updated_at
    FROM discordsh.dungeon_profiles p
    WHERE p.discord_id = p_discord_id;
END;
$$;

-- ===========================================
-- NEW: service_load_profile_by_auth — for isometric game
--
-- Loads a profile by Supabase auth.users UUID instead of Discord snowflake.
-- Returns empty if no linked profile exists (guest mode).
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_load_profile_by_auth(
    p_auth_user_id UUID
)
RETURNS TABLE(
    discord_id BIGINT,
    discord_name TEXT,
    class_id SMALLINT,
    level SMALLINT,
    xp INT,
    xp_to_next INT,
    gold INT,
    lifetime_kills INT,
    lifetime_gold_earned INT,
    lifetime_rooms_cleared INT,
    lifetime_bosses_defeated INT,
    lifetime_deaths INT,
    lifetime_victories INT,
    lifetime_escapes INT,
    weapon TEXT,
    armor_gear TEXT,
    inventory JSONB,
    completed_quests TEXT[],
    skills JSONB,
    faction_standing JSONB,
    auth_user_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.discord_id,
        p.discord_name,
        p.class_id,
        p.level,
        p.xp,
        p.xp_to_next,
        p.gold,
        p.lifetime_kills,
        p.lifetime_gold_earned,
        p.lifetime_rooms_cleared,
        p.lifetime_bosses_defeated,
        p.lifetime_deaths,
        p.lifetime_victories,
        p.lifetime_escapes,
        p.weapon,
        p.armor_gear,
        p.inventory,
        p.completed_quests,
        p.skills,
        p.faction_standing,
        p.auth_user_id,
        p.created_at,
        p.updated_at
    FROM discordsh.dungeon_profiles p
    WHERE p.auth_user_id = p_auth_user_id;
END;
$$;

COMMENT ON FUNCTION discordsh.service_load_profile_by_auth IS
    'Load a dungeon profile by Supabase auth UUID. Returns empty if no linked profile (guest mode).';

REVOKE ALL ON FUNCTION discordsh.service_load_profile_by_auth(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_load_profile_by_auth(UUID) TO service_role;
ALTER FUNCTION discordsh.service_load_profile_by_auth(UUID) OWNER TO service_role;

-- ===========================================
-- UPDATE: service_upsert_profile — add new columns
-- ===========================================

DROP FUNCTION IF EXISTS discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
);

CREATE OR REPLACE FUNCTION discordsh.service_upsert_profile(
    -- Profile fields
    p_discord_id            BIGINT,
    p_discord_name          TEXT,
    p_class_id              SMALLINT,
    p_level                 SMALLINT,
    p_xp                    INT,
    p_xp_to_next            INT,
    p_gold                  INT,
    p_lifetime_kills        INT,
    p_lifetime_gold_earned  INT,
    p_lifetime_rooms_cleared INT,
    p_lifetime_bosses_defeated INT,
    p_lifetime_deaths       INT,
    p_lifetime_victories    INT,
    p_lifetime_escapes      INT,
    p_weapon                TEXT DEFAULT NULL,
    p_armor_gear            TEXT DEFAULT NULL,
    p_inventory             JSONB DEFAULT '[]'::JSONB,
    p_completed_quests      TEXT[] DEFAULT '{}',
    p_skills                JSONB DEFAULT '{}'::JSONB,
    p_faction_standing      JSONB DEFAULT '{}'::JSONB,
    -- Run fields
    p_run_outcome           SMALLINT DEFAULT NULL,
    p_run_rooms_cleared     INT DEFAULT 0,
    p_run_kills             INT DEFAULT 0,
    p_run_gold_earned       INT DEFAULT 0,
    p_run_gold_lost         INT DEFAULT 0,
    p_run_bosses_defeated   INT DEFAULT 0,
    p_run_xp_earned         INT DEFAULT 0,
    p_run_level_at_end      SMALLINT DEFAULT 1,
    p_run_duration_secs     INT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Advisory lock: serialize saves per player using discord_id directly
    PERFORM pg_advisory_xact_lock(p_discord_id);

    -- Upsert profile
    INSERT INTO discordsh.dungeon_profiles (
        discord_id, discord_name, class_id, level, xp, xp_to_next, gold,
        lifetime_kills, lifetime_gold_earned, lifetime_rooms_cleared,
        lifetime_bosses_defeated, lifetime_deaths, lifetime_victories,
        lifetime_escapes, weapon, armor_gear, inventory, completed_quests,
        skills, faction_standing
    )
    VALUES (
        p_discord_id, p_discord_name, p_class_id, p_level, p_xp, p_xp_to_next, p_gold,
        p_lifetime_kills, p_lifetime_gold_earned, p_lifetime_rooms_cleared,
        p_lifetime_bosses_defeated, p_lifetime_deaths, p_lifetime_victories,
        p_lifetime_escapes, p_weapon, p_armor_gear, p_inventory, p_completed_quests,
        p_skills, p_faction_standing
    )
    ON CONFLICT (discord_id) DO UPDATE SET
        discord_name            = EXCLUDED.discord_name,
        class_id                = EXCLUDED.class_id,
        level                   = EXCLUDED.level,
        xp                      = EXCLUDED.xp,
        xp_to_next              = EXCLUDED.xp_to_next,
        gold                    = EXCLUDED.gold,
        lifetime_kills          = EXCLUDED.lifetime_kills,
        lifetime_gold_earned    = EXCLUDED.lifetime_gold_earned,
        lifetime_rooms_cleared  = EXCLUDED.lifetime_rooms_cleared,
        lifetime_bosses_defeated = EXCLUDED.lifetime_bosses_defeated,
        lifetime_deaths         = EXCLUDED.lifetime_deaths,
        lifetime_victories      = EXCLUDED.lifetime_victories,
        lifetime_escapes        = EXCLUDED.lifetime_escapes,
        weapon                  = EXCLUDED.weapon,
        armor_gear              = EXCLUDED.armor_gear,
        inventory               = EXCLUDED.inventory,
        completed_quests        = EXCLUDED.completed_quests,
        skills                  = EXCLUDED.skills,
        faction_standing        = EXCLUDED.faction_standing;

    -- Insert run log (if outcome provided)
    IF p_run_outcome IS NOT NULL THEN
        INSERT INTO discordsh.dungeon_runs (
            discord_id, outcome, rooms_cleared, kills,
            gold_earned, gold_lost, bosses_defeated,
            xp_earned, level_at_end, duration_secs
        )
        VALUES (
            p_discord_id, p_run_outcome, p_run_rooms_cleared, p_run_kills,
            p_run_gold_earned, p_run_gold_lost, p_run_bosses_defeated,
            p_run_xp_earned, p_run_level_at_end, p_run_duration_secs
        );
    END IF;

    RETURN QUERY SELECT true, 'Profile saved.'::TEXT;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_upsert_profile IS
    'Atomic upsert of dungeon profile (with skills + faction) + run log. Advisory-locked per discord_id. Bot-only.';

REVOKE ALL ON FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[], JSONB, JSONB,
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[], JSONB, JSONB,
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) TO service_role;
ALTER FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[], JSONB, JSONB,
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) OWNER TO service_role;

-- ===========================================
-- NEW: service_link_auth — link a Supabase auth account to a Discord profile
--
-- Called by an edge function when a user links their accounts.
-- Requires both discord_id and auth_user_id to be valid.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_link_auth(
    p_discord_id    BIGINT,
    p_auth_user_id  UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE discordsh.dungeon_profiles
    SET auth_user_id = p_auth_user_id
    WHERE discord_id = p_discord_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Discord profile not found.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT true, 'Account linked.'::TEXT;

EXCEPTION
    WHEN unique_violation THEN
        RETURN QUERY SELECT false, 'Auth account already linked to another profile.'::TEXT;
    WHEN OTHERS THEN
        RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_link_auth IS
    'Link a Supabase auth.users UUID to a Discord dungeon profile. Enables cross-platform persistence.';

REVOKE ALL ON FUNCTION discordsh.service_link_auth(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_link_auth(BIGINT, UUID) TO service_role;
ALTER FUNCTION discordsh.service_link_auth(BIGINT, UUID) OWNER TO service_role;

-- ===========================================
-- MODE LOCK: prevents simultaneous Discord + isometric play
--
-- Rationale: when a player has both clients open, both can call
-- service_upsert_profile concurrently. The advisory lock keyed on
-- discord_id only prevents torn writes, not last-write-wins clobbering
-- of fields the other client just changed (gold, inventory, skills).
--
-- The mode lock forces sessions to be serial: player can be in Discord
-- OR isometric, never both. Stale claims auto-expire after 30 minutes
-- (covers crash recovery without locking the player out forever).
--
-- TTL: 30 minutes
-- ===========================================

-- service_claim_mode — atomic CAS to grab the mode lock for a session
CREATE OR REPLACE FUNCTION discordsh.service_claim_mode(
    p_discord_id  BIGINT,
    p_mode        TEXT,           -- 'discord' or 'isometric'
    p_session_id  TEXT,           -- opaque session id owned by caller
    p_force       BOOLEAN DEFAULT FALSE  -- override stale claim (>30min)
)
RETURNS TABLE(success BOOLEAN, current_mode TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_mode       TEXT;
    v_existing_session_id TEXT;
    v_existing_started_at TIMESTAMPTZ;
    v_lock_age_minutes    NUMERIC;
    v_ttl_minutes         CONSTANT INT := 30;
BEGIN
    -- Validate mode value
    IF p_mode NOT IN ('discord', 'isometric') THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid mode (must be discord or isometric).'::TEXT;
        RETURN;
    END IF;

    IF p_session_id IS NULL OR p_session_id = '' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'session_id is required.'::TEXT;
        RETURN;
    END IF;

    -- Serialize per-player to avoid concurrent claims racing
    PERFORM pg_advisory_xact_lock(p_discord_id);

    SELECT active_mode, active_mode_session_id, active_mode_started_at
      INTO v_existing_mode, v_existing_session_id, v_existing_started_at
      FROM discordsh.dungeon_profiles
     WHERE discord_id = p_discord_id;

    -- Profile doesn't exist yet — auto-create with the claim
    IF NOT FOUND THEN
        INSERT INTO discordsh.dungeon_profiles (
            discord_id, discord_name, active_mode, active_mode_session_id, active_mode_started_at
        )
        VALUES (
            p_discord_id, 'Adventurer'::TEXT, p_mode, p_session_id, NOW()
        );
        RETURN QUERY SELECT true, p_mode, 'Mode claimed (new profile).'::TEXT;
        RETURN;
    END IF;

    -- No active claim → grant immediately
    IF v_existing_mode IS NULL THEN
        UPDATE discordsh.dungeon_profiles
           SET active_mode = p_mode,
               active_mode_session_id = p_session_id,
               active_mode_started_at = NOW()
         WHERE discord_id = p_discord_id;
        RETURN QUERY SELECT true, p_mode, 'Mode claimed.'::TEXT;
        RETURN;
    END IF;

    -- Same mode + same session = idempotent re-claim (refresh timestamp)
    IF v_existing_mode = p_mode AND v_existing_session_id = p_session_id THEN
        UPDATE discordsh.dungeon_profiles
           SET active_mode_started_at = NOW()
         WHERE discord_id = p_discord_id;
        RETURN QUERY SELECT true, p_mode, 'Mode reclaimed (refreshed).'::TEXT;
        RETURN;
    END IF;

    -- Different claim exists — check if it's stale
    v_lock_age_minutes := EXTRACT(EPOCH FROM (NOW() - v_existing_started_at)) / 60;

    IF v_lock_age_minutes > v_ttl_minutes OR p_force THEN
        -- Stale or forced override
        UPDATE discordsh.dungeon_profiles
           SET active_mode = p_mode,
               active_mode_session_id = p_session_id,
               active_mode_started_at = NOW()
         WHERE discord_id = p_discord_id;
        RETURN QUERY SELECT
            true,
            p_mode,
            FORMAT('Mode claimed (overrode stale %s claim, age %s min).',
                   v_existing_mode, ROUND(v_lock_age_minutes, 1))::TEXT;
        RETURN;
    END IF;

    -- Lock held by another active session — reject
    RETURN QUERY SELECT
        false,
        v_existing_mode,
        FORMAT('Player is already in %s (claim age %s min). Finish that session first.',
               v_existing_mode, ROUND(v_lock_age_minutes, 1))::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_claim_mode IS
    'Atomically claim the play mode lock for a player. Prevents simultaneous '
    'Discord + isometric sessions. Stale claims (>30min) auto-override.';

REVOKE ALL ON FUNCTION discordsh.service_claim_mode(BIGINT, TEXT, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_claim_mode(BIGINT, TEXT, TEXT, BOOLEAN)
    TO service_role;
ALTER FUNCTION discordsh.service_claim_mode(BIGINT, TEXT, TEXT, BOOLEAN)
    OWNER TO service_role;

-- service_release_mode — release the lock if the caller still owns it
CREATE OR REPLACE FUNCTION discordsh.service_release_mode(
    p_discord_id BIGINT,
    p_session_id TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_session_id TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(p_discord_id);

    SELECT active_mode_session_id INTO v_existing_session_id
      FROM discordsh.dungeon_profiles
     WHERE discord_id = p_discord_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Profile not found.'::TEXT;
        RETURN;
    END IF;

    IF v_existing_session_id IS NULL THEN
        RETURN QUERY SELECT true, 'No active claim.'::TEXT;
        RETURN;
    END IF;

    IF v_existing_session_id <> p_session_id THEN
        RETURN QUERY SELECT false, 'Lock owned by another session.'::TEXT;
        RETURN;
    END IF;

    UPDATE discordsh.dungeon_profiles
       SET active_mode = NULL,
           active_mode_session_id = NULL,
           active_mode_started_at = NULL
     WHERE discord_id = p_discord_id;

    RETURN QUERY SELECT true, 'Mode released.'::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_release_mode IS
    'Release the play mode lock if the caller still owns the session.';

REVOKE ALL ON FUNCTION discordsh.service_release_mode(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_release_mode(BIGINT, TEXT)
    TO service_role;
ALTER FUNCTION discordsh.service_release_mode(BIGINT, TEXT)
    OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify new columns exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'discordsh' AND table_name = 'dungeon_profiles' AND column_name = 'skills'
    ) THEN
        RAISE EXCEPTION 'skills column not found on discordsh.dungeon_profiles';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'discordsh' AND table_name = 'dungeon_profiles' AND column_name = 'faction_standing'
    ) THEN
        RAISE EXCEPTION 'faction_standing column not found on discordsh.dungeon_profiles';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'discordsh' AND table_name = 'dungeon_profiles' AND column_name = 'auth_user_id'
    ) THEN
        RAISE EXCEPTION 'auth_user_id column not found on discordsh.dungeon_profiles';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'discordsh' AND table_name = 'dungeon_profiles' AND column_name = 'active_mode'
    ) THEN
        RAISE EXCEPTION 'active_mode column not found on discordsh.dungeon_profiles';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'discordsh' AND table_name = 'dungeon_profiles' AND column_name = 'active_mode_session_id'
    ) THEN
        RAISE EXCEPTION 'active_mode_session_id column not found on discordsh.dungeon_profiles';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'discordsh' AND table_name = 'dungeon_profiles' AND column_name = 'active_mode_started_at'
    ) THEN
        RAISE EXCEPTION 'active_mode_started_at column not found on discordsh.dungeon_profiles';
    END IF;

    -- Verify new functions exist
    PERFORM 'discordsh.service_load_profile_by_auth(uuid)'::regprocedure;
    PERFORM 'discordsh.service_link_auth(bigint, uuid)'::regprocedure;
    PERFORM 'discordsh.service_claim_mode(bigint, text, text, boolean)'::regprocedure;
    PERFORM 'discordsh.service_release_mode(bigint, text)'::regprocedure;

    RAISE NOTICE 'cross_platform_profiles migration verified successfully.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

-- Drop mode lock functions
DROP FUNCTION IF EXISTS discordsh.service_release_mode(BIGINT, TEXT);
DROP FUNCTION IF EXISTS discordsh.service_claim_mode(BIGINT, TEXT, TEXT, BOOLEAN);

-- Drop new helper functions
DROP FUNCTION IF EXISTS discordsh.service_link_auth(BIGINT, UUID);
DROP FUNCTION IF EXISTS discordsh.service_load_profile_by_auth(UUID);

-- Drop the modified service functions (they have new signatures with skills/faction_standing)
DROP FUNCTION IF EXISTS discordsh.service_load_profile(BIGINT);
DROP FUNCTION IF EXISTS discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[], JSONB, JSONB,
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
);

-- Drop index
DROP INDEX IF EXISTS discordsh.idx_discordsh_dungeon_profiles_auth_user;

-- Remove columns (mode lock first, then cross-platform fields)
ALTER TABLE discordsh.dungeon_profiles
    DROP COLUMN IF EXISTS active_mode_started_at,
    DROP COLUMN IF EXISTS active_mode_session_id,
    DROP COLUMN IF EXISTS active_mode,
    DROP COLUMN IF EXISTS auth_user_id,
    DROP COLUMN IF EXISTS faction_standing,
    DROP COLUMN IF EXISTS skills;

-- Recreate the original service_load_profile (without skills/faction/auth_user_id columns)
-- to restore the prior schema state.
CREATE OR REPLACE FUNCTION discordsh.service_load_profile(
    p_discord_id BIGINT
)
RETURNS TABLE(
    discord_id BIGINT,
    discord_name TEXT,
    class_id SMALLINT,
    level SMALLINT,
    xp INT,
    xp_to_next INT,
    gold INT,
    lifetime_kills INT,
    lifetime_gold_earned INT,
    lifetime_rooms_cleared INT,
    lifetime_bosses_defeated INT,
    lifetime_deaths INT,
    lifetime_victories INT,
    lifetime_escapes INT,
    weapon TEXT,
    armor_gear TEXT,
    inventory JSONB,
    completed_quests TEXT[],
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.discord_id, p.discord_name, p.class_id, p.level, p.xp, p.xp_to_next, p.gold,
        p.lifetime_kills, p.lifetime_gold_earned, p.lifetime_rooms_cleared,
        p.lifetime_bosses_defeated, p.lifetime_deaths, p.lifetime_victories, p.lifetime_escapes,
        p.weapon, p.armor_gear, p.inventory, p.completed_quests, p.created_at, p.updated_at
    FROM discordsh.dungeon_profiles p
    WHERE p.discord_id = p_discord_id;
END;
$$;
REVOKE ALL ON FUNCTION discordsh.service_load_profile(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_load_profile(BIGINT) TO service_role;
ALTER FUNCTION discordsh.service_load_profile(BIGINT) OWNER TO service_role;

-- Recreate original service_upsert_profile (without p_skills/p_faction_standing params)
CREATE OR REPLACE FUNCTION discordsh.service_upsert_profile(
    p_discord_id            BIGINT,
    p_discord_name          TEXT,
    p_class_id              SMALLINT,
    p_level                 SMALLINT,
    p_xp                    INT,
    p_xp_to_next            INT,
    p_gold                  INT,
    p_lifetime_kills        INT,
    p_lifetime_gold_earned  INT,
    p_lifetime_rooms_cleared INT,
    p_lifetime_bosses_defeated INT,
    p_lifetime_deaths       INT,
    p_lifetime_victories    INT,
    p_lifetime_escapes      INT,
    p_weapon                TEXT DEFAULT NULL,
    p_armor_gear            TEXT DEFAULT NULL,
    p_inventory             JSONB DEFAULT '[]'::JSONB,
    p_completed_quests      TEXT[] DEFAULT '{}',
    p_run_outcome           SMALLINT DEFAULT NULL,
    p_run_rooms_cleared     INT DEFAULT 0,
    p_run_kills             INT DEFAULT 0,
    p_run_gold_earned       INT DEFAULT 0,
    p_run_gold_lost         INT DEFAULT 0,
    p_run_bosses_defeated   INT DEFAULT 0,
    p_run_xp_earned         INT DEFAULT 0,
    p_run_level_at_end      SMALLINT DEFAULT 1,
    p_run_duration_secs     INT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(p_discord_id);
    INSERT INTO discordsh.dungeon_profiles (
        discord_id, discord_name, class_id, level, xp, xp_to_next, gold,
        lifetime_kills, lifetime_gold_earned, lifetime_rooms_cleared,
        lifetime_bosses_defeated, lifetime_deaths, lifetime_victories,
        lifetime_escapes, weapon, armor_gear, inventory, completed_quests
    )
    VALUES (
        p_discord_id, p_discord_name, p_class_id, p_level, p_xp, p_xp_to_next, p_gold,
        p_lifetime_kills, p_lifetime_gold_earned, p_lifetime_rooms_cleared,
        p_lifetime_bosses_defeated, p_lifetime_deaths, p_lifetime_victories,
        p_lifetime_escapes, p_weapon, p_armor_gear, p_inventory, p_completed_quests
    )
    ON CONFLICT (discord_id) DO UPDATE SET
        discord_name            = EXCLUDED.discord_name,
        class_id                = EXCLUDED.class_id,
        level                   = EXCLUDED.level,
        xp                      = EXCLUDED.xp,
        xp_to_next              = EXCLUDED.xp_to_next,
        gold                    = EXCLUDED.gold,
        lifetime_kills          = EXCLUDED.lifetime_kills,
        lifetime_gold_earned    = EXCLUDED.lifetime_gold_earned,
        lifetime_rooms_cleared  = EXCLUDED.lifetime_rooms_cleared,
        lifetime_bosses_defeated = EXCLUDED.lifetime_bosses_defeated,
        lifetime_deaths         = EXCLUDED.lifetime_deaths,
        lifetime_victories      = EXCLUDED.lifetime_victories,
        lifetime_escapes        = EXCLUDED.lifetime_escapes,
        weapon                  = EXCLUDED.weapon,
        armor_gear              = EXCLUDED.armor_gear,
        inventory               = EXCLUDED.inventory,
        completed_quests        = EXCLUDED.completed_quests;
    IF p_run_outcome IS NOT NULL THEN
        INSERT INTO discordsh.dungeon_runs (
            discord_id, outcome, rooms_cleared, kills,
            gold_earned, gold_lost, bosses_defeated,
            xp_earned, level_at_end, duration_secs
        )
        VALUES (
            p_discord_id, p_run_outcome, p_run_rooms_cleared, p_run_kills,
            p_run_gold_earned, p_run_gold_lost, p_run_bosses_defeated,
            p_run_xp_earned, p_run_level_at_end, p_run_duration_secs
        );
    END IF;
    RETURN QUERY SELECT true, 'Profile saved.'::TEXT;
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) TO service_role;
ALTER FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) OWNER TO service_role;
