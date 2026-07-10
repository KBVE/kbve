import bpy
import os
import math

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
TARGET_GLB = os.path.join(MODELS, "character.glb")
SOURCE_GLB = os.path.join(MODELS, "m2m-character.glb")
OUT_GLB = os.path.join(MODELS, "character-anim.glb")

CLIPS = [
    "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop",
    "Sword_Idle", "Sword_Attack", "Sword_Block",
    "Jump_Start", "Jump_Loop", "Jump_Land", "Punch_Cross",
]

PROBE = "upperarm_l"


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in added if o.type == "ARMATURE"), None)
    return arm, added


def depth(bone):
    d = 0
    b = bone
    while b.parent:
        d += 1
        b = b.parent
    return d


def main():
    wipe()
    sc = bpy.context.scene

    tgt, tgt_objs = import_glb(TARGET_GLB)
    src, _ = import_glb(SOURCE_GLB)
    tgt.location = (0, 0, 0)
    src.location = (0, 0, 0)
    bpy.context.view_layer.update()

    tgt_bones = {b.name for b in tgt.pose.bones}
    src_bones = {b.name for b in src.pose.bones}
    shared = [b for b in tgt.pose.bones if b.name in src_bones]
    shared.sort(key=lambda pb: depth(pb.bone))
    print(f"target_bones={len(tgt_bones)} source_bones={len(src_bones)} "
          f"shared={len(shared)}")

    # Precompute rest matrices (armature space) for shared bones.
    rest_src = {pb.name: src.pose.bones[pb.name].bone.matrix_local.copy()
                for pb in shared}
    rest_tgt = {pb.name: pb.bone.matrix_local.copy() for pb in shared}
    rest_src_inv = {n: m.inverted() for n, m in rest_src.items()}  # noqa: F841

    src.animation_data_create()
    tgt.animation_data_create()

    # --- Phase A: re-rest the target to the source's rest orientation. ---
    # M2M binds in A-pose, SIDEKICK in T-pose. Pose SIDEKICK's shared bones to
    # match M2M's rest (per-bone world orientation, keeping SIDEKICK's own joint
    # positions), then apply as the new rest pose. Now both rigs share a rest,
    # so a straight world-pose copy per clip is faithful with no roll explosion.
    src.animation_data.action = None
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    tgt.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    bpy.ops.object.mode_set(mode="POSE")
    for pb in shared:
        n = pb.name
        head = pb.matrix.to_translation()
        m = src.pose.bones[n].matrix.to_quaternion().to_matrix().to_4x4()
        m.translation = head
        pb.matrix = m
        bpy.context.view_layer.update()
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    # refresh cached rest after the re-rest
    rest_tgt = {pb.name: pb.bone.matrix_local.copy() for pb in shared}  # noqa: F841

    made = []
    probe_max = {}
    for name in CLIPS:
        act = bpy.data.actions.get(name)
        if not act:
            print(f"  MISSING {name}")
            continue
        src.animation_data.action = act
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])

        new_act = bpy.data.actions.new(f"RT_{name}")
        tgt.animation_data.action = new_act
        mx = 0.0

        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            for pb in shared:
                n = pb.name
                # Orientation from source (arms-down lives in its A-rest, so we
                # need the ABSOLUTE orientation), but keep the target's own joint
                # position from its FK chain so differing proportions don't
                # stretch the mesh. Parent-first + update() makes the read head
                # reflect the already-posed parent.
                sm = src.pose.bones[n].matrix
                head = pb.matrix.to_translation()
                m = sm.to_quaternion().to_matrix().to_4x4()
                m.translation = head
                pb.matrix = m
                bpy.context.view_layer.update()
            bpy.context.view_layer.update()
            for pb in shared:
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
            probe = tgt.pose.bones.get(PROBE)
            if probe:
                ang = probe.rotation_quaternion.angle
                if not math.isnan(ang):
                    mx = max(mx, abs(ang))

        probe_max[name] = round(mx, 3)
        made.append((name, new_act))
        # detach source action name collision handling
        act_clean = name  # noqa: F841
        new_act.name = f"TMP_{name}"

    print(f"retargeted {len(made)}/{len(CLIPS)}")
    print(f"probe({PROBE}) max-rot rad: {probe_max}")

    # Now free source clips of their names and give clean names to targets.
    for name, new_act in made:
        srcclip = bpy.data.actions.get(name)
        if srcclip and srcclip is not new_act:
            srcclip.name = f"SRC_{name}"
        new_act.name = name

    if made:
        tgt.animation_data.action = made[0][1]

    bpy.ops.object.select_all(action="DESELECT")
    for o in tgt_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = tgt

    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        use_selection=True,
        export_yup=True,
        export_morph=False,
        export_animation_mode="ACTIONS",
        export_animations=True,
    )
    print(f"exported {OUT_GLB}")


if __name__ == "__main__":
    main()
