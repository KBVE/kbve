"""Import the SS2-V5 rifle as a skeletal mesh.

Materials are left alone deliberately: this exists to put a second weapon in
front of the grip solver, and a grip is judged by where the hand sits on the
geometry rather than by what the geometry is painted with. The source ships no
textures anyway -- it carries a material and no images at all.
"""

import os

import unreal

STEM = "SK_Rifle_SS2V5"
WEAPON_DIR = "/Game/Weapons"


def main():
    content = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
    fbx = os.path.join(content, os.pardir, "Art", "Weapons", f"{STEM}.fbx")
    if not os.path.isfile(fbx):
        unreal.log_error(f"missing {fbx}")
        return

    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("import_animations", False)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)

    import_data = options.skeletal_mesh_import_data
    import_data.set_editor_property("import_morph_targets", False)
    import_data.set_editor_property("convert_scene", True)
    import_data.set_editor_property("normal_import_method", unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS)

    # Barrel onto +X, muzzle forward.
    #
    # The Mosin imports that way and every grip number is written in those
    # terms -- the point along the fore-end, the section half-extents, the bore
    # height. This source has its barrel along Y. Turned here rather than in
    # Blender: rotating the source geometry means baking each part's own offset
    # in first, which separates the parts from the bones they are skinned to.
    import_data.set_editor_property("import_rotation", unreal.Rotator(0.0, 0.0, -90.0))

    task = unreal.AssetImportTask()
    task.filename = fbx
    task.destination_path = WEAPON_DIR
    task.destination_name = STEM
    task.automated = True
    task.replace_existing = True
    task.save = True
    task.options = options

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    mesh = unreal.EditorAssetLibrary.load_asset(f"{WEAPON_DIR}/{STEM}")
    if not isinstance(mesh, unreal.SkeletalMesh):
        unreal.log_error(f"import produced no SkeletalMesh for {STEM}")
        return

    bounds = mesh.get_bounds()
    origin, extent = bounds.origin, bounds.box_extent
    unreal.log_warning(
        f"{STEM}: x[{origin.x - extent.x:.1f},{origin.x + extent.x:.1f}] "
        f"y[{origin.y - extent.y:.1f},{origin.y + extent.y:.1f}] "
        f"z[{origin.z - extent.z:.1f},{origin.z + extent.z:.1f}]"
    )


main()
