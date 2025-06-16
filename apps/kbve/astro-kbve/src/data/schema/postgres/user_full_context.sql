create or replace function private.create_full_user_context(
  user_id uuid,
  username text,
  bio text default '',
  avatar_ulid bytea default null,
  role text default null,
  level smallint default 1,
  credits numeric(15,2) default 0.00,
  khash numeric(15,2) default 0.00
)
returns void
language plpgsql
security definer
as $$
begin
  perform private.create_user_profile(
    user_id,
    username,
    bio,
    avatar_ulid,
    role,
    level
  );

  perform private.create_user_balance(
    user_id,
    credits,
    khash
  );
end;
$$;

grant execute on function private.create_full_user_context(
  uuid, text, text, bytea, text, smallint, numeric, numeric
) to service_role;