-- Create schema
create schema if not exists private;

-- Table: user_profiles
create table private.user_profiles (
  id uuid primary key references auth.users(id)
    on delete cascade on update restrict,
  avatar_ulid bytea,
  username text unique check (username ~ '^[a-zA-Z0-9_-]{3,30}$'),
  bio text,
  role text,
  level smallint default 1,  -- Changed to smallint for space efficiency
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for user_profiles
create index idx_user_profiles_id on private.user_profiles(id);

-- Table: user_balance
create table private.user_balance (
  user_id uuid primary key references auth.users(id)
    on delete cascade on update restrict,
  credits numeric(15, 2) default 0.00 check (credits >= 0),
  khash numeric(15, 2) default 0.00 check (khash >= 0),
  updated_at timestamptz default now()
);

-- Index for user_balance
create index idx_user_balance_user_id on private.user_balance(user_id);

-- Auto-initialize user_balance when new user is created
create or replace function private.initialize_user_balance()
returns trigger as $$
begin
  insert into private.user_balance (user_id, credits, khash, updated_at)
  values (NEW.id, 0.00, 0.00, now())
  on conflict do nothing;
  return NEW;
end;
$$ language plpgsql;

create trigger initialize_user_balance_trigger
after insert on auth.users
for each row
execute procedure private.initialize_user_balance();

-- Table: ledger
create table private.ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references private.user_balance(user_id)
    on delete cascade on update restrict,
  kind text check (kind in ('credit', 'khash')),
  delta numeric(15, 2) not null,
  reason text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Indexes for performance
create index idx_ledger_user_id_created_at on private.ledger(user_id, created_at);
create index idx_ledger_kind on private.ledger(kind);

-- Trigger function to apply ledger delta with rollback protection and locking
create or replace function private.apply_ledger_delta()
returns trigger as $$
declare
  new_credits numeric(15,2);
  new_khash numeric(15,2);
begin
  if NEW.kind = 'credit' then
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

-- Secure user-initiated transfer via RPC (with user-friendly errors and credit fee)
create or replace function private.transfer_balance_rpc(
  to_user uuid,
  kind text,
  amount numeric(15, 2),
  reason text default 'user transfer',
  meta jsonb default '{}'
)
returns void
language plpgsql
security definer
as $$
declare
  from_user uuid := auth.uid();
  fee numeric(15, 2);
  total_deduction numeric(15, 2);
begin
  if amount <= 0 then
    raise exception 'Please enter a positive amount to transfer.';
  end if;

  if from_user = to_user then
    raise exception 'You cannot transfer to your own account.';
  end if;

  if kind not in ('credit', 'khash') then
    raise exception 'Invalid transfer type. Please select credit or khash.';
  end if;

  if kind = 'credit' then
    fee := round(amount * 0.01 + 10.00, 2);
  else
    fee := 0.00;
  end if;

  total_deduction := amount + fee;

  -- Use implicit transaction behavior; let any failure roll back the whole function
  insert into private.ledger (user_id, kind, delta, reason, meta)
  values (from_user, kind, -total_deduction, reason || ' (debit, includes fee)', meta);

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
