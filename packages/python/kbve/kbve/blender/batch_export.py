"""Export every mesh object in the loaded .blend to its own file.

Runs inside Blender's bundled Python (``bpy``), launched by
:func:`kbve.blender.cli.batch_export_main`.

Args: output_path, export_format.
"""

import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

output_path = argv[0] if len(argv) > 0 else "/tmp/blender-output"
export_format = argv[1] if len(argv) > 1 else "FBX"

EXTENSIONS = {
    "FBX": ".fbx",
    "GLTF": ".gltf",
    "OBJ": ".obj",
    "USD": ".usd",
    "ALEMBIC": ".abc",
    "STL": ".stl",
}
ext = EXTENSIONS.get(export_format, ".fbx")
objects_to_export = [obj for obj in bpy.data.objects if obj.type == "MESH"]

print(f"Batch exporting {len(objects_to_export)} objects as {export_format}")

for obj in objects_to_export:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    filepath = os.path.join(output_path, f"{obj.name}{ext}")
    if export_format == "FBX":
        bpy.ops.export_scene.fbx(
            filepath=filepath,
            use_selection=True,
            apply_scale_options="FBX_SCALE_ALL",
            bake_anim=True,
        )
    elif export_format == "GLTF":
        bpy.ops.export_scene.gltf(filepath=filepath, use_selection=True)
    elif export_format == "OBJ":
        bpy.ops.wm.obj_export(filepath=filepath, export_selected_objects=True)
    print(f"Exported: {filepath}")

print(f"Batch export complete: {len(objects_to_export)} files")
