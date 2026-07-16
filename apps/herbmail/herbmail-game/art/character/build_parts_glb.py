"""Build lazy-loadable SIDEKICK wardrobe part glbs (no animation).

Each SIDEKICK part FBX carries the full 88-bone UE-mannequin skeleton, so the
parts only need to ship with one rest-pose armature per glb; at runtime the
meshes are rebound onto the animated character rig by bone name
(src/game/character/partsLoader.ts). character-anim.glb is never touched.

    blender -b -P build_parts_glb.py -- <parts_dir> <tex_dir> <out_dir>

Outputs scifi-civ09.glb / scifi-civ10.glb / horr-viln01.glb into <out_dir>.
"""
import bpy
import os
import re
import sys
import glob

SETS = [
    ("scifi-civ09.glb", "SK_SCFI_CIVL_09_", "SCFI09_",
     "T_Starter_02ColorMap.png"),
    ("scifi-civ10.glb", "SK_SCFI_CIVL_10_", "SCFI10_",
     "T_Starter_02ColorMap.png"),
    ("horr-viln01.glb", "SK_HORR_VILN_01_", "HORR01_",
     "T_Starter_04ColorMap.png"),
]


def make_material(name, tex_path):
    img = bpy.data.images.load(tex_path)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def merge_missing_bones(arm_master, arm_s):
    have = set(b.name for b in arm_master.data.bones)
    missing = [b for b in arm_s.data.bones if b.name not in have]
    if not missing:
        return

    def depth(b):
        d = 0
        while b.parent:
            d += 1
            b = b.parent
        return d
    missing.sort(key=depth)
    world_s = arm_s.matrix_world.copy()
    world_m_inv = arm_master.matrix_world.inverted()
    bpy.ops.object.select_all(action="DESELECT")
    arm_master.select_set(True)
    bpy.context.view_layer.objects.active = arm_master
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm_master.data.edit_bones
    for bone in missing:
        eb = ebones.new(bone.name)
        mat = world_m_inv @ world_s @ bone.matrix_local
        eb.matrix = mat
        scale = (world_m_inv @ world_s).to_scale()[0]
        eb.length = max(bone.length * scale, 0.001)
        if bone.parent and bone.parent.name in ebones:
            eb.parent = ebones[bone.parent.name]
    bpy.ops.object.mode_set(mode="OBJECT")


def build_set(out_path, prefix, node_prefix, tex_path, parts_dir, rig_glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=rig_glb)
    rig_objs = [o for o in bpy.data.objects if o not in before]
    arm_master = next(o for o in rig_objs if o.type == "ARMATURE")
    arm_master.name = node_prefix + "rig"
    for o in rig_objs:
        if o.type == "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    arm_master.animation_data_clear()

    mat = make_material(node_prefix + "mat", tex_path)
    meshes = []
    for fbx in sorted(glob.glob(os.path.join(parts_dir, prefix + "*.fbx"))):
        base = os.path.basename(fbx)
        b0 = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(
            filepath=fbx, automatic_bone_orientation=False)
        new = [o for o in bpy.data.objects if o not in b0]
        arm_s = next(o for o in new if o.type == "ARMATURE")
        merge_missing_bones(arm_master, arm_s)
        slot = re.sub(r"^\d+", "", base.replace(".fbx", "").split("_")[4])
        for m in (o for o in new if o.type == "MESH"):
            m.data.materials.clear()
            m.data.materials.append(mat)
            for mod in m.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = arm_master
            mp = m.matrix_world.copy()
            m.parent = arm_master
            m.matrix_world = mp
            m.name = node_prefix + slot
            meshes.append(m.name)
        bpy.data.objects.remove(arm_s, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    arm_master.select_set(True)
    for n in meshes:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = arm_master
    bpy.ops.export_scene.gltf(
        filepath=out_path, use_selection=True, export_yup=True,
        export_morph=False, export_animations=False)
    print("exported", out_path, len(meshes), "meshes:", meshes)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    parts_dir, tex_dir, out_dir = argv[0], argv[1], argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    rig_glb = os.path.normpath(os.path.join(
        here, "..", "..", "public", "models", "character-anim.glb"))
    os.makedirs(out_dir, exist_ok=True)
    for out_name, prefix, node_prefix, tex in SETS:
        build_set(os.path.join(out_dir, out_name), prefix, node_prefix,
                  os.path.join(tex_dir, tex), parts_dir, rig_glb)


if __name__ == "__main__":
    main()
