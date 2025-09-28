drop function if exists public.proxy_send_user_message(uuid, text, text, text);

create function public.proxy_send_user_message(
  p_receiver uuid,
  p_title text,
  p_description text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  p_sender uuid := auth.uid();
begin
  if p_sender is null then
    raise exception 'You must be logged in to send a message.';
  end if;

  if p_sender = p_receiver then
    raise exception 'You cannot send a message to yourself.';
  end if;

  if length(p_title) > 100
   or p_title ~* '<[^>]*>'
   or p_title ~* '(onerror|onload)\s*='
   or p_title ~ '[[:cntrl:]]'
   or p_title ~ '[\u200B-\u200F\u2028\u2029]' then
  raise exception 'Title contains disallowed content.';
end if;

-- Description: 300 max, same rules
if length(p_description) > 300
   or p_description ~* '<[^>]*>'
   or p_description ~* '(onerror|onload)\s*='
   or p_description ~ '[[:cntrl:]]'
   or p_description ~ '[\u200B-\u200F\u2028\u2029]' then
  raise exception 'Description contains disallowed content.';
end if;

-- Message: 5000 max, still strong but avoids false positives
if length(p_message) > 5000
   or p_message ~* '<[^>]*>'
   or p_message ~* '(onerror|onload)\s*='
   or p_message ~ '[[:cntrl:]]'
   or p_message ~ '[\u200B-\u200F\u2028\u2029]' then
  raise exception 'Message contains disallowed content.';
end if;

  -- Enforce no encryption (for now)
  perform private.send_user_message(
    p_sender,
    p_receiver,
    p_title,
    p_description,
    p_message,
    ''
  );
end;
$$;

-- Lock it to signed-in users only
revoke all on function public.proxy_send_user_message(uuid, text, text, text) from public;
grant execute on function public.proxy_send_user_message(uuid, text, text, text) to authenticated;
