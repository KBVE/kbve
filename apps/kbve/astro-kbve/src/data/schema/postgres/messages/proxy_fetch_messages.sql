drop function if exists public.proxy_fetch_user_messages();

create function public.proxy_fetch_user_messages()
returns setof private.user_messages
language plpgsql
security definer
set search_path = private, public
as $$
declare
  p_user_id uuid := auth.uid();
begin
  if p_user_id is null then
    raise exception 'You must be logged in to fetch messages.';
  end if;

  return query
    select *
    from private.user_messages
    where sender = p_user_id
       or receiver = p_user_id
    order by created_at desc;
end;
$$;

-- Lock it to signed-in users only
revoke all on function public.proxy_fetch_user_messages() from public;
grant execute on function public.proxy_fetch_user_messages() to authenticated;
