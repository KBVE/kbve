create or replace function private.create_user_profile(
  user_id uuid,
  username text,
  bio text default '',
  avatar_ulid bytea default null,
  role text default null,
  level smallint default 1
)
returns void
language plpgsql
security definer
as $$
declare
  username_taken boolean;
begin
  -- Validate username format
  if username !~ '^[a-zA-Z0-9_-]{3,30}$' then
    raise exception 'Invalid username. Must be 3–30 chars, only letters, numbers, underscores, or dashes.';
  end if;

  -- Check for uniqueness
  select exists (
    select 1 from private.user_profiles where username = create_user_profile.username
  ) into username_taken;

  if username_taken then
    raise exception 'Username already taken.';
  end if;

  -- Perform insert
  insert into private.user_profiles (
    id, username, bio, avatar_ulid, role, level, created_at, updated_at
  )
  values (
    user_id, username, bio, avatar_ulid, role, level, now(), now()
  );
end;
$$;

grant execute on function private.create_user_profile(uuid, text, text, bytea, text, smallint) to service_role;
