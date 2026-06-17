-- migrate:up
-- Richer profiles for the hybrid vetting flow (Plan C): the applicant submits a
-- profile_draft with their membership application; on approval the draft is
-- normalized into public profile rows (talent_profiles + talent_verticals +
-- talent_taxonomy) by the decision handler. The draft is the review envelope;
-- links + disciplines become relational on approval.
--
-- profile_draft shape (validated below):
--   { headline, bio, years_experience, location, links:[{kind,url}], discipline_ids:[..] }

alter table jobboard.talent_profiles
    add column bio      text  not null default '',
    add column location text  not null default '',
    add column links    jsonb not null default '[]'::jsonb;

alter table jobboard.member_applications
    add column profile_draft jsonb not null default '{}'::jsonb;

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

create or replace function jobboard.is_valid_profile_draft(p_draft jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
    select
        jsonb_typeof(p_draft) = 'object'
        and octet_length(p_draft::text) <= 32768
        and p_draft - array[
            'headline', 'bio', 'years_experience', 'location', 'links', 'discipline_ids'
        ] = '{}'::jsonb
        and (
            not p_draft ? 'headline'
            or (jsonb_typeof(p_draft -> 'headline') = 'string'
                and length(p_draft ->> 'headline') <= 200)
        )
        and (
            not p_draft ? 'bio'
            or (jsonb_typeof(p_draft -> 'bio') = 'string'
                and length(p_draft ->> 'bio') <= 5000)
        )
        and (
            not p_draft ? 'location'
            or (jsonb_typeof(p_draft -> 'location') = 'string'
                and length(p_draft ->> 'location') <= 120)
        )
        and (
            not p_draft ? 'years_experience'
            or (jsonb_typeof(p_draft -> 'years_experience') = 'number'
                and (p_draft ->> 'years_experience') ~ '^[0-9]+$'
                and (p_draft ->> 'years_experience')::integer between 0 and 100)
        )
        and (
            not p_draft ? 'links'
            or jobboard.is_valid_profile_links(p_draft -> 'links')
        )
        and (
            not p_draft ? 'discipline_ids'
            or (jsonb_typeof(p_draft -> 'discipline_ids') = 'array'
                and jsonb_array_length(p_draft -> 'discipline_ids') <= 20
                and not exists (
                    select 1
                    from jsonb_array_elements(p_draft -> 'discipline_ids') as d(value)
                    where jsonb_typeof(d.value) <> 'number'
                       or (d.value #>> '{}') !~ '^[1-9][0-9]*$'
                ))
        );
$$;

revoke all on function jobboard.is_valid_profile_links(jsonb) from public;
revoke all on function jobboard.is_valid_profile_draft(jsonb) from public;
alter function jobboard.is_valid_profile_links(jsonb) owner to postgres;
alter function jobboard.is_valid_profile_draft(jsonb) owner to postgres;

alter table jobboard.talent_profiles
    add constraint talent_profiles_bio_len_ck check (length(bio) <= 5000),
    add constraint talent_profiles_location_len_ck check (length(location) <= 120),
    add constraint talent_profiles_links_valid_ck check (jobboard.is_valid_profile_links(links));

alter table jobboard.member_applications
    add constraint member_applications_profile_draft_valid_ck
        check (jobboard.is_valid_profile_draft(profile_draft));

comment on column jobboard.talent_profiles.links is
    'Public profile links: validated jsonb array (max 20) of {kind, url}; kind in github/linkedin/website/x/itch/artstation/other, url https-only <=2048 chars.';
comment on column jobboard.member_applications.profile_draft is
    'Unapproved profile submission ({ headline, bio, years_experience, location, links, discipline_ids }) reviewed during vetting and transactionally normalized into public profile tables on approval.';

-- migrate:down
alter table jobboard.member_applications
    drop constraint if exists member_applications_profile_draft_valid_ck;
alter table jobboard.talent_profiles
    drop constraint if exists talent_profiles_bio_len_ck,
    drop constraint if exists talent_profiles_location_len_ck,
    drop constraint if exists talent_profiles_links_valid_ck;

drop function if exists jobboard.is_valid_profile_draft(jsonb);
drop function if exists jobboard.is_valid_profile_links(jsonb);

alter table jobboard.member_applications
    drop column if exists profile_draft;
alter table jobboard.talent_profiles
    drop column if exists bio,
    drop column if exists location,
    drop column if exists links;
