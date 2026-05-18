-- migrate:up

CREATE OR REPLACE FUNCTION wallet.service_user_balance(p_user_id uuid)
RETURNS TABLE(
    account_id uuid,
    credits bigint,
    khash bigint,
    updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT b.account_id, b.credits, b.khash, b.updated_at
    FROM wallet.account a
    JOIN wallet.balance b ON b.account_id = a.id
    WHERE a.kind = 'user'
      AND a.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION wallet.service_user_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_user_balance(uuid) TO service_role;
ALTER FUNCTION wallet.service_user_balance(uuid) OWNER TO service_role;

COMMENT ON FUNCTION wallet.service_user_balance(uuid) IS
'Service-role read of the current wallet balance for a Supabase user. Returns the row from wallet.balance for the user-kind account, or no rows if the user has no wallet yet OR (corruption case) the account row exists with no matching balance row. The partial unique index wallet_account_user_uq guarantees at most one user-kind account per user_id, so LIMIT 1 is intentionally omitted — duplicate rows surface as multiple results rather than silently selecting one. STABLE because the function only reads tables and never writes. Used by backend bridges (mc_auth) that hold service-role JWTs and cannot authenticate against /auth/v1/user.';

-- migrate:down

DROP FUNCTION IF EXISTS wallet.service_user_balance(uuid);
