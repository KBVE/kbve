-- migrate:up

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
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.user_id,
        (g.identity_data->>'user_name')::TEXT AS github_login,
        g.provider_id::TEXT                   AS github_id,
        p.username::TEXT                      AS kbve_username
    FROM auth.identities d
    LEFT JOIN auth.identities g
      ON g.user_id = d.user_id AND g.provider = 'github'
    LEFT JOIN profile.username p
      ON p.user_id = d.user_id
    WHERE d.provider = 'discord' AND d.provider_id = p_discord_id
    LIMIT 1;
END;
$$;

ALTER FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) OWNER TO service_role;

REVOKE ALL ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT)
TO service_role;

COMMENT ON FUNCTION tracker.find_claim_identity_by_discord_id(TEXT) IS
'Resolves a Discord user_id (auth.identities.provider_id where provider=discord) into the linked GitHub login + KBVE profile username in one round-trip. LEFT JOIN so callers can distinguish "no KBVE account" (empty result) from "no GitHub link" (github_login NULL) and "no profile username" (kbve_username NULL). Used by discordsh /gh claim. SECURITY DEFINER with empty search_path; auth.identities and profile.username are schema-qualified.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS tracker.find_claim_identity_by_discord_id(TEXT);
NOTIFY pgrst, 'reload schema';
