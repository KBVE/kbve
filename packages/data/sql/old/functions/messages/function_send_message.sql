drop function if exists private.send_user_message(uuid, uuid, text, text, text, text);

create function private.send_user_message(
  p_sender uuid,
  p_receiver uuid,
  p_title text,
  p_description text,
  p_message text,
  p_encryption text default ''
)
returns void
language plpgsql
security definer
as $$
begin
  if p_sender is null or p_receiver is null then
    raise exception 'Sender and receiver must be valid users.';
  end if;

  if p_sender = p_receiver then
    raise exception 'Cannot send a message to yourself.';
  end if;

  if length(p_title) > 100 then
    raise exception 'Title too long (max 100 characters).';
  end if;

  if length(p_description) > 300 then
    raise exception 'Description too long (max 300 characters).';
  end if;

  if length(p_message) > 5000 then
    raise exception 'Message too long (max 5000 characters).';
  end if;

  if p_encryption is distinct from '' then
    raise exception 'Encryption is not supported yet. Must be blank.';
  end if;

  if p_title ~ '<[^>]+>' or p_description ~ '<[^>]+>' or p_message ~ '<[^>]+>' then
    raise exception 'Message contains disallowed HTML content.';
  end if;

  -- 💸 Deduct messaging fee (e.g. 1.00 credit)
  perform private.credit_process_fee(p_sender, 1.00);

  insert into private.user_messages (
    ulid,
    sender,
    receiver,
    title,
    description,
    message,
    encryption
  )
  values (
    gen_ulid(),
    p_sender,
    p_receiver,
    trim(p_title),
    trim(p_description),
    trim(p_message),
    ''
  );
end;
$$;

-- Access control
revoke all on function private.send_user_message(uuid, uuid, text, text, text, text) from public, authenticated, anon;
grant execute on function private.send_user_message(uuid, uuid, text, text, text, text) to service_role;
