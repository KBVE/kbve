import bpy
import sys
import os
import glob
argv = sys.argv[sys.argv.index("--") + 1:]
parts_dir, tex_dir, out = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, img_path):
    img = bpy.data.images.load(img_path)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = 'Closest'
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


mat_outfit = make_mat("sk_outfit", os.path.join(
    tex_dir, "T_Starter_01ColorMap.png"))
mat_skin = make_mat("sk_skin", os.path.join(
    tex_dir, "T_HumanSpecies_01ColorMap.png"))

master = None
meshes = []
for fbx in sorted(glob.glob(os.path.join(parts_dir, "*.fbx"))):
    base = os.path.basename(fbx)
    mat = mat_skin if "HUMN_BASE" in base else mat_outfit
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx, automatic_bone_orientation=False)
    new = list(set(bpy.data.objects) - before)
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    ms = [o for o in new if o.type == 'MESH']
    for m in ms:
        m.data.materials.clear()
        m.data.materials.append(mat)
        if master is not None:
            for mod in m.modifiers:
                if mod.type == 'ARMATURE':
                    mod.object = master
            mp = m.matrix_world.copy()
            m.parent = master
            m.matrix_world = mp
    if master is None:
        master = arm
    elif arm:
        bpy.data.objects.remove(arm, do_unlink=True)
    meshes += ms

bpy.ops.object.select_all(action='DESELECT')
for m in meshes:
    m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = "SidekickCharacter"
print("FINAL_VERTS", len(body.data.vertices), "MATS", len(
    body.data.materials), "BONES", len(master.data.bones))

bpy.ops.object.select_all(action='DESELECT')
master.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = master
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_skins=True,
    export_yup=True,
    export_morph=False,
    export_draco_mesh_compression_enable=False)
print("EXPORTED", out, round(os.path.getsize(out) / 1048576, 2), "MB")
