"""Rig a PolyHaven weapon .blend and export it as a skeletal mesh FBX.

The source ships as separate rigid parts with no armature. Everything the rig
needs is already implied by that split -- the bolt is its own object, so its
axis is its origin and its throw is measurable -- which is why this is scripted
rather than clicked: the numbers come out of the mesh instead of out of a
modeller's judgement, and rerunning after a source update reproduces them.

Rigid weights only. A firearm has no deformation; every vertex belongs to
exactly one bone at weight 1, so there is no skinning to get wrong.

Headless:
  blender -b <source.blend> --python rig_weapon.py -- --out <path.fbx>
"""

import argparse
import math
import sys

import bpy
from mathutils import Matrix, Vector

# Parts that ride the bolt. Both share an origin -- that shared point is the
# bolt axis, and taking it from the source beats nominating one by eye.
BOLT_PARTS = ("bolt_a", "bolt_b")
TRIGGER_PARTS = ("trigger",)

# Left loose on the body: it is a spare round sitting in the model, not a
# chambered one, so nothing animates it. Ejection spawns its own actor.
LOOSE_PARTS = ("bullet_54mm",)

FPS = 30

# Frames for the four phases of a bolt cycle: lift, pull, push, lock. A real
# 7.62 cycle is about a second, and this is 28 frames at 30 fps.
F_REST, F_LIFT, F_BACK, F_FWD, F_LOCK = 0, 6, 14, 22, 28

BOLT_LIFT_DEGREES = 70.0


def parts_matching(suffixes):
    out = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if any(obj.name.endswith(s) for s in suffixes):
            out.append(obj)
    return out


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def apply_transforms():
    """Bake object transforms into the meshes.

    The scope carries an unapplied ninety degree rotation. Exported as-is the
    FBX carries it on the node instead of the geometry, and it survives into
    Unreal as a rotated component that every socket placed on it inherits.
    """
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects():
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects()[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")


def bolt_axis_and_throw(bolt_objs, body_obj, origin):
    """Bolt travel direction and how far it can be drawn back.

    The direction is the long axis of the receiver, taken from the body's own
    bounding box rather than assumed to be X, so a differently-oriented source
    rigs correctly instead of silently rigging wrong.
    """
    size = body_obj.dimensions
    axis_index = max(range(3), key=lambda i: size[i])
    direction = Vector((0, 0, 0))
    direction[axis_index] = 1.0

    # Throw has to clear the cartridge, or the round cannot leave the action.
    # Measured off the loose round when there is one rather than nominated.
    loose = parts_matching(LOOSE_PARTS)
    case_length = max(loose[0].dimensions) if loose else 0.06
    throw = case_length * 1.25

    return direction, throw, axis_index


def lift_sign(bolt_objs, origin, direction):
    """Which way round the barrel axis raises the handle.

    Decided from the geometry: the vertex furthest from the axis is the tip of
    the bolt handle, and the sign is whichever one carries it upward. Guessing
    gives a fifty percent chance of a bolt that opens by rotating into the
    stock.
    """
    handle = None
    best = -1.0
    for obj in bolt_objs:
        for v in obj.data.vertices:
            world = obj.matrix_world @ v.co
            offset = world - origin
            radial = offset - direction * offset.dot(direction)
            if radial.length > best:
                best = radial.length
                handle = world

    for sign in (1.0, -1.0):
        rot = Matrix.Rotation(math.radians(BOLT_LIFT_DEGREES) * sign, 4, direction)
        lifted = origin + rot @ (handle - origin)
        if lifted.z > handle.z:
            return sign
    return -1.0


def make_vertex_groups(bolt_objs, trigger_objs):
    """One group per object, named for the bone it rides, every vertex at 1.0."""
    for obj in mesh_objects():
        if obj in bolt_objs:
            bone = "bolt"
        elif obj in trigger_objs:
            bone = "trigger"
        else:
            bone = "root"
        group = obj.vertex_groups.new(name=bone)
        group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")


def build_armature(origin, direction, trigger_objs, body_obj):
    arm_data = bpy.data.armatures.new("WeaponArmature")
    arm_obj = bpy.data.objects.new("Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    # Root sits at the world origin the parts were modelled around, so the
    # weapon's own transform in Unreal is the transform of this bone.
    root = arm_data.edit_bones.new("root")
    root.head = Vector((0, 0, 0))
    root.tail = Vector((0, 0, 0)) + direction * 0.1

    bolt = arm_data.edit_bones.new("bolt")
    bolt.head = origin
    bolt.tail = origin + direction * 0.12
    bolt.parent = root

    trigger = arm_data.edit_bones.new("trigger")
    if trigger_objs:
        box = [
            trigger_objs[0].matrix_world @ Vector(c) for c in trigger_objs[0].bound_box
        ]
        top = Vector(
            (
                sum(v.x for v in box) / 8.0,
                sum(v.y for v in box) / 8.0,
                max(v.z for v in box),
            )
        )
    else:
        top = origin
    trigger.head = top
    trigger.tail = top + direction * 0.03
    trigger.parent = root

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def parent_to_armature(arm_obj):
    """Armature deform without generating weights: the groups already exist."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects():
        obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_NAME")
    bpy.ops.object.select_all(action="DESELECT")


def world_delta(pose_bone, delta):
    """A world-space transform expressed in the bone's own basis.

    Setting matrix_basis from a world delta this way avoids reasoning about
    Blender bone axes at all -- bones point along their local Y, and the roll
    that fixes the other two is not obvious for a bone laid along world X.
    """
    rest = pose_bone.bone.matrix_local
    return rest.inverted() @ delta @ rest


def key_bolt(arm_obj, origin, direction, throw, sign):
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")

    pb = arm_obj.pose.bones["bolt"]
    pb.rotation_mode = "QUATERNION"

    to_origin = Matrix.Translation(-origin)
    from_origin = Matrix.Translation(origin)
    lift = (
        from_origin
        @ Matrix.Rotation(math.radians(BOLT_LIFT_DEGREES) * sign, 4, direction)
        @ to_origin
    )
    back = Matrix.Translation(-direction * throw)

    # Lift, draw back, run forward, lock down. The rotation is held through the
    # travel because a bolt that is unlocked stays unlocked until it closes.
    poses = [
        (F_REST, Matrix.Identity(4)),
        (F_LIFT, lift),
        (F_BACK, back @ lift),
        (F_FWD, lift),
        (F_LOCK, Matrix.Identity(4)),
    ]

    for frame, delta in poses:
        pb.matrix_basis = world_delta(pb, delta)
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("rotation_quaternion", frame=frame)

    pb.matrix_basis = Matrix.Identity(4)
    bpy.ops.object.mode_set(mode="OBJECT")

    action = arm_obj.animation_data.action
    action.name = "A_BoltCycle"
    # Named on the action and used as the take name, which is what Unreal shows
    # the imported sequence as.
    if hasattr(action, "use_fake_user"):
        action.use_fake_user = True


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        # Centimetres, because that is what Unreal measures in and the source
        # is metric at scale 1.0.
        global_scale=1.0,
        apply_scale_options="FBX_SCALE_UNITS",
        object_types={"ARMATURE", "MESH"},
        use_armature_deform_only=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1.0,
        bake_anim_simplify_factor=0.0,
        axis_forward="-Z",
        axis_up="Y",
        mesh_smooth_type="FACE",
    )


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = F_REST
    bpy.context.scene.frame_end = F_LOCK

    bolt_objs = parts_matching(BOLT_PARTS)
    trigger_objs = parts_matching(TRIGGER_PARTS)
    if not bolt_objs:
        raise SystemExit("error: no bolt parts found in the source")

    # Read before the transforms are baked, not after. Applying them moves every
    # object's origin to the world origin, and the bolt parts' shared origin is
    # the one piece of information here that cannot be recovered from geometry:
    # it is the axis the bolt turns about. Taken afterwards the bolt pivots
    # around the world origin, a metre away, and swings through the stock.
    origin = bolt_objs[0].matrix_world.translation.copy()

    apply_transforms()

    # The body is the largest part and the one the axis direction is measured from.
    body_obj = max(mesh_objects(), key=lambda o: len(o.data.vertices))

    direction, throw, axis_index = bolt_axis_and_throw(bolt_objs, body_obj, origin)
    sign = lift_sign(bolt_objs, origin, direction)

    print(
        f"rig: axis={'XYZ'[axis_index]} origin=({origin.x:.3f},{origin.y:.3f},{origin.z:.3f}) "
        f"throw={throw * 100:.1f}cm lift={BOLT_LIFT_DEGREES * sign:+.0f}deg"
    )

    make_vertex_groups(bolt_objs, trigger_objs)
    arm_obj = build_armature(origin, direction, trigger_objs, body_obj)
    parent_to_armature(arm_obj)
    key_bolt(arm_obj, origin, direction, throw, sign)
    export(args.out)
    print(f"rig: wrote {args.out}")


main()
