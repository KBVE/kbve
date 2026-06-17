-- migrate:up
-- Richer profiles for the hybrid vetting flow (Plan C): the applicant submits
-- profile details (headline/bio/experience/location/links/disciplines) with their
-- membership application; on approval those populate the public talent_profile.
--
-- member_applications.profile_draft holds the submitted-but-unapproved payload:
--   { headline, bio, years_experience, location, links: [{kind,url}], discipline_ids: [..] }
-- talent_profiles gains the public-facing columns the draft maps onto.

alter table jobboard.talent_profiles
    add column if not exists bio      text  not null default '' ,
    add column if not exists location text  not null default '' ,
    add column if not exists links    jsonb not null default '[]';

alter table jobboard.talent_profiles
    add constraint talent_profiles_bio_len_ck check (length(bio) <= 5000) not valid;
alter table jobboard.talent_profiles
    add constraint talent_profiles_location_len_ck check (length(location) <= 120) not valid;
alter table jobboard.talent_profiles
    add constraint talent_profiles_links_arr_ck check (jsonb_typeof(links) = 'array') not valid;

comment on column jobboard.talent_profiles.links is
    'Public structured links: jsonb array of {kind, url} (kind: github/linkedin/website/x/itch/artstation/other).';

alter table jobboard.member_applications
    add column if not exists profile_draft jsonb not null default '{}';

alter table jobboard.member_applications
    add constraint member_applications_profile_draft_obj_ck
        check (jsonb_typeof(profile_draft) = 'object') not valid;

comment on column jobboard.member_applications.profile_draft is
    'Submitted profile payload reviewed during vetting and copied to talent_profiles on approval: { headline, bio, years_experience, location, links:[{kind,url}], discipline_ids:[..] }.';

-- migrate:down
alter table jobboard.member_applications
    drop constraint if exists member_applications_profile_draft_obj_ck;
alter table jobboard.member_applications
    drop column if exists profile_draft;

alter table jobboard.talent_profiles
    drop constraint if exists talent_profiles_bio_len_ck,
    drop constraint if exists talent_profiles_location_len_ck,
    drop constraint if exists talent_profiles_links_arr_ck;
alter table jobboard.talent_profiles
    drop column if exists bio,
    drop column if exists location,
    drop column if exists links;
