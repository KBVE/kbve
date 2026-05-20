-- migrate:up

-- Public-schema PostgREST bridge for wallet.service_user_balance.
--
-- Why this exists:
--   PostgREST only exposes configured schemas. Backend bridges such as
--   mc_auth call RPCs through the public schema, so calls directly against
--   wallet.service_user_balance are not visible unless the wallet schema is
--   exposed. This wrapper keeps wallet private while exposing a narrow,
--   service-role-only read path.
--
-- Authority:
--   service_role only. anon/authenticated/PUBLIC are explicitly revoked.
--
-- Safety:
--   SECURITY DEFINER with search_path='' prevents search-path hijacking.
--   The inner function is schema-qualified.
--
-- Planner:
--   STABLE is valid because this wrapper performs a read-only balance lookup.
--   The inner function should also remain read-only.

CREATE OR REPLACE FUNCTION public.proxy_service_user_balance(p_user_id uuid)
RETURNS TABLE (
    account_id uuid,
    credits    bigint,
    khash      bigint,
    updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        b.account_id,
        b.credits,
        b.khash,
        b.updated_at
    FROM wallet.service_user_balance(p_user_id) AS b;
$$;

ALTER FUNCTION public.proxy_service_user_balance(uuid) OWNER TO service_role;

REVOKE ALL ON FUNCTION public.proxy_service_user_balance(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.proxy_service_user_balance(uuid)
TO service_role;

COMMENT ON FUNCTION public.proxy_service_user_balance(uuid) IS
'Public-schema PostgREST bridge to wallet.service_user_balance(uuid). Exposes a narrow service-role-only read path for backend bridges such as mc_auth while keeping the wallet schema private. SECURITY DEFINER with empty search_path; inner RPC is schema-qualified and read-only.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_service_user_balance(uuid);
NOTIFY pgrst, 'reload schema';
