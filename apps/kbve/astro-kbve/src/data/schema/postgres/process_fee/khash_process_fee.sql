drop function if exists private.khash_process_fee(uuid, numeric);

create function private.khash_process_fee(
  p_user_id uuid,
  p_amount numeric(15,2)
)
returns void
language plpgsql
security definer
as $$
declare
  new_balance numeric(15,2);
begin
  if p_user_id is null or p_amount <= 0 then
    raise exception 'Invalid user or amount.';
  end if;

  select khash - p_amount
    into new_balance
    from private.user_balance
    where user_id = p_user_id
    for update;

  if new_balance is null then
    raise exception 'User balance record not found.';
  end if;

  if new_balance < 0 then
    raise exception 'Insufficient khash for fee processing.';
  end if;

  update private.user_balance
    set khash = new_balance,
        updated_at = now()
    where user_id = p_user_id;
end;
$$;

revoke all on function private.khash_process_fee(uuid, numeric) from public, authenticated, anon;
grant execute on function private.khash_process_fee(uuid, numeric) to service_role;
