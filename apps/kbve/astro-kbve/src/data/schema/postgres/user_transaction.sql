-- Create schema
create schema if not exists private;

-- Table: user_profiles
create table private.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  avatar_ulid bytea,
  username text,
  bio text,
  role text,
  level int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table: user_balance
create table private.user_balance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits numeric(1000, 2) default 0.00 check (credits >= 0),
  khash numeric(1000, 2) default 0.00 check (khash >= 0),
  updated_at timestamptz default now()
);

-- Table: ledger
create table private.ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references private.user_balance(user_id) on delete cascade,
  kind text check (kind in ('credit', 'khash')),
  delta numeric(1000, 2) not null,
  reason text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Trigger function to apply ledger delta with rollback protection
create or replace function private.apply_ledger_delta()
returns trigger as $$
declare
  new_credits numeric(1000,2);
  new_khash numeric(1000,2);
begin
  if NEW.kind = 'credit' then
    -- Lock the row to prevent race condition
    select credits + NEW.delta into new_credits 
    from private.user_balance 
    where user_id = NEW.user_id
    for update;

    if new_credits < 0 then
      raise exception 'Insufficient credit balance for user %', NEW.user_id;
    end if;

    update private.user_balance
    set credits = new_credits,
        updated_at = now()
    where user_id = NEW.user_id;

  elsif NEW.kind = 'khash' then
    -- Lock the row to prevent race condition
    select khash + NEW.delta into new_khash 
    from private.user_balance 
    where user_id = NEW.user_id
    for update;

    if new_khash < 0 then
      raise exception 'Insufficient khash balance for user %', NEW.user_id;
    end if;

    update private.user_balance
    set khash = new_khash,
        updated_at = now()
    where user_id = NEW.user_id;
  end if;

  return NEW;
end;
$$ language plpgsql;

-- Trigger for ledger insert
create trigger apply_ledger_delta_trigger
after insert on private.ledger
for each row
execute procedure private.apply_ledger_delta();

-- RPC Function: secure user-to-user transfer
create or replace function private.transfer_balance_rpc(
  to_user uuid,
  kind text,
  amount numeric(1000, 2),
  reason text default 'user transfer',
  meta jsonb default '{}'
)
returns void
language plpgsql
security definer
as $$
declare
  from_user uuid := auth.uid();
begin
  if amount <= 0 then
    raise exception 'Transfer amount must be positive';
  end if;

  if from_user = to_user then
    raise exception 'Cannot transfer to yourself';
  end if;

  if kind not in ('credit', 'khash') then
    raise exception 'Invalid kind. Must be credit or khash';
  end if;

  insert into private.ledger (user_id, kind, delta, reason, meta)
  values (from_user, kind, -amount, reason || ' (debit)', meta);

  insert into private.ledger (user_id, kind, delta, reason, meta)
  values (to_user, kind, amount, reason || ' (credit)', meta);
end;
$$;

-- Grant execution of the RPC to authenticated users only
grant execute on function private.transfer_balance_rpc(uuid, text, numeric, text, jsonb)
  to authenticated;

-- Materialized View for public consumption
create materialized view public.user_balances_view as
select
  u.id as user_id,
  u.username,
  u.role,
  b.credits,
  b.khash,
  u.level,
  u.created_at
from private.user_profiles u
join private.user_balance b on u.id = b.user_id;

-- Grant public read access to the view
grant select on public.user_balances_view to anon, authenticated;

-- Enable RLS and deny all direct access by default
alter table private.user_profiles enable row level security;
create policy "No access to profiles" on private.user_profiles for all using (false);

alter table private.user_balance enable row level security;
create policy "No access to balances" on private.user_balance for all using (false);

alter table private.ledger enable row level security;
create policy "No access to ledger" on private.ledger for all using (false);
