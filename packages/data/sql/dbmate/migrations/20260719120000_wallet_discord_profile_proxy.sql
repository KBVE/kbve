-- migrate:up

-- Public-schema PostgREST bridge: Discord snowflake -> KBVE profile + wallet.
--
-- Why this exists:
--   The discordsh-bot resolves a Discord user to their KBVE profile + wallet
--   balance for the /wm profile command. That is two private-schema hops
--   (tracker.find_claim_identity_by_discord_id, then wallet.service_user_balance)
--   neither of which PostgREST can reach directly. This wrapper joins both into
--   a single narrow, service-role-only public RPC so a zero-dep Windmill script
--   can read it over one HTTP call while both source schemas stay private.
--
-- Authority:
--   service_role only. anon/authenticated/PUBLIC are explicitly revoked. The
--   result surfaces linked-identity + balance data that must never reach a
--   browser client.
--
-- Safety:
--   SECURITY DEFINER with search_path='' prevents search-path hijacking; every
--   inner reference is schema-qualified. Input shape is gated inside
--   tracker.find_claim_identity_by_discord_id (^[0-9]{15,25}$) before any table
--   read, so non-snowflake probes short-circuit to `linked = false`.
--
-- Planner:
--   STABLE — read-only over two STABLE/read-only inner functions.

CREATE OR REPLACE FUNCTION public.proxy_discord_profile(p_discord_id text)
RETURNS TABLE (
    linked        boolean,
    user_id       uuid,
    kbve_username text,
    credits       bigint,
    khash         bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH ident AS (
        SELECT i.user_id, i.kbve_username
        FROM tracker.find_claim_identity_by_discord_id(p_discord_id) AS i
    )
    SELECT
        (ident.user_id IS NOT NULL)         AS linked,
        ident.user_id,
        ident.kbve_username,
        COALESCE(bal.credits, 0)::bigint    AS credits,
        COALESCE(bal.khash, 0)::bigint      AS khash
    FROM ident
    LEFT JOIN LATERAL wallet.service_user_balance(ident.user_id) AS bal ON true;
$$;

ALTER FUNCTION public.proxy_discord_profile(text) OWNER TO service_role;

REVOKE ALL ON FUNCTION public.proxy_discord_profile(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.proxy_discord_profile(text)
TO service_role;

COMMENT ON FUNCTION public.proxy_discord_profile(text) IS
'Public-schema PostgREST bridge: resolves a Discord snowflake to KBVE user_id + kbve_username (tracker.find_claim_identity_by_discord_id) and joins the current wallet balance (wallet.service_user_balance). Returns exactly one row; linked=false with NULL identity + zero balances when the snowflake has no linked KBVE account. Balances COALESCE to 0 when the account has no wallet row yet. service_role only; SECURITY DEFINER, empty search_path, schema-qualified. Used by the discordsh-bot /wm profile command via a Windmill script.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_discord_profile(text);
NOTIFY pgrst, 'reload schema';
