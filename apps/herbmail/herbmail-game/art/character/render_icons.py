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
    ("kngt-helmet", KNGT, ["22AHED"], "T_Starter_01ColorMap.png"),
    ("kngt-eye-patch", KNGT, ["23AFAC"], "T_Starter_01ColorMap.png"),
    ("kngt-backpack", KNGT, ["24ABAC"], "T_Starter_01ColorMap.png"),
    ("kngt-chest", KNGT, ["10TORS"], "T_Starter_01ColorMap.png"),
    ("kngt-pauldrons", KNGT, ["29ASHL", "30ASHR"], "T_Starter_01ColorMap.png"),
    ("kngt-upper-arms", KNGT, ["11AUPL", "12AUPR"],
     "T_Starter_01ColorMap.png"),
    ("kngt-elbow-guards", KNGT, ["31AEBL",
     "32AEBR"], "T_Starter_01ColorMap.png"),
    ("kngt-bracers", KNGT, ["13ALWL", "14ALWR"], "T_Starter_01ColorMap.png"),
    ("kngt-gauntlets", KNGT, ["15HNDL", "16HNDR"], "T_Starter_01ColorMap.png"),
    ("kngt-hips", KNGT, ["17HIPS"], "T_Starter_01ColorMap.png"),
    ("kngt-fauld-set", KNGT, ["25AHPF", "26AHPB",
     "27AHPL", "28AHPR"], "T_Starter_01ColorMap.png"),
    ("kngt-legs", KNGT, ["18LEGL", "19LEGR"], "T_Starter_01ColorMap.png"),
    ("kngt-knee-guards", KNGT, ["33AKNL",
     "34AKNR"], "T_Starter_01ColorMap.png"),
    ("kngt-boots", KNGT, ["20FOTL", "21FOTR"], "T_Starter_01ColorMap.png"),
    ("scifi09-hair", SC09, ["02HAIR"], "T_Starter_02ColorMap.png"),
    ("scifi09-visor", SC09, ["22AHED"], "T_Starter_02ColorMap.png"),
    ("scifi09-mask", SC09, ["23AFAC"], "T_Starter_02ColorMap.png"),
    ("scifi09-tech-pack", SC09, ["24ABAC"], "T_Starter_02ColorMap.png"),
    ("scifi09-jacket", SC09, ["10TORS"], "T_Starter_02ColorMap.png"),
    ("scifi09-sleeves", SC09, ["11AUPL", "12AUPR"],
     "T_Starter_02ColorMap.png"),
    ("scifi09-cuffs", SC09, ["13ALWL", "14ALWR"], "T_Starter_02ColorMap.png"),
    ("scifi09-gloves", SC09, ["15HNDL", "16HNDR"], "T_Starter_02ColorMap.png"),
    ("scifi09-pants", SC09, ["17HIPS"], "T_Starter_02ColorMap.png"),
    ("scifi09-pant-legs", SC09, ["18LEGL",
     "19LEGR"], "T_Starter_02ColorMap.png"),
    ("scifi09-sneakers", SC09, ["20FOTL",
     "21FOTR"], "T_Starter_02ColorMap.png"),
    ("scifi09-pouch-set", SC09, ["25AHPF", "26AHPB",
     "27AHPL", "28AHPR"], "T_Starter_02ColorMap.png"),
    ("scifi09-shoulder-pads", SC09,
     ["29ASHL", "30ASHR"], "T_Starter_02ColorMap.png"),
    ("scifi09-elbow-pads", SC09, ["31AEBL",
     "32AEBR"], "T_Starter_02ColorMap.png"),
    ("scifi09-knee-pads", SC09, ["33AKNL",
     "34AKNR"], "T_Starter_02ColorMap.png"),
    ("scifi10-helmet", SC10, ["22AHED"], "T_Starter_02ColorMap.png"),
    ("scifi10-pouch-set", SC10,
     ["26AHPB", "27AHPL", "28AHPR"], "T_Starter_02ColorMap.png"),
    ("scifi10-shoulders", SC10, ["29ASHL",
     "30ASHR"], "T_Starter_02ColorMap.png"),
    ("horr01-villain-helm", HORR, ["22AHED"], "T_Starter_04ColorMap.png"),
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

    deps = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for m in meshes:
        ev = m.evaluated_get(deps)
        for c in ev.bound_box:
            w = ev.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
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
