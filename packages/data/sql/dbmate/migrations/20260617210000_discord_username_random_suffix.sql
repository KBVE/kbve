-- migrate:up

CREATE OR REPLACE FUNCTION tracker.ensure_discord_username(
    p_user_id    UUID,
    p_base       TEXT,
    p_discord_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing  TEXT;
    v_base      TEXT;
    v_candidate TEXT;
    v_suffix    TEXT;
    v_attempt   INT := 0;
BEGIN
    SELECT username INTO v_existing FROM profile.username WHERE user_id = p_user_id;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_base := lower(coalesce(p_base, ''));
    v_base := regexp_replace(v_base, '[^a-z0-9_-]', '', 'g');
    IF char_length(v_base) < 3 THEN
        v_base := 'chip' || substr(md5(random()::text || coalesce(p_discord_id, '')), 1, 6);
    END IF;
    v_base := left(v_base, 24);

    LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt = 1 THEN
            v_candidate := v_base;
        ELSE
            v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 4);
            v_candidate := left(v_base, 58 - char_length(v_suffix)) || '-' || v_suffix;
        END IF;

        BEGIN
            PERFORM profile.service_add_username(p_user_id, v_candidate);
            RETURN v_candidate;
        EXCEPTION
            WHEN unique_violation THEN
                IF v_attempt >= 8 THEN
                    RAISE;
                END IF;
            WHEN OTHERS THEN
                IF v_attempt >= 8 THEN
                    RAISE;
                END IF;
        END;
    END LOOP;
END;
$$;

ALTER FUNCTION tracker.ensure_discord_username(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION tracker.ensure_discord_username(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tracker.ensure_discord_username(UUID, TEXT, TEXT) TO service_role;

-- migrate:down

CREATE OR REPLACE FUNCTION tracker.ensure_discord_username(
    p_user_id    UUID,
    p_base       TEXT,
    p_discord_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing  TEXT;
    v_base      TEXT;
    v_candidate TEXT;
    v_suffix    TEXT;
    v_attempt   INT := 0;
BEGIN
    SELECT username INTO v_existing FROM profile.username WHERE user_id = p_user_id;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_base := lower(coalesce(p_base, ''));
    v_base := regexp_replace(v_base, '[^a-z0-9_-]', '', 'g');
    IF char_length(v_base) < 3 THEN
        v_base := 'chip' || right(regexp_replace(coalesce(p_discord_id, ''), '[^0-9]', '', 'g'), 6);
    END IF;
    v_base := left(v_base, 24);

    LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt = 1 THEN
            v_candidate := v_base;
        ELSE
            v_suffix := right(regexp_replace(coalesce(p_discord_id, ''), '[^0-9]', '', 'g'), v_attempt + 1);
            v_candidate := left(v_base, 60 - char_length(v_suffix)) || '-' || v_suffix;
        END IF;

        BEGIN
            PERFORM profile.service_add_username(p_user_id, v_candidate);
            RETURN v_candidate;
        EXCEPTION
            WHEN unique_violation THEN
                IF v_attempt >= 6 THEN
                    RAISE;
                END IF;
            WHEN OTHERS THEN
                IF v_attempt >= 6 THEN
                    RAISE;
                END IF;
        END;
    END LOOP;
END;
$$;

ALTER FUNCTION tracker.ensure_discord_username(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION tracker.ensure_discord_username(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tracker.ensure_discord_username(UUID, TEXT, TEXT) TO service_role;
