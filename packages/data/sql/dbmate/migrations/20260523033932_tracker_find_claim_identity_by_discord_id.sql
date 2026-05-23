-- migrate:up

CREATE SCHEMA IF NOT EXISTS tracker;

REVOKE ALL ON SCHEMA tracker FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA tracker TO service_role;

CREATE OR REPLACE FUNCTION tracker.find_claim_identity_by_discord_id(
    p_discord_id TEXT
)
RETURNS TABLE (
    user_id        UUID,
    github_login   TEXT,
    github_id      TEXT,
    kbve_username  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
BEGIN
    IF p_discord_id IS NULL OR p_discord_id !~ '^[0-9]{15,25}$' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        d.user_id,
        g.github_login,
        g.github_id,
        p.username::TEXT AS kbve_username
    FROM auth.identities d
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(
                gi.identity_data->>'user_name',
                gi.identity_data->>'preferred_username'
            )::TEXT                 AS github_login,
            gi.provider_id::TEXT    AS github_id
        FROM auth.identities gi
        WHERE gi.user_id = d.user_id
          AND gi.provider = 'github'
        ORDER BY gi.created_at DESC NULLS LAST
        LIMIT 1
    ) g ON TRUE
    LEFT JOIN profile.username p
      ON p.user_id = d.user_id
    WHERE d.provider = 'discord'
      AND d.provider_id = p_discord_id
    ORDER BY d.created_at DESC NULLS LAST
    LIMIT 1;
END;
$$;

ALTER FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) OWNER TO service_role;

REVOKE ALL ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT)
TO service_role;

COMMENT ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) IS
'Resolves a Discord snowflake to KBVE user_id + (optional) linked GitHub login/id + (optional) profile.username in one round-trip. Empty result = no auth.identities row for the snowflake (or invalid input shape). NULL github_login = KBVE account exists but no GitHub identity linked. NULL kbve_username = no profile.username row yet. LATERAL join on github keeps results stable when a user has multiple github links (picks latest by created_at). github_login extracted via COALESCE(user_name, preferred_username) since the claim name differs across GitHub OAuth scopes. Input is gated by ^[0-9]{15,25}$ in WHERE so non-snowflake probes short-circuit to empty result. SECURITY DEFINER with empty search_path; every reference schema-qualified. Used by discordsh /gh claim.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS tracker.find_claim_identity_by_discord_id(TEXT);
NOTIFY pgrst, 'reload schema';
