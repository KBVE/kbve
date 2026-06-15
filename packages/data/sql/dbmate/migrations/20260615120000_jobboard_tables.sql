-- migrate:up
create schema if not exists jobboard;

create table if not exists jobboard.verticals (
    id          bigserial primary key,
    slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
    label       text not null,
    description text not null default '',
    status      integer not null default 1,
    sort_order  integer not null default 0
);

create table if not exists jobboard.taxonomy (
    id          bigserial primary key,
    vertical_id bigint not null references jobboard.verticals(id) on delete cascade,
    kind        integer not null,
    name        text not null check (name ~ '^[a-z0-9-]+$'),
    label       text not null,
    status      integer not null default 1,
    unique (vertical_id, kind, name)
);

create index if not exists jobboard_taxonomy_vertical_kind_idx
    on jobboard.taxonomy (vertical_id, kind);

create table if not exists jobboard.talent_profiles (
    user_id          uuid primary key references auth.users(id) on delete cascade,
    headline         text not null default '',
    years_experience integer not null default 0,
    availability     integer not null default 0,
    rate_min         bigint not null default 0,
    rate_max         bigint not null default 0,
    currency         text not null default 'USD',
    vertical_ids     bigint[] not null default '{}',
    discipline_ids   bigint[] not null default '{}',
    tool_ids         bigint[] not null default '{}',
    skill_ids        bigint[] not null default '{}',
    updated_at       timestamptz not null default now()
);

create table if not exists jobboard.client_profiles (
    user_id      uuid primary key references auth.users(id) on delete cascade,
    org_name     text not null default '',
    company_size integer not null default 0,
    website      text not null default '',
    about        text not null default '',
    vertical_ids bigint[] not null default '{}',
    updated_at   timestamptz not null default now()
);

create table if not exists jobboard.member_applications (
    id                     bigserial primary key,
    user_id                uuid not null references auth.users(id) on delete cascade,
    requested_capabilities integer not null default 0,
    vertical_ids           bigint[] not null default '{}',
    statement              text not null default '',
    portfolio_links        text[] not null default '{}',
    status                 integer not null default 0,
    reviewed_by            uuid references auth.users(id) on delete set null,
    reviewed_at            timestamptz,
    review_notes           text not null default '',
    created_at             timestamptz not null default now()
);

create index if not exists jobboard_member_applications_status_idx
    on jobboard.member_applications (status);

create table if not exists jobboard.portfolio_items (
    id          bigserial primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    vertical_id bigint not null references jobboard.verticals(id),
    title       text not null,
    description text not null default '',
    source      text not null default '',
    media       jsonb not null default '[]',
    tag_ids     bigint[] not null default '{}',
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists jobboard_portfolio_items_user_idx
    on jobboard.portfolio_items (user_id);

create table if not exists jobboard.gigs (
    id             bigserial primary key,
    poster_id      uuid not null references auth.users(id) on delete cascade,
    vertical_id    bigint not null references jobboard.verticals(id),
    title          varchar(120) not null,
    summary        varchar(200) not null default '',
    description    text not null default '',
    discipline_ids bigint[] not null default '{}',
    tool_ids       bigint[] not null default '{}',
    skill_ids      bigint[] not null default '{}',
    budget_type    integer not null default 0,
    budget_min     bigint not null default 0,
    budget_max     bigint not null default 0,
    currency       text not null default 'USD',
    deadline       timestamptz,
    location_pref  integer not null default 0,
    status         integer not null default 0,
    published_at   timestamptz,
    updated_at     timestamptz not null default now(),
    created_at     timestamptz not null default now()
);

create index if not exists jobboard_gigs_status_idx on jobboard.gigs (status);
create index if not exists jobboard_gigs_vertical_idx on jobboard.gigs (vertical_id);
create index if not exists jobboard_gigs_poster_idx on jobboard.gigs (poster_id);

create table if not exists jobboard.applications (
    id                 bigserial primary key,
    gig_id             bigint not null references jobboard.gigs(id) on delete cascade,
    applicant_id       uuid not null references auth.users(id) on delete cascade,
    cover_message      text not null default '',
    proposed_rate      bigint not null default 0,
    proposed_rate_type integer not null default 0,
    portfolio_item_ids bigint[] not null default '{}',
    status             integer not null default 0,
    created_at         timestamptz not null default now(),
    unique (gig_id, applicant_id)
);

create index if not exists jobboard_applications_applicant_idx
    on jobboard.applications (applicant_id);

create table if not exists jobboard.engagements (
    id           bigserial primary key,
    gig_id       bigint not null references jobboard.gigs(id) on delete cascade,
    poster_id    uuid not null references auth.users(id) on delete cascade,
    taker_id     uuid not null references auth.users(id) on delete cascade,
    status       integer not null default 0,
    started_at   timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists jobboard_engagements_gig_idx on jobboard.engagements (gig_id);

create table if not exists jobboard.reviews (
    id            bigserial primary key,
    engagement_id bigint not null references jobboard.engagements(id) on delete cascade,
    reviewer_id   uuid not null references auth.users(id) on delete cascade,
    reviewee_id   uuid not null references auth.users(id) on delete cascade,
    rating        integer not null check (rating between 1 and 5),
    body          text not null default '',
    created_at    timestamptz not null default now(),
    unique (engagement_id, reviewer_id)
);

create index if not exists jobboard_reviews_reviewee_idx on jobboard.reviews (reviewee_id);

create table if not exists jobboard.conversations (
    id         bigserial primary key,
    gig_id     bigint references jobboard.gigs(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists jobboard.conversation_participants (
    conversation_id bigint not null references jobboard.conversations(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    primary key (conversation_id, user_id)
);

create index if not exists jobboard_conversation_participants_user_idx
    on jobboard.conversation_participants (user_id);

create table if not exists jobboard.messages (
    id              bigserial primary key,
    conversation_id bigint not null references jobboard.conversations(id) on delete cascade,
    sender_id       uuid not null references auth.users(id) on delete cascade,
    body            text not null default '',
    attachments     jsonb not null default '[]',
    read_at         timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists jobboard_messages_conversation_idx
    on jobboard.messages (conversation_id, created_at);

create table if not exists jobboard.notifications (
    id         bigserial primary key,
    user_id    uuid not null references auth.users(id) on delete cascade,
    kind       integer not null default 0,
    payload    jsonb not null default '{}',
    read_at    timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists jobboard_notifications_user_idx
    on jobboard.notifications (user_id, read_at);

create table if not exists jobboard.reports (
    id          bigserial primary key,
    reporter_id uuid not null references auth.users(id) on delete cascade,
    target_kind integer not null default 0,
    target_id   text not null default '',
    reason      text not null default '',
    status      integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists jobboard_reports_status_idx on jobboard.reports (status);

create table if not exists jobboard.audit_log (
    id          bigserial primary key,
    actor_id    uuid references auth.users(id) on delete set null,
    action      text not null,
    target_kind integer not null default 0,
    target_id   text not null default '',
    detail      jsonb not null default '{}',
    created_at  timestamptz not null default now()
);

create index if not exists jobboard_audit_log_created_idx on jobboard.audit_log (created_at);

-- migrate:down
drop schema if exists jobboard cascade;
