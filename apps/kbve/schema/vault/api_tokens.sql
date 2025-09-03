-- ===================================================================
-- API TOKENS VAULT SYSTEM
-- Secure token storage using Supabase Vault with RLS protection
-- ===================================================================

-- 0. Ensure private schema exists
create schema if not exists private;

-- 1. Core API Tokens Reference Table
-- This table holds references to vault secrets and provides auth mapping
create table private.api_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    token_name text not null, -- user-facing label like "discord_bot" or "github_api"
    service text not null, -- service category like "discord", "github", "openai", etc
    vault_key text not null, -- actual vault path: "user/{user_id}/tokens/{service}/{token_name}"
    description text, -- optional description for the user
    is_active boolean default true, -- allow disabling tokens without deletion
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- Ensure unique token names per user per service
    constraint unique_user_service_token_name unique (user_id, service, token_name)
);

-- Indexing for performance
create index idx_api_tokens_user_id on private.api_tokens(user_id);
create index idx_api_tokens_service on private.api_tokens(service);
create index idx_api_tokens_active on private.api_tokens(is_active) where is_active = true;

-- Enable RLS and lock down access
alter table private.api_tokens enable row level security;

create policy "No access by default" on private.api_tokens for all using (false);

-- Revoke all default permissions
revoke all on private.api_tokens from anon, authenticated, public;
grant all on private.api_tokens to service_role;

-- ===================================================================
-- 2. INTERNAL FUNCTIONS (Service Role Only)
-- ===================================================================

-- Internal function to create/update API tokens
create or replace function private.set_api_token_internal(
    p_user_id uuid,
    p_token_name text,
    p_service text,
    p_token_value text,
    p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = private, vault, public
as $$
declare
    v_vault_key text;
    v_secret_id uuid;
    v_token_id uuid;
    v_clean_token_name text;
    v_clean_service text;
begin
    -- Validate user exists
    if not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Invalid user_id';
    end if;
    
    -- Validate and clean token_name (allow more flexibility than secrets)
    if p_token_name !~ '^[a-zA-Z0-9_-]{3,64}$' then
        raise exception 'Invalid token_name format. Only a-z, A-Z, 0-9, underscore, and dash (3-64 chars) allowed.';
    end if;
    v_clean_token_name := lower(trim(p_token_name));
    
    -- Validate and clean service name
    if p_service !~ '^[a-z0-9_]{2,32}$' then
        raise exception 'Invalid service format. Only lowercase a-z, 0-9, underscore (2-32 chars) allowed.';
    end if;
    v_clean_service := lower(trim(p_service));
    
    -- Build vault key path
    v_vault_key := format('user/%s/tokens/%s/%s', p_user_id, v_clean_service, v_clean_token_name);
    
    -- Create or update the secret in vault
    begin
        select vault.create_secret(
            p_token_value, 
            v_vault_key, 
            format('API Token: %s/%s for user %s', v_clean_service, v_clean_token_name, p_user_id)
        ) into v_secret_id;
    exception 
        when unique_violation then
            -- If vault key exists, update the secret
            update vault.secrets 
            set secret = p_token_value, updated_at = now() 
            where name = v_vault_key;
    end;
    
    -- Insert or update the token reference
    insert into private.api_tokens (
        user_id, 
        token_name, 
        service, 
        vault_key, 
        description,
        is_active
    ) values (
        p_user_id, 
        v_clean_token_name, 
        v_clean_service, 
        v_vault_key, 
        p_description,
        true
    )
    on conflict (user_id, service, token_name) 
    do update set
        vault_key = excluded.vault_key,
        description = excluded.description,
        is_active = true,
        updated_at = now()
    returning id into v_token_id;
    
    return v_token_id;
end;
$$;

-- Internal function to retrieve API tokens
create or replace function private.get_api_token_internal(
    p_user_id uuid,
    p_token_id uuid
)
returns text
language plpgsql
security definer
set search_path = private, vault, public
as $$
declare
    v_vault_key text;
    v_token_value text;
begin
    -- Validate user and get vault key
    select vault_key into v_vault_key
    from private.api_tokens
    where id = p_token_id 
      and user_id = p_user_id 
      and is_active = true;
    
    if not found then
        raise exception 'Token not found or not accessible';
    end if;
    
    -- Get decrypted token from vault
    select decrypted_secret into v_token_value
    from vault.decrypted_secrets
    where name = v_vault_key;
    
    if v_token_value is null then
        raise exception 'Token value not found in vault';
    end if;
    
    return v_token_value;
end;
$$;

-- Internal function to delete API tokens
create or replace function private.delete_api_token_internal(
    p_user_id uuid,
    p_token_id uuid
)
returns void
language plpgsql
security definer
set search_path = private, vault, public
as $$
declare
    v_vault_key text;
begin
    -- Get vault key and validate ownership
    select vault_key into v_vault_key
    from private.api_tokens
    where id = p_token_id and user_id = p_user_id;
    
    if not found then
        raise exception 'Token not found or not owned by user';
    end if;
    
    -- Delete from vault first
    delete from vault.secrets where name = v_vault_key;
    
    -- Delete the reference
    delete from private.api_tokens 
    where id = p_token_id and user_id = p_user_id;
end;
$$;

-- Secure the internal functions
revoke all on function private.set_api_token_internal(uuid, text, text, text, text) 
from public, anon, authenticated;
grant execute on function private.set_api_token_internal(uuid, text, text, text, text) 
to service_role;

revoke all on function private.get_api_token_internal(uuid, uuid) 
from public, anon, authenticated;
grant execute on function private.get_api_token_internal(uuid, uuid) 
to service_role;

revoke all on function private.delete_api_token_internal(uuid, uuid) 
from public, anon, authenticated;
grant execute on function private.delete_api_token_internal(uuid, uuid) 
to service_role;

-- ===================================================================
-- 3. PUBLIC PROXY FUNCTIONS (Authenticated Users)
-- ===================================================================

-- Public function to create/update API tokens
create or replace function public.set_api_token(
    p_token_name text,
    p_service text,
    p_token_value text,
    p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $function$
declare
    v_user_id uuid := auth.uid();
    v_token_id uuid;
begin

    -- [TEMP] Disable this function if they are not service role.
    if auth.jwt() ->> 'role' != 'service_role' then
        raise exception 'API token creation is temporarily disabled. Please try again later.';
    end if;

    -- Authentication check
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;
    
    -- Input validation (duplicated for security)
    if p_token_name !~ '^[a-zA-Z0-9_-]{3,64}$' then
        raise exception 'Invalid token name format. Only a-z, A-Z, 0-9, underscore, and dash (3-64 chars) allowed.';
    end if;
    
    if p_service !~ '^[a-z0-9_]{2,32}$' then
        raise exception 'Invalid service format. Only lowercase a-z, 0-9, underscore (2-32 chars) allowed.';
    end if;
    
    if length(p_token_value) < 10 or length(p_token_value) > 1000 then
        raise exception 'Token value must be between 10 and 1000 characters';
    end if;
    
    if p_description is not null and length(p_description) > 500 then
        raise exception 'Description must be 500 characters or less';
    end if;
    
    -- Call internal function
    v_token_id := private.set_api_token_internal(
        v_user_id, 
        p_token_name, 
        p_service, 
        p_token_value, 
        p_description
    );
    
    return v_token_id;
end;
$function$;

-- Public function to retrieve API tokens (for service_role usage)
create or replace function public.get_api_token(
    p_token_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, private
as $function$
declare
    v_user_id uuid := auth.uid();
    v_token_value text;
begin
    -- Authentication check
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;
    
    -- Call internal function
    v_token_value := private.get_api_token_internal(v_user_id, p_token_id);
    
    return v_token_value;
end;
$function$;

-- Public function to list user's API tokens (metadata only, no secrets)
create or replace function public.list_api_tokens()
returns table (
    id uuid,
    token_name text,
    service text,
    description text,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
security definer
set search_path = public, private
as $function$
    select 
        id,
        token_name,
        service,
        description,
        is_active,
        created_at,
        updated_at
    from private.api_tokens
    where user_id = auth.uid()
    order by service, token_name;
$function$;

-- Public function to delete API tokens
create or replace function public.delete_api_token(
    p_token_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
declare
    v_user_id uuid := auth.uid();
begin
    -- Authentication check
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;
    
    -- Call internal function
    perform private.delete_api_token_internal(v_user_id, p_token_id);
end;
$function$;

-- Public function to toggle token active status
create or replace function public.toggle_api_token_status(
    p_token_id uuid,
    p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
declare
    v_user_id uuid := auth.uid();
begin
    -- Authentication check
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;
    
    -- Update token status
    update private.api_tokens
    set is_active = p_is_active,
        updated_at = now()
    where id = p_token_id 
      and user_id = v_user_id;
    
    if not found then
        raise exception 'Token not found or not owned by user';
    end if;
end;
$function$;

-- Secure the public functions
revoke all on function public.set_api_token(text, text, text, text) from public, anon;
grant execute on function public.set_api_token(text, text, text, text) to authenticated;

revoke all on function public.get_api_token(uuid) from public, anon;
grant execute on function public.get_api_token(uuid) to authenticated, service_role;

revoke all on function public.list_api_tokens() from public, anon;
grant execute on function public.list_api_tokens() to authenticated;

revoke all on function public.delete_api_token(uuid) from public, anon;
grant execute on function public.delete_api_token(uuid) to authenticated;

revoke all on function public.toggle_api_token_status(uuid, boolean) from public, anon;
grant execute on function public.toggle_api_token_status(uuid, boolean) to authenticated;

-- ===================================================================
-- 4. VERIFICATION QUERY
-- ===================================================================

-- Check that all tables and functions exist
WITH expected_tables(schema, name) AS (
    VALUES 
    ('private', 'api_tokens')
),
expected_functions(schema, name, arg_types) AS (
    VALUES 
    ('private', 'set_api_token_internal', ARRAY['uuid', 'text', 'text', 'text', 'text']),
    ('private', 'get_api_token_internal', ARRAY['uuid', 'uuid']),
    ('private', 'delete_api_token_internal', ARRAY['uuid', 'uuid']),
    ('public', 'set_api_token', ARRAY['text', 'text', 'text', 'text']),
    ('public', 'get_api_token', ARRAY['uuid']),
    ('public', 'list_api_tokens', ARRAY[]::text[]),
    ('public', 'delete_api_token', ARRAY['uuid']),
    ('public', 'toggle_api_token_status', ARRAY['uuid', 'boolean'])
),
normalized_functions AS (
    SELECT 
        n.nspname AS schema,
        p.proname AS name,
        p.oid,
        (
            SELECT array_agg(format_type(t.oid, NULL)::text ORDER BY a.ordinality)
            FROM unnest(p.proargtypes) WITH ORDINALITY AS a(oid, ordinality)
            JOIN pg_type t ON t.oid = a.oid
        ) AS normalized_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
)

-- Final verification results
SELECT 
    'table' AS type,
    et.schema || '.' || et.name AS identifier,
    CASE 
        WHEN pt.tablename IS NOT NULL THEN 'exists'
        ELSE 'missing'
    END AS status
FROM expected_tables et
LEFT JOIN pg_tables pt ON pt.schemaname = et.schema AND pt.tablename = et.name

UNION ALL

SELECT 
    'function' AS type,
    ef.schema || '.' || ef.name || '(' || array_to_string(ef.arg_types, ', ') || ')' AS identifier,
    CASE 
        WHEN nf.oid IS NOT NULL THEN 'exists'
        ELSE 'missing'
    END AS status
FROM expected_functions ef
LEFT JOIN normalized_functions nf ON ef.schema = nf.schema 
    AND ef.name = nf.name 
    AND coalesce(nf.normalized_args, ARRAY[]::text[]) = ef.arg_types

ORDER BY type, identifier;