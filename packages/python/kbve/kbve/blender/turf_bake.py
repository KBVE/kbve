"""Bakes a tiling turf surface -- grass tufts and rocks -- down to flat maps.

Run through the wrapper rather than directly::

    blender -b -P turf_bake.py -- --out <dir> --res 2048

The output feeds the ground shader's parallax pass, so the height map is the
important one: it is what the raymarch walks. The scanned texture set this
replaces carried its rock shapes in height and only grain in its normal map,
which left the surface displaced correctly and then lit as if it were flat.
Baking both from the same geometry keeps them consistent by construction.

Seamlessness comes from scattering into one tile and then instancing that
scatter across a 3x3 neighbourhood. The bake target covers only the centre
tile, so anything crossing an edge is met by its own copy on the far side.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

TILE = 2.0
ROCK_COUNT = 18
TUFT_COUNT = 2400
BLADES_PER_TUFT = 7
GRASS_H = (0.030, 0.075)
ROCK_R = (0.020, 0.070)
SOIL_SUBDIV = 240
SOIL_RELIEF = 0.006


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


class Accum:
    """Vertex and face accumulator. Everything lands in two meshes rather than
    thousands of objects: per-object linking drags a depsgraph update along
    with it, and at this scatter density that alone runs longer than the bake."""

    def __init__(self) -> None:
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []

    def add(self, verts, faces, offset: Vector) -> None:
        base = len(self.verts)
        for v in verts:
            self.verts.append((v[0] + offset.x, v[1] + offset.y, v[2] + offset.z))
        for f in faces:
            self.faces.append(tuple(i + base for i in f))

    def to_object(self, name: str) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


def icosphere_template() -> tuple[list[Vector], list[tuple[int, ...]]]:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    bm.verts.ensure_lookup_table()
    verts = [v.co.copy() for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts, faces


def rock_geometry(rng: random.Random, template) -> tuple[list[Vector], list]:
    """A half-buried irregular stone. Sunk below z=0 so the tile reads as
    stones set into soil rather than pebbles resting on a plane."""
    base_verts, faces = template
    r = rng.uniform(*ROCK_R)
    sx = r * rng.uniform(1.0, 1.7)
    sy = r * rng.uniform(1.0, 1.7)
    sz = r * rng.uniform(0.45, 0.8)
    yaw = rng.uniform(0.0, math.tau)
    ph = (rng.random() * 6.0, rng.random() * 6.0, rng.random() * 6.0)

    out: list[Vector] = []
    for v in base_verts:
        n = v.normalized()
        warp = (
            0.30 * math.sin(n.x * 4.1 + ph[0])
            + 0.22 * math.sin(n.y * 5.7 + ph[1])
            + 0.18 * math.sin(n.z * 3.3 + ph[2])
        )
        p = n * (1.0 + warp * 0.35)
        x, y, z = p.x * sx, p.y * sy, p.z * sz
        out.append(Vector((
            x * math.cos(yaw) - y * math.sin(yaw),
            x * math.sin(yaw) + y * math.cos(yaw),
            z,
        )))
    return out, faces


def blade_geometry(rng: random.Random) -> tuple[list[Vector], list]:
    """One tapered, bent blade. Kept low: tall blades produce parallax that
    stretches badly at grazing angles, and the field already has real 3D
    blades for anything close enough to need them."""
    height = rng.uniform(*GRASS_H)
    width = height * rng.uniform(0.055, 0.10)
    segments = 5
    bend = rng.uniform(0.25, 0.85)
    lean = rng.uniform(0.0, math.tau)

    verts: list[Vector] = []
    faces: list[tuple[int, ...]] = []
    for i in range(segments + 1):
        t = i / segments
        w = width * (1.0 - t) ** 0.7
        drop = bend * height * t * t
        z = height * t
        x = math.cos(lean) * drop
        y = math.sin(lean) * drop
        side = Vector((-math.sin(lean), math.cos(lean), 0.0)) * w
        verts.append(Vector((x, y, z)) - side)
        verts.append(Vector((x, y, z)) + side)
    for i in range(segments):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    return verts, faces


def soil_geometry() -> tuple[list[Vector], list[tuple[int, ...]]]:
    """A gently undulating floor spanning the whole 3x3 neighbourhood. Without
    it every ray that misses a blade or a stone returns nothing, and the height
    map reads as a void between features instead of as ground behind them."""
    span = TILE * 1.5
    n = SOIL_SUBDIV
    verts: list[Vector] = []
    faces: list[tuple[int, ...]] = []
    for iy in range(n + 1):
        for ix in range(n + 1):
            x = -span + (2.0 * span) * ix / n
            y = -span + (2.0 * span) * iy / n
            z = SOIL_RELIEF * (
                math.sin(x * 7.3) * math.cos(y * 6.1)
                + 0.5 * math.sin(x * 19.7 + 1.3) * math.cos(y * 17.9)
            )
            verts.append(Vector((x, y, z)))
    for iy in range(n):
        for ix in range(n):
            a = iy * (n + 1) + ix
            faces.append((a, a + 1, a + n + 2, a + n + 1))
    return verts, faces


def scatter(rng: random.Random, rock_count: int = ROCK_COUNT) -> tuple[Accum, Accum, float]:
    """Scatters into the centre tile and repeats it across a 3x3 neighbourhood.
    The bake target covers only the centre, so anything crossing an edge is met
    by its own copy on the far side and the maps wrap."""
    rocks = Accum()
    grass = Accum()
    half = TILE * 0.5
    template = icosphere_template()
    z_max = 0.0

    placements: list[tuple[bool, Vector, tuple]] = []
    for _ in range(rock_count):
        geo = rock_geometry(rng, template)
        loc = Vector((rng.uniform(-half, half), rng.uniform(-half, half), rng.uniform(-0.03, 0.004)))
        placements.append((True, loc, geo))
    for _ in range(TUFT_COUNT):
        cx = rng.uniform(-half, half)
        cy = rng.uniform(-half, half)
        for _ in range(BLADES_PER_TUFT):
            geo = blade_geometry(rng)
            loc = Vector((
                cx + rng.gauss(0.0, 0.018),
                cy + rng.gauss(0.0, 0.018),
                rng.uniform(-0.004, 0.002),
            ))
            placements.append((False, loc, geo))

    for is_rock, loc, (verts, faces) in placements:
        for v in verts:
            z_max = max(z_max, v.z + loc.z)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                offset = Vector((loc.x + dx * TILE, loc.y + dy * TILE, loc.z))
                (rocks if is_rock else grass).add(verts, faces, offset)

    return rocks, grass, z_max


def build_source_material(name: str, colour: tuple, roughness: float) -> bpy.types.Material:
    """One material per surface class, wired so the output can be swapped
    between the shaded result and an emission probe without rebuilding it."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness

    emit = nt.nodes.new("ShaderNodeEmission")

    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    height_range = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], height_range.inputs["Value"])

    curve_range = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(geo.outputs["Pointiness"], curve_range.inputs["Value"])
    curve_range.inputs["From Min"].default_value = 0.3
    curve_range.inputs["From Max"].default_value = 0.7

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    mat["out"] = out.name
    mat["bsdf"] = bsdf.name
    mat["emit"] = emit.name
    mat["height_range"] = height_range.name
    mat["curve_range"] = curve_range.name
    return mat


def wire(mat: bpy.types.Material, mode: str, z_min: float, z_max: float) -> None:
    nt = mat.node_tree
    out = nt.nodes[mat["out"]]
    emit = nt.nodes[mat["emit"]]
    hr = nt.nodes[mat["height_range"]]
    cr = nt.nodes[mat["curve_range"]]

    for link in list(out.inputs["Surface"].links):
        nt.links.remove(link)
    for link in list(emit.inputs["Color"].links):
        nt.links.remove(link)

    if mode == "shaded":
        nt.links.new(nt.nodes[mat["bsdf"]].outputs["BSDF"], out.inputs["Surface"])
        return
    if mode == "height":
        hr.inputs["From Min"].default_value = z_min
        hr.inputs["From Max"].default_value = z_max
        nt.links.new(hr.outputs["Result"], emit.inputs["Color"])
    else:
        nt.links.new(cr.outputs["Result"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])


def make_target(res: int) -> tuple[bpy.types.Object, bpy.types.Material, bpy.types.ShaderNodeTexImage]:
    bpy.ops.mesh.primitive_plane_add(size=TILE, location=(0.0, 0.0, 0.0))
    plane = bpy.context.active_object
    plane.name = "bake_target"

    mat = bpy.data.materials.new("bake_target_mat")
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    mat.node_tree.nodes.active = tex
    plane.data.materials.append(mat)
    return plane, mat, tex


def bake_pass(
    name: str,
    res: int,
    bake_type: str,
    non_color: bool,
    tex: bpy.types.ShaderNodeTexImage,
    extrusion: float,
    float_buffer: bool = False,
) -> bpy.types.Image:
    img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=float_buffer)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    tex.image = img

    kwargs = dict(
        type=bake_type,
        use_selected_to_active=True,
        cage_extrusion=extrusion,
        max_ray_distance=extrusion * 2.0,
        use_clear=True,
        margin=res // 128,
    )
    if bake_type == "DIFFUSE":
        bpy.context.scene.render.bake.use_pass_direct = False
        bpy.context.scene.render.bake.use_pass_indirect = False
        bpy.context.scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(**kwargs)
    return img


def save(img: bpy.types.Image, path: Path, depth: str = "8") -> None:
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = depth
    img.save_render(str(path), scene=scene)


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else Path.cwd()
    res = int(argv[argv.index("--res") + 1]) if "--res" in argv else 2048
    seed = int(argv[argv.index("--seed") + 1]) if "--seed" in argv else 7
    prefix = argv[argv.index("--prefix") + 1] if "--prefix" in argv else "turf_baked"
    ao_samples = int(argv[argv.index("--ao-samples") + 1]) if "--ao-samples" in argv else 96
    rock_count = int(argv[argv.index("--rocks") + 1]) if "--rocks" in argv else ROCK_COUNT

    out_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)

    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.render.bake.use_selected_to_active = True

    rock_acc, grass_acc, z_max = scatter(rng, rock_count)
    soil_acc = Accum()
    soil_acc.add(*soil_geometry(), Vector((0.0, 0.0, 0.0)))
    print(
        f"[turf_bake] scatter: {len(rock_acc.verts)} rock, "
        f"{len(grass_acc.verts)} grass, {len(soil_acc.verts)} soil verts"
    )

    rock_mat = build_source_material("turf_rock", (0.42, 0.40, 0.37), 0.62)
    grass_mat = build_source_material("turf_grass", (0.20, 0.34, 0.09), 0.85)
    soil_mat = build_source_material("turf_soil", (0.085, 0.105, 0.048), 0.92)
    materials = (rock_mat, grass_mat, soil_mat)

    sources = []
    for acc, mat, name in (
        (rock_acc, rock_mat, "turf_rocks"),
        (grass_acc, grass_mat, "turf_grass"),
        (soil_acc, soil_mat, "turf_soil"),
    ):
        obj = acc.to_object(name)
        obj.data.materials.append(mat)
        sources.append(obj)

    z_min = -SOIL_RELIEF * 1.5
    extrusion = z_max + 0.02

    plane, _, tex = make_target(res)

    def select(active_target: bool = True) -> None:
        bpy.ops.object.select_all(action="DESELECT")
        for o in sources:
            o.select_set(True)
        plane.select_set(True)
        bpy.context.view_layer.objects.active = plane

    passes = []

    for m in materials:
        wire(m, "height", z_min, z_max)
    select()
    scene.cycles.samples = 1
    passes.append(("height", bake_pass(f"{prefix}_height", res, "EMIT", True, tex, extrusion, True)))

    for m in materials:
        wire(m, "curvature", z_min, z_max)
    select()
    passes.append(("curvature", bake_pass(f"{prefix}_curvature", res, "EMIT", True, tex, extrusion)))

    for m in materials:
        wire(m, "shaded", z_min, z_max)

    select()
    passes.append(("normal_gl", bake_pass(f"{prefix}_normal_gl", res, "NORMAL", True, tex, extrusion)))

    select()
    scene.cycles.samples = 4
    passes.append(("albedo", bake_pass(f"{prefix}_albedo", res, "DIFFUSE", False, tex, extrusion)))

    select()
    passes.append(("roughness", bake_pass(f"{prefix}_roughness", res, "ROUGHNESS", True, tex, extrusion)))

    select()
    scene.cycles.samples = ao_samples
    passes.append(("ao", bake_pass(f"{prefix}_ao", res, "AO", True, tex, extrusion)))

    for label, img in passes:
        save(img, out_dir / f"{prefix}_{label}.png", depth="16" if label == "height" else "8")

    meta = {
        "tile_metres": TILE,
        "height_range_metres": round(z_max - z_min, 5),
        "resolution": res,
        "seed": seed,
        "rocks": rock_count,
        "tufts": TUFT_COUNT,
    }
    (out_dir / f"{prefix}.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"[turf_bake] wrote {len(passes)} maps to {out_dir}")
    print(f"[turf_bake] height range {meta['height_range_metres']} m over a {TILE} m tile")
    return 0


if __name__ == "__main__":
    sys.exit(main())
