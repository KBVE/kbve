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

TERRAIN_DIR = "/Game/Textures/Terrain"
WORLD_DIR = "/Game/Textures/World"
MATERIAL_PATH = f"{TERRAIN_DIR}/M_RareIcon_Terrain"

# stem -> (Art/ subdirectory, /Game destination)
SETS = {
    "T_RockyTerrain02": ("Terrain", TERRAIN_DIR),
    "T_RoadPattern": ("World", WORLD_DIR),
    "T_WoodDeck": ("World", WORLD_DIR),
    "T_StonePier": ("World", WORLD_DIR),
}

# suffix -> (sRGB, compression)
MAPS = {
    "D": (True, unreal.TextureCompressionSettings.TC_DEFAULT),
    "N": (False, unreal.TextureCompressionSettings.TC_NORMALMAP),
    "RH": (False, unreal.TextureCompressionSettings.TC_MASKS),
}

# World units per texture repeat. 512 uu = ~5 m, which reads as coarse rock at
# walking distance without the tiling pattern becoming obvious from the air.
UV_SCALE = 1.0 / 512.0

# Roads are painted into the terrain, not laid over it, so the road texture is
# part of the ground material and picked up by the red vertex channel the patch
# builder writes. Tighter than the ground's tiling: a road surface read at
# walking pace wants a finer grain than a hillside seen across a valley.
ROAD_UV_SCALE = 1.0 / 300.0

# Scales for the second and third readings of a surface texture. Chosen against
# each other rather than for their own sake: 0.47 and 0.083 share no useful
# common multiple with 1.0, so the two readings do not come back into phase
# anywhere a player would walk.
DETILE_ALT_SCALE = 0.47
DETILE_MACRO_SCALE = 0.083

# Bridge meshes parameterise UV0 by distance travelled in world units, so their
# materials sample UV0 straight through. Scaling it again here is what makes a
# deck and the road it meets tile at different rates across the seam they share.
# The road itself has no material here: it is terrain, and the ground material
# samples its textures directly.
WATER_MATERIAL_PATH = f"{WORLD_DIR}/M_RareIcon_Water"

SURFACE_MATERIALS = {
    "M_RareIcon_BridgeWood": "T_WoodDeck",
    "M_RareIcon_BridgeStone": "T_StonePier",
}


def source_dir(subdir):
    project = unreal.Paths.convert_relative_path_to_full(
        unreal.Paths.project_content_dir()
    )
    return os.path.join(project, os.pardir, "Art", subdir)


def import_texture(name, subdir, content_dir, srgb, compression):
    png = os.path.join(source_dir(subdir), name + ".png")
    if not os.path.isfile(png):
        unreal.log_error(f"missing source texture: {png}")
        return None

    task = unreal.AssetImportTask()
    task.filename = png
    task.destination_path = content_dir
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.save = True
    ASSET_TOOLS.import_asset_tasks([task])

    tex = EAL.load_asset(f"{content_dir}/{name}")
    if not isinstance(tex, unreal.Texture2D):
        unreal.log_error(f"import produced no Texture2D for {name}")
        return None

    tex.set_editor_property("srgb", srgb)
    tex.set_editor_property("compression_settings", compression)
    tex.set_editor_property("lod_group", unreal.TextureGroup.TEXTUREGROUP_WORLD)
    # Already flipped during ingest; flipping again would undo it.
    if compression == unreal.TextureCompressionSettings.TC_NORMALMAP:
        tex.set_editor_property("flip_green_channel", False)
    EAL.save_asset(f"{content_dir}/{name}")
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

    # Road, blended in by the red vertex channel. The patch builder paints that
    # channel from the same road field it grades the ground with, so the surface
    # and the cutting it sits in cannot disagree about where the road is.
    road_scale = expr(mat, unreal.MaterialExpressionScalarParameter, -700, 320)
    road_scale.set_editor_property("parameter_name", "RoadUVScale")
    road_scale.set_editor_property("default_value", ROAD_UV_SCALE)

    road_uv = expr(mat, unreal.MaterialExpressionMultiply, -500, 320)
    MEL.connect_material_expressions(mask, "", road_uv, "A")
    MEL.connect_material_expressions(road_scale, "", road_uv, "B")

    def road_sample(name, y, sampler_type):
        s = expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, -300, y)
        s.set_editor_property("parameter_name", name)
        s.set_editor_property("texture", textures[name])
        s.set_editor_property("sampler_type", sampler_type)
        MEL.connect_material_expressions(road_uv, "", s, "UVs")
        return s

    road_d = road_sample(
        "T_RoadPattern_D", 700, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
    )
    road_n = road_sample(
        "T_RoadPattern_N", 1000, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
    )
    road_rh = road_sample(
        "T_RoadPattern_RH", 1300, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS
    )

    vertex_color = expr(mat, unreal.MaterialExpressionVertexColor, -700, 1600)
    road_mask = expr(mat, unreal.MaterialExpressionComponentMask, -500, 1600)
    road_mask.set_editor_property("r", True)
    road_mask.set_editor_property("g", False)
    road_mask.set_editor_property("b", False)
    road_mask.set_editor_property("a", False)
    MEL.connect_material_expressions(vertex_color, "", road_mask, "")

    def blend(ground, road, channel, y):
        node = expr(mat, unreal.MaterialExpressionLinearInterpolate, -100, y)
        MEL.connect_material_expressions(ground, channel, node, "A")
        MEL.connect_material_expressions(road, channel, node, "B")
        MEL.connect_material_expressions(road_mask, "", node, "Alpha")
        return node

    base_color = blend(diff, road_d, "RGB", -200)
    normal = blend(norm, road_n, "RGB", 100)
    # R is roughness, G is height. Height is unused until displacement or POM
    # lands; it rides along so that work does not need a reimport.
    roughness = blend(rh, road_rh, "R", 400)

    MEL.connect_material_property(base_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(normal, "", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)

    MEL.recompile_material(mat)
    EAL.save_asset(MATERIAL_PATH)
    unreal.log(f"built {MATERIAL_PATH}")
    return mat


def build_surface_material(path, textures, stem):
    if EAL.does_asset_exist(path):
        EAL.delete_asset(path)

    pkg_dir, pkg_name = path.rsplit("/", 1)
    mat = ASSET_TOOLS.create_asset(
        pkg_name, pkg_dir, unreal.Material, unreal.MaterialFactoryNew()
    )

    def coords(u_scale, y):
        node = expr(mat, unreal.MaterialExpressionTextureCoordinate, -700, y)
        node.set_editor_property("coordinate_index", 0)
        node.set_editor_property("u_tiling", u_scale)
        node.set_editor_property("v_tiling", u_scale)
        return node

    uv = coords(1.0, 0)

    # A second reading of the same wood at an unrelated scale, mixed in by a
    # third at a very large one.
    #
    # The strip builder parameterises UVs by distance along the deck, so a span
    # is the same tile laid end to end -- twenty times over on a long one, and in
    # lockstep across the deck and both rails, which is what makes the repeat
    # read as a repeat rather than as timber. The scales are deliberately not
    # ratios of each other: two patterns that share a common multiple line up
    # again at that multiple and the eye finds the new period instead of the old.
    uv_alt = coords(DETILE_ALT_SCALE, 300)
    uv_macro = coords(DETILE_MACRO_SCALE, 600)

    def sample(suffix, y, sampler_type, uvs=None):
        name = f"{stem}_{suffix}"
        s = expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, -300, y)
        s.set_editor_property("parameter_name", name)
        s.set_editor_property("texture", textures[name])
        s.set_editor_property("sampler_type", sampler_type)
        MEL.connect_material_expressions(uvs or uv, "", s, "UVs")
        return s

    diff = sample("D", -200, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
    norm = sample("N", 100, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    rh = sample("RH", 400, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)

    # Only the colour is read twice. The repeat is visible in albedo -- the same
    # knot in the same place down the whole rail -- and a second normal and
    # roughness would double the samplers again to fix something nobody sees.
    diff_alt = expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, -300, 700)
    diff_alt.set_editor_property("parameter_name", f"{stem}_D_Alt")
    diff_alt.set_editor_property("texture", textures[f"{stem}_D"])
    diff_alt.set_editor_property(
        "sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
    )
    MEL.connect_material_expressions(uv_alt, "", diff_alt, "UVs")

    macro = expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, -300, 1000)
    macro.set_editor_property("parameter_name", f"{stem}_Macro")
    macro.set_editor_property("texture", textures[f"{stem}_D"])
    macro.set_editor_property(
        "sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
    )
    MEL.connect_material_expressions(uv_macro, "", macro, "UVs")

    base_color = expr(mat, unreal.MaterialExpressionLinearInterpolate, -100, -200)
    MEL.connect_material_expressions(diff, "RGB", base_color, "A")
    MEL.connect_material_expressions(diff_alt, "RGB", base_color, "B")
    MEL.connect_material_expressions(macro, "R", base_color, "Alpha")

    MEL.connect_material_property(base_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(norm, "RGB", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(rh, "R", unreal.MaterialProperty.MP_ROUGHNESS)

    MEL.recompile_material(mat)
    EAL.save_asset(path)
    unreal.log(f"built {path}")
    return mat


def build_water_material():
    # Single Layer Water rather than a translucent surface: the carved channels
    # are shallow and a flat blue plane over them reads as plastic, where this
    # shading model gets depth absorption and refraction from the ground already
    # drawn underneath it. No texture — the surface is all shading.
    if EAL.does_asset_exist(WATER_MATERIAL_PATH):
        EAL.delete_asset(WATER_MATERIAL_PATH)

    pkg_dir, pkg_name = WATER_MATERIAL_PATH.rsplit("/", 1)
    mat = ASSET_TOOLS.create_asset(
        pkg_name, pkg_dir, unreal.Material, unreal.MaterialFactoryNew()
    )
    mat.set_editor_property(
        "shading_model", unreal.MaterialShadingModel.MSM_SINGLE_LAYER_WATER
    )

    tint = expr(mat, unreal.MaterialExpressionConstant3Vector, -400, 0)
    tint.set_editor_property("constant", unreal.LinearColor(0.008, 0.035, 0.05, 1.0))
    MEL.connect_material_property(tint, "", unreal.MaterialProperty.MP_BASE_COLOR)

    rough = expr(mat, unreal.MaterialExpressionConstant, -400, 180)
    rough.set_editor_property("r", 0.02)
    MEL.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)

    metal = expr(mat, unreal.MaterialExpressionConstant, -400, 320)
    metal.set_editor_property("r", 0.0)
    MEL.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)

    # Opacity, which for this shading model is how much of the water's own
    # surface shows rather than how see-through the material is. Left
    # unconnected the surface had nothing to shade with and read as absent over
    # a riverbed only a hundred and sixty units deep.
    opacity = expr(mat, unreal.MaterialExpressionConstant, -400, 460)
    opacity.set_editor_property("r", 1.0)
    MEL.connect_material_property(opacity, "", unreal.MaterialProperty.MP_OPACITY)

    # Absorption and scattering. Single Layer Water derives its colour from how
    # light travels through the depth behind it, and with no coefficients given
    # it takes defaults that are close to clear -- which over a shallow channel
    # is indistinguishable from no water at all. These are per-metre in world
    # units: strong enough to read as water at a metre of depth.
    water_out = expr(
        mat, unreal.MaterialExpressionSingleLayerWaterMaterialOutput, -100, 600
    )

    absorption = expr(mat, unreal.MaterialExpressionConstant3Vector, -400, 600)
    absorption.set_editor_property(
        "constant", unreal.LinearColor(0.004, 0.0016, 0.0012, 1.0)
    )
    MEL.connect_material_expressions(
        absorption, "", water_out, "ScatteringCoefficients"
    )

    extinction = expr(mat, unreal.MaterialExpressionConstant3Vector, -400, 740)
    extinction.set_editor_property(
        "constant", unreal.LinearColor(0.006, 0.003, 0.002, 1.0)
    )
    MEL.connect_material_expressions(
        extinction, "", water_out, "AbsorptionCoefficients"
    )

    MEL.recompile_material(mat)
    EAL.save_asset(WATER_MATERIAL_PATH)
    unreal.log(f"built {WATER_MATERIAL_PATH}")
    return mat


def main():
    imported = {}
    for stem, (subdir, content_dir) in SETS.items():
        for suffix, (srgb, compression) in MAPS.items():
            name = f"{stem}_{suffix}"
            tex = import_texture(name, subdir, content_dir, srgb, compression)
            if tex is None:
                unreal.log_error(f"aborting: {name} did not import")
                return
            imported[name] = tex

    build_material(imported)
    for path, stem in SURFACE_MATERIALS.items():
        build_surface_material(f"{WORLD_DIR}/{path}", imported, stem)
    build_water_material()


main()
