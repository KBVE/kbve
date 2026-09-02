"""Populate a level from a JSON description.

A umap is binary and unreviewable, so the scene it holds cannot be read in a
diff. Generating it from a description moves the reviewable part into the
game's repository and leaves the map as build output.

Idempotent: actors of the classes it spawns are removed first, so re-running
after a change rebuilds the scene rather than stacking duplicates.

Config (KBVE_UNREAL_CONFIG):
    map      content path of the level to populate
    actors   [{class, location, properties, struct_properties}]

`class` is the name of a class exposed to Python (e.g. "KBVEWorldStreamer").
`properties` are set directly; `struct_properties` name a struct property and
the fields to set inside it, which is how nested settings like a heightfield
shape are reached.
"""

import json
import os

import unreal

LEVEL = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
ACTORS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
EAL = unreal.EditorAssetLibrary


def load_config():
    path = os.environ.get("KBVE_UNREAL_CONFIG")
    if not path:
        raise RuntimeError("KBVE_UNREAL_CONFIG is not set")
    with open(path) as handle:
        return json.load(handle)


def resolve_class(name):
    cls = getattr(unreal, name, None)
    if cls is None:
        raise RuntimeError(f"class {name!r} is not exposed to Python -- is its plugin enabled?")
    return cls


def resolve_value(value):
    """Turn a JSON value into what set_editor_property expects.

    A string that looks like a content path is loaded as an asset, so a config
    can name a material without the caller doing the lookup. A three-element
    list becomes a Vector, a two-element list a Vector2D.
    """
    if isinstance(value, str) and value.startswith("/Game/"):
        asset = EAL.load_asset(value)
        if asset is None:
            raise RuntimeError(f"asset not found: {value}")
        return asset
    if isinstance(value, list) and len(value) == 3 and all(isinstance(v, (int, float)) for v in value):
        return unreal.Vector(*[float(v) for v in value])
    if isinstance(value, list) and len(value) == 2 and all(isinstance(v, (int, float)) for v in value):
        return unreal.Vector2D(*[float(v) for v in value])
    return value


def apply_properties(target, properties):
    for name, value in properties.items():
        target.set_editor_property(name, resolve_value(value))


def apply_struct_properties(actor, struct_properties):
    # Read, mutate, write back. A struct property returns a copy, so setting a
    # field on what the getter returned changes nothing on the actor.
    for struct_name, fields in struct_properties.items():
        struct = actor.get_editor_property(struct_name)
        apply_properties(struct, fields)
        actor.set_editor_property(struct_name, struct)


def build(config):
    LEVEL.load_level(config["map"])

    specs = config["actors"]
    classes = tuple(resolve_class(spec["class"]) for spec in specs)

    removed = 0
    for actor in ACTORS.get_all_level_actors():
        if isinstance(actor, classes):
            ACTORS.destroy_actor(actor)
            removed += 1

    for spec in specs:
        location = unreal.Vector(*[float(v) for v in spec.get("location", [0, 0, 0])])
        actor = ACTORS.spawn_actor_from_class(resolve_class(spec["class"]), location)
        apply_properties(actor, spec.get("properties", {}))
        apply_struct_properties(actor, spec.get("struct_properties", {}))

    LEVEL.save_current_level()
    unreal.log(f"{config['map']}: removed {removed}, spawned {len(specs)}")


build(load_config())
