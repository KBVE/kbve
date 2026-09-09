"""Attach the SIDEKICK human skin body onto the already-animated knight rig.

The good `character-anim.glb` was retargeted via the Rokoko GUI (the headless
`retarget_bake.py` contorts the body). Re-running retarget to add a skin base is
therefore off the table. Instead we bind the human species body parts straight
onto the animated armature: they carry the SAME 88-bone UE skeleton, so pointing
each skin mesh's Armature modifier at the target rig makes it follow the baked
clips with no retarget. The skin becomes a permanent base; the knight meshes stay
as a removable layer (see src/game/character/armor.ts).

Skin parts come from SIDEKICK_Starter_Unity_2021_3_v1_0_4.unitypackage — human
variant 01 body slots 10TORS..21FOTR + 38WRAP (underwear). Extract each GUID dir's
`asset` file (renamed to its `pathname` basename) into parts_dir, and
T_HumanSpecies_01ColorMap.png into tex_dir.

    blender -b -P attach_skin_body.py -- <parts_dir> <tex_dir> [out.glb]
"""
import bpy
import os
import sys
import re
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models"))
GLB = os.path.join(MODELS, "character-anim.glb")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    parts_dir, tex_dir = argv[0], argv[1]
    out = argv[2] if len(argv) > 2 else GLB

    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    tgt_objs = [o for o in bpy.data.objects if o not in before]
    arm_t = next(o for o in tgt_objs if o.type == "ARMATURE")

    img = bpy.data.images.load(
        os.path.join(tex_dir, "T_HumanSpecies_01ColorMap.png"))
    mat = bpy.data.materials.new("sk_skin")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    added = []
    for fbx in sorted(glob.glob(os.path.join(parts_dir, "*.fbx"))):
        base = os.path.basename(fbx)
        b0 = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(
            filepath=fbx, automatic_bone_orientation=False)
        new = [o for o in bpy.data.objects if o not in b0]
        arm_s = next(o for o in new if o.type == "ARMATURE")
        slot = re.sub(r"^\d+", "", base.replace(".fbx", "").split("_")[4])
        for m in (o for o in new if o.type == "MESH"):
            m.data.materials.clear()
            m.data.materials.append(mat)
            for mod in m.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = arm_t
            mp = m.matrix_world.copy()
            m.parent = arm_t
            m.matrix_world = mp
            m.name = "SKIN_" + slot
            added.append(m.name)
        bpy.data.objects.remove(arm_s, do_unlink=True)
    print("attached", added)

    bpy.ops.object.select_all(action="DESELECT")
    for o in tgt_objs:
        if o.name in bpy.data.objects:
            o.select_set(True)
    for n in added:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = arm_t
    bpy.ops.export_scene.gltf(
        filepath=out, use_selection=True, export_yup=True,
        export_morph=True, export_animation_mode="ACTIONS",
        export_animations=True)
    print("exported", out)


if __name__ == "__main__":
    main()
