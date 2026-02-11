drop function if exists public.get_user_balance_context(text, boolean);

create function public.get_user_balance_context(
  p_identifier text,
  use_cache boolean default true
)
returns table (
  user_id uuid,
  username text,
  role text,
  credits numeric,
  khash numeric,
  level integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if use_cache then
    return query
      select
        v.user_id,
        v.username,
        v.role,
        v.credits,
        v.khash,
        v.level,
        v.created_at
      from public.user_balances_view v
      where v.user_id::text = p_identifier or v.username = p_identifier;
  else
    return query
      select
        u.id as user_id,
        u.username,
        u.role,
        b.credits,
        b.khash,
        u.level,
        u.created_at
      from private.user_profiles u
      join private.user_balance b on u.id = b.user_id
      where u.id::text = p_identifier or u.username = p_identifier;
  end if;
end;
$$;

-- Access control
revoke all on function public.get_user_balance_context(text, boolean) from public;
grant execute on function public.get_user_balance_context(text, boolean) to authenticated;
