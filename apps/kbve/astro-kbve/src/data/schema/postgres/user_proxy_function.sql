drop function if exists public.transfer_balance_proxy(uuid, text, numeric, text, jsonb);

create function public.transfer_balance_proxy(
  p_to_user uuid,
  p_kind text,
  p_amount numeric(15,2),
  p_reason text default 'user transfer',
  p_meta jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  p_from_user uuid := auth.uid();
  p_balance numeric := 0;
  p_fee numeric;
  p_total numeric;
  recent_transfer timestamp;
begin
  if p_from_user is null then
    raise exception 'You must be logged in to perform a transfer.';
  end if;

  if p_to_user = p_from_user then
    raise exception 'Cannot transfer to your own account.';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than 0.';
  end if;

  if p_kind not in ('credit', 'khash') then
    raise exception 'Invalid transfer kind.';
  end if;

  -- Sanitize and validate p_reason
  if length(p_reason) > 100 or p_reason ~ '[^a-zA-Z0-9 _\\-()]' then
    raise exception 'Reason contains invalid characters or is too long.';
  end if;

  -- Optional: Validate p_meta size (defensive)
  if length(p_meta::text) > 1000 then
    raise exception 'Metadata is too large.';
  end if;

  -- Rate limiting: one transfer per minute per user
  select max(created_at)
    into recent_transfer
    from private.ledger
    where user_id = p_from_user
      and reason like 'user transfer%'
      and created_at > now() - interval '1 minute';

  if recent_transfer is not null then
    raise exception 'Please wait at least 1 minute between transfers.';
  end if;

  -- Fee logic
  p_fee := case
    when p_kind = 'credit' then round(p_amount * 0.01 + 10.00, 2)
    else 0.00
  end;

  p_total := p_amount + p_fee;

  -- Use authoritative balance source
  if p_kind = 'credit' then
    select credits into p_balance from private.user_balance where user_id = p_from_user;
  else
    select khash into p_balance from private.user_balance where user_id = p_from_user;
  end if;

  if coalesce(p_balance, 0) < p_total then
    raise exception 'Insufficient %s balance. Available: %s Required: %s', p_kind, p_balance, p_total;
  end if;

  -- Perform the secure internal transfer
  perform private.transfer_balance_rpc(
    p_to_user,
    p_kind,
    p_amount,
    p_reason,
    p_meta
  );
end;
$$;

-- Expose only to signed-in users
revoke all on function public.transfer_balance_proxy(uuid, text, numeric, text, jsonb) from public;
grant execute on function public.transfer_balance_proxy(uuid, text, numeric, text, jsonb) to authenticated;
