-- migrate:up

-- Per-kind host lock for profile links. github/linkedin/itch/artstation/x are
-- pinned to their canonical host (apex + subdomains: user.itch.io,
-- gist.github.com). x accepts x.com or twitter.com. website/other = any https
-- host. Mirrors apps/jobboard/web/src/lib/profileDraft.ts (hostOk).
create or replace function jobboard.link_host_ok(p_kind text, p_url text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
    with h as (
        select lower(
            split_part(substring(p_url from '^https?://([^/?#]+)'), ':', 1)
        ) as host
    )
    select case p_kind
        when 'github' then host = 'github.com' or host like '%.github.com'
        when 'linkedin' then host = 'linkedin.com' or host like '%.linkedin.com'
        when 'itch' then host = 'itch.io' or host like '%.itch.io'
        when 'artstation'
            then host = 'artstation.com' or host like '%.artstation.com'
        when 'x'
            then host in ('x.com', 'twitter.com')
                or host like '%.x.com' or host like '%.twitter.com'
        else true
    end
    from h;
$$;

revoke all on function jobboard.link_host_ok(text, text) from public;
alter function jobboard.link_host_ok(text, text) owner to postgres;

create or replace function jobboard.is_valid_profile_links(p_links jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
    select
        jsonb_typeof(p_links) = 'array'
        and jsonb_array_length(p_links) <= 20
        and octet_length(p_links::text) <= 16384
        and not exists (
            select 1
            from jsonb_array_elements(p_links) as item(value)
            where jsonb_typeof(item.value) <> 'object'
               or not item.value ?& array['kind', 'url']
               or item.value - array['kind', 'url'] <> '{}'::jsonb
               or jsonb_typeof(item.value -> 'kind') <> 'string'
               or jsonb_typeof(item.value -> 'url') <> 'string'
               or item.value ->> 'kind' not in (
                    'github', 'linkedin', 'website', 'x', 'itch', 'artstation', 'other'
               )
               or length(item.value ->> 'url') not between 1 and 2048
               or item.value ->> 'url' !~* '^https://'
               or not jobboard.link_host_ok(
                    item.value ->> 'kind', item.value ->> 'url'
               )
        );
$$;

-- migrate:down

create or replace function jobboard.is_valid_profile_links(p_links jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
    select
        jsonb_typeof(p_links) = 'array'
        and jsonb_array_length(p_links) <= 20
        and octet_length(p_links::text) <= 16384
        and not exists (
            select 1
            from jsonb_array_elements(p_links) as item(value)
            where jsonb_typeof(item.value) <> 'object'
               or not item.value ?& array['kind', 'url']
               or item.value - array['kind', 'url'] <> '{}'::jsonb
               or jsonb_typeof(item.value -> 'kind') <> 'string'
               or jsonb_typeof(item.value -> 'url') <> 'string'
               or item.value ->> 'kind' not in (
                    'github', 'linkedin', 'website', 'x', 'itch', 'artstation', 'other'
               )
               or length(item.value ->> 'url') not between 1 and 2048
               or item.value ->> 'url' !~* '^https://'
        );
$$;

drop function if exists jobboard.link_host_ok(text, text);
