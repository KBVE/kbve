"""
UEDevOps — Import Raw Folder

Imports every FBX + image in a source filesystem folder into a target
/Game content path, classifies textures by filename suffix, configures
their compression / sRGB, and builds a PBR Material wired up to whatever
slots match the imported textures. Assigns the material to the imported
static mesh if a single mesh was imported.

Usage from the editor "py" console command or via the UEDevOps editor
blueprint wrapper:

    py "<UEDevOpsPluginContent>/Python/import_raw_folder.py" \
        --source "/abs/path/to/Raw/Props/Arcade" \
        --dest   "/Game/Props/Arcade" \
        --material-name "ArcadeCabinet"
"""

import argparse
import os

import unreal


SUFFIX_RULES = {
    "_BaseColor": (unreal.TextureCompressionSettings.TC_DEFAULT,   True,  unreal.MaterialProperty.MP_BASE_COLOR),
    "_Color":     (unreal.TextureCompressionSettings.TC_DEFAULT,   True,  unreal.MaterialProperty.MP_BASE_COLOR),
    "_Albedo":    (unreal.TextureCompressionSettings.TC_DEFAULT,   True,  unreal.MaterialProperty.MP_BASE_COLOR),
    "_Normal":    (unreal.TextureCompressionSettings.TC_NORMALMAP, False, unreal.MaterialProperty.MP_NORMAL),
    "_NormalF":   (unreal.TextureCompressionSettings.TC_NORMALMAP, False, unreal.MaterialProperty.MP_NORMAL),
    "_Metallic":  (unreal.TextureCompressionSettings.TC_MASKS,     False, unreal.MaterialProperty.MP_METALLIC),
    "_Metalness": (unreal.TextureCompressionSettings.TC_MASKS,     False, unreal.MaterialProperty.MP_METALLIC),
    "_Roughness": (unreal.TextureCompressionSettings.TC_MASKS,     False, unreal.MaterialProperty.MP_ROUGHNESS),
    "_AO":        (unreal.TextureCompressionSettings.TC_MASKS,     False, unreal.MaterialProperty.MP_AMBIENT_OCCLUSION),
    "_Occlusion": (unreal.TextureCompressionSettings.TC_MASKS,     False, unreal.MaterialProperty.MP_AMBIENT_OCCLUSION),
    "_Emission":  (unreal.TextureCompressionSettings.TC_DEFAULT,   False, unreal.MaterialProperty.MP_EMISSIVE_COLOR),
    "_Emissive":  (unreal.TextureCompressionSettings.TC_DEFAULT,   False, unreal.MaterialProperty.MP_EMISSIVE_COLOR),
}

IMAGE_EXTS = (".png", ".tga", ".jpg", ".jpeg", ".exr", ".tif", ".tiff")
MESH_EXTS = (".fbx",)


def classify(stem):
    for suffix, rule in SUFFIX_RULES.items():
        if stem.endswith(suffix):
            return suffix, rule
    return None, None


def import_one(filename, dest):
    task = unreal.AssetImportTask()
    task.filename = filename
    task.destination_path = dest
    task.replace_existing = True
    task.automated = True
    task.save = True
    return task


def configure_fbx_task(task):
    options = unreal.FbxImportUI()
    options.import_mesh = True
    options.import_textures = False
    options.import_materials = False
    options.import_as_skeletal = False
    options.static_mesh_import_data.combine_meshes = True
    options.static_mesh_import_data.generate_lightmap_u_vs = True
    options.static_mesh_import_data.auto_generate_collision = True
    task.options = options
    return task


def apply_texture_settings(asset_path, compression, srgb):
    tex = unreal.EditorAssetLibrary.load_asset(asset_path)
    if not tex:
        return None
    tex.compression_settings = compression
    tex.srgb = srgb
    unreal.EditorAssetLibrary.save_asset(asset_path)
    return tex


def build_material(material_name, dest, slot_to_texture):
    mat_path = f"{dest}/M_{material_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(mat_path):
        unreal.EditorAssetLibrary.delete_asset(mat_path)

    factory = unreal.MaterialFactoryNew()
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        f"M_{material_name}", dest, unreal.Material, factory
    )
    mel = unreal.MaterialEditingLibrary

    y = -300
    for slot, (texture, srgb) in slot_to_texture.items():
        sample = mel.create_material_expression(
            mat, unreal.MaterialExpressionTextureSample, -400, y)
        sample.texture = texture
        if slot == unreal.MaterialProperty.MP_NORMAL:
            sample.sampler_type = unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
        elif srgb:
            sample.sampler_type = unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
        else:
            sample.sampler_type = unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR
        mel.connect_material_property(sample, "RGB", slot)
        y += 250

    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_asset(mat_path)
    return mat


def assign_material_to_mesh(mesh_path, material):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if not isinstance(mesh, unreal.StaticMesh):
        return
    slots = mesh.get_editor_property("static_materials")
    if not slots:
        new_slot = unreal.StaticMaterial(
            material_interface=material, material_slot_name=unreal.Name("Slot0"))
        slots = [new_slot]
    else:
        slots[0].material_interface = material
    mesh.set_editor_property("static_materials", slots)
    unreal.EditorAssetLibrary.save_asset(mesh_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--dest",   required=True)
    parser.add_argument("--material-name", default=None)
    args, _ = parser.parse_known_args()

    source = os.path.abspath(args.source)
    dest = args.dest.rstrip("/")
    if not os.path.isdir(source):
        unreal.log_error(f"[UEDevOps] Source not a directory: {source}")
        return

    unreal.EditorAssetLibrary.make_directory(dest)

    fbx_tasks = []
    tex_tasks = []
    tex_meta = {}

    for fn in sorted(os.listdir(source)):
        full = os.path.join(source, fn)
        if not os.path.isfile(full):
            continue
        stem, ext = os.path.splitext(fn)
        ext = ext.lower()

        if ext in MESH_EXTS:
            fbx_tasks.append(configure_fbx_task(import_one(full, dest)))
        elif ext in IMAGE_EXTS:
            suffix, rule = classify(stem)
            if not rule:
                unreal.log_warning(
                    f"[UEDevOps] Skipping unclassified texture: {fn}")
                continue
            compression, srgb, slot = rule
            task = import_one(full, dest)
            tex_tasks.append(task)
            tex_meta[task.filename] = (stem, compression, srgb, slot)

    all_tasks = fbx_tasks + tex_tasks
    if not all_tasks:
        unreal.log_warning(
            f"[UEDevOps] No FBX or supported images found in {source}")
        return

    unreal.log(
        f"[UEDevOps] Importing {len(fbx_tasks)} FBX + {len(tex_tasks)} textures to {dest}")
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(all_tasks)

    slot_to_texture = {}
    for task in tex_tasks:
        stem, compression, srgb, slot = tex_meta[task.filename]
        for asset_path in task.imported_object_paths:
            tex = apply_texture_settings(asset_path, compression, srgb)
            if tex and slot not in slot_to_texture:
                slot_to_texture[slot] = (tex, srgb)

    mesh_paths = []
    for task in fbx_tasks:
        for asset_path in task.imported_object_paths:
            mesh_paths.append(asset_path)

    material_name = args.material_name or os.path.basename(source.rstrip("/"))

    material = None
    if slot_to_texture:
        material = build_material(material_name, dest, slot_to_texture)

    if material and len(mesh_paths) == 1:
        assign_material_to_mesh(mesh_paths[0], material)

    mat_label = material.get_path_name() if material else "none"
    unreal.log(
        f"[UEDevOps] Import complete. Mesh(es): {mesh_paths}, Material: {mat_label}")


main()
