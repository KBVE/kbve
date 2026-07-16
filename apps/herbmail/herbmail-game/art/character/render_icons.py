"""Render 64x64 inventory icons for SIDEKICK equipment sets.

Each set item (see docs/superpowers/specs/2026-07-13-herbmail-itemdb-
equipment-design.md) imports all of its part FBX meshes, frames them with an
orthographic 3/4 camera and renders on a transparent background.

    blender -b -P render_icons.py -- <parts_dir> <tex_dir> <out_dir>
"""
import bpy
import os
import sys
import math
from mathutils import Vector

KNGT = "SK_FANT_KNGT_17_"
SC09 = "SK_SCFI_CIVL_09_"
SC10 = "SK_SCFI_CIVL_10_"
HORR = "SK_HORR_VILN_01_"

SETS = [
    ("vanguard-helm", KNGT, ["22AHED"], "T_Starter_01ColorMap.png"),
    ("worn-eye-patch", KNGT, ["23AFAC"], "T_Starter_01ColorMap.png"),
    ("campaign-pack", KNGT, ["24ABAC"], "T_Starter_01ColorMap.png"),
    ("vanguard-breastplate", KNGT, ["10TORS"], "T_Starter_01ColorMap.png"),
    ("vanguard-pauldrons", KNGT, ["29ASHL",
     "30ASHR"], "T_Starter_01ColorMap.png"),
    ("vanguard-arm-guards", KNGT, ["11AUPL", "12AUPR"],
     "T_Starter_01ColorMap.png"),
    ("vanguard-elbow-guards", KNGT, ["31AEBL",
     "32AEBR"], "T_Starter_01ColorMap.png"),
    ("vanguard-bracers", KNGT, ["13ALWL",
     "14ALWR"], "T_Starter_01ColorMap.png"),
    ("vanguard-gauntlets", KNGT, ["15HNDL",
     "16HNDR"], "T_Starter_01ColorMap.png"),
    ("vanguard-tassets", KNGT, ["17HIPS"], "T_Starter_01ColorMap.png"),
    ("vanguard-faulds", KNGT, ["25AHPF", "26AHPB",
     "27AHPL", "28AHPR"], "T_Starter_01ColorMap.png"),
    ("vanguard-greaves", KNGT, ["18LEGL",
     "19LEGR"], "T_Starter_01ColorMap.png"),
    ("vanguard-knee-guards", KNGT, ["33AKNL",
     "34AKNR"], "T_Starter_01ColorMap.png"),
    ("vanguard-sabatons", KNGT, ["20FOTL",
     "21FOTR"], "T_Starter_01ColorMap.png"),
    ("ion-blue-hair", SC09, ["02HAIR"], "T_Starter_02ColorMap.png"),
    ("optic-visor", SC09, ["22AHED"], "T_Starter_02ColorMap.png"),
    ("filter-mask", SC09, ["23AFAC"], "T_Starter_02ColorMap.png"),
    ("tech-pack", SC09, ["24ABAC"], "T_Starter_02ColorMap.png"),
    ("circuit-jacket", SC09, ["10TORS"], "T_Starter_02ColorMap.png"),
    ("padded-sleeves", SC09, ["11AUPL", "12AUPR"],
     "T_Starter_02ColorMap.png"),
    ("utility-cuffs", SC09, ["13ALWL", "14ALWR"], "T_Starter_02ColorMap.png"),
    ("grip-gloves", SC09, ["15HNDL", "16HNDR"], "T_Starter_02ColorMap.png"),
    ("cargo-slacks", SC09, ["17HIPS"], "T_Starter_02ColorMap.png"),
    ("shin-wraps", SC09, ["18LEGL",
     "19LEGR"], "T_Starter_02ColorMap.png"),
    ("mag-sneakers", SC09, ["20FOTL",
     "21FOTR"], "T_Starter_02ColorMap.png"),
    ("pouch-rig", SC09, ["25AHPF", "26AHPB",
     "27AHPL", "28AHPR"], "T_Starter_02ColorMap.png"),
    ("impact-shoulder-pads", SC09,
     ["29ASHL", "30ASHR"], "T_Starter_02ColorMap.png"),
    ("impact-elbow-pads", SC09, ["31AEBL",
     "32AEBR"], "T_Starter_02ColorMap.png"),
    ("impact-knee-pads", SC09, ["33AKNL",
     "34AKNR"], "T_Starter_02ColorMap.png"),
    ("crest-helmet", SC10, ["22AHED"], "T_Starter_02ColorMap.png"),
    ("hardcase-pouches", SC10,
     ["26AHPB", "27AHPL", "28AHPR"], "T_Starter_02ColorMap.png"),
    ("hardpoint-shoulders", SC10, ["29ASHL",
     "30ASHR"], "T_Starter_02ColorMap.png"),
    ("grinning-pumpkin-helm", HORR, ["22AHED"], "T_Starter_04ColorMap.png"),
]


def make_material(tex_path):
    img = bpy.data.images.load(tex_path)
    mat = bpy.data.materials.new("icon_mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def render_icon(ref, prefix, slots, tex_path, parts_dir, out_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material(tex_path)

    meshes = []
    for slot in slots:
        fbx = os.path.join(parts_dir, f"{prefix}{slot}_HU01.fbx")
        b0 = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(
            filepath=fbx, automatic_bone_orientation=False)
        new = [o for o in bpy.data.objects if o not in b0]
        for o in new:
            if o.type == "MESH" and len(o.data.vertices) > 8:
                o.data.materials.clear()
                o.data.materials.append(mat)
                meshes.append(o)
            elif o.type == "MESH":
                bpy.data.objects.remove(o, do_unlink=True)

    def mesh_bounds():
        deps = bpy.context.evaluated_depsgraph_get()
        out = []
        for m in meshes:
            ev = m.evaluated_get(deps)
            mlo = Vector((1e9, 1e9, 1e9))
            mhi = Vector((-1e9, -1e9, -1e9))
            for c in ev.bound_box:
                w = ev.matrix_world @ Vector(c)
                mlo = Vector(map(min, mlo, w))
                mhi = Vector(map(max, mhi, w))
            out.append((m, mlo, mhi))
        return out

    # Paired parts rest a full arm-span apart in the T-pose, which makes each
    # piece a speck in the shared frame — pull spread parts into a tight
    # side-by-side cluster before framing.
    bounds = mesh_bounds()
    if len(bounds) > 1:
        sizes = [max(mhi - mlo) for _, mlo, mhi in bounds]
        centers = [(mlo + mhi) / 2 for _, mlo, mhi in bounds]
        spread = max(
            (a - b).length for a in centers for b in centers)
        if spread > 1.5 * max(sizes):
            anchor = centers[0]
            x = 0.0
            for (m, mlo, mhi), c in zip(bounds, centers):
                width = (mhi - mlo).x
                target = anchor + Vector((x, 0, 0))
                m.matrix_world.translation += target - c
                x += width * 1.1
            bpy.context.view_layer.update()
            bounds = mesh_bounds()

    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for _, mlo, mhi in bounds:
        lo = Vector(map(min, lo, mlo))
        hi = Vector(map(max, hi, mhi))
    center = (lo + hi) / 2
    extent = max(hi - lo)

    cam_data = bpy.data.cameras.new("icon_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = extent * 1.25
    cam = bpy.data.objects.new("icon_cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    direction = Vector((1.0, -1.2, 0.7)).normalized()
    cam.location = center + direction * max(extent * 3, 1.0)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.context.scene.camera = cam

    sun = bpy.data.objects.new(
        "icon_sun", bpy.data.lights.new("icon_sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), math.radians(-20),
                          math.radians(30))
    bpy.context.scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("icon_world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    bpy.context.scene.world = world

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = os.path.join(out_dir, f"{ref}.png")
    bpy.ops.render.render(write_still=True)
    print("icon", ref, "extent", round(extent, 3))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    parts_dir, tex_dir, out_dir = argv[0], argv[1], argv[2]
    os.makedirs(out_dir, exist_ok=True)
    only = set(argv[3:])
    for ref, prefix, slots, tex in SETS:
        if only and ref not in only:
            continue
        render_icon(ref, prefix, slots, os.path.join(tex_dir, tex),
                    parts_dir, out_dir)


if __name__ == "__main__":
    main()
