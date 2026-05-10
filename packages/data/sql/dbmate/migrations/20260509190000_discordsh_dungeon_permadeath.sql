-- migrate:up

CREATE OR REPLACE FUNCTION discordsh.service_delete_profile(
    p_discord_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deleted BIGINT;
BEGIN
    IF p_discord_id IS NULL THEN
        RAISE EXCEPTION 'discord_id cannot be null'
            USING ERRCODE = '22004';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(p_discord_id);

    DELETE FROM discordsh.dungeon_profiles
    WHERE discord_id = p_discord_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION discordsh.service_delete_profile(BIGINT) IS
    'Permadeath wipe — deletes one dungeon profile by Discord snowflake. Returns row count: 1 if deleted, 0 if absent. dungeon_runs rows for this Discord ID are also removed via the dungeon_runs.discord_id ON DELETE CASCADE foreign key (full erasure, by design).';

REVOKE ALL ON FUNCTION discordsh.service_delete_profile(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION discordsh.service_delete_profile(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION discordsh.service_delete_profile(BIGINT) FROM authenticated;

GRANT EXECUTE ON FUNCTION discordsh.service_delete_profile(BIGINT) TO service_role;

ALTER FUNCTION discordsh.service_delete_profile(BIGINT) OWNER TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS discordsh.service_delete_profile(BIGINT);
