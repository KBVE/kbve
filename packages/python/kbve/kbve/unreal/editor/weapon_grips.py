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

        # Where the hands meet this weapon. Vectors rather than floats, and
        # optional: a weapon that does not state them keeps the defaults, which
        # are the Mosin's, which is what the anim instance used to hardcode.
        for field in ("right_grip_local", "left_grip_local", "left_hand_target_local"):
            if field in entry:
                x, y, z = entry[field]
                grip.set_editor_property(field, unreal.Vector(float(x), float(y), float(z)))

        # Where the support hand goes, computed from the fore-end rather than
        # typed beside it.
        #
        # Typed, the two drifted: the socket sat at the forward end of the
        # Mosin's wood while grip_along_barrel three lines above said the rear,
        # and the file's own comment explains that the forward end is 52 cm from
        # a 49 cm arm. The solver did the only thing it could -- straightened
        # the arm, stopped short, and left the wrist hanging. A number derived
        # from the section cannot disagree with the section.
        socket = entry.get("support_hand_socket") or {}
        along = float(entry.get("grip_along_barrel", 0.0))
        centre = float(entry.get("fore_end_centre_height", 0.0))
        half = float(entry.get("fore_end_half_height", 0.0))

        # Under the fore-end by a palm's thickness. The clearance is the one
        # measured constant here: 0.8 puts the Mosin's wrist where it was found
        # by eye, and the same figure carries to a weapon nobody has looked at.
        clearance = float(entry.get("grip_palm_clearance", 0.8))

        # How much wood there is to choose from, and how much arm may be spent
        # reaching along it. The hold itself is picked at runtime from these.
        for field, prop in (("grip_along_min", "grip_along_min"),
                            ("grip_along_max", "grip_along_max"),
                            ("grip_arm_extension", "grip_arm_extension")):
            if field in entry:
                grip.set_editor_property(prop, float(entry[field]))

        if "location" in socket:
            loc = [float(v) for v in socket["location"]]
        else:
            loc = [along, 0.0, round(centre - half - clearance, 3)]
        rot = [float(v) for v in socket.get("rotation", [0.0, 0.0, 0.0])]
        unreal.log(f"{entry['asset']}: support socket {loc} (along={along} centre={centre} half={half})")
        placed = unreal.Transform()
        placed.set_editor_property("translation", unreal.Vector(*loc))
        placed.set_editor_property(
            "rotation", unreal.Rotator(roll=rot[2], pitch=rot[0], yaw=rot[1]).quaternion())
        placed.set_editor_property("scale3d", unreal.Vector(1.0, 1.0, 1.0))
        grip.set_editor_property("support_hand_socket", placed)

        attach = entry.get("attach_offset")
        if attach:
            loc = [float(v) for v in attach.get("location", [0.0, 0.0, 0.0])]
            rot = [float(v) for v in attach.get("rotation", [0.0, 0.0, 0.0])]
            transform = unreal.Transform()
            transform.set_editor_property("translation", unreal.Vector(*loc))
            # Named, not positional. unreal.Rotator's Python constructor is
            # (roll, pitch, yaw) while C++ FRotator is (pitch, yaw, roll), so
            # passing a config triple straight through turns a yaw of 180 into
            # a pitch of 180 -- the weapon arrives upside down rather than
            # turned around, and both are a half turn so it looks like tuning.
            transform.set_editor_property(
                "rotation", unreal.Rotator(roll=rot[2], pitch=rot[0], yaw=rot[1]).quaternion()
            )
            transform.set_editor_property("scale3d", unreal.Vector(1.0, 1.0, 1.0))
            grip.set_editor_property("attach_offset", transform)

        # The grip as joint angles. Written in preference to a posed asset
        # because a hold is reviewable as numbers -- a diff says which knuckle
        # closed further, which a binary uasset never can.
        pose = entry.get("finger_pose")
        if pose:
            fingers = []
            for chain, angles in pose.items():
                if len(angles) != 3:
                    unreal.log_error(f"{name}: {chain} needs three angles, got {len(angles)}")
                    continue
                finger = unreal.KBVEGripFinger()
                finger.set_editor_property("chain", chain)
                finger.set_editor_property("base", float(angles[0]))
                finger.set_editor_property("middle", float(angles[1]))
                finger.set_editor_property("tip", float(angles[2]))
                fingers.append(finger)
            grip.set_editor_property("finger_pose", fingers)

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
