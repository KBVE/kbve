"""Headless Rokoko retarget. Runs inside Blender: ``blender -b -P retarget.py --``.

Retargets Mesh2Motion (A-pose) source clips onto a Synty SIDEKICK (T-pose)
target rig using the Rokoko Studio Live addon's ``rsl.*`` operators. Rokoko
correctly resolves the A<->T rest-pose difference (a naive same-name delta
leaves arms stuck in the target's T-pose). Requires the addon installed in the
Blender that runs this; ``rokoko_beta`` registers cleanly on Blender 5.0.x.

Also performs SIDEKICK-general cleanup:
- ``reweight_neutral`` — routes Synty ``neutral_bone`` stray weights to the
  right deform/attach bone so accessories follow the body.
- ``add_plume`` (optional) — splits a helmet crest onto a springable ``plume``
  bone; herbmail-specific, gate off with ``--no-plume``.

Args after ``--``: CHAR ANIMS OUT CLIP[,CLIP...] [PLUME] [REWEIGHT]
  PLUME/REWEIGHT are "1"/"0" (default "1").
"""
import bpy
import os
import sys


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in added if o.type == "ARMATURE"), None)
    return arm, added


SLOT_ATTACH = {
    "AHED": "headAttach", "AFAC": "faceAttach", "ABAC": "backAttach",
    "AHPF": "hipAttachFront", "AHPB": "hipAttachBack",
    "AHPL": "hipAttach_l", "AHPR": "hipAttach_r",
    "ASHL": "shoulderAttach_l", "ASHR": "shoulderAttach_r",
    "AEBL": "elbowAttach_l", "AEBR": "elbowAttach_r",
    "AKNL": "kneeAttach_l", "AKNR": "kneeAttach_r",
}


def reweight_neutral(tgt_objs, arm):
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
                        names, key=lambda n: (centers[n] - v.co).length)
                    moves.append((v.index, best, g.weight))
        for vi, best, w in moves:
            grp = mesh.vertex_groups.get(best) or mesh.vertex_groups.new(
                name=best)
            grp.add([vi], w, "ADD")
            nb.remove([vi])
        mesh.vertex_groups.remove(nb)
        total += len(moves)
    print(f"reweighted neutral_bone verts: {total}")


def add_plume(arm, tgt_objs):
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
    print(f"plume bone added, gradient-weighted verts: {moved}")


MIRROR_PAIRS = [("foot_r", "foot_l"), ("ball_r", "ball_l")]


def mirror_side_roll(arm, pairs=MIRROR_PAIRS):
    from mathutils import Matrix
    s = Matrix.Diagonal((-1.0, 1.0, 1.0))
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    n = 0
    for rname, lname in pairs:
        r, lb = eb.get(rname), eb.get(lname)
        if not r or not lb:
            continue
        m = (s @ lb.matrix.to_3x3() @ s).to_4x4()
        m.translation = s @ lb.matrix.to_translation()
        r.matrix = m
        n += 1
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"mirrored roll onto right side: {n} bones")


def enable_rokoko():
    for mod in ("rokoko_stable", "rokoko_beta", "rokoko_rt"):
        try:
            bpy.ops.preferences.addon_enable(module=mod)
            print(f"rokoko: {mod}")
            return
        except Exception:  # noqa: BLE001
            continue
    raise SystemExit("Rokoko addon not available in this Blender")


def set_arm_prop(scene, prop, arm):
    try:
        setattr(scene, prop, arm)
    except (TypeError, ValueError):
        setattr(scene, prop, arm.name)


def retarget(char, anims, out, clips, plume=True, reweight=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene

    tgt, tgt_objs = import_glb(char)
    src, _ = import_glb(anims)
    print(f"target={tgt.name} source={src.name} actions={len(bpy.data.actions)}")

    # glTF import leaves a +90deg X object rotation; Rokoko's retarget assumes a
    # clean Z-up armature, so bake it into the bones first.
    for arm in (tgt, src):
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.transform_apply(
            location=False, rotation=True, scale=True)

    if reweight:
        reweight_neutral(tgt_objs, tgt)

    mirror_side_roll(tgt)

    enable_rokoko()

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
    src.animation_data.action = clip_action.get(clips[0]) or bpy.data.actions[0]

    set_arm_prop(sc, "rsl_retargeting_armature_source", src)
    set_arm_prop(sc, "rsl_retargeting_armature_target", tgt)
    sc.rsl_retargeting_use_pose = "REST"
    sc.rsl_retargeting_auto_scaling = False

    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    tgt.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    bpy.ops.rsl.build_bone_list()
    bl = sc.rsl_retargeting_bone_list
    tgt_bones = {b.name for b in tgt.pose.bones}
    for item in bl:
        if not item.bone_name_target and item.bone_name_source in tgt_bones:
            item.bone_name_target = item.bone_name_source
    mapped = sum(1 for b in bl if b.bone_name_target)
    print(f"bone_list total={len(bl)} mapped={mapped}")

    made = []
    for name in clips:
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
        result = tgt.animation_data.action if tgt.animation_data else None
        if res == {"FINISHED"} and result:
            result.name = f"RT_{name}"
            made.append((name, result))
        else:
            print(f"  no result for {name}: {res}")
    print(f"retargeted {len(made)}/{len(clips)}")

    for name, act in made:
        clash = bpy.data.actions.get(name)
        if clash and clash is not act:
            clash.name = f"SRC_{name}"
        act.name = name
    if made:
        tgt.animation_data.action = made[0][1]

    keep = {a for _, a in made}
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.delete()
    for a in list(bpy.data.actions):
        if a not in keep:
            bpy.data.actions.remove(a)

    if plume:
        add_plume(tgt, tgt_objs)

    bpy.ops.object.select_all(action="DESELECT")
    for o in tgt_objs:
        if o.name in bpy.data.objects:
            o.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    bpy.ops.export_scene.gltf(
        filepath=out, use_selection=True, export_yup=True, export_morph=False,
        export_animation_mode="ACTIONS", export_animations=True)
    size = round(os.path.getsize(out) / 1048576, 2)
    print(f"exported {out} {size} MB {[n for n, _ in made]}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    char, anims, out = argv[0], argv[1], argv[2]
    clips = argv[3].split(",")
    plume = argv[4] != "0" if len(argv) > 4 else True
    reweight = argv[5] != "0" if len(argv) > 5 else True
    retarget(char, anims, out, clips, plume=plume, reweight=reweight)


if __name__ == "__main__":
    main()
