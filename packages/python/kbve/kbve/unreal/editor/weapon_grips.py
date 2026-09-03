"""Create one grip data asset per weapon from the game's JSON.

A grip asset is what a weapon tells the support-hand solver: the cross-section
of its fore-end, where along that fore-end a hand takes hold, and the authored
finger pose to wear while holding it. Solving the fingers instead was tried at
length and does not work -- contact distance is satisfied by poses no hand can
hold -- so the pose is authored and referenced, and only the placement is
solved.

The numbers are measured off the weapon mesh rather than chosen. For the Mosin
they came from slicing the source FBX: the fore-end is a block 4.2 cm wide and
7.0 cm tall centred 3.3 cm up, while the bore runs at 5.35, and the woodwork
spans -18 to -4 along the weapon's own X.
"""

import json
import os

import unreal


def _load():
    path = os.environ.get("KBVE_UNREAL_CONFIG")
    if not path:
        unreal.log_error("KBVE_UNREAL_CONFIG is not set")
        return None
    with open(path) as handle:
        return json.load(handle)


def _asset(package_path, name):
    full = f"{package_path}/{name}"
    existing = unreal.EditorAssetLibrary.load_asset(full)
    if existing:
        return existing

    tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.DataAssetFactory()
    factory.set_editor_property("data_asset_class", unreal.KBVEWeaponGrip)
    return tools.create_asset(name, package_path, unreal.KBVEWeaponGrip, factory)


def main():
    config = _load()
    if not config:
        return

    package_path = config.get("package_path", "/Game/Weapons")
    written = 0

    for entry in config.get("weapons", []):
        name = entry["asset"]
        grip = _asset(package_path, name)
        if not grip:
            unreal.log_error(f"could not create {package_path}/{name}")
            continue

        for field in (
            "fore_end_half_width",
            "fore_end_half_height",
            "fore_end_centre_height",
            "grip_along_barrel",
            "grip_angle_degrees",
            "knuckle_clearance",
            "support_hand_pose_time",
            "support_hand_pose_weight",
        ):
            if field in entry:
                grip.set_editor_property(field, float(entry[field]))

        # The pose is a reference rather than a copy, so re-authoring the pose
        # updates every weapon that wears it without touching this script.
        pose_path = entry.get("support_hand_pose")
        if pose_path:
            pose = unreal.EditorAssetLibrary.load_asset(pose_path)
            if pose:
                grip.set_editor_property("support_hand_pose", pose)
            else:
                unreal.log_warning(f"{name}: no pose at {pose_path}")

        unreal.EditorAssetLibrary.save_loaded_asset(grip)
        written += 1
        unreal.log(f"grip asset {package_path}/{name}")

    unreal.log(f"wrote {written} grip asset(s)")


main()
