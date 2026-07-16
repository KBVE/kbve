"""Bake the shared UE clips onto KURENAI's own mixamo rig.

KURENAI is a stylised, non-human-proportioned character (skirt, thin legs,
arms-down authoring). Re-posing its mesh onto the UE T-rest to share the rig
breaks its artist weights, so instead we keep KURENAI's own rig / mesh / weights
untouched and retarget the *animation*: each KURENAI bone copies the world
rotation of its UE counterpart while the master rig plays a clip, and the result
is baked into a KURENAI-owned action. KURENAI then ships as a self-contained
animated glb that plays its own clips.

    blender -b -P retarget_kurenai_anim.py

Outputs public/models/parts/kurenai.glb (mesh + own rig + baked clips).
"""
import bpy
import os
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
RIG_GLB = os.path.join(MODELS, "character-anim.glb")
SRC_FBX = os.path.join(HERE, "kurenai", "kurenai_lowpoly.fbx")
OUT_GLB = os.path.join(MODELS, "parts", "kurenai.glb")

# KURENAI mixamo bone -> UE master bone whose motion it should follow.
BONE_MAP = {
    "mixamorig:Hips": "pelvis",
    "mixamorig:Spine": "spine_01",
    "mixamorig:Spine1": "spine_02",
    "mixamorig:Spine2": "spine_03",
    "mixamorig:Neck": "neck_01",
    "mixamorig:Head": "head",
    "mixamorig:LeftShoulder": "clavicle_l",
    "mixamorig:LeftArm": "upperarm_l",
    "mixamorig:ForeArm": "lowerarm_l",
    "mixamorig:LeftHand": "hand_l",
    "mixamorig:RightShoulder": "clavicle_r",
    "mixamorig:RightArm": "upperarm_r",
    "mixamorig:RightForeArm": "lowerarm_r",
    "mixamorig:RightHand": "hand_r",
    "mixamorig:LeftUpLeg": "thigh_l",
    "mixamorig:LeftLeg": "calf_l",
    "mixamorig:LeftFoot": "foot_l",
    "mixamorig:LeftToeBase": "ball_l",
    "mixamorig:RightUpLeg": "thigh_r",
    "mixamorig:RightLeg": "calf_r",
    "mixamorig:RightFoot": "foot_r",
    "mixamorig:RightToeBase": "ball_r",
}

# clips the wandering NPC needs, plus a couple of flourishes.
CLIPS = [
    "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop",
    "Idle_FoldArms_Loop", "Sword_Regular_A", "Hit_Chest", "Death_D",
]


def log(*a):
    print("[kurenai-anim]", *a)


def import_master():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=RIG_GLB)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in added if o.type == "ARMATURE")
    for o in added:
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    arm.name = "MASTER"
    return arm


def import_kurenai():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(
        filepath=SRC_FBX, automatic_bone_orientation=False)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in added if o.type == "ARMATURE")
    arm.animation_data_clear()
    meshes = [o for o in added if o.type == "MESH"]
    # world scale / upright: unparent (keep world), zero origins, apply on rig
    bpy.context.scene.cursor.location = (0, 0, 0)
    for m in meshes:
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mw
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # rebind meshes to the (now world-scale) rig
    for m in meshes:
        for md in list(m.modifiers):
            m.modifiers.remove(md)
        m.parent = arm
        m.matrix_parent_inverse.identity()
        md = m.modifiers.new("Armature", "ARMATURE")
        md.object = arm
    arm.name = "KURN_rig"
    return arm, meshes


def build_retarget(kurn, master):
    """Precompute, per mapped bone, the rest data needed to apply the UE bone's
    world-space rotation delta onto KURENAI's own rest orientation. Working in
    world-space deltas makes the transfer independent of the differing mixamo /
    UE bone axes."""
    kw = kurn.matrix_world
    mw = master.matrix_world
    plan = []
    order = {b.name: i for i, b in enumerate(kurn.data.bones)}  # parents first
    for kbone, uebone in sorted(BONE_MAP.items(), key=lambda kv: order.get(kv[0], 999)):
        kpb = kurn.pose.bones.get(kbone)
        upb = master.pose.bones.get(uebone)
        if kpb is None or upb is None:
            continue
        ue_rest_r = (mw @ upb.bone.matrix_local).to_3x3()
        k_rest_r = (kw @ kpb.bone.matrix_local).to_3x3()
        plan.append((kpb, upb, ue_rest_r, k_rest_r,
                     kbone == "mixamorig:Hips"))
    hips_ue_rest = (mw @ master.pose.bones["pelvis"].bone.matrix_local
                    ).translation
    hips_k_rest = (kw @ kurn.pose.bones["mixamorig:Hips"].bone.matrix_local
                   ).translation
    return plan, hips_ue_rest, hips_k_rest


def bake_clips(kurn, master, actions):
    plan, hips_ue_rest, hips_k_rest = build_retarget(kurn, master)
    kw = kurn.matrix_world
    kw_inv = kw.inverted()
    mw = master.matrix_world
    for pb in kurn.pose.bones:
        pb.rotation_mode = "QUATERNION"
    baked = {}
    for name in CLIPS:
        act = actions.get(name)
        if act is None:
            log("MISSING clip", name)
            continue
        master.animation_data_create()
        master.animation_data.action = act
        if getattr(act, "slots", None):
            master.animation_data.action_slot = act.slots[0]
        fr = act.frame_range
        f0, f1 = int(fr[0]), int(fr[1])
        kurn.animation_data_create()
        new_act = bpy.data.actions.new(name + "_bake")
        kurn.animation_data.action = new_act
        for f in range(f0, f1 + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            for kpb, upb, ue_rest_r, k_rest_r, is_hips in plan:
                delta = (mw @ upb.matrix).to_3x3() @ ue_rest_r.inverted()
                target_r = delta @ k_rest_r
                head = (kw @ kpb.matrix).translation
                world = Matrix.Translation(head) @ target_r.to_4x4()
                if is_hips:
                    ue_off = (mw @ upb.matrix).translation - hips_ue_rest
                    world = (Matrix.Translation(hips_k_rest + ue_off)
                             @ target_r.to_4x4())
                kpb.matrix = kw_inv @ world
                bpy.context.view_layer.update()
                kpb.keyframe_insert("rotation_quaternion", frame=f)
                if is_hips:
                    kpb.keyframe_insert("location", frame=f)
        baked[name] = new_act
        kurn.animation_data.action = None
        log("baked", name, f"{f0}-{f1}")
    return baked


BAKE_RES = 256
FLAT_FALLBACK = {
    "KURN_Info_circle": ((0.35, 0.8, 1.0), 1.6),
    "KURN_Fake_Smoke": ((0.45, 0.45, 0.48), 0.0),
}


def _demetal(meshes):
    seen = set()
    for m in meshes:
        for slot in m.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen or not mat.use_nodes:
                continue
            seen.add(mat.name)
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Metallic"].default_value = 0.0


def _flat_mat(name, color, emit):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Specular IOR Level"].default_value = 0.0
    b.inputs["Emission Color"].default_value = (*color, 1.0)
    b.inputs["Emission Strength"].default_value = emit
    nt.links.new(b.outputs["BSDF"], o.inputs["Surface"])
    return mat


def _ensure_uv(m):
    while m.data.uv_layers:
        m.data.uv_layers.remove(m.data.uv_layers[0])
    m.data.uv_layers.new(name="bake")
    bpy.ops.object.select_all(action="DESELECT")
    m.select_set(True)
    bpy.context.view_layer.objects.active = m
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.02, angle_limit=1.15)
    bpy.ops.object.mode_set(mode="OBJECT")


def _bake_pass(m, img, bake_type):
    for slot in m.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        nt = mat.node_tree
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = img
        node.select = True
        nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    m.select_set(True)
    bpy.context.view_layer.objects.active = m
    bpy.ops.object.bake(type=bake_type, use_clear=True, margin=4)
    for slot in m.material_slots:
        mat = slot.material
        if mat and mat.use_nodes:
            for n in [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE"]:
                mat.node_tree.nodes.remove(n)


def bake_materials(meshes):
    import numpy as np
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 4
    sc.render.bake.use_pass_direct = False
    sc.render.bake.use_pass_indirect = False
    sc.render.bake.use_pass_color = True
    _demetal(meshes)
    for m in meshes:
        if m.name in FLAT_FALLBACK:
            color, emit = FLAT_FALLBACK[m.name]
            m.data.materials.clear()
            m.data.materials.append(_flat_mat(m.name + "_mat", color, emit))
            continue
        _ensure_uv(m)
        diff = bpy.data.images.new(m.name + "_D", BAKE_RES, BAKE_RES)
        emit = bpy.data.images.new(m.name + "_E", BAKE_RES, BAKE_RES)
        _bake_pass(m, diff, "DIFFUSE")
        _bake_pass(m, emit, "EMIT")
        d = np.array(diff.pixels[:])
        e = np.array(emit.pixels[:])
        out = np.clip(d + e, 0.0, 1.0)
        out[3::4] = 1.0
        tex = bpy.data.images.new(m.name + "_TEX", BAKE_RES, BAKE_RES)
        tex.pixels = out.tolist()
        tex.pack()
        m.data.materials.clear()
        mat = bpy.data.materials.new(m.name + "_mat")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        b.inputs["Specular IOR Level"].default_value = 0.0
        b.inputs["Roughness"].default_value = 0.9
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = tex
        t.interpolation = "Closest"
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = 0.35
        nt.links.new(b.outputs["BSDF"], o.inputs["Surface"])
        m.data.materials.append(mat)
        bpy.data.images.remove(diff)
        bpy.data.images.remove(emit)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    master = import_master()
    actions = {a.name: a for a in bpy.data.actions}
    kurn, meshes = import_kurenai()
    baked = bake_clips(kurn, master, actions)
    bpy.data.objects.remove(master, do_unlink=True)
    # drop every master clip; keep only KURENAI's baked actions, clean names
    keep = set(baked.values())
    for a in list(bpy.data.actions):
        if a not in keep:
            bpy.data.actions.remove(a)
    for name, act in baked.items():
        act.name = name
    log("kept actions:", sorted(a.name for a in bpy.data.actions))

    for m in meshes:
        m.name = "KURN_" + m.name.replace("_Geo", "")
    bake_materials(meshes)

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    kurn.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = kurn
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB, use_selection=True, export_yup=True,
        export_animations=True, export_morph=False)
    log("exported", OUT_GLB)


if __name__ == "__main__":
    main()
