import bpy
import math
import mathutils
import numpy as np
import os
import random
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = os.path.expanduser(argv[0] if len(
    argv) > 0 else "~/Downloads/cliff_rocks_05_1k")
_HERE = os.path.dirname(os.path.abspath(__file__))
OUT = argv[1] if len(argv) > 1 else os.path.join(
    _HERE, "..", "assets", "environment", "props", "rocks")
OUT = os.path.abspath(OUT)
SEED = int(argv[2]) if len(argv) > 2 else 1337
VARIANTS = 3
CHUNKS = 5
ALBEDO_SIZE = 512
PALETTE_TONES = 7
PALETTE_SOFTNESS = 0.6

random.seed(SEED)


def load_pixels(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return buf.reshape(h, w, 4)


def box_blur(a, r):
    for axis in (0, 1):
        k = 2 * r + 1
        s = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0)
                      for i in range(a.ndim)], mode="edge"), axis=axis)
        a = (np.take(s, range(k, s.shape[axis]), axis=axis) -
             np.take(s, range(0, s.shape[axis] - k), axis=axis)) / k
    return a


def downscale(a, size):
    h, w = a.shape[:2]
    ys = (np.arange(size) * h // size)
    xs = (np.arange(size) * w // size)
    return a[np.ix_(ys, xs)]


def make_albedo():
    base = load_pixels(os.path.join(
        SRC, "cliff_rocks_05_basecolor_1k.png"))[..., :3]
    ao = load_pixels(os.path.join(
        SRC, "cliff_rocks_05_ambientocclusion_1k.png"))[..., :1]
    base = downscale(base, ALBEDO_SIZE)
    ao = downscale(ao, ALBEDO_SIZE)
    base = box_blur(base, 5)
    base = box_blur(base, 3)
    lum = (base * np.array([0.299, 0.587, 0.114],
           dtype=np.float32).reshape(1, 1, 3)).sum(axis=-1, keepdims=True)
    lum = np.clip((lum - lum.min()) /
                  max(lum.max() - lum.min(), 1e-6), 0.0, 1.0)
    stone_dark = np.array([0.30, 0.29, 0.28], dtype=np.float32)
    stone_light = np.array([0.82, 0.78, 0.70], dtype=np.float32)
    graded = stone_dark + (stone_light - stone_dark) * lum
    base = graded * 0.75 + base * 0.25
    q = np.round(base * (PALETTE_TONES - 1)) / (PALETTE_TONES - 1)
    base = base * (1.0 - PALETTE_SOFTNESS) + q * PALETTE_SOFTNESS
    ao = box_blur(ao, 6)
    ao = np.sqrt(np.clip(ao, 0.0, 1.0)) * 0.3 + 0.7
    out = np.clip(base * ao * 1.15, 0.0, 1.0)
    rgba = np.concatenate([out, np.ones_like(out[..., :1])],
                          axis=-1).astype(np.float32)
    img = bpy.data.images.new(
        "rock_albedo", ALBEDO_SIZE, ALBEDO_SIZE, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT, "rock_albedo.png")
    img.file_format = "PNG"
    img.save()
    print("wrote", img.filepath_raw)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def height_texture():
    img = bpy.data.images.load(os.path.join(
        SRC, "cliff_rocks_05_height_1k.png"))
    tex = bpy.data.textures.new("rock_height", type="IMAGE")
    tex.image = img
    return tex


def noise_texture(variant):
    tex = bpy.data.textures.new(f"rock_noise_{variant}", type="CLOUDS")
    tex.noise_scale = 1.6 + 0.6 * random.random()
    tex.noise_depth = 1
    return tex


def build_rock(variant, htex):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.6)
    rock = bpy.context.active_object
    rock.name = f"rock_{variant}"
    rock.scale = (
        0.9 + 0.5 * random.random(),
        0.7 + 0.4 * random.random(),
        0.9 + 0.5 * random.random(),
    )
    bpy.ops.object.transform_apply(scale=True)

    disp_n = rock.modifiers.new("noise", "DISPLACE")
    disp_n.texture = noise_texture(variant)
    disp_n.strength = 0.42
    disp_n.texture_coords = "OBJECT"

    disp_h = rock.modifiers.new("height", "DISPLACE")
    disp_h.texture = htex
    disp_h.strength = 0.12
    disp_h.texture_coords = "GLOBAL"

    smooth = rock.modifiers.new("smooth", "SMOOTH")
    smooth.factor = 1.2
    smooth.iterations = 8

    dec = rock.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.10

    bpy.ops.object.convert(target="MESH")
    rock = bpy.context.active_object
    bpy.ops.object.shade_smooth()

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(89), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    uvs = rock.data.uv_layers.active.data
    for loop_uv in uvs:
        loop_uv.uv = loop_uv.uv * 0.35 + mathutils.Vector((0.3, 0.3))
    return rock


def cell_points(rock, count):
    bb = [rock.matrix_world @ mathutils.Vector(c) for c in rock.bound_box]
    lo = mathutils.Vector((min(v.x for v in bb), min(
        v.y for v in bb), min(v.z for v in bb)))
    hi = mathutils.Vector((max(v.x for v in bb), max(
        v.y for v in bb), max(v.z for v in bb)))
    pts = []
    for _ in range(count):
        pts.append(mathutils.Vector((
            lo.x + (0.2 + 0.6 * random.random()) * (hi.x - lo.x),
            lo.y + (0.2 + 0.6 * random.random()) * (hi.y - lo.y),
            lo.z + (0.2 + 0.6 * random.random()) * (hi.z - lo.z),
        )))
    return pts


def bisect_chunk(rock, pts, i):
    bpy.ops.object.select_all(action="DESELECT")
    rock.select_set(True)
    bpy.context.view_layer.objects.active = rock
    bpy.ops.object.duplicate()
    chunk = bpy.context.active_object
    chunk.name = f"{rock.name}_chunk_{i}"
    bpy.ops.object.mode_set(mode="EDIT")
    for j, p in enumerate(pts):
        if j == i:
            continue
        n = (pts[j] - pts[i])
        if n.length < 1e-6:
            continue
        n.normalize()
        mid = (pts[i] + pts[j]) * 0.5
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.bisect(plane_co=mid, plane_no=n,
                            clear_outer=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return chunk


def export_variant(rock, chunks):
    bpy.ops.object.select_all(action="DESELECT")
    rock.select_set(True)
    for c in chunks:
        c.select_set(True)
    path = os.path.join(OUT, f"{rock.name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_image_format="NONE",
        export_materials="NONE",
        export_yup=True,
        export_apply=True,
    )
    print("wrote", path)


def main():
    os.makedirs(OUT, exist_ok=True)
    make_albedo()
    clear_scene()
    htex = height_texture()
    for v in range(VARIANTS):
        rock = build_rock(v, htex)
        pts = cell_points(rock, CHUNKS)
        chunks = [bisect_chunk(rock, pts, i) for i in range(CHUNKS)]
        export_variant(rock, chunks)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete()


main()
