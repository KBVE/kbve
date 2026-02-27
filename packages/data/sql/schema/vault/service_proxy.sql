-- ===================================================================
-- SERVICE-PROXY FUNCTIONS FOR USER API TOKENS
-- Public-schema wrappers that accept an explicit user_id parameter,
-- restricted to service_role only. These allow the Discord bot (and
-- other service-role callers) to manage tokens on behalf of users.
-- Each function delegates to the corresponding private.* internal.
-- ===================================================================

BEGIN;

-- 1. Set (create/update) a user's API token
create or replace function public.service_set_api_token(
    p_user_id uuid,
    p_token_name text,
    p_service text,
    p_token_value text,
    p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.jwt() ->> 'role' != 'service_role' then
        raise exception 'Access denied: service_role required';
    end if;

    return private.set_api_token_internal(
        p_user_id, p_token_name, p_service, p_token_value, p_description
    );
end;
$$;

revoke all on function public.service_set_api_token(uuid, text, text, text, text)
    from public, anon, authenticated;
grant execute on function public.service_set_api_token(uuid, text, text, text, text)
    to service_role;

-- 2. Get (retrieve decrypted) a user's API token
create or replace function public.service_get_api_token(
    p_user_id uuid,
    p_token_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.jwt() ->> 'role' != 'service_role' then
        raise exception 'Access denied: service_role required';
    end if;

    return private.get_api_token_internal(p_user_id, p_token_id);
end;
$$;

revoke all on function public.service_get_api_token(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.service_get_api_token(uuid, uuid)
    to service_role;

-- 3. List a user's API tokens (metadata only, no secrets)
create or replace function public.service_list_api_tokens(
    p_user_id uuid
)
returns table (
    id uuid,
    token_name text,
    service text,
    description text,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.jwt() ->> 'role' != 'service_role' then
        raise exception 'Access denied: service_role required';
    end if;

    if not exists (select 1 from auth.users where auth.users.id = p_user_id) then
        raise exception 'Invalid user_id';
    end if;

    return query
    select
        t.id,
        t.token_name,
        t.service,
        t.description,
        t.is_active,
        t.created_at,
        t.updated_at
    from private.api_tokens t
    where t.user_id = p_user_id
    order by t.service, t.token_name;
end;
$$;

revoke all on function public.service_list_api_tokens(uuid)
    from public, anon, authenticated;
grant execute on function public.service_list_api_tokens(uuid)
    to service_role;

-- 4. Delete a user's API token
create or replace function public.service_delete_api_token(
    p_user_id uuid,
    p_token_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.jwt() ->> 'role' != 'service_role' then
        raise exception 'Access denied: service_role required';
    end if;

    perform private.delete_api_token_internal(p_user_id, p_token_id);
end;
$$;

revoke all on function public.service_delete_api_token(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.service_delete_api_token(uuid, uuid)
    to service_role;

-- 5. Toggle a user's API token active status
create or replace function public.service_toggle_api_token_status(
    p_user_id uuid,
    p_token_id uuid,
    p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.jwt() ->> 'role' != 'service_role' then
        raise exception 'Access denied: service_role required';
    end if;

    update private.api_tokens
    set is_active = p_is_active,
        updated_at = now()
    where id = p_token_id
      and user_id = p_user_id;

    if not found then
        raise exception 'Token not found or not owned by user';
    end if;
end;
$$;

revoke all on function public.service_toggle_api_token_status(uuid, uuid, boolean)
    from public, anon, authenticated;
grant execute on function public.service_toggle_api_token_status(uuid, uuid, boolean)
    to service_role;

COMMIT;
