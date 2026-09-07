"""Import a foliage pack's clump models and hang them off their atlas.

The packs ship their plants as models as well as as a sheet, and the models are
better than anything generated from the sheet alone: they are authored, their
UVs already say which part of the atlas is a plant, and the meadow pack carries
a three step LOD chain per clump that does not have to be invented.

Sizes are the pack's own. A bermuda tuft is two to ten centimetres and a meadow
clump twenty four to thirty two, which is what those plants are -- so they come
in at true scale and the field jitters them rather than being told a height.

LODs arrive as separate files because an FBX out of Blender carries no LOD
group, so each level is imported as its own asset, folded into the first, and
then deleted -- the levels live inside the mesh that keeps them, not beside it.
"""

import json
import os
import re

import unreal

EAL = unreal.EditorAssetLibrary
ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
MESH_LIB = unreal.EditorStaticMeshLibrary


LOD_SUFFIX = re.compile(r"_LOD(\d+)$")


def load_config():
    path = os.environ["KBVE_FOLIAGE_CONFIG"]
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def import_fbx(path, destination, name):
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = destination
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = False

    options = unreal.FbxImportUI()
    options.import_mesh = True
    options.import_as_skeletal = False
    options.import_materials = False
    options.import_textures = False
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)

    mesh_data = options.static_mesh_import_data
    # Scale is applied on export, so nothing here has to agree with anything.
    mesh_data.set_editor_property("combine_meshes", True)
    mesh_data.set_editor_property("generate_lightmap_u_vs", False)
    mesh_data.set_editor_property("auto_generate_collision", False)
    options.static_mesh_import_data = mesh_data
    task.options = options

    ASSET_TOOLS.import_asset_tasks([task])
    return EAL.load_asset(f"{destination}/{name}")


def wanted(name, spec):
    includes = spec.get("include") or []
    if includes and not any(token in name for token in includes):
        return False
    return not any(token in name for token in spec.get("exclude", []))


def import_pack(spec, art_root, package_path):
    source_dir = os.path.join(art_root, spec["pack"])
    if not os.path.isdir(source_dir):
        unreal.log_error(f"no exported models at {source_dir}")
        return []

    # Grouped by the name the LOD suffix is stripped from, so a model and its
    # levels arrive together however the directory happens to be ordered.
    groups = {}
    for entry in sorted(os.listdir(source_dir)):
        if not entry.endswith(".fbx"):
            continue
        stem = entry[:-4]
        if not wanted(stem, spec):
            continue
        match = LOD_SUFFIX.search(stem)
        if match and int(match.group(1)) > 0:
            continue
        base = LOD_SUFFIX.sub("", stem)
        groups.setdefault(base, {})[0] = os.path.join(source_dir, entry)

    material = EAL.load_asset(spec["material"])
    if material is None:
        unreal.log_error(f"no material at {spec['material']}")
        return []

    built = []
    for base, levels in sorted(groups.items()):
        name = f"SM_{base}"
        mesh = import_fbx(levels[0], package_path, name)
        if mesh is None:
            unreal.log_error(f"failed to import {base}")
            continue

        # LOD0 only, and not for want of trying. A pack that ships an authored
        # chain is the better source for one, but every route to attaching it
        # fails from a commandlet: import_lod returns -1 with no editor to
        # import through, StaticMeshEditorSubsystem is not up at all, and the
        # deprecated library alias runs and does not take. The clumps are 28 to
        # 290 triangles and the field already fades them by distance, so the
        # prize is small; revisit if these are ever imported from the editor.
        mesh.set_material(0, material)
        # Nothing walks into a blade of grass, and the cook of a collision body
        # for every clump is paid whether or not anything ever queries it.
        mesh.set_editor_property("body_setup", None)
        EAL.save_asset(f"{package_path}/{name}")
        built.append(mesh)
        unreal.log_error(f"imported {name} with {mesh.get_num_lods()} lods")

    return built


def build(config):
    package_path = config.get("package_path", "/Game/Foliage")
    project = os.environ["KBVE_FOLIAGE_ART"]
    art_root = os.path.join(project, config.get("art_subdir", "Foliage/Models"))

    for spec in config["packs"]:
        meshes = import_pack(spec, art_root, package_path)
        if not meshes:
            continue

        atlas = EAL.load_asset(spec["atlas"])
        if atlas is None:
            unreal.log_error(f"no atlas at {spec['atlas']}")
            continue
        atlas.set_editor_property("clumps", meshes)
        EAL.save_asset(spec["atlas"])
        unreal.log(f"{spec['atlas']} now carries {len(meshes)} clumps")


build(load_config())
