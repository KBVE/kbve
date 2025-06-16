create or replace function private.create_user_balance(
  user_id uuid,
  credits numeric(15,2) default 0.00,
  khash numeric(15,2) default 0.00
)
returns void
language plpgsql
security definer
as $$
declare
  already_exists boolean;
begin
  -- Validate non-negative values
  if credits < 0 then
    raise exception 'Initial credits must be >= 0.';
  end if;

  if khash < 0 then
    raise exception 'Initial khash must be >= 0.';
  end if;

  -- Prevent duplicates
  select exists (
    select 1 from private.user_balance where user_id = create_user_balance.user_id
  ) into already_exists;

  if already_exists then
    raise exception 'User balance already exists for user_id %', user_id;
  end if;

  -- Insert balance row
  insert into private.user_balance (
    user_id, credits, khash, updated_at
  )
  values (
    user_id, credits, khash, now()
  );
end;
$$;

-- Grant execution to service role
grant execute on function private.create_user_balance(uuid, numeric, numeric) to service_role;
