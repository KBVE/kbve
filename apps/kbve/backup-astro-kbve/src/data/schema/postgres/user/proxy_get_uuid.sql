drop function if exists public.proxy_get_uuid(text);

create function public.proxy_get_uuid(p_username text)
returns uuid
language plpgsql
security definer
set search_path = private, public
as $$
declare
  result uuid;
begin
  if length(p_username) < 3 or length(p_username) > 30
     or p_username !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username format.';
  end if;

  select id into result
  from private.user_profiles
  where username = p_username;

  if result is null then
    raise exception 'Username not found.';
  end if;

  return result;
end;
$$;

revoke all on function public.proxy_get_uuid(text) from public;
grant execute on function public.proxy_get_uuid(text) to authenticated;
