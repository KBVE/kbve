#!/usr/bin/env python3
"""Bake the Sketchfab pickaxe download into the game's held-item GLB convention.

Source: "Pickaxe" by TediumInteractive, CC-BY-4.0. Attribution is required and
lives with the item itself, in the itemdb `credits` field on
apps/kbve/astro-kbve/src/content/docs/itemdb/pickaxe.mdx.
https://sketchfab.com/3d-models/pickaxe-726bd1041790439cba610fd8be337a42

The source ships a 2K PBR set (baseColor + metallicRoughness + normal) and a
Sketchfab rig of lamp/camera empties at 100x scale. Held items in this game are
one mesh, one material, one 256px baseColor map -- everything else is dead weight
at PSX render scale -- so this strips the extras, normalizes the transform the way
sword.glb is normalized (handle end at y=0, head at +Y, 1.0 units long) and packs
the downscaled texture into the GLB.

Run:
    blender -b -P art/items/build_pickaxe.py
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parents[2]
SRC = Path.home() / "Downloads/pickaxe/scene.gltf"
OUT = ROOT / "public/models/pickaxe.glb"
# Both icon sinks the dev Icon Studio writes to: the game's grid art and the
# astro site's itemdb art, which is also what gen-itemdb-atlas packs.
ICONS = [
    ROOT / "public/icons/items/pickaxe.png",
    REPO / "apps/kbve/astro-kbve/public/assets/items/equipment/pickaxe.png",
]
ICON = ICONS[0]
TEX_SIZE = 256
ICON_SIZE = 64
LENGTH = 1.0
UP = Vector((0.0, 0.0, 1.0))


def wipe() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source() -> bpy.types.Object:
    if not SRC.exists():
        sys.exit(f"missing source: {SRC}")
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        sys.exit("source has no mesh")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def handle_axis(mesh: bpy.types.Mesh) -> Vector:
    """Unit vector along the haft, pointing at the head.

    The haft is the longest bbox axis. The head is whichever end carries the
    wider cross-section -- that is the crossbar of blade and adze.
    """
    co = [v.co for v in mesh.vertices]
    lo = Vector((min(c[i] for c in co) for i in range(3)))
    hi = Vector((max(c[i] for c in co) for i in range(3)))
    axis = max(range(3), key=lambda i: hi[i] - lo[i])
    mid = (lo[axis] + hi[axis]) / 2
    others = [i for i in range(3) if i != axis]

    def spread(verts) -> float:
        if not verts:
            return 0.0
        return max(
            max(v[i] for v in verts) - min(v[i] for v in verts) for i in others
        )

    top = spread([c for c in co if c[axis] > mid])
    bottom = spread([c for c in co if c[axis] <= mid])
    out = Vector((0.0, 0.0, 0.0))
    out[axis] = 1.0 if top >= bottom else -1.0
    return out


def normalize(obj: bpy.types.Object) -> None:
    mesh = obj.data
    mesh.transform(handle_axis(mesh).rotation_difference(
        UP).to_matrix().to_4x4())
    co = [v.co for v in mesh.vertices]
    lo = Vector((min(c[i] for c in co) for i in range(3)))
    hi = Vector((max(c[i] for c in co) for i in range(3)))
    span = max(hi[i] - lo[i] for i in range(3))
    scale = LENGTH / span
    for v in mesh.vertices:
        v.co = Vector(
            (
                (v.co.x - (lo.x + hi.x) / 2) * scale,
                (v.co.y - (lo.y + hi.y) / 2) * scale,
                (v.co.z - lo.z) * scale,
            )
        )
    obj.name = "Pickaxe"
    mesh.name = "Pickaxe"


def base_color_image(obj: bpy.types.Object) -> bpy.types.Image:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        bsdf = next(
            (n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None
        )
        if not bsdf:
            continue
        link = next(
            (
                e
                for e in mat.node_tree.links
                if e.to_node == bsdf and e.to_socket.name == "Base Color"
            ),
            None,
        )
        if link and link.from_node.type == "TEX_IMAGE":
            return link.from_node.image
    sys.exit("no base color texture on the source material")


def downscale(img: bpy.types.Image) -> None:
    """Resize in place and re-pack, so the export writes the small bytes.

    Blender re-emits the original packed file when the datablock still points at
    it, so the scaled pixels have to be round-tripped through a PNG on disk.
    """
    img.scale(TEX_SIZE, TEX_SIZE)
    tmp = Path(bpy.app.tempdir) / "pickaxe_color.png"
    img.filepath_raw = str(tmp)
    img.file_format = "PNG"
    img.save()
    img.source = "FILE"
    img.filepath = str(tmp)
    img.reload()
    img.pack()


def rebuild_material(obj: bpy.types.Object, img: bpy.types.Image) -> None:
    mat = bpy.data.materials.new("Pickaxe")
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def render_icon(obj: bpy.types.Object) -> None:
    """Same 3/4 ortho framing the armor icons use (art/character/render_icons.py)."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
    center = (lo + hi) / 2
    extent = max(hi - lo)

    cam_data = bpy.data.cameras.new("icon_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = extent * 1.15
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
    engines = scene.render.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = next(e for e in engines if "EEVEE" in e)
    scene.render.resolution_x = ICON_SIZE
    scene.render.resolution_y = ICON_SIZE
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    ICON.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(ICON)
    bpy.ops.render.render(write_still=True)
    for extra in ICONS[1:]:
        extra.parent.mkdir(parents=True, exist_ok=True)
        extra.write_bytes(ICON.read_bytes())


def main() -> None:
    wipe()
    obj = import_source()
    img = base_color_image(obj)
    downscale(img)
    normalize(obj)
    rebuild_material(obj, img)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        export_texcoords=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(
        f"wrote {OUT.name} {len(obj.data.vertices)}v {tris}t "
        f"{TEX_SIZE}px {OUT.stat().st_size // 1024}K"
    )
    render_icon(obj)
    for icon in ICONS:
        print(f"wrote {icon.relative_to(REPO)} {ICON_SIZE}px")


if __name__ == "__main__":
    main()
