"""kbve-blender-vat --src <fbx|glb> --out <dir> --tris N --frames N"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


def argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load_source(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise SystemExit(f"unsupported source: {path}")


def find_mesh() -> bpy.types.Object:
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no mesh in source")
    return max(meshes, key=lambda o: len(o.data.vertices))


def find_action() -> bpy.types.Action:
    if not bpy.data.actions:
        raise SystemExit("no action in source")
    return max(bpy.data.actions, key=lambda a: a.frame_range[1] - a.frame_range[0])


def decimate(obj: bpy.types.Object, target_tris: int) -> None:
    current = len(obj.data.polygons)
    if target_tris <= 0 or current <= target_tris:
        return
    mod = obj.modifiers.new(name="vat_decimate", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target_tris / current
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def write_vertex_index_uv(obj: bpy.types.Object, width: int) -> None:
    mesh = obj.data
    layer = mesh.uv_layers.get("vat_index") or mesh.uv_layers.new(name="vat_index")
    for poly in mesh.polygons:
        for loop_i in poly.loop_indices:
            vert_i = mesh.loops[loop_i].vertex_index
            layer.data[loop_i].uv = ((vert_i + 0.5) / width, 0.5)


def sample_frames(obj: bpy.types.Object, action: bpy.types.Action, frames: int):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    start, end = action.frame_range
    positions: list[list[tuple[float, float, float]]] = []
    normals: list[list[tuple[float, float, float]]] = []
    for i in range(frames):
        t = start + (end - start) * (i / frames)
        bpy.context.scene.frame_set(int(t), subframe=float(t - int(t)))
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_normals_split() if hasattr(mesh, "calc_normals_split") else None
        positions.append([(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices])
        normals.append([(v.normal.x, v.normal.z, -v.normal.y) for v in mesh.vertices])
        evaluated.to_mesh_clear()
    return positions, normals


def write_exr(path: Path, rows: list[list[tuple[float, float, float]]], width: int) -> None:
    height = len(rows)
    image = bpy.data.images.new(path.stem, width=width, height=height,
                                alpha=True, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    pixels = [0.0] * (width * height * 4)
    for y, row in enumerate(rows):
        for x in range(width):
            value = row[x] if x < len(row) else (0.0, 0.0, 0.0)
            i = (y * width + x) * 4
            pixels[i] = value[0]
            pixels[i + 1] = value[1]
            pixels[i + 2] = value[2]
            pixels[i + 3] = 1.0
    image.pixels.foreach_set(pixels)
    image.file_format = "OPEN_EXR"
    image.filepath_raw = str(path)
    image.save()
    bpy.data.images.remove(image)


def export_mesh(obj: bpy.types.Object, out: Path) -> None:
    for mod in list(obj.modifiers):
        if mod.type == "ARMATURE":
            obj.modifiers.remove(mod)
    obj.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_apply=True,
        export_yup=True,
    )


def main() -> None:
    args = argv()
    if len(args) < 4:
        raise SystemExit("usage: vat_bake.py -- <src> <out_dir> <target_tris> <frames> [name]")
    src = Path(args[0])
    out_dir = Path(args[1])
    target_tris = int(args[2])
    frames = int(args[3])
    name = args[4] if len(args) > 4 else src.stem.lower()
    out_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    load_source(src)
    obj = find_mesh()
    action = find_action()

    source_tris = len(obj.data.polygons)
    decimate(obj, target_tris)
    width = len(obj.data.vertices)
    write_vertex_index_uv(obj, width)

    positions, normals = sample_frames(obj, action, frames)
    write_exr(out_dir / f"{name}_vat_pos.exr", positions, width)
    write_exr(out_dir / f"{name}_vat_nrm.exr", normals, width)
    export_mesh(obj, out_dir / f"{name}.glb")

    bounds_min = [min(p[i] for row in positions for p in row) for i in range(3)]
    bounds_max = [max(p[i] for row in positions for p in row) for i in range(3)]
    meta = {
        "name": name,
        "verts": width,
        "tris": len(obj.data.polygons),
        "source_tris": source_tris,
        "frames": frames,
        "fps": bpy.context.scene.render.fps,
        "length_s": float(action.frame_range[1] - action.frame_range[0])
        / bpy.context.scene.render.fps,
        "aabb_min": bounds_min,
        "aabb_max": bounds_max,
    }
    (out_dir / f"{name}_vat.json").write_text(json.dumps(meta, indent=2))
    print(f"[vat] {name}: {source_tris} -> {meta['tris']} tris, "
          f"{width} verts x {frames} frames")


if __name__ == "__main__":
    main()
