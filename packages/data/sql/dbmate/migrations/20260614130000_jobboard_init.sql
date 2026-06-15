-- migrate:up
create schema if not exists jobboard;

create table if not exists jobboard.users (
    id              uuid primary key default gen_random_uuid(),
    email           text not null unique,
    username        text not null unique,
    password_hash   text not null,
    role            integer not null default 0,
    reputation      integer not null default 0,
    status          integer not null default 0,
    created_at      timestamptz not null default now(),
    last_login      timestamptz
);

create table if not exists jobboard.sessions (
    id      text primary key,
    data    jsonb not null,
    expiry  bigint not null
);

create index if not exists jobboard_sessions_expiry_idx on jobboard.sessions (expiry);

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

insert into jobboard.verticals (slug, label, description, status, sort_order)
values ('game-dev', 'Game Development', 'Art, code, audio, design, and QA for games.', 1, 0)
on conflict (slug) do nothing;

insert into jobboard.taxonomy (vertical_id, kind, name, label)
select v.id, t.kind, t.name, t.label
from jobboard.verticals v
cross join (values
    (1, '2d-art', '2D Art'),
    (1, '3d-art', '3D Art'),
    (1, 'animation-rigging', 'Animation/Rigging'),
    (1, 'programming', 'Programming'),
    (1, 'technical-art', 'Technical Art/Shaders'),
    (1, 'audio', 'Audio (Music/SFX/VO)'),
    (1, 'game-design', 'Game Design'),
    (1, 'level-design', 'Level Design'),
    (1, 'narrative', 'Narrative/Writing'),
    (1, 'ui-ux', 'UI/UX'),
    (1, 'qa-testing', 'QA/Testing'),
    (1, 'porting', 'Porting'),
    (1, 'localization', 'Localization'),
    (1, 'production', 'Production/PM'),
    (1, 'community', 'Community'),
    (2, 'unity', 'Unity'),
    (2, 'unreal', 'Unreal'),
    (2, 'godot', 'Godot'),
    (2, 'gamemaker', 'GameMaker'),
    (2, 'bevy', 'Bevy'),
    (2, 'blender', 'Blender'),
    (2, 'maya', 'Maya'),
    (2, 'zbrush', 'ZBrush'),
    (2, 'substance', 'Substance'),
    (2, 'photoshop', 'Photoshop'),
    (2, 'spine', 'Spine'),
    (2, 'fmod', 'FMOD'),
    (2, 'wwise', 'Wwise'),
    (3, 'netcode', 'netcode'),
    (3, 'humanoid-rigging', 'humanoid-rigging'),
    (3, 'pixel-art', 'pixel-art'),
    (3, 'procgen', 'procgen'),
    (3, 'shader-graph', 'shader-graph'),
    (3, 'vertical-slice', 'vertical-slice')
) as t(kind, name, label)
where v.slug = 'game-dev'
on conflict (vertical_id, kind, name) do nothing;

-- migrate:down
drop schema if exists jobboard cascade;
