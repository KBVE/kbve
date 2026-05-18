-- migrate:up

CREATE OR REPLACE FUNCTION wallet.service_user_balance(p_user_id uuid)
RETURNS TABLE(
    account_id uuid,
    credits bigint,
    khash bigint,
    updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT b.account_id, b.credits, b.khash, b.updated_at
    FROM wallet.balance b
    JOIN wallet.account a ON a.id = b.account_id
    WHERE a.kind = 'user' AND a.user_id = p_user_id
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION wallet.service_user_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_user_balance(uuid) TO service_role;
ALTER FUNCTION wallet.service_user_balance(uuid) OWNER TO service_role;

COMMENT ON FUNCTION wallet.service_user_balance(uuid) IS
'Service-role read of the current wallet balance for a Supabase user. Returns the row from wallet.balance for the user kind account, or no rows if the user has no wallet yet. Used by backend bridges (mc_auth) that hold service-role JWTs and can not authenticate against /auth/v1/user.';

-- migrate:down

DROP FUNCTION IF EXISTS wallet.service_user_balance(uuid);
