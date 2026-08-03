"""Render 64x64 inventory icons for the four gems from one shared mesh.

Every gem is the same low-poly model (art/items/gem/scene.gltf, CC-BY Ponam)
with only its base colour swapped, so the icons stay a matched set and the
runtime can share one geometry across all four.

    blender -b -P render_gems.py -- <gem_gltf> <out_dir>
"""
import bpy
import os
import sys
import math
from mathutils import Vector

# sRGB hex -> linear, matching the grid tile colours in inventory/items.ts.
GEMS = [
    ("emerald", "3aa86a"),
    ("sapphire", "3a6ac4"),
    ("ruby", "c43a4a"),
    ("diamond", "e8f4fa"),
]

SIZE = 64
METALLIC = 0.0
ROUGHNESS = 0.42


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0)
                 for i in (0, 2, 4)) + (1.0,)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            block.remove(item)


def frame_camera(target):
    bbox = [target.matrix_world @ Vector(c) for c in target.bound_box]
    center = sum(bbox, Vector()) / 8.0
    radius = max((v - center).length for v in bbox)

    cam_data = bpy.data.cameras.new("IconCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = radius * 2.15
    cam = bpy.data.objects.new("IconCam", cam_data)
    bpy.context.collection.objects.link(cam)

    # 3/4 view, matching render_icons.py's framing convention.
    direction = Vector((0.6, -1.0, 0.55)).normalized()
    cam.location = center + direction * (radius * 4.0)
    cam.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def add_lights(center, radius):
    # Most of the exposure comes from an even world dome so the flat gem facets
    # read as colour rather than as one blown specular highlight; the key only
    # adds enough gradient to separate the crown from the pavilion.
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("IconWorld")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 0.30

    key = bpy.data.lights.new("Key", type="AREA")
    key.energy = 2.0
    key.size = radius * 4
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.location = center + Vector((2.0, -2.4, 3.0)) * radius
    key_obj.rotation_euler = (math.radians(35), 0, math.radians(40))
    bpy.context.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("Fill", type="AREA")
    fill.energy = 1.0
    fill.size = radius * 6
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.location = center + Vector((-2.4, -1.6, 1.2)) * radius
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-55))
    bpy.context.collection.objects.link(fill_obj)


def setup_render(out_path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    # AgX (the 4.x+ default) desaturates saturated albedo hard, which turns the
    # gem tints into pastels. Icons want the colour as authored.
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = out_path


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    gem_path, out_dir = argv[0], argv[1]
    os.makedirs(out_dir, exist_ok=True)

    for ref, hex_color in GEMS:
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=gem_path)

        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        if not meshes:
            raise SystemExit(f"no mesh imported from {gem_path}")
        gem = meshes[0]

        mat = bpy.data.materials.new(f"gem_{ref}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = hex_to_linear(hex_color)
        bsdf.inputs["Metallic"].default_value = METALLIC
        bsdf.inputs["Roughness"].default_value = ROUGHNESS
        gem.data.materials.clear()
        gem.data.materials.append(mat)

        bbox = [gem.matrix_world @ Vector(c) for c in gem.bound_box]
        center = sum(bbox, Vector()) / 8.0
        radius = max((v - center).length for v in bbox)

        frame_camera(gem)
        add_lights(center, radius)
        setup_render(os.path.join(out_dir, f"{ref}.png"))
        bpy.ops.render.render(write_still=True)
        print(f"rendered {ref}")


if __name__ == "__main__":
    main()
