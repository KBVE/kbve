import os

import unreal

# Imports the terrain texture set from Art/Terrain/ and builds the ground
# material that samples it. The source PNGs live outside Content/ so the editor
# does not see them as loose files next to the assets they produced. Re-runnable: importing over an existing asset
# reimports it, and the material is rebuilt from scratch each run, so this file
# -- not the binary uasset -- is the thing to edit.
#
# The PNGs are ingest-converted from the 4k PolyHaven source (see moon task
# `import-terrain`): 2k, EXR flattened to 8-bit, normal green flipped from the
# OpenGL convention the source ships to the DirectX convention Unreal samples,
# and roughness + height packed into one texture so the material costs one
# sample instead of two.
#
# Headless:
#   UnrealEditor-Cmd <project> -ExecutePythonScript="<abs path to this file>"

ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary

CONTENT_DIR = "/Game/Textures/Terrain"
MATERIAL_PATH = "/Game/Textures/Terrain/M_RareIcon_Terrain"

# name -> (sRGB, compression, description)
TEXTURES = {
    "T_RockyTerrain02_D": (True, unreal.TextureCompressionSettings.TC_DEFAULT),
    "T_RockyTerrain02_N": (False, unreal.TextureCompressionSettings.TC_NORMALMAP),
    "T_RockyTerrain02_RH": (False, unreal.TextureCompressionSettings.TC_MASKS),
}

# World units per texture repeat. 512 uu = ~5 m, which reads as coarse rock at
# walking distance without the tiling pattern becoming obvious from the air.
UV_SCALE = 1.0 / 512.0


def source_dir():
    project = unreal.Paths.convert_relative_path_to_full(
        unreal.Paths.project_content_dir()
    )
    return os.path.join(project, os.pardir, "Art", "Terrain")


def import_texture(name, srgb, compression):
    png = os.path.join(source_dir(), name + ".png")
    if not os.path.isfile(png):
        unreal.log_error(f"missing source texture: {png}")
        return None

    task = unreal.AssetImportTask()
    task.filename = png
    task.destination_path = CONTENT_DIR
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = True
    ASSET_TOOLS.import_asset_tasks([task])

    tex = EAL.load_asset(f"{CONTENT_DIR}/{name}")
    if not isinstance(tex, unreal.Texture2D):
        unreal.log_error(f"import produced no Texture2D for {name}")
        return None

    tex.set_editor_property("srgb", srgb)
    tex.set_editor_property("compression_settings", compression)
    tex.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_WORLD)
    # Already flipped during ingest; flipping again would undo it.
    if compression == unreal.TextureCompressionSettings.TC_NORMALMAP:
        tex.set_editor_property("flip_green_channel", False)
    EAL.save_asset(f"{CONTENT_DIR}/{name}")
    unreal.log(f"imported {name} (srgb={srgb})")
    return tex


def expr(mat, cls, x, y):
    return MEL.create_material_expression(mat, cls, x, y)


def build_material(textures):
    if EAL.does_asset_exist(MATERIAL_PATH):
        EAL.delete_asset(MATERIAL_PATH)

    pkg_dir, pkg_name = MATERIAL_PATH.rsplit("/", 1)
    mat = ASSET_TOOLS.create_asset(
        pkg_name, pkg_dir, unreal.Material, unreal.MaterialFactoryNew()
    )

    # World-space UVs rather than mesh UVs: chunk meshes are generated, adjacent
    # chunks are separate actors, and anything derived from per-mesh UVs would
    # seam at every chunk border.
    world_pos = expr(mat, unreal.MaterialExpressionWorldPosition, -900, 0)
    mask = expr(mat, unreal.MaterialExpressionComponentMask, -700, 0)
    mask.set_editor_property("r", True)
    mask.set_editor_property("g", True)
    mask.set_editor_property("b", False)
    mask.set_editor_property("a", False)
    MEL.connect_material_expressions(world_pos, "", mask, "")

    scale = expr(mat, unreal.MaterialExpressionScalarParameter, -700, 140)
    scale.set_editor_property("parameter_name", "UVScale")
    scale.set_editor_property("default_value", UV_SCALE)

    uv = expr(mat, unreal.MaterialExpressionMultiply, -500, 0)
    MEL.connect_material_expressions(mask, "", uv, "A")
    MEL.connect_material_expressions(scale, "", uv, "B")

    def sample(name, y, sampler_type):
        s = expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, -300, y)
        s.set_editor_property("parameter_name", name)
        s.set_editor_property("texture", textures[name])
        s.set_editor_property("sampler_type", sampler_type)
        MEL.connect_material_expressions(uv, "", s, "UVs")
        return s

    diff = sample(
        "T_RockyTerrain02_D", -200, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
    )
    norm = sample(
        "T_RockyTerrain02_N", 100, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
    )
    rh = sample(
        "T_RockyTerrain02_RH", 400, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS
    )

    MEL.connect_material_property(diff, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(norm, "RGB", unreal.MaterialProperty.MP_NORMAL)
    # R is roughness, G is height. Height is unused until displacement or POM
    # lands; it rides along so that work does not need a reimport.
    MEL.connect_material_property(rh, "R", unreal.MaterialProperty.MP_ROUGHNESS)

    MEL.recompile_material(mat)
    EAL.save_asset(MATERIAL_PATH)
    unreal.log(f"built {MATERIAL_PATH}")
    return mat


def main():
    imported = {}
    for name, (srgb, compression) in TEXTURES.items():
        tex = import_texture(name, srgb, compression)
        if tex is None:
            unreal.log_error(f"aborting: {name} did not import")
            return
        imported[name] = tex
    build_material(imported)


main()
