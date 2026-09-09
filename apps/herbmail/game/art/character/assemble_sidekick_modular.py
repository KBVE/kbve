import bpy
import sys
import os
import glob
import re

argv = sys.argv[sys.argv.index("--") + 1:]
parts_dir, tex_dir, out = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)

# Body armor comes from the knight outfit; head/face/eyes from the human
# species; hair from a civilian set. Most naked torso/limbs are skipped — the
# knight outfit ships its own under-armor body layer. Exception: the knight set
# has NO arm under-layer, so removing arm armor exposed a gap. The human species
# arm parts below fill it (see BODY_BASE in src/game/character/armor.ts). Each
# entry becomes its own named mesh so the game can toggle equipment per slot.
#
INCLUDE = {
    # slot: filename substring
    "SK_FANT_KNGT_17_": "outfit",           # all knight body + A* attachments
    "SK_HUMN_BASE_01_01HEAD": "skin",
    "SK_HUMN_BASE_01_03EBRL": "skin",
    "SK_HUMN_BASE_01_04EBRR": "skin",
    "SK_HUMN_BASE_01_05EYEL": "skin",
    "SK_HUMN_BASE_01_06EYER": "skin",
    "SK_HUMN_BASE_01_07EARL": "skin",
    "SK_HUMN_BASE_01_08EARR": "skin",
    "SK_HUMN_BASE_01_35NOSE": "skin",
    "SK_HUMN_BASE_01_36TETH": "skin",
    "SK_HUMN_BASE_01_37TONG": "skin",
    # Human arm skin: fills the gap the knight outfit leaves. Its raw tokens
    # (AUPL/AUPR/ALWL/ALWR) collide with the knight armor arm meshes, so
    # SKIN_ARM_RENAME below maps them to distinct S* nodes kept in BODY_BASE.
    "SK_HUMN_BASE_01_11AUPL": "skin",
    "SK_HUMN_BASE_01_12AUPR": "skin",
    "SK_HUMN_BASE_01_13ALWL": "skin",
    "SK_HUMN_BASE_01_14ALWR": "skin",
    "SK_SCFI_CIVL_09_02HAIR": "outfit",
}

# Skin-arm token -> distinct node name (raw tokens clash with knight armor).
SKIN_ARM_RENAME = {
    "AUPL": "SUPL",
    "AUPR": "SUPR",
    "ALWL": "SLWL",
    "ALWR": "SLWR",
}


def make_mat(name, img_path):
    img = bpy.data.images.load(img_path)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def slot_of(fbx_base):
    # SK_FANT_KNGT_17_10TORS_HU01 -> token '10TORS' -> 'TORS'
    toks = fbx_base.replace(".fbx", "").split("_")
    token = toks[4] if len(toks) > 4 else toks[-1]
    return re.sub(r"^\d+", "", token)


def want(base):
    for key, kind in INCLUDE.items():
        if key in base:
            return kind
    return None


mat_outfit = make_mat(
    "sk_outfit", os.path.join(tex_dir, "T_Starter_01ColorMap.png"))
mat_skin = make_mat(
    "sk_skin", os.path.join(tex_dir, "T_HumanSpecies_01ColorMap.png"))

master = None
kept = []
for fbx in sorted(glob.glob(os.path.join(parts_dir, "*.fbx"))):
    base = os.path.basename(fbx)
    kind = want(base)
    if not kind:
        continue
    mat = mat_skin if kind == "skin" else mat_outfit
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx, automatic_bone_orientation=False)
    new = list(set(bpy.data.objects) - before)
    arm = next((o for o in new if o.type == "ARMATURE"), None)
    ms = [o for o in new if o.type == "MESH"]
    slot = slot_of(base)
    if kind == "skin" and slot in SKIN_ARM_RENAME:
        slot = SKIN_ARM_RENAME[slot]
    for i, m in enumerate(ms):
        m.data.materials.clear()
        m.data.materials.append(mat)
        m.name = slot if len(ms) == 1 else f"{slot}_{i}"
        if master is not None:
            for mod in m.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = master
            mp = m.matrix_world.copy()
            m.parent = master
            m.matrix_world = mp
        kept.append(m)
    if master is None:
        master = arm
    elif arm:
        bpy.data.objects.remove(arm, do_unlink=True)

print("PARTS", len(kept), "slots:", sorted(m.name for m in kept))
print("BONES", len(master.data.bones))

bpy.ops.object.select_all(action="DESELECT")
master.select_set(True)
for m in kept:
    m.select_set(True)
bpy.context.view_layer.objects.active = master
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_yup=True,
    export_morph=False,
    export_draco_mesh_compression_enable=False,
)
print("EXPORTED", out, round(os.path.getsize(out) / 1048576, 2), "MB")
