"""Build Enhanced Input assets from a JSON description.

A Mover pawn takes UInputAction and UInputMappingContext object references, so
these have to exist as assets before a pawn constructor can find them. Authoring
them by hand puts the keybinds in a binary uasset; generating them keeps the
binds in a file that can be reviewed and diffed.

Config (KBVE_UNREAL_CONFIG):
    dest_dir      content path to write into, e.g. "/Game/Input"
    context_name  name of the mapping context asset
    actions       {name: "Boolean"|"Axis1D"|"Axis2D"|"Axis3D"}
    mappings      [{action, key, modifiers: [...]}]

Modifiers are {"type": "negate", "x"/"y"/"z": bool} or
{"type": "swizzle", "order": "YXZ"}.
"""

import json
import os

import unreal

AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary

VALUE_TYPES = {
    "Boolean": unreal.InputActionValueType.BOOLEAN,
    "Axis1D": unreal.InputActionValueType.AXIS1D,
    "Axis2D": unreal.InputActionValueType.AXIS2D,
    "Axis3D": unreal.InputActionValueType.AXIS3D,
}


def load_config():
    path = os.environ.get("KBVE_UNREAL_CONFIG")
    if not path:
        raise RuntimeError("KBVE_UNREAL_CONFIG is not set")
    with open(path) as handle:
        return json.load(handle)


def key(name):
    k = unreal.Key()
    k.set_editor_property("key_name", name)
    return k


def make_modifier(owner, spec):
    """Build one input modifier owned by `owner`.

    Ownership matters: a modifier is a UObject, and one with no outer is
    transient. Built bare it saves as null, and the mapping silently loses its
    modifiers on the next load while still reporting the right count.
    """
    kind = spec["type"]
    if kind == "swizzle":
        m = unreal.new_object(unreal.InputModifierSwizzleAxis, outer=owner)
        order = spec.get("order", "YXZ")
        m.set_editor_property("order", getattr(unreal.InputAxisSwizzle, order))
        return m
    if kind == "negate":
        m = unreal.new_object(unreal.InputModifierNegate, outer=owner)
        m.set_editor_property("x", spec.get("x", False))
        m.set_editor_property("y", spec.get("y", False))
        m.set_editor_property("z", spec.get("z", False))
        return m
    raise ValueError(f"unknown modifier type: {kind!r}")


def get_or_create(path, name, dest_dir, asset_class):
    """Load the asset if it exists, otherwise create it.

    Overwrite in place rather than delete-and-recreate: the context references
    every action, so a delete pass has to be perfectly ordered, and a delete the
    registry refuses leaves create_asset returning None on a name still taken --
    which then fails several statements later, somewhere unrelated.
    """
    if EAL.does_asset_exist(path):
        return EAL.load_asset(path)
    return AT.create_asset(name, dest_dir, asset_class, None)


def build(config):
    dest_dir = config["dest_dir"]
    context_name = config["context_name"]

    actions = {}
    for name, type_name in config["actions"].items():
        path = f"{dest_dir}/{name}"
        action = get_or_create(path, name, dest_dir, unreal.InputAction)
        action.set_editor_property("value_type", VALUE_TYPES[type_name])
        EAL.save_asset(path)
        actions[name] = action

    context_path = f"{dest_dir}/{context_name}"
    imc = get_or_create(context_path, context_name, dest_dir, unreal.InputMappingContext)

    # Built as one array and assigned back, not via map_key: map_key hands back a
    # copy of the mapping struct, so modifiers set on its return value are
    # written into a temporary and lost.
    mappings = []
    for spec in config["mappings"]:
        m = unreal.EnhancedActionKeyMapping()
        m.set_editor_property("action", actions[spec["action"]])
        m.set_editor_property("key", key(spec["key"]))
        modifiers = [make_modifier(imc, mod) for mod in spec.get("modifiers", [])]
        if modifiers:
            m.set_editor_property("modifiers", modifiers)
        mappings.append(m)

    data = imc.get_editor_property("default_key_mappings")
    data.set_editor_property("mappings", mappings)
    imc.set_editor_property("default_key_mappings", data)
    EAL.save_asset(context_path)

    unreal.log(f"{context_path}: {len(actions)} actions, {len(mappings)} mappings")


build(load_config())
