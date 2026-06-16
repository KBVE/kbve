-- migrate:up

-- Fast-register helpers for the Discord Activity session bridge. auth.users is
-- created by GoTrue (admin API) so these never INSERT into auth.*; they only
-- read auth.users (link-by-email) and set profile.username. SECURITY DEFINER
-- owned by postgres because auth.users is owned by supabase_auth_admin and a
-- service_role-owned definer fn would throw 42501.

CREATE OR REPLACE FUNCTION tracker.find_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.id
    FROM auth.users u
    WHERE u.email = lower(p_email)
    ORDER BY u.created_at DESC NULLS LAST, u.id DESC
    LIMIT 1;
$$;

ALTER FUNCTION tracker.find_user_id_by_email(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION tracker.find_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tracker.find_user_id_by_email(TEXT) TO service_role;

-- Idempotently give a freshly-provisioned user a profile.username. Returns the
-- existing username if one is already set, otherwise derives a candidate from
-- the Discord display name (sanitized to the profile charset) and retries with a
-- snowflake-derived suffix on collision/banlist rejection.
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
                -- banlist/format rejection on the derived candidate; fall through
                -- to a snowflake-suffixed retry rather than failing the register.
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

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS tracker.ensure_discord_username(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS tracker.find_user_id_by_email(TEXT);
