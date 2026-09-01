-- Extended profile data (identity fields shared across apps)
-- Part of profile schema consolidation (issue #13465)

begin;

-- Validation function for profile links (reusable across schemas)
create or replace function profile.is_valid_profile_links(p_links jsonb)
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

revoke all on function profile.is_valid_profile_links(jsonb) from public;
alter function profile.is_valid_profile_links(jsonb) owner to postgres;

-- Trigger function for updated_at auto-update
create or replace function profile.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := clock_timestamp();
    return new;
end;
$$;

revoke all on function profile.set_updated_at() from public;
alter function profile.set_updated_at() owner to postgres;

-- Extended profiles table (central source of truth for bio/location/avatar/links)
create table if not exists profile.extended_profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    bio        text not null default '' check (length(bio) <= 5000),
    location   text not null default '' check (length(location) <= 120),
    avatar_url text not null default '' check (length(avatar_url) <= 2048),
    links      jsonb not null default '[]'::jsonb
               check (profile.is_valid_profile_links(links)),
    updated_at timestamptz not null default now()
);

comment on table profile.extended_profiles is
    'Central extended profile data (bio, location, avatar, links) shared across all apps. Single source of truth for user identity fields.';

comment on column profile.extended_profiles.bio is
    'User biography (max 5000 chars).';

comment on column profile.extended_profiles.location is
    'Geographic location (max 120 chars).';

comment on column profile.extended_profiles.avatar_url is
    'Profile avatar URL (max 2048 chars, HTTPS recommended).';

comment on column profile.extended_profiles.links is
    'Public profile links: validated jsonb array (max 20) of {kind, url}; kind in github/linkedin/website/x/itch/artstation/other, url https-only <=2048 chars.';

-- Trigger for auto-updating updated_at
create trigger extended_profiles_set_updated_at
    before update on profile.extended_profiles
    for each row execute function profile.set_updated_at();

-- RLS policies
alter table profile.extended_profiles enable row level security;

-- Service-role full access
create policy "service_role_full_access"
    on profile.extended_profiles
    for all
    to service_role
    using (true)
    with check (true);

-- Users can read own profile
create policy "user_read_own"
    on profile.extended_profiles
    for select
    to authenticated
    using (user_id = auth.uid());

-- Users can update own profile
create policy "user_update_own"
    on profile.extended_profiles
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Users can insert own profile (one-time)
create policy "user_insert_own"
    on profile.extended_profiles
    for insert
    to authenticated
    with check (user_id = auth.uid());

-- Revoke direct access (use policies only)
revoke all on table profile.extended_profiles from public, anon, authenticated;

-- Grant via RLS
grant select, insert, update on table profile.extended_profiles to authenticated;
grant all on table profile.extended_profiles to service_role;

commit;
