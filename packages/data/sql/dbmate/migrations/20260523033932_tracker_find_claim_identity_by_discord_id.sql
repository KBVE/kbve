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
COST 50
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
                gi.identity_data->>'preferred_username',
                gi.identity_data->>'login'
            )::TEXT                 AS github_login,
            gi.provider_id::TEXT    AS github_id
        FROM auth.identities gi
        WHERE gi.user_id = d.user_id
          AND gi.provider = 'github'
        ORDER BY gi.created_at DESC NULLS LAST, gi.id DESC
        LIMIT 1
    ) g ON TRUE
    LEFT JOIN profile.username p
      ON p.user_id = d.user_id
    WHERE d.provider = 'discord'
      AND d.provider_id = p_discord_id
    ORDER BY d.created_at DESC NULLS LAST, d.id DESC
    LIMIT 1;
END;
$$;

ALTER FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) OWNER TO service_role;

REVOKE ALL ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT)
TO service_role;

COMMENT ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) IS
'Backend/service_role only; intentionally not exposed to anon/authenticated clients because it surfaces linked identity metadata from auth.identities. Resolves a Discord snowflake to KBVE user_id + (optional) linked GitHub login/id + (optional) profile.username in one round-trip. Empty result = no auth.identities row for the snowflake (or invalid input shape). NULL github_login = KBVE account exists but no GitHub identity linked. NULL kbve_username = no profile.username row yet. LATERAL join on github picks the latest GitHub identity by (created_at DESC NULLS LAST, id DESC) so the tie-breaker is fully deterministic even when timestamps collide. Same tie-breaker applied on the outer discord lookup. github_login extracted via COALESCE(user_name, preferred_username, login) since the claim name differs across GitHub OAuth scopes. Input is gated by ^[0-9]{15,25}$ in a PL/pgSQL early-return guard before any auth.identities lookup, so non-snowflake probes short-circuit to an empty result without touching the table. SECURITY DEFINER with empty search_path; every reference schema-qualified.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS tracker.find_claim_identity_by_discord_id(TEXT);
NOTIFY pgrst, 'reload schema';
