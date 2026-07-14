-- AUTO-GENERATED — do not edit. Source of truth:
--   apps/kbve/astro-kbve/src/content/docs/project/jobboard.mdx (verticals block)
-- Regenerate: nx run astro-kbve:sync:jobboard-taxonomy

insert into jobboard.verticals (slug, label, description, status, sort_order) values
    ('game-dev', 'Game Development', 'Art, code, audio, design, and QA for games — the launch vertical.', 2, 0)
on conflict (slug) do update set
    label = excluded.label, description = excluded.description,
    status = excluded.status, sort_order = excluded.sort_order;

insert into jobboard.taxonomy (vertical_id, kind, name, label, status)
select v.id, t.kind, t.name, t.label, t.status
from (values
    ('game-dev', 1, '2d-art', '2D Art', 1),
    ('game-dev', 1, '3d-art', '3D Art', 1),
    ('game-dev', 1, 'animation', 'Animation / Rigging', 1),
    ('game-dev', 1, 'programming', 'Programming', 1),
    ('game-dev', 1, 'technical-art', 'Technical Art / Shaders', 1),
    ('game-dev', 1, 'audio', 'Audio (Music / SFX / VO)', 1),
    ('game-dev', 1, 'game-design', 'Game Design', 1),
    ('game-dev', 1, 'level-design', 'Level Design', 1),
    ('game-dev', 1, 'narrative', 'Narrative / Writing', 1),
    ('game-dev', 1, 'ui-ux', 'UI / UX', 1),
    ('game-dev', 1, 'qa', 'QA / Testing', 1),
    ('game-dev', 1, 'porting', 'Porting', 1),
    ('game-dev', 1, 'localization', 'Localization', 1),
    ('game-dev', 1, 'production', 'Production / PM', 1),
    ('game-dev', 1, 'community', 'Community', 1),
    ('game-dev', 2, 'unity', 'Unity', 1),
    ('game-dev', 2, 'unreal', 'Unreal', 1),
    ('game-dev', 2, 'godot', 'Godot', 1),
    ('game-dev', 2, 'gamemaker', 'GameMaker', 1),
    ('game-dev', 2, 'bevy', 'Bevy', 1),
    ('game-dev', 2, 'blender', 'Blender', 1),
    ('game-dev', 2, 'maya', 'Maya', 1),
    ('game-dev', 2, 'zbrush', 'ZBrush', 1),
    ('game-dev', 2, 'substance', 'Substance', 1),
    ('game-dev', 2, 'photoshop', 'Photoshop', 1),
    ('game-dev', 2, 'spine', 'Spine', 1),
    ('game-dev', 2, 'fmod', 'FMOD', 1),
    ('game-dev', 2, 'wwise', 'Wwise', 1),
    ('game-dev', 3, 'netcode', 'Netcode', 1),
    ('game-dev', 3, 'humanoid-rigging', 'Humanoid Rigging', 1),
    ('game-dev', 3, 'pixel-art', 'Pixel Art', 1),
    ('game-dev', 3, 'procgen', 'Procedural Generation', 1),
    ('game-dev', 3, 'shader-graph', 'Shader Graph', 1),
    ('game-dev', 3, 'vertical-slice', 'Vertical Slice', 1)
) as t(vertical_slug, kind, name, label, status)
join jobboard.verticals v on v.slug = t.vertical_slug
on conflict (vertical_id, kind, name) do update set
    label = excluded.label, status = excluded.status;
