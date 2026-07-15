"""Retarget the KURENAI mixamo asset onto the shared UE-mannequin rig.

The SIDEKICK parts already carry the UE skeleton, so build_parts_glb.py can
just reparent them. KURENAI ships a Mixamo skeleton instead, so it needs a true
cross-skeleton re-skin: pose the mixamo rig to overlay the master UE rig exactly
(per-bone world matrix), bake that rest pose into the mesh, then bind the meshes
onto the master rig by UE bone name. Grip/attach bones (prop_l/prop_r/headAttach
...) come for free from the master rig. Cosmetic bones with no UE equivalent
(smoke, cape, tissue, hat, pistons) are merged into the master rig as extra
child bones so future secondary-motion physics can drive them.

    blender -b -P retarget_kurenai.py

Outputs public/models/parts/kurenai.glb.
"""
import bpy
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
RIG_GLB = os.path.join(MODELS, "character-anim.glb")
CHARACTER_GLB = os.path.join(MODELS, "character.glb")
SRC_BLEND = os.path.join(HERE, "kurenai", "kurenai_lowpoly.blend")
OUT_GLB = os.path.join(MODELS, "parts", "kurenai.glb")
NODE_PREFIX = "KURN_"

KURENAI_MESHES = [
    "Body_Geo", "Cloth_Geo", "Head_Geo", "Fake_Smoke_Geo", "Info_circle_Geo",
]

# mixamo bone name -> UE-mannequin bone name (master rig). Note the source's
# left-forearm bone is mis-named 'mixamorig:ForeArm' (missing 'Left').
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
    "mixamorig:LeftHandThumb1": "thumb_01_l",
    "mixamorig:LeftHandThumb2": "thumb_02_l",
    "mixamorig:LeftHandThumb3": "thumb_03_l",
    "mixamorig:LeftHandIndex1": "index_01_l",
    "mixamorig:LeftHandIndex2": "index_02_l",
    "mixamorig:LeftHandIndex3": "index_03_l",
    "mixamorig:LeftHandMiddle1": "middle_01_l",
    "mixamorig:LeftHandMiddle2": "middle_02_l",
    "mixamorig:LeftHandMiddle3": "middle_03_l",
    "mixamorig:LeftHandPinky1": "pinky_01_l",
    "mixamorig:LeftHandPinky2": "pinky_02_l",
    "mixamorig:LeftHandPinky3": "pinky_03_l",
    "mixamorig:RightShoulder": "clavicle_r",
    "mixamorig:RightArm": "upperarm_r",
    "mixamorig:RightForeArm": "lowerarm_r",
    "mixamorig:RightHand": "hand_r",
    "mixamorig:RightHandThumb1": "thumb_01_r",
    "mixamorig:RightHandThumb2": "thumb_02_r",
    "mixamorig:RightHandThumb3": "thumb_03_r",
    "mixamorig:RightHandIndex1": "index_01_r",
    "mixamorig:RightHandIndex2": "index_02_r",
    "mixamorig:RightHandIndex3": "index_03_r",
    "mixamorig:RightHandMiddle1": "middle_01_r",
    "mixamorig:RightHandMiddle2": "middle_02_r",
    "mixamorig:RightHandMiddle3": "middle_03_r",
    "mixamorig:RightHandPinky1": "pinky_01_r",
    "mixamorig:RightHandPinky2": "pinky_02_r",
    "mixamorig:RightHandPinky3": "pinky_03_r",
    "mixamorig:LeftUpLeg": "thigh_l",
    "mixamorig:LeftLeg": "calf_l",
    "mixamorig:LeftFoot": "foot_l",
    "mixamorig:LeftToeBase": "ball_l",
    "mixamorig:RightUpLeg": "thigh_r",
    "mixamorig:RightLeg": "calf_r",
    "mixamorig:RightFoot": "foot_r",
    "mixamorig:RightToeBase": "ball_r",
}


def log(*a):
    print("[kurenai]", *a)


def import_master_rig():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=RIG_GLB)
    added = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in added if o.type == "ARMATURE")
    arm.name = NODE_PREFIX + "rig"
    for o in added:
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    arm.animation_data_clear()
    arm.location = (0, 0, 0)
    arm.rotation_euler = (0, 0, 0)
    return arm


def append_kurenai():
    with bpy.data.libraries.load(SRC_BLEND, link=False) as (src, dst):
        want = set(KURENAI_MESHES) | {"KURENAI_Rig"}
        dst.objects = [n for n in src.objects if n in want]
    added = []
    for o in dst.objects:
        if o is not None:
            bpy.context.scene.collection.objects.link(o)
            added.append(o)
    arm = next(o for o in added if o.type == "ARMATURE")
    arm.animation_data_clear()
    meshes = [o for o in added if o.type == "MESH"]
    for m in meshes:
        if m.data.validate(verbose=False):
            log("   cleaned invalid geometry in", m.name)
    return arm, meshes


def apply_transforms(arm, meshes):
    """Normalize to world scale/orientation. The source meshes are parented to
    the armature at 0.01 scale / 90deg tilt; applying transforms while they are
    still parented leaves some mesh origins offset (which the gltf exporter then
    bakes into skinned POSITION and floats the mesh). So: unparent each mesh
    keeping its world position, force its origin to the world origin, then apply
    the transform to the armature alone so its bones land at world scale."""
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


def ue_rest_world(arm_master):
    """UE bone name -> rest world matrix (armature at origin identity)."""
    out = {}
    w = arm_master.matrix_world
    for b in arm_master.data.bones:
        out[b.name] = w @ b.matrix_local
    return out


def disconnect_bones(arm_src):
    """Free every bone head from its parent tail so pose-space translation is
    honoured during the overlay (mixamo ships connected bones)."""
    bpy.ops.object.select_all(action="DESELECT")
    arm_src.select_set(True)
    bpy.context.view_layer.objects.active = arm_src
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm_src.data.edit_bones:
        eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")


def rename_kurenai(arm_src, meshes):
    for b in arm_src.data.bones:
        if b.name in BONE_MAP:
            b.name = BONE_MAP[b.name]
    for m in meshes:
        for vg in m.vertex_groups:
            if vg.name in BONE_MAP:
                vg.name = BONE_MAP[vg.name]


def overlay_pose(arm_src, ue_rest):
    """Pose the (renamed) source rig so each mapped bone overlays the UE rig
    exactly in world space. Cosmetic bones ride along with their parent."""
    bpy.ops.object.select_all(action="DESELECT")
    arm_src.select_set(True)
    bpy.context.view_layer.objects.active = arm_src
    bpy.ops.object.mode_set(mode="POSE")
    w_inv = arm_src.matrix_world.inverted()

    def depth(pb):
        d, p = 0, pb.parent
        while p:
            d += 1
            p = p.parent
        return d
    for pb in sorted(arm_src.pose.bones, key=depth):
        target = ue_rest.get(pb.name)
        if target is None:
            continue
        pb.matrix = w_inv @ target
        bpy.context.view_layer.update()
    worst = 0.0
    for pb in arm_src.pose.bones:
        if pb.name in ue_rest:
            got = (arm_src.matrix_world @ pb.matrix).translation
            worst = max(worst, (got - ue_rest[pb.name].translation).length)
    log(f"   overlay worst joint error: {worst:.4f}")
    bpy.ops.object.mode_set(mode="OBJECT")


def capture_cosmetic(arm_src):
    """Record posed world head/tail/roll of every source bone with no UE
    mapping, plus its nearest mapped ancestor, so they can be re-created in the
    master rig as valid deform joints for their (cosmetic) vertex weights."""
    from mathutils import Vector
    w = arm_src.matrix_world
    mapped = set(BONE_MAP.values())
    out = {}
    for pb in arm_src.pose.bones:
        if pb.name in mapped:
            continue
        anc = pb.parent
        while anc and anc.name not in mapped and anc.name not in out:
            anc = anc.parent
        parent = anc.name if anc else "pelvis"
        mw = w @ pb.matrix
        out[pb.name] = (mw @ Vector((0, 0, 0)),
                        mw @ Vector((0, max(pb.length, 0.02), 0)), parent)
    return out


def merge_cosmetic_bones(arm_master, cosmetic):
    m_inv = arm_master.matrix_world.inverted()
    bpy.ops.object.select_all(action="DESELECT")
    arm_master.select_set(True)
    bpy.context.view_layer.objects.active = arm_master
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_master.data.edit_bones
    for name, (head, tail, parent) in cosmetic.items():
        if name in eb:
            continue
        nb = eb.new(name)
        nb.head = m_inv @ head
        nb.tail = m_inv @ tail
        if parent in eb:
            nb.parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    log("   merged cosmetic bones:", len(cosmetic))


def bake_pose(meshes):
    """Freeze the overlaid UE-width pose into each mesh's raw geometry by
    applying its armature modifier (do this with NO intervening mode switch, or
    the pose resets to rest first). Afterwards the raw vertices already sit at
    the UE rest pose."""
    for m in meshes:
        mods = [md for md in m.modifiers if md.type == "ARMATURE"]
        if not mods:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.modifier_apply(modifier=mods[0].name)


def rebuild_clean(m):
    """Rebuild the mesh from fresh geometry, copying verts/faces/materials and
    vertex weights into a brand-new datablock. The appended meshes can carry a
    stale 'position' attribute (one was flagged invalid) that the gltf exporter
    reads instead of the live coordinates, floating the mesh; a fresh datablock
    has a single clean position layer. Returns the new object (old one removed)."""
    me = m.data
    nm = bpy.data.meshes.new(me.name + "_C")
    nm.from_pydata([v.co.copy() for v in me.vertices], [],
                   [tuple(p.vertices) for p in me.polygons])
    nm.update()
    for mat in me.materials:
        nm.materials.append(mat)
    for pn, po in zip(nm.polygons, me.polygons):
        pn.material_index = po.material_index
    for uv in me.uv_layers:
        nuv = nm.uv_layers.new(name=uv.name)
        for i, d in enumerate(uv.data):
            nuv.data[i].uv = d.uv
    no = bpy.data.objects.new(m.name, nm)
    bpy.context.scene.collection.objects.link(no)
    gname = {i: g.name for i, g in enumerate(m.vertex_groups)}
    for g in m.vertex_groups:
        no.vertex_groups.new(name=g.name)
    ng = {g.name: g for g in no.vertex_groups}
    for vi, v in enumerate(me.vertices):
        for g in v.groups:
            if g.weight > 0:
                ng[gname[g.group]].add([vi], g.weight, "REPLACE")
    bpy.data.objects.remove(m, do_unlink=True)
    return no


def bind_to_master(arm_master, meshes):
    """Rebind the baked meshes onto the master UE rig: rebuild each into a clean
    datablock, bind by the shared bone names, cap to 4 weights (gltf limit) and
    normalise. Returns the new mesh objects."""
    out = []
    for m in meshes:
        base = m.name.replace("_Geo", "")
        for md in list(m.modifiers):
            m.modifiers.remove(md)
        m.parent = None
        m.data.transform(m.matrix_basis)
        no = rebuild_clean(m)
        bpy.ops.object.select_all(action="DESELECT")
        no.select_set(True)
        bpy.context.view_layer.objects.active = no
        md = no.modifiers.new("Armature", "ARMATURE")
        md.object = arm_master
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        no.name = NODE_PREFIX + base
        out.append(no)
    return out


BODY_WEIGHT_MESHES = {"KURN_Body", "KURN_Head", "KURN_Cloth"}


def inject_body_weights(meshes):
    """Transfer skin weights from the base character body onto KURENAI's body
    meshes by surface proximity. The mixamo source had no UE twist bones, so its
    forearms/thighs candy-wrapper when the shared clips roll a limb; the base
    body is weighted across the twist bones, so copying its weights makes KURENAI
    deform exactly like every other character. Cosmetic meshes (smoke, holo) are
    left on their own bones."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=CHARACTER_GLB)
    added = [o for o in bpy.data.objects if o not in before]
    src_meshes = [o for o in added if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in src_meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = src_meshes[0]
    bpy.ops.object.join()
    src = bpy.context.view_layer.objects.active
    for m in meshes:
        if m.name not in BODY_WEIGHT_MESHES:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        dt = m.modifiers.new("DT", "DATA_TRANSFER")
        dt.object = src
        dt.use_vert_data = True
        dt.data_types_verts = {"VGROUP_WEIGHTS"}
        dt.vert_mapping = "POLYINTERP_NEAREST"
        dt.layers_vgroup_select_src = "ALL"
        dt.layers_vgroup_select_dst = "NAME"
        bpy.ops.object.datalayout_transfer(modifier="DT")
        bpy.ops.object.modifier_apply(modifier="DT")
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    for o in [o for o in bpy.data.objects if o in set(added) or o is src]:
        bpy.data.objects.remove(o, do_unlink=True)


def prune_skeleton(arm_master, meshes):
    """Strip every master-rig bone KURENAI's meshes are not weighted to (twist,
    attach, ik, face, unused fingers) so the part ships only the bones that were
    in the source rig plus their parent chain. The runtime rebinds by name onto
    the full master rig, so the extras were pure bloat; keeping just the used
    bones also stops the un-weighted twist bones from interfering."""
    used = set()
    for m in meshes:
        gi = {i: g.name for i, g in enumerate(m.vertex_groups)}
        for v in m.data.vertices:
            for g in v.groups:
                if g.weight > 0:
                    used.add(gi[g.group])
    keep = set(used)
    for b in arm_master.data.bones:
        if b.name in used:
            p = b.parent
            while p:
                keep.add(p.name)
                p = p.parent
    bpy.ops.object.select_all(action="DESELECT")
    arm_master.select_set(True)
    bpy.context.view_layer.objects.active = arm_master
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_master.data.edit_bones
    for b in [b for b in eb if b.name not in keep]:
        eb.remove(b)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"   pruned skeleton to {len(keep)} bones "
        f"({len(arm_master.data.bones)} remain)")


BAKE_RES = 256

# meshes whose emissive/transparent materials do not bake; use a flat emissive.
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
    """Bake each mesh's procedural materials (albedo + emission composited) into
    one PSX texture per mesh so the crimson gradients / glow survive to gltf,
    then replace the material stack with a single unlit-ish Principled sampling
    that texture with nearest-neighbour filtering."""
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


def export(arm_master, meshes):
    keep = {arm_master, *meshes}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    from mathutils import Matrix
    for m in meshes:
        m.parent = arm_master
        m.matrix_parent_inverse = Matrix.Identity(4)
        m.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm_master.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = arm_master
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB, use_selection=True, export_yup=True,
        export_morph=False, export_animations=False,
        export_apply=False)
    log("exported", OUT_GLB, [m.name for m in meshes])


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm_master = import_master_rig()
    ue_rest = ue_rest_world(arm_master)

    arm_src, meshes = append_kurenai()
    apply_transforms(arm_src, meshes)

    disconnect_bones(arm_src)
    rename_kurenai(arm_src, meshes)
    overlay_pose(arm_src, ue_rest)
    cosmetic = capture_cosmetic(arm_src)
    bake_pose(meshes)

    bpy.data.objects.remove(arm_src, do_unlink=True)
    merge_cosmetic_bones(arm_master, cosmetic)
    meshes = bind_to_master(arm_master, meshes)
    prune_skeleton(arm_master, meshes)
    arm_master.name = NODE_PREFIX + "rig"
    bake_materials(meshes)
    export(arm_master, meshes)


if __name__ == "__main__":
    main()
