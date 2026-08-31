"""Export the loaded .blend to one file in the requested format.

Runs inside Blender's bundled Python (``bpy``), launched by
:func:`kbve.blender.cli.export_main`.

Args: output_path, export_format, selection_only, apply_modifiers.
"""

import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

output_path = argv[0] if len(argv) > 0 else "/tmp/blender-output"
export_format = argv[1] if len(argv) > 1 else "FBX"
selection_only = argv[2].lower() == "true" if len(argv) > 2 else False
apply_modifiers = argv[3].lower() == "true" if len(argv) > 3 else True

EXTENSIONS = {
    "FBX": ".fbx",
    "GLTF": ".gltf",
    "OBJ": ".obj",
    "USD": ".usd",
    "ALEMBIC": ".abc",
    "STL": ".stl",
}

if export_format not in EXTENSIONS:
    print(f"Unknown format: {export_format}")
    sys.exit(1)

output_file = os.path.join(output_path, f"export{EXTENSIONS[export_format]}")

print(f"Exporting as {export_format} to {output_file}")
print(f"Selection only: {selection_only}")
print(f"Apply modifiers: {apply_modifiers}")

if export_format == "FBX":
    bpy.ops.export_scene.fbx(
        filepath=output_file,
        use_selection=selection_only,
        apply_scale_options="FBX_SCALE_ALL",
        use_mesh_modifiers=apply_modifiers,
        bake_anim=True,
    )
elif export_format == "GLTF":
    bpy.ops.export_scene.gltf(filepath=output_file, use_selection=selection_only, export_apply=apply_modifiers)
elif export_format == "OBJ":
    bpy.ops.wm.obj_export(
        filepath=output_file,
        export_selected_objects=selection_only,
        apply_modifiers=apply_modifiers,
    )
elif export_format == "USD":
    bpy.ops.wm.usd_export(
        filepath=output_file,
        selected_objects_only=selection_only,
        export_meshes=True,
        export_materials=True,
    )
elif export_format == "ALEMBIC":
    bpy.ops.wm.alembic_export(filepath=output_file, selected=selection_only, apply_subdiv=apply_modifiers)
elif export_format == "STL":
    bpy.ops.wm.stl_export(
        filepath=output_file,
        export_selected_objects=selection_only,
        apply_modifiers=apply_modifiers,
    )

print(f"Export complete: {output_file}")
