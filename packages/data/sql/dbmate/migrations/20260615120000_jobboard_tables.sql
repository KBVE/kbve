-- migrate:up
create schema jobboard;

create function jobboard.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := clock_timestamp();
    return new;
end;
$$;

revoke all on function jobboard.set_updated_at() from public;
alter function jobboard.set_updated_at() owner to postgres;

create table jobboard.verticals (
    id          bigint generated always as identity primary key,
    slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    label       text not null check (length(btrim(label)) between 1 and 100),
    description text not null default '',
    status      integer not null default 1 check (status between 0 and 2),
    sort_order  integer not null default 0
);

create table jobboard.taxonomy (
    id          bigint generated always as identity primary key,
    vertical_id bigint not null references jobboard.verticals(id) on delete cascade,
    kind        integer not null check (kind between 1 and 3),
    name        text not null check (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    label       text not null check (length(btrim(label)) between 1 and 100),
    status      integer not null default 1 check (status between 0 and 2),
    unique (vertical_id, kind, name),
    unique (id, vertical_id)
);

create table jobboard.talent_profiles (
    user_id          uuid primary key references auth.users(id) on delete cascade,
    headline         text not null default '',
    years_experience integer not null default 0 check (years_experience between 0 and 100),
    availability     integer not null default 0 check (availability between 0 and 2),
    rate_min         bigint not null default 0,
    rate_max         bigint not null default 0,
    currency         text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
    updated_at       timestamptz not null default now(),
    constraint talent_profiles_rate_ck check (rate_min >= 0 and rate_max >= 0 and rate_min <= rate_max)
);

comment on column jobboard.talent_profiles.rate_min is 'Amount in the currency minor unit, e.g. cents for USD.';
comment on column jobboard.talent_profiles.rate_max is 'Amount in the currency minor unit, e.g. cents for USD.';

create table jobboard.client_profiles (
    user_id      uuid primary key references auth.users(id) on delete cascade,
    org_name     text not null default '',
    company_size integer not null default 0 check (company_size >= 0),
    website      text not null default '',
    about        text not null default '',
    updated_at   timestamptz not null default now()
);

create table jobboard.talent_verticals (
    user_id     uuid not null references jobboard.talent_profiles(user_id) on delete cascade,
    vertical_id bigint not null references jobboard.verticals(id) on delete cascade,
    primary key (user_id, vertical_id)
);

create index jobboard_talent_verticals_vertical_idx on jobboard.talent_verticals (vertical_id, user_id);

create table jobboard.talent_taxonomy (
    user_id     uuid not null,
    vertical_id bigint not null,
    taxonomy_id bigint not null,
    primary key (user_id, taxonomy_id),
    foreign key (user_id, vertical_id)
        references jobboard.talent_verticals(user_id, vertical_id) on delete cascade,
    foreign key (taxonomy_id, vertical_id)
        references jobboard.taxonomy(id, vertical_id) on delete cascade
);

create index jobboard_talent_taxonomy_taxonomy_idx on jobboard.talent_taxonomy (taxonomy_id, user_id);

create table jobboard.client_verticals (
    user_id     uuid not null references jobboard.client_profiles(user_id) on delete cascade,
    vertical_id bigint not null references jobboard.verticals(id) on delete cascade,
    primary key (user_id, vertical_id)
);

create index jobboard_client_verticals_vertical_idx on jobboard.client_verticals (vertical_id, user_id);

create table jobboard.member_applications (
    id                     uuid primary key default public.gen_ulid()::uuid,
    user_id                uuid not null references auth.users(id) on delete cascade,
    requested_capabilities integer not null default 0
        check (requested_capabilities >= 0 and (requested_capabilities & ~3) = 0),
    statement              text not null default '',
    portfolio_links        text[] not null default '{}',
    status                 integer not null default 0 check (status between 0 and 2),
    reviewed_by            uuid references auth.users(id) on delete set null,
    reviewed_at            timestamptz,
    review_notes           text not null default '',
    created_at             timestamptz not null default now(),
    constraint member_applications_review_state_ck check (
        (status = 0 and reviewed_by is null and reviewed_at is null)
        or (status <> 0 and reviewed_at is not null)
    )
);

create unique index jobboard_member_applications_one_pending_uq
    on jobboard.member_applications (user_id) where status = 0;

create table jobboard.member_application_verticals (
    application_id uuid not null references jobboard.member_applications(id) on delete cascade,
    vertical_id    bigint not null references jobboard.verticals(id) on delete cascade,
    primary key (application_id, vertical_id)
);

create index jobboard_member_application_verticals_vertical_idx
    on jobboard.member_application_verticals (vertical_id, application_id);

create table jobboard.portfolio_items (
    id          uuid primary key default public.gen_ulid()::uuid,
    user_id     uuid not null references auth.users(id) on delete cascade,
    vertical_id bigint not null references jobboard.verticals(id) on delete restrict,
    title       text not null check (length(btrim(title)) between 1 and 200),
    description text not null default '',
    source      text not null default '',
    media       jsonb not null default '[]' check (jsonb_typeof(media) = 'array'),
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    unique (id, vertical_id)
);

create index jobboard_portfolio_items_user_idx on jobboard.portfolio_items (user_id);

create table jobboard.portfolio_tags (
    portfolio_item_id uuid not null,
    vertical_id       bigint not null,
    taxonomy_id       bigint not null,
    primary key (portfolio_item_id, taxonomy_id),
    foreign key (portfolio_item_id, vertical_id)
        references jobboard.portfolio_items(id, vertical_id) on delete cascade,
    foreign key (taxonomy_id, vertical_id)
        references jobboard.taxonomy(id, vertical_id) on delete cascade
);

create index jobboard_portfolio_tags_taxonomy_idx on jobboard.portfolio_tags (taxonomy_id, portfolio_item_id);

create table jobboard.gigs (
    id            uuid primary key default public.gen_ulid()::uuid,
    poster_id     uuid references auth.users(id) on delete set null,
    vertical_id   bigint not null references jobboard.verticals(id) on delete restrict,
    title         varchar(120) not null check (length(btrim(title)) between 1 and 120),
    summary       varchar(200) not null default '',
    description   text not null default '',
    budget_type   integer not null default 0 check (budget_type between 0 and 3),
    budget_min    bigint not null default 0,
    budget_max    bigint not null default 0,
    currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
    deadline      timestamptz,
    location_pref integer not null default 0 check (location_pref between 0 and 2),
    status        integer not null default 0 check (status in (0, 1, 2, 4, 8, 16)),
    published_at  timestamptz,
    updated_at    timestamptz not null default now(),
    created_at    timestamptz not null default now(),
    unique (id, vertical_id),
    constraint gigs_budget_ck check (budget_min >= 0 and budget_max >= 0 and budget_min <= budget_max),
    constraint gigs_publication_state_ck check (
        (status = 0 and published_at is null)
        or (status in (2, 4, 8, 16) and published_at is not null)
        or status = 1
    )
);

comment on column jobboard.gigs.budget_min is 'Amount in the currency minor unit, e.g. cents for USD.';
comment on column jobboard.gigs.budget_max is 'Amount in the currency minor unit, e.g. cents for USD.';

create index jobboard_gigs_poster_idx on jobboard.gigs (poster_id);
create index jobboard_gigs_public_feed_idx
    on jobboard.gigs (vertical_id, published_at desc, id desc) where status = 2;
create index jobboard_gigs_public_recent_idx
    on jobboard.gigs (published_at desc, id desc) where status = 2;

create table jobboard.gig_taxonomy (
    gig_id      uuid not null,
    vertical_id bigint not null,
    taxonomy_id bigint not null,
    primary key (gig_id, taxonomy_id),
    foreign key (gig_id, vertical_id)
        references jobboard.gigs(id, vertical_id) on delete cascade,
    foreign key (taxonomy_id, vertical_id)
        references jobboard.taxonomy(id, vertical_id) on delete cascade
);

create index jobboard_gig_taxonomy_taxonomy_idx on jobboard.gig_taxonomy (taxonomy_id, gig_id);

create table jobboard.applications (
    id                 uuid primary key default public.gen_ulid()::uuid,
    gig_id             uuid not null references jobboard.gigs(id) on delete cascade,
    applicant_id       uuid references auth.users(id) on delete set null,
    cover_message      text not null default '',
    proposed_rate      bigint not null default 0 check (proposed_rate >= 0),
    proposed_rate_type integer not null default 0 check (proposed_rate_type between 0 and 3),
    status             integer not null default 0 check (status between 0 and 4),
    created_at         timestamptz not null default now(),
    unique (gig_id, applicant_id)
);

comment on column jobboard.applications.proposed_rate is 'Amount in the currency minor unit, e.g. cents for USD.';

create index jobboard_applications_applicant_created_idx
    on jobboard.applications (applicant_id, created_at desc, id desc);
create index jobboard_applications_gig_status_created_idx
    on jobboard.applications (gig_id, status, created_at, id);

create table jobboard.application_portfolio_items (
    application_id    uuid not null references jobboard.applications(id) on delete cascade,
    portfolio_item_id uuid not null references jobboard.portfolio_items(id) on delete cascade,
    primary key (application_id, portfolio_item_id)
);

create index jobboard_application_portfolio_items_item_idx
    on jobboard.application_portfolio_items (portfolio_item_id, application_id);

create table jobboard.engagements (
    id           uuid primary key default public.gen_ulid()::uuid,
    gig_id       uuid not null references jobboard.gigs(id) on delete cascade,
    poster_id    uuid references auth.users(id) on delete set null,
    taker_id     uuid references auth.users(id) on delete set null,
    status       integer not null default 0 check (status between 0 and 2),
    started_at   timestamptz not null default now(),
    completed_at timestamptz,
    constraint engagements_distinct_parties_ck check (
        poster_id is null or taker_id is null or poster_id <> taker_id
    ),
    constraint engagements_lifecycle_ck check (
        (status = 1 and completed_at is not null and completed_at >= started_at)
        or (status in (0, 2) and completed_at is null)
    )
);

create unique index jobboard_engagements_gig_uq on jobboard.engagements (gig_id);
create index jobboard_engagements_taker_idx on jobboard.engagements (taker_id);
create index jobboard_engagements_poster_idx on jobboard.engagements (poster_id);

create table jobboard.reviews (
    id            uuid primary key default public.gen_ulid()::uuid,
    engagement_id uuid not null references jobboard.engagements(id) on delete cascade,
    reviewer_id   uuid references auth.users(id) on delete set null,
    reviewee_id   uuid references auth.users(id) on delete set null,
    rating        integer not null check (rating between 1 and 5),
    body          text not null default '',
    created_at    timestamptz not null default now(),
    constraint reviews_distinct_users_ck check (
        reviewer_id is null or reviewee_id is null or reviewer_id <> reviewee_id
    )
);

create unique index jobboard_reviews_engagement_reviewer_uq
    on jobboard.reviews (engagement_id, reviewer_id) where reviewer_id is not null;
create index jobboard_reviews_reviewee_created_idx
    on jobboard.reviews (reviewee_id, created_at desc, id desc);

create table jobboard.conversations (
    id         uuid primary key default public.gen_ulid()::uuid,
    gig_id     uuid references jobboard.gigs(id) on delete set null,
    created_at timestamptz not null default now()
);

create table jobboard.conversation_participants (
    id                   uuid primary key default public.gen_ulid()::uuid,
    conversation_id      uuid not null references jobboard.conversations(id) on delete cascade,
    user_id              uuid references auth.users(id) on delete set null,
    joined_at            timestamptz not null default now(),
    left_at              timestamptz,
    last_read_message_id uuid,
    unique (conversation_id, id),
    unique (conversation_id, user_id),
    constraint conversation_participants_dates_ck check (left_at is null or left_at >= joined_at)
);

create index jobboard_conversation_participants_user_idx
    on jobboard.conversation_participants (user_id);

create table jobboard.messages (
    id                    uuid primary key default public.gen_ulid()::uuid,
    conversation_id       uuid not null references jobboard.conversations(id) on delete cascade,
    sender_participant_id uuid not null,
    body                  text not null default '',
    attachments           jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
    created_at            timestamptz not null default now(),
    constraint messages_content_ck check (
        length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0
    ),
    constraint messages_body_len_ck check (length(body) <= 20000),
    constraint messages_attachments_len_ck check (jsonb_array_length(attachments) <= 10),
    constraint messages_conversation_id_id_uq unique (conversation_id, id),
    constraint messages_sender_participant_fk
        foreign key (conversation_id, sender_participant_id)
        references jobboard.conversation_participants (conversation_id, id) on delete no action
);

create index jobboard_messages_conversation_cursor_idx
    on jobboard.messages (conversation_id, created_at desc, id desc);

alter table jobboard.conversation_participants
    add constraint conversation_participants_last_read_fk
    foreign key (conversation_id, last_read_message_id)
    references jobboard.messages (conversation_id, id)
    on delete set null (last_read_message_id);

create table jobboard.notifications (
    id         uuid primary key default public.gen_ulid()::uuid,
    user_id    uuid not null references auth.users(id) on delete cascade,
    kind       integer not null default 0 check (kind in (0, 1, 2, 4, 8, 16)),
    payload    jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
    read_at    timestamptz,
    created_at timestamptz not null default now()
);

create index jobboard_notifications_unread_idx
    on jobboard.notifications (user_id, created_at desc, id desc) where read_at is null;
create index jobboard_notifications_history_idx
    on jobboard.notifications (user_id, created_at desc, id desc);

create table jobboard.reports (
    id          uuid primary key default public.gen_ulid()::uuid,
    reporter_id uuid references auth.users(id) on delete set null,
    target_kind integer not null check (target_kind in (1, 2, 3, 4)),
    target_id   text not null check (length(btrim(target_id)) > 0),
    reason      text not null check (length(btrim(reason)) between 1 and 2000),
    status      integer not null default 0 check (status in (0, 1, 2, 3)),
    created_at  timestamptz not null default now()
);

create index jobboard_reports_queue_idx on jobboard.reports (status, created_at, id);

create table jobboard.audit_log (
    id          uuid primary key default public.gen_ulid()::uuid,
    actor_id    uuid references auth.users(id) on delete set null,
    action      text not null check (length(btrim(action)) between 1 and 100),
    target_kind integer not null default 0 check (target_kind >= 0),
    target_id   text not null default '',
    detail      jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
    created_at  timestamptz not null default now()
);

create index jobboard_audit_log_created_idx on jobboard.audit_log (created_at desc, id desc);

create trigger talent_profiles_set_updated_at
    before update on jobboard.talent_profiles
    for each row execute function jobboard.set_updated_at();
create trigger client_profiles_set_updated_at
    before update on jobboard.client_profiles
    for each row execute function jobboard.set_updated_at();
create trigger gigs_set_updated_at
    before update on jobboard.gigs
    for each row execute function jobboard.set_updated_at();

alter table jobboard.verticals                    enable row level security;
alter table jobboard.taxonomy                     enable row level security;
alter table jobboard.talent_profiles              enable row level security;
alter table jobboard.client_profiles              enable row level security;
alter table jobboard.talent_verticals             enable row level security;
alter table jobboard.talent_taxonomy              enable row level security;
alter table jobboard.client_verticals             enable row level security;
alter table jobboard.member_applications          enable row level security;
alter table jobboard.member_application_verticals enable row level security;
alter table jobboard.portfolio_items              enable row level security;
alter table jobboard.portfolio_tags               enable row level security;
alter table jobboard.gigs                         enable row level security;
alter table jobboard.gig_taxonomy                 enable row level security;
alter table jobboard.applications                 enable row level security;
alter table jobboard.application_portfolio_items  enable row level security;
alter table jobboard.engagements                  enable row level security;
alter table jobboard.reviews                      enable row level security;
alter table jobboard.conversations                enable row level security;
alter table jobboard.conversation_participants    enable row level security;
alter table jobboard.messages                     enable row level security;
alter table jobboard.notifications                enable row level security;
alter table jobboard.reports                      enable row level security;
alter table jobboard.audit_log                    enable row level security;

alter table jobboard.engagements         force row level security;
alter table jobboard.reviews             force row level security;
alter table jobboard.member_applications force row level security;
alter table jobboard.reports             force row level security;
alter table jobboard.audit_log           force row level security;

revoke all on schema jobboard from public;
grant usage on schema jobboard to authenticated;
revoke all on all tables in schema jobboard from anon, authenticated;
revoke all on all sequences in schema jobboard from anon, authenticated;
alter default privileges in schema jobboard revoke all on tables from anon, authenticated;
alter default privileges in schema jobboard revoke all on sequences from anon, authenticated;
alter default privileges in schema jobboard revoke execute on functions from public;

-- migrate:down
drop schema if exists jobboard cascade;
