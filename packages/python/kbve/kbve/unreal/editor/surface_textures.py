"""Import a PBR texture set and build the materials that sample it.

Three maps per set -- albedo, normal, and roughness+height packed into one --
ingested to PNG outside Content/ so the editor does not see the sources as
loose files beside the assets they produced. Re-runnable: importing over an
existing asset reimports it, and every material is rebuilt from scratch, so the
config -- not the binary uasset -- is the thing to edit.

Config (KBVE_UNREAL_CONFIG):
    art_root            directory holding the converted PNGs, relative to the
                        project (default "Art")
    sets                [{stem, source, destination}] -- destination omitted
                        means the set is converted for something else and not
                        imported here
    terrain_material    {path, ground, road, repeat_uu, road_repeat_uu} or null
    surface_materials   [{path, stem, repeat, alt_repeat, macro_repeat}]
    water_material      {path, tint, roughness, scattering, absorption} or null

The terrain material samples by world position and blends a road set in by the
red vertex channel; a surface material samples UV0, which the ribbon builders
parameterise by distance travelled. That is the whole difference between them,
and it is why they are two builders over one texture convention rather than one
material with a switch.
"""

import json
import os

import unreal

ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary

# suffix -> (sRGB, compression, sampler type)
MAPS = {
    "D": (True, unreal.TextureCompressionSettings.TC_DEFAULT, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR),
    "N": (False, unreal.TextureCompressionSettings.TC_NORMALMAP, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL),
    "RH": (False, unreal.TextureCompressionSettings.TC_MASKS, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS),
}


def load_config():
    path = os.environ.get("KBVE_UNREAL_CONFIG")
    if not path:
        raise RuntimeError("KBVE_UNREAL_CONFIG is not set")
    with open(path) as handle:
        return json.load(handle)


def source_dir(art_root, subdir):
    project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
    return os.path.join(project, os.pardir, art_root, subdir)


def import_texture(art_root, name, subdir, content_dir):
    srgb, compression, _sampler = MAPS[name.rsplit("_", 1)[1]]
    png = os.path.join(source_dir(art_root, subdir), name + ".png")
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


def create_material(path):
    if EAL.does_asset_exist(path):
        EAL.delete_asset(path)
    pkg_dir, pkg_name = path.rsplit("/", 1)
    return ASSET_TOOLS.create_asset(pkg_name, pkg_dir, unreal.Material, unreal.MaterialFactoryNew())


def expr(mat, cls, x, y):
    return MEL.create_material_expression(mat, cls, x, y)


def sampler(mat, textures, name, y, suffix, uvs, parameter=None):
    _srgb, _compression, sampler_type = MAPS[suffix]
    node = expr(mat, unreal.MaterialExpressionTextureSampleParameter2D, -300, y)
    node.set_editor_property("parameter_name", parameter or name)
    node.set_editor_property("texture", textures[name])
    node.set_editor_property("sampler_type", sampler_type)
    MEL.connect_material_expressions(uvs, "", node, "UVs")
    return node


def build_terrain_material(spec, textures):
    mat = create_material(spec["path"])
    ground, road = spec["ground"], spec["road"]

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

    def world_uv(parameter, repeat_uu, y):
        scale = expr(mat, unreal.MaterialExpressionScalarParameter, -700, y)
        scale.set_editor_property("parameter_name", parameter)
        scale.set_editor_property("default_value", 1.0 / float(repeat_uu))
        node = expr(mat, unreal.MaterialExpressionMultiply, -500, y)
        MEL.connect_material_expressions(mask, "", node, "A")
        MEL.connect_material_expressions(scale, "", node, "B")
        return node

    uv = world_uv("UVScale", spec["repeat_uu"], 140)
    # Roads are painted into the terrain rather than laid over it, so the road
    # texture is part of the ground material. Tighter tiling than the ground's:
    # a road surface read at walking pace wants a finer grain than a hillside
    # seen across a valley.
    road_uv = world_uv("RoadUVScale", spec["road_repeat_uu"], 320)

    diff = sampler(mat, textures, f"{ground}_D", -200, "D", uv)
    norm = sampler(mat, textures, f"{ground}_N", 100, "N", uv)
    rh = sampler(mat, textures, f"{ground}_RH", 400, "RH", uv)
    road_d = sampler(mat, textures, f"{road}_D", 700, "D", road_uv)
    road_n = sampler(mat, textures, f"{road}_N", 1000, "N", road_uv)
    road_rh = sampler(mat, textures, f"{road}_RH", 1300, "RH", road_uv)

    # The patch builder paints the red vertex channel from the same road field
    # it grades the ground with, so the surface and the cutting it sits in
    # cannot disagree about where the road is.
    vertex_color = expr(mat, unreal.MaterialExpressionVertexColor, -700, 1600)
    road_mask = expr(mat, unreal.MaterialExpressionComponentMask, -500, 1600)
    road_mask.set_editor_property("r", True)
    road_mask.set_editor_property("g", False)
    road_mask.set_editor_property("b", False)
    road_mask.set_editor_property("a", False)
    MEL.connect_material_expressions(vertex_color, "", road_mask, "")

    def blend(a, b, channel, y):
        node = expr(mat, unreal.MaterialExpressionLinearInterpolate, -100, y)
        MEL.connect_material_expressions(a, channel, node, "A")
        MEL.connect_material_expressions(b, channel, node, "B")
        MEL.connect_material_expressions(road_mask, "", node, "Alpha")
        return node

    # R is roughness, G is height. Height is unused until displacement or POM
    # lands; it rides along so that work does not need a reimport.
    MEL.connect_material_property(blend(diff, road_d, "RGB", -200), "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(blend(norm, road_n, "RGB", 100), "", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(blend(rh, road_rh, "R", 400), "", unreal.MaterialProperty.MP_ROUGHNESS)

    MEL.recompile_material(mat)
    EAL.save_asset(spec["path"])
    unreal.log(f"built {spec['path']}")


def build_surface_material(spec, textures):
    path, stem = spec["path"], spec["stem"]
    mat = create_material(path)

    def coords(tiling, y):
        node = expr(mat, unreal.MaterialExpressionTextureCoordinate, -700, y)
        node.set_editor_property("coordinate_index", 0)
        node.set_editor_property("u_tiling", tiling)
        node.set_editor_property("v_tiling", tiling)
        return node

    uv = coords(spec.get("repeat", 1.0), 0)

    # A second reading of the same surface at an unrelated scale, mixed in by a
    # third at a very large one.
    #
    # The ribbon builders parameterise UVs by distance travelled, so a span is
    # the same tile laid end to end -- twenty times over on a long one, and in
    # lockstep across the deck and both rails, which is what makes the repeat
    # read as a repeat rather than as timber. The scales are deliberately not
    # ratios of each other: two patterns that share a common multiple line up
    # again at that multiple and the eye finds the new period instead of the old.
    uv_alt = coords(spec.get("alt_repeat", 0.47), 300)
    uv_macro = coords(spec.get("macro_repeat", 0.083), 600)

    diff = sampler(mat, textures, f"{stem}_D", -200, "D", uv)
    norm = sampler(mat, textures, f"{stem}_N", 100, "N", uv)
    rh = sampler(mat, textures, f"{stem}_RH", 400, "RH", uv)

    # Only the colour is read twice. The repeat is visible in albedo -- the same
    # knot in the same place down the whole rail -- and a second normal and
    # roughness would double the samplers again to fix something nobody sees.
    diff_alt = sampler(mat, textures, f"{stem}_D", 700, "D", uv_alt, parameter=f"{stem}_D_Alt")
    macro = sampler(mat, textures, f"{stem}_D", 1000, "D", uv_macro, parameter=f"{stem}_Macro")

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


def build_water_material(spec):
    # Single Layer Water rather than a translucent surface: carved channels are
    # shallow and a flat blue plane over them reads as plastic, where this
    # shading model gets depth absorption and refraction from the ground already
    # drawn underneath it. No texture -- the surface is all shading.
    path = spec["path"]
    mat = create_material(path)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_SINGLE_LAYER_WATER)

    def colour(values, y):
        node = expr(mat, unreal.MaterialExpressionConstant3Vector, -400, y)
        node.set_editor_property("constant", unreal.LinearColor(*values, 1.0))
        return node

    def scalar(value, y):
        node = expr(mat, unreal.MaterialExpressionConstant, -400, y)
        node.set_editor_property("r", value)
        return node

    MEL.connect_material_property(colour(spec["tint"], 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(scalar(spec["roughness"], 180), "", unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.connect_material_property(scalar(0.0, 320), "", unreal.MaterialProperty.MP_METALLIC)

    # Opacity, which for this shading model is how much of the water's own
    # surface shows rather than how see-through the material is. Left
    # unconnected the surface has nothing to shade with and reads as absent over
    # a riverbed only a hundred and sixty units deep.
    MEL.connect_material_property(scalar(1.0, 460), "", unreal.MaterialProperty.MP_OPACITY)

    # Single Layer Water derives its colour from how light travels through the
    # depth behind it, and with no coefficients given it takes defaults close to
    # clear -- which over a shallow channel is indistinguishable from no water at
    # all. Per-metre in world units.
    water_out = expr(mat, unreal.MaterialExpressionSingleLayerWaterMaterialOutput, -100, 600)
    MEL.connect_material_expressions(colour(spec["scattering"], 600), "", water_out, "ScatteringCoefficients")
    MEL.connect_material_expressions(colour(spec["absorption"], 740), "", water_out, "AbsorptionCoefficients")

    MEL.recompile_material(mat)
    EAL.save_asset(path)
    unreal.log(f"built {path}")


def build(config):
    art_root = config.get("art_root", "Art")

    textures = {}
    for entry in config["sets"]:
        destination = entry.get("destination")
        if not destination:
            continue
        for suffix in MAPS:
            name = f"{entry['stem']}_{suffix}"
            tex = import_texture(art_root, name, entry["source"], destination)
            if tex is None:
                unreal.log_error(f"aborting: {name} did not import")
                return
            textures[name] = tex

    if config.get("terrain_material"):
        build_terrain_material(config["terrain_material"], textures)
    for spec in config.get("surface_materials", []):
        build_surface_material(spec, textures)
    if config.get("water_material"):
        build_water_material(config["water_material"])


build(load_config())
