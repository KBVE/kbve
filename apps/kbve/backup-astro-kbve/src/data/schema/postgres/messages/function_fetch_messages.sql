create or replace function private.fetch_user_messages(p_user_id uuid)
returns setof private.user_messages
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if p_user_id is null then
    raise exception 'Invalid user ID.';
  end if;

  return query
    select *
    from private.user_messages
    where sender = p_user_id
       or receiver = p_user_id
    order by created_at desc;
end;
$$;

revoke all on function private.fetch_user_messages(uuid) from public, authenticated, anon;
grant execute on function private.fetch_user_messages(uuid) to service_role;
