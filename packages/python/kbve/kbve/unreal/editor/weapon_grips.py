"""Create one grip data asset per weapon from the game's JSON.

A grip asset is what a weapon tells the support-hand solver: the cross-section
of its fore-end, where along that fore-end a hand takes hold, and the authored
finger pose to wear while holding it. Solving the fingers instead was tried at
length and does not work -- contact distance is satisfied by poses no hand can
hold -- so the pose is authored and referenced, and only the placement is
solved.

The numbers are measured off the weapon mesh rather than chosen -- here, in
this script, at import time. They used to be measured by a person slicing the
source FBX and typed into the config, which described the Mosin correctly and
described the second rifle by estimate: the SS2's fore-end range was a guess,
was labelled as one, and the solver believed it anyway. A weapon states its own
shape, so it is asked.

What comes out is a profile -- the underside of the weapon, a slice per
centimetre -- plus the section and the stretch of it a hand can close around.
Everything in weapons.json stays honoured as an override, so a weapon that
measures badly can still be told, but nothing has to be told.
"""

import json
import os

import unreal

# A centimetre a slice. Fine enough that a barrel band or the step down to the
# receiver lands in its own slice, coarse enough that a rifle is a hundred-odd
# floats rather than a thousand.
SLAB_WIDTH = 1.0

# What separates one body from the body above it. A handguard and the barrel
# over it are a centimetre or two apart on every rifle here; below about one
# they merge and the section swallows the barrel, above about three the scope
# joins in.
CLUSTER_GAP = 1.5

# What a hand can close around, as half-extents. Beyond this the slice is a
# receiver or a magazine well: still weapon, but not a hold, and a support hand
# put there reads as carrying the rifle rather than shooting it.
MAX_HALF_WIDTH = 4.0
MAX_HALF_HEIGHT = 5.0

# How far ahead of the trigger hand the fore-end is allowed to start. A hand is
# about this wide, and two hands sharing a stretch of weapon is the one hold
# that is definitely wrong.
TRIGGER_CLEARANCE = 9.0

# Room left at the muzzle end of the wood so the hold is on it rather than off
# the end of it, along the weapon's own X.
FORE_END_MARGIN = 4.0

# How much narrower than the widest slice of a stretch a slice may be and still
# count as the same body. Wood tapering into barrel is a continuous slide on
# both of these rifles, so there is no break to find -- this is what ends the
# fore-end instead.
SAME_BODY_FRACTION = 0.8

# How long a stretch has to be to be a hold. Shorter than a hand and it is a
# barrel band or a sling swivel, and a rifle has several of those.
MIN_HOLD_SLABS = 8


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


def _profile(entry):
    """Slice the weapon's mesh and return its underside, or None."""
    path = entry.get("mesh")
    if not path:
        return None
    mesh = unreal.EditorAssetLibrary.load_asset(path)
    if not mesh:
        unreal.log_warning(f"{entry['asset']}: no mesh at {path}")
        return None
    profile = unreal.KBVEMoverEditorLibrary.measure_weapon_profile(mesh, SLAB_WIDTH, CLUSTER_GAP)
    return list(profile) or None


def _fore_end(profile, behind_x):
    """Pick the stretch of the profile a support hand takes hold of.

    Not the longest holdable stretch. A barrel is holdable, unbroken and half a
    metre long, so length picks the barrel every time -- measured, the Mosin's
    fore-end runs twelve slices and the barrel behind it runs forty-three. What
    separates them is bulk: a handguard is 4.3 cm across the wood and a barrel
    is 2.4 cm across the steel, and the hand goes on the wood.

    Nor can the two be told apart by looking for a break between them, because
    on both of these rifles there is not one: the wood tapers into the barrel
    over a few centimetres and the section slides down with it. So the run is
    grown instead -- a stretch is only one stretch while its slices stay within
    a fifth of the widest of them -- and the fattest such stretch long enough to
    put a hand on wins.
    """
    holdable = [
        slab.half_width > 0.05
        and slab.half_width <= MAX_HALF_WIDTH
        and slab.half_height <= MAX_HALF_HEIGHT
        and slab.x > behind_x
        for slab in profile
    ]

    # Widest slice first, and grow outwards from it while the weapon stays the
    # same thickness. Scored instead -- widest on average, longest, fattest by
    # area -- every scoring rule tried picked either the barrel, because it is
    # long, or exactly the minimum window, because a mean width only falls as
    # the taper is included. Growing from the widest point asks the question
    # directly: this is the thickest thing forward of the trigger, and the
    # fore-end is however far it stays thick.
    order = sorted(
        (index for index, ok in enumerate(holdable) if ok),
        key=lambda index: profile[index].half_width,
        reverse=True,
    )

    best = None
    for seed in order:
        floor = profile[seed].half_width * SAME_BODY_FRACTION
        first = seed
        while first > 0 and holdable[first - 1] and profile[first - 1].half_width >= floor:
            first -= 1
        last = seed
        while last + 1 < len(profile) and holdable[last + 1] and profile[last + 1].half_width >= floor:
            last += 1
        if last - first + 1 >= MIN_HOLD_SLABS:
            best = profile[first : last + 1]
            break

    if not best:
        return None

    # Margin at the muzzle end only. A hand at the front edge of the wood has
    # half of itself on the barrel, but a hand at the rear edge is against the
    # receiver, which is where a support hand on a full-length rifle goes and
    # the only place on the Mosin a 49 cm arm can reach at all.
    lo = best[0].x
    hi = best[-1].x - FORE_END_MARGIN
    if hi < lo:
        lo = hi = 0.5 * (best[0].x + best[-1].x)

    # Averaged over the run, not over the whole weapon. These are the fallback
    # the solver uses where a profile is missing and what the debug box draws,
    # so they should describe the part being held rather than the mean of a
    # rifle.
    count = float(len(best))
    return {
        "grip_along_min": round(lo, 3),
        "grip_along_max": round(hi, 3),
        "fore_end_half_width": round(sum(s.half_width for s in best) / count, 3),
        "fore_end_half_height": round(sum(s.half_height for s in best) / count, 3),
        "fore_end_centre_height": round(sum(s.centre_z for s in best) / count, 3),
        "fore_end_centre_across": round(sum(s.centre_y for s in best) / count, 3),
    }


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

        # Measured first, told second. Anything stated in the config wins, so a
        # weapon whose mesh measures badly can still be corrected by hand --
        # but nothing has to be stated for a weapon to be held, which is the
        # difference between two rifles and any rifle.
        profile = _profile(entry)
        values = {}
        if profile:
            grip.set_editor_property("fore_end_profile", profile)
            grip.set_editor_property("profile_slab_width", SLAB_WIDTH)
            behind = float(entry.get("right_grip_local", [0.0])[0]) + TRIGGER_CLEARANCE
            measured = _fore_end(profile, behind)
            if measured:
                values.update(measured)
                unreal.log_warning(f"{entry['asset']}: measured {measured}")
            else:
                unreal.log_warning(f"{entry['asset']}: no graspable run in {len(profile)} slices")
        values.update(entry)

        # Where along the wood to hold defaults to the near end of it, which is
        # both where a support hand belongs and the part a shoulder can reach.
        values.setdefault("grip_along_barrel", values.get("grip_along_min", 0.0))

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
            if field in values:
                grip.set_editor_property(field, float(values[field]))

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
        socket = values.get("support_hand_socket") or {}
        along = float(values.get("grip_along_barrel", 0.0))
        centre = float(values.get("fore_end_centre_height", 0.0))
        half = float(values.get("fore_end_half_height", 0.0))

        # Under the fore-end by a palm's thickness. The clearance is the one
        # measured constant here: 0.8 puts the Mosin's wrist where it was found
        # by eye, and the same figure carries to a weapon nobody has looked at.
        clearance = float(values.get("grip_palm_clearance", 0.8))

        # How much wood there is to choose from, and how much arm may be spent
        # reaching along it. The hold itself is picked at runtime from these.
        for field in ("grip_along_min", "grip_along_max", "grip_arm_extension"):
            if field in values:
                grip.set_editor_property(field, float(values[field]))

        if "location" in socket:
            loc = [float(v) for v in socket["location"]]
        else:
            # Across the weapon as well as along and under it. A rifle whose
            # mesh is not built about its own bore -- and the Mosin is not, its
            # bolt handle stands three centimetres off one side -- puts the
            # fore-end off zero, and a socket pinned to zero puts the hand
            # beside the wood rather than under it.
            across = float(values.get("fore_end_centre_across", 0.0))
            loc = [along, across, round(centre - half - clearance, 3)]
        rot = [float(v) for v in socket.get("rotation", [0.0, 0.0, 0.0])]

        # A section of nothing is not a weapon the solver can hold: the socket
        # collapses to the origin and the arm is sent to the middle of the
        # rifle. Loud, because it is the one failure this script can produce
        # that still writes a plausible-looking asset.
        if half <= 0.0 or centre <= 0.0:
            unreal.log_error(f"{name}: no fore-end section -- mesh unmeasured and config states none")
        unreal.log_warning(f"{name}: support socket {loc} (along={along} centre={centre} half={half})")
        placed = unreal.Transform()
        placed.set_editor_property("translation", unreal.Vector(*loc))
        placed.set_editor_property("rotation", unreal.Rotator(roll=rot[2], pitch=rot[0], yaw=rot[1]).quaternion())
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
        unreal.log_warning(f"grip asset {package_path}/{name}")

    unreal.log_warning(f"wrote {written} grip asset(s)")


main()
