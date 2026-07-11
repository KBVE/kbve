import bpy
import os

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

SUFFIX = " Retarget"


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in added if o.type == "ARMATURE"), None)
    return arm, added


# SIDEKICK attachment slot -> the deform-following attach bone it rides.
SLOT_ATTACH = {
    "AHED": "headAttach", "AFAC": "faceAttach", "ABAC": "backAttach",
    "AHPF": "hipAttachFront", "AHPB": "hipAttachBack",
    "AHPL": "hipAttach_l", "AHPR": "hipAttach_r",
    "ASHL": "shoulderAttach_l", "ASHR": "shoulderAttach_r",
    "AEBL": "elbowAttach_l", "AEBR": "elbowAttach_r",
    "AKNL": "kneeAttach_l", "AKNR": "kneeAttach_r",
}


def reweight_neutral(tgt_objs, arm):
    """Synty/Unity FBX parks stray verts on a static 'neutral_bone' (and IK
    bones aren't deform bones). Route each attachment mesh's neutral weights to
    its designated attach bone; route body meshes to the nearest DEFORM bone."""
    def is_deform(name):
        return name != "neutral_bone" and not name.startswith("ik_")

    centers = {
        b.name: (b.head_local + b.tail_local) * 0.5
        for b in arm.data.bones if is_deform(b.name)
    }
    names = list(centers.keys())
    total = 0
    for mesh in tgt_objs:
        if mesh.type != "MESH":
            continue
        nb = mesh.vertex_groups.get("neutral_bone")
        if not nb:
            continue
        nb_idx = nb.index
        slot = next((s for s in SLOT_ATTACH if mesh.name.startswith(s)), None)
        fixed = SLOT_ATTACH.get(slot) if slot else None
        if fixed and fixed not in centers:
            fixed = None
        moves = []
        for v in mesh.data.vertices:
            for g in v.groups:
                if g.group == nb_idx and g.weight > 0:
                    best = fixed or min(
                        names, key=lambda n: (centers[n] - v.co).length
                    )
                    moves.append((v.index, best, g.weight))
        for vi, best, w in moves:
            grp = mesh.vertex_groups.get(best) or mesh.vertex_groups.new(
                name=best
            )
            grp.add([vi], w, "ADD")
            nb.remove([vi])
        mesh.vertex_groups.remove(nb)
        total += len(moves)
    print(f"reweighted neutral_bone verts: {total}")


def add_plume_bone(arm, tgt_objs):
    """Split the helmet crest onto its own 'plume' bone (child of headAttach)
    with a height-gradient weight so the game can spring it. Helmet base stays
    rigid on headAttach; crest tips ride the plume bone."""
    from mathutils import Vector
    ahed = next(
        (m for m in tgt_objs
         if m.type == "MESH" and m.name.startswith("AHED")), None)
    if not ahed:
        print("no AHED mesh; skipping plume")
        return
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    ha = eb.get("headAttach")
    base = ha.head.copy() if ha else Vector((0.0, 0.0, 1.6))
    pl = eb.new("plume")
    pl.head = base
    pl.tail = base + Vector((0.0, 0.03, 0.3))
    pl.parent = ha
    pl.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")

    ha_vg = ahed.vertex_groups.get("headAttach")
    pl_vg = ahed.vertex_groups.get("plume") or ahed.vertex_groups.new(
        name="plume")
    mw = ahed.matrix_world
    z0, z1 = 1.62, 1.95
    moved = 0
    for v in ahed.data.vertices:
        wco = mw @ v.co
        if abs(wco.x) > 0.17:
            continue
        grad = max(0.0, min(1.0, (wco.z - z0) / (z1 - z0)))
        if grad <= 0:
            continue
        wha = next((g.weight for g in v.groups
                    if ha_vg and g.group == ha_vg.index), 0.0)
        if wha <= 0:
            continue
        pl_vg.add([v.index], wha * grad, "REPLACE")
        ha_vg.add([v.index], wha * (1 - grad), "REPLACE")
        moved += 1
    print(f"plume bone added; gradient-weighted verts: {moved}")


def enable_rokoko():
    for mod in ("rokoko_stable", "rokoko_beta", "rokoko_rt"):
        try:
            bpy.ops.preferences.addon_enable(module=mod)
            print(f"rokoko: {mod}")
            return
        except Exception:  # noqa: BLE001
            continue


def set_arm_prop(scene, prop, arm):
    try:
        setattr(scene, prop, arm)
    except (TypeError, ValueError):
        setattr(scene, prop, arm.name)


def main():
    wipe()
    sc = bpy.context.scene

    tgt, tgt_objs = import_glb(TARGET_GLB)
    src, _ = import_glb(SOURCE_GLB)
    print(
        f"target={tgt.name} source={src.name} actions={len(bpy.data.actions)}")

    # glTF import leaves a +90deg X object rotation (Y-up->Z-up). Rokoko's
    # retarget does transform_apply + a rotation flip that assumes a CLEAN
    # Z-up armature, so bake that rotation into the data first or the target
    # collapses. Apply on the armatures (bones) before touching Rokoko.
    for arm in (tgt, src):
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.transform_apply(
            location=False, rotation=True, scale=True
        )
    # Keep both armatures at the origin. Offsetting the source pollutes the
    # target root via Rokoko's COPY_LOCATION and leaves rest-pose accessory
    # bones stretching back to origin.
    print(
        f"tgt rot after apply={tuple(round(v, 3) for v in tgt.rotation_quaternion)}")

    reweight_neutral(tgt_objs, tgt)

    enable_rokoko()

    # The source pointer has a poll requiring an active action, so assign one
    # BEFORE binding the armatures (glTF import parks clips in the NLA).
    # The glTF importer suffixes actions with the object name
    # (e.g. "Idle_Loop_Armature.001"); map clean clip names to datablocks.
    suffixes = [f"_{src.name}", f" {src.name}", ""]
    clip_action = {}
    for a in bpy.data.actions:
        for suf in suffixes:
            if suf and a.name.endswith(suf):
                clip_action[a.name[: -len(suf)]] = a
                break
        else:
            clip_action.setdefault(a.name, a)

    src.animation_data_create()
    src.animation_data.action = clip_action.get(
        CLIPS[0]) or bpy.data.actions[0]
    print(f"src active action={src.animation_data.action.name}")

    set_arm_prop(sc, "rsl_retargeting_armature_source", src)
    set_arm_prop(sc, "rsl_retargeting_armature_target", tgt)
    print(f"src ptr={sc.rsl_retargeting_armature_source} "
          f"tgt ptr={sc.rsl_retargeting_armature_target}")
    sc.rsl_retargeting_use_pose = "REST"
    # Both rigs are same-scale UE mannequins; auto-scaling bakes stray scale
    # channels that balloon skinned accessories (helmet/backpack) in three.js.
    sc.rsl_retargeting_auto_scaling = False

    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    tgt.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    bpy.ops.rsl.build_bone_list()
    bl = sc.rsl_retargeting_bone_list
    # Auto-detect misses bones whose names aren't in Rokoko's scheme. SIDEKICK
    # and M2M share exact UE bone names, so fill any unmapped row where the
    # target rig has a bone of the same name as the source.
    tgt_bones = {b.name for b in tgt.pose.bones}
    for item in bl:
        if not item.bone_name_target and item.bone_name_source in tgt_bones:
            item.bone_name_target = item.bone_name_source
    mapped = sum(1 for b in bl if b.bone_name_target)
    print(f"bone_list total={len(bl)} mapped={mapped}")

    made = []
    for name in CLIPS:
        act = clip_action.get(name)
        if not act:
            print(f"  MISSING {name}")
            continue
        src.animation_data.action = act
        try:
            res = bpy.ops.rsl.retarget_animation()
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL {name}: {e}")
            continue
        out = tgt.animation_data.action if tgt.animation_data else None
        if res == {"FINISHED"} and out:
            out.name = f"RT_{name}"
            made.append((name, out))
        else:
            print(f"  no result for {name}: {res}")

    print(f"retargeted {len(made)}/{len(CLIPS)}")

    for name, act in made:
        clash = bpy.data.actions.get(name)
        if clash and clash is not act:
            clash.name = f"SRC_{name}"
        act.name = name

    if made:
        tgt.animation_data.action = made[0][1]

    # Drop the source armature and every non-retargeted action so the export
    # carries only the 11 clean clips (not all 88 M2M source clips).
    keep = {a for _, a in made}
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.delete()
    for a in list(bpy.data.actions):
        if a not in keep:
            bpy.data.actions.remove(a)
    print(f"actions kept for export: {[a.name for a in bpy.data.actions]}")

    add_plume_bone(tgt, tgt_objs)

    bpy.ops.object.select_all(action="DESELECT")
    for o in tgt_objs:
        if o.name in bpy.data.objects:
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
