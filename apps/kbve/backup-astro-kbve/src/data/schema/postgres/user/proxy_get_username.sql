drop function if exists public.proxy_get_username(uuid);

create function public.proxy_get_username(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = private, public
as $$
declare
  result text;
begin
  if p_user_id is null then
    raise exception 'Invalid user ID.';
  end if;

  select username into result
  from private.user_profiles
  where id = p_user_id;

  if result is null then
    raise exception 'User not found.';
  end if;

  return result;
end;
$$;

revoke all on function public.proxy_get_username(uuid) from public;
grant execute on function public.proxy_get_username(uuid) to authenticated;
