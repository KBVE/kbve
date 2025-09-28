-- Table: private.user_messages
create table private.user_messages (
  ulid text primary key default encode(gen_random_bytes(16), 'hex'),
  sender uuid references auth.users(id) on delete cascade on update restrict,
  receiver uuid references auth.users(id) on delete cascade on update restrict,
  title text,
  description text,
  message text,
  encryption text,
  created_at timestamptz default now()
);

-- Indexes for faster lookups
create index idx_user_messages_sender on private.user_messages(sender);
create index idx_user_messages_receiver on private.user_messages(receiver);
create index idx_user_messages_created_at on private.user_messages(created_at);

-- Security: Enable RLS and deny all by default
alter table private.user_messages enable row level security;
create policy "No access to messages" on private.user_messages for all using (false);

-- Grant access only to service_role
grant select, insert, delete, update on private.user_messages to service_role;
