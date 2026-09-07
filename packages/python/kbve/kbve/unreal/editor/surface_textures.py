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
import math
import os

import unreal

ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary


def link(source, output, target, target_input):
    """Connect two expressions, or stop the build saying which pair refused.

    MaterialEditingLibrary reports a refused connection by returning False, and
    every caller here used to ignore it. A wrong pin name is therefore not an
    error when it is made: the script reports success, the material silently
    fails to compile, and the field draws in the default grey -- or worse, draws
    almost right with one term missing. Several of the names in this file are
    unnamed pins that must be passed as "", which is exactly the mistake this
    catches.
    """
    if not MEL.connect_material_expressions(source, output, target, target_input):
        raise RuntimeError(
            f"{type(source).__name__}.{output or '<unnamed>'} would not connect to "
            f"{type(target).__name__}.{target_input or '<unnamed>'}"
        )


def link_any(source, outputs, target, target_input):
    """Connect the first of several candidate pin names that the node accepts.

    A multi-output node publishes its pins under names this API will not read
    back -- Outputs is protected -- so the only way to learn one from a script is
    to offer a name and see whether it is taken. Rather than pin a spelling that
    is right for one engine version, offer the spellings and let the node choose,
    and say what was tried when none of them fit.
    """
    for output in outputs:
        if MEL.connect_material_expressions(source, output, target, target_input):
            return output
    raise RuntimeError(
        f"{type(source).__name__} took none of {outputs} into {type(target).__name__}.{target_input or '<unnamed>'}"
    )


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

    # Declared here rather than left to the editor. A material handed to an
    # instanced component without this compiles the permutation on the spot,
    # warns, and dirties the package -- and a cook, which has no editor to do
    # that, drops the material for the default one instead.
    if spec.get("instanced", False):
        mat.set_editor_property("used_with_instanced_static_meshes", True)

    MEL.recompile_material(mat)
    EAL.save_asset(path)
    unreal.log(f"built {path}")


def build_foliage_material(spec, textures):
    """A masked card material for a cutout atlas.

    Cards are not a surface: they are a photograph of one plant with everything
    around it cut away, so the whole material is what the cut is and how the
    remainder is lit. Opacity comes from the packed map's blue channel, where
    the ingest side puts a cutout mask -- that texture is already imported
    linear and as masks, which is what coverage wants, and it needs no sampler
    that roughness was not already paying for.

    Built here rather than in C++ at runtime because material expressions are an
    editor-only API: the same code that assembles a graph in the editor is a
    crash in a packaged client and a silent null in a cook.
    """
    path, stem = spec["path"], spec["stem"]
    mat = create_material(path)

    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    mat.set_editor_property("two_sided", True)

    # Two-sided foliage, which is Unreal's model for a leaf: light that hits the
    # far side of a blade comes through it rather than stopping. That glow along
    # a lit edge is most of what separates a photographed clump from a printed
    # one, and it is the difference between this and the render the pack ships.
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    mat.set_editor_property("opacity_mask_clip_value", spec.get("clip", 0.33))
    mat.set_editor_property("dithered_lod_transition", True)
    mat.set_editor_property("used_with_instanced_static_meshes", True)

    uv = expr(mat, unreal.MaterialExpressionTextureCoordinate, -700, 0)
    uv.set_editor_property("coordinate_index", 0)

    diff = sampler(mat, textures, f"{stem}_D", -200, "D", uv)
    packed = sampler(mat, textures, f"{stem}_RH", 400, "RH", uv)

    # How far up its own clump a vertex sits, nought at the ground and one at the
    # crown. Both the shading at the base and the wind are meaningless without
    # it: they are the difference between a plant rooted in the earth and a
    # cut-out sliding about on top of it.
    #
    # Measured off the geometry rather than read out of a vertex colour, which is
    # where it used to come from. The card builder paints the channel, so that
    # worked for exactly as long as every clump was a generated card -- a pack's
    # own model arrives with no colours at all, which Unreal reads as white, and
    # white means every vertex claims to be the crown. The base then lights as
    # brightly as the tip and sways as far as it, so the whole clump slides from
    # side to side instead of bending. That is the "dancing", and it is not a
    # question of amplitude.
    #
    # Taken in the mesh's own local space, before any transform reaches it.
    #
    # Deriving it in world space instead needs the clump's pivot and its height,
    # and both of those are traps: ObjectPositionWS is the centre of the bounds
    # rather than the pivot, so half of every clump reads as below the ground;
    # and world position is reported after the material's own offsets, so the
    # wind moves the vertex, the moved vertex changes the height, and the height
    # changes the wind, which is a clump that drives itself back and forth.
    #
    # Local bounds have neither problem. Bounds minimum is the bottom of the
    # mesh whatever its pivot, the full extent is its height, and nothing here
    # is downstream of the wind. It is also free of the instance's scale, so a
    # clump normalised up from ten units answers the same as one authored at
    # sixty.
    local = expr(mat, unreal.MaterialExpressionPreSkinnedPosition, -1600, 400)
    extent = expr(mat, unreal.MaterialExpressionPreSkinnedLocalBounds, -1600, 540)

    def upward(source, outputs, y):
        node = expr(mat, unreal.MaterialExpressionComponentMask, -1300, y)
        node.set_editor_property("r", False)
        node.set_editor_property("g", False)
        node.set_editor_property("b", True)
        node.set_editor_property("a", False)
        link_any(source, outputs, node, "")
        return node

    off_floor = expr(mat, unreal.MaterialExpressionSubtract, -1050, 400)
    link(upward(local, [""], 400), "", off_floor, "A")
    link(upward(extent, ["Bounds Min", "BoundsMin", "Min"], 470), "", off_floor, "B")

    # A unit of slack in the divisor: a mesh with no readable height would
    # otherwise divide by zero, and an infinity saturates to one -- which is the
    # every-vertex-is-the-crown case this whole block exists to remove.
    one = expr(mat, unreal.MaterialExpressionConstant, -1300, 620)
    one.set_editor_property("r", 1.0)
    tall = expr(mat, unreal.MaterialExpressionAdd, -1050, 560)
    link(upward(extent, ["Full Extents", "FullExtents", "Extents"], 540), "", tall, "A")
    link(one, "", tall, "B")

    rise = expr(mat, unreal.MaterialExpressionDivide, -800, 460)
    link(off_floor, "", rise, "A")
    link(tall, "", rise, "B")

    # Vertex stage only: PreSkinnedPosition is a vertex-shader identifier, and a
    # material that reaches for it from the pixel shader does not fail at that
    # node -- it fails entirely, and Unreal quietly draws the default material
    # instead. Which looks like grey untextured geometry, and reads as a broken
    # mesh rather than a broken material.
    #
    # So the height is computed once here for the wind, which is a vertex
    # concern, and carried across the interpolator for the shading and the
    # ground blend, which are pixel ones.
    lifted = expr(mat, unreal.MaterialExpressionClamp, -600, 460)
    link(rise, "", lifted, "")

    along = expr(mat, unreal.MaterialExpressionVertexInterpolator, -450, 460)
    link(lifted, "", along, "")

    # World space for the two things that genuinely want it: the ground the root
    # blends into, and the direction out of the clump's centre the normal is bent
    # along. Both without the material's own offsets, or each swims as the wind
    # moves the blade it is measuring.
    crown = expr(mat, unreal.MaterialExpressionWorldPosition, -1900, 200)
    crown.set_editor_property(
        "world_position_shader_offset",
        unreal.WorldPositionIncludedOffsets.WPT_EXCLUDE_ALL_SHADER_OFFSETS,
    )
    pivot = expr(mat, unreal.MaterialExpressionObjectPositionWS, -1900, 340)
    spoke = expr(mat, unreal.MaterialExpressionSubtract, -1700, 260)
    link(crown, "", spoke, "A")
    link(pivot, "", spoke, "B")

    occlusion = expr(mat, unreal.MaterialExpressionLinearInterpolate, -400, -400)
    occlusion.set_editor_property("const_a", spec.get("base_shade", 0.70))
    occlusion.set_editor_property("const_b", 1.0)
    link(along, "", occlusion, "Alpha")

    shaded = expr(mat, unreal.MaterialExpressionMultiply, -100, -300)
    link(diff, "RGB", shaded, "A")
    link(occlusion, "", shaded, "B")

    # The scan is a dry olive -- hue 69 degrees, and more red than a growing
    # blade has. Corrected here rather than in the PNG so the source stays the
    # measurement and this stays the artistic decision. These numbers are solved
    # rather than guessed: the sheet's mean under the mask is linear
    # (0.120, 0.132, 0.038), and this lands the lit blade on hue 98 at 0.62
    # saturation, which is a growing one.
    tint_rgb = spec.get("tint", [0.62, 1.60, 0.80])

    # One tint over the whole field is the loudest thing left saying this was
    # generated. A real sward is a range -- the same species drier here, lusher
    # there -- and the eye reads that range long before it reads any blade.
    #
    # Drier is redder and less saturated, lusher is greener: a scale on its own
    # only makes some clumps darker, which reads as shadow rather than as a
    # different plant. Per instance rather than per pixel, so a clump varies
    # from its neighbour and not from itself.
    scatter = expr(mat, unreal.MaterialExpressionPerInstanceRandom, -1200, 1600)

    vary = spec.get("tint_variation", 0.18)
    dry_rgb = [tint_rgb[0] * (1.0 + vary * 0.35), tint_rgb[1] * (1.0 - vary), tint_rgb[2] * (1.0 - vary * 0.5)]
    lush_rgb = [tint_rgb[0] * (1.0 - vary * 0.35), tint_rgb[1] * (1.0 + vary), tint_rgb[2] * (1.0 + vary * 0.5)]

    dry = expr(mat, unreal.MaterialExpressionConstant3Vector, -700, -160)
    dry.set_editor_property("constant", unreal.LinearColor(dry_rgb[0], dry_rgb[1], dry_rgb[2], 1.0))
    lush = expr(mat, unreal.MaterialExpressionConstant3Vector, -700, -60)
    lush.set_editor_property("constant", unreal.LinearColor(lush_rgb[0], lush_rgb[1], lush_rgb[2], 1.0))
    tint = expr(mat, unreal.MaterialExpressionLinearInterpolate, -400, -100)
    link(dry, "", tint, "A")
    link(lush, "", tint, "B")
    link(scatter, "", tint, "Alpha")

    tinted = expr(mat, unreal.MaterialExpressionMultiply, -100, -200)
    link(shaded, "", tinted, "A")
    link(tint, "", tinted, "B")

    # Grass that ignores the ground it stands in reads as stickers laid on a
    # surface, and no amount of shading on the blade itself fixes it -- the tell
    # is the hard edge where the clump meets a colour it has nothing to do with.
    # Pulling the root toward the ground's own albedo removes that edge.
    #
    # Sampled from the terrain's texture at the terrain's own world-space UVs
    # rather than through a runtime virtual texture. The terrain material maps
    # by world position, so the same position and the same scale land on exactly
    # the same texel -- the registration an RVT would buy is already free here.
    # What this does not get is anything painted on the terrain rather than
    # tiled into it: a road blends its own surface in on top, and a clump at the
    # verge blends toward the hillside instead. Grass is kept off the roads
    # anyway, so that is a seam we do not currently draw.
    ground_stem = spec.get("ground")
    grounded = tinted
    if ground_stem and f"{ground_stem}_D" in textures:
        ground_uv_scale = expr(mat, unreal.MaterialExpressionConstant, -1000, -420)
        ground_uv_scale.set_editor_property("r", 1.0 / float(spec.get("ground_repeat_uu", 512)))
        flat = expr(mat, unreal.MaterialExpressionComponentMask, -1200, -420)
        flat.set_editor_property("r", True)
        flat.set_editor_property("g", True)
        flat.set_editor_property("b", False)
        flat.set_editor_property("a", False)
        link(crown, "", flat, "")
        ground_uv = expr(mat, unreal.MaterialExpressionMultiply, -800, -420)
        link(flat, "", ground_uv, "A")
        link(ground_uv_scale, "", ground_uv, "B")

        earth = sampler(mat, textures, f"{ground_stem}_D", -600, "D", ground_uv)

        # Strongest at the root and gone by the crown, because that is where the
        # eye looks for the join. Squared so the blend stays near the ground
        # instead of washing the whole clump toward dirt.
        reach = expr(mat, unreal.MaterialExpressionOneMinus, -400, -520)
        link(along, "", reach, "")
        sharpen = expr(mat, unreal.MaterialExpressionMultiply, -300, -520)
        link(reach, "", sharpen, "A")
        link(reach, "", sharpen, "B")
        depth = expr(mat, unreal.MaterialExpressionConstant, -400, -460)
        depth.set_editor_property("r", spec.get("ground_blend", 0.45))
        amount = expr(mat, unreal.MaterialExpressionMultiply, -200, -500)
        link(sharpen, "", amount, "A")
        link(depth, "", amount, "B")

        grounded = expr(mat, unreal.MaterialExpressionLinearInterpolate, 0, -300)
        link(tinted, "", grounded, "A")
        link(earth, "RGB", grounded, "B")
        link(amount, "", grounded, "Alpha")

    MEL.connect_material_property(grounded, "", unreal.MaterialProperty.MP_BASE_COLOR)

    # What comes through the blade, not what bounces off it: greener and darker
    # than the surface, because a leaf filters the light it transmits.
    through_rgb = spec.get("transmission", [0.09, 0.26, 0.05])
    through = expr(mat, unreal.MaterialExpressionConstant3Vector, -400, 0)
    through.set_editor_property(
        "constant",
        unreal.LinearColor(through_rgb[0], through_rgb[1], through_rgb[2], 1.0),
    )
    MEL.connect_material_property(through, "", unreal.MaterialProperty.MP_SUBSURFACE_COLOR)

    # A card's own normal points out of its face, sideways, so half a field faces
    # away from any sun and shades to black -- which reads as dirt with a pattern
    # on it rather than as ground cover. It has to be bent, and what it is bent
    # toward decides whether the result looks like a plant or like a decal.
    #
    # Bent toward world up, every blade in the field ends up holding the same
    # vector, and a thing that shades identically everywhere reads as flat no
    # matter how much geometry is in it -- the whole clump lights as one panel.
    #
    # Bent instead toward the direction out of the clump's own centre, each
    # vertex gets its own answer: the crown points up, the skirt points out, and
    # the clump shades as the rounded tuft it is. This is the dome-normal trick
    # every foliage pipeline arrives at, and it costs two nodes.
    up = expr(mat, unreal.MaterialExpressionConstant3Vector, -700, 200)
    up.set_editor_property("constant", unreal.LinearColor(0.0, 0.0, 1.0, 1.0))

    dome = expr(mat, unreal.MaterialExpressionNormalize, -950, 260)
    link(spoke, "", dome, "")

    # Pure outward would leave the skirt horizontal and unlit from above. Some
    # up keeps the underside off black without flattening the crown back out.
    domed = expr(mat, unreal.MaterialExpressionLinearInterpolate, -700, 300)
    link(dome, "", domed, "A")
    link(up, "", domed, "B")
    domed.set_editor_property("const_alpha", spec.get("dome_up", 0.35))

    face = expr(mat, unreal.MaterialExpressionVertexNormalWS, -700, 400)
    bend = expr(mat, unreal.MaterialExpressionLinearInterpolate, -400, 300)
    link(face, "", bend, "A")
    link(domed, "", bend, "B")
    bend.set_editor_property("const_alpha", spec.get("normal_lift", 0.75))

    # World space, because the normal being fed is the vertex normal in world
    # space. Left tangent space, every card would read that vector as a tilt off
    # its own face and light as if it were turned on its side.
    mat.set_editor_property("tangent_space_normal", False)
    MEL.connect_material_property(bend, "", unreal.MaterialProperty.MP_NORMAL)
    MEL.connect_material_property(packed, "B", unreal.MaterialProperty.MP_OPACITY_MASK)
    # Remapped, not used as it stands. The scan's roughness averages 0.37 with
    # 94% of it under 0.5 -- a polished surface, which is what a wet studio leaf
    # measures as and not what a field of dry grass is. At that gloss the sun's
    # highlight blows the blade out to white, and it does it across the whole
    # field at once, because a sun that catches one blade catches every blade
    # pointing the same way. The map still carries the variation; only its
    # range moves.
    rough_lo, rough_hi = spec.get("roughness_range", [0.62, 0.95])
    roughness = expr(mat, unreal.MaterialExpressionLinearInterpolate, -100, 400)
    roughness.set_editor_property("const_a", rough_lo)
    roughness.set_editor_property("const_b", rough_hi)
    link(packed, "R", roughness, "Alpha")
    MEL.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)

    # Grass is not a dielectric worth a half-strength highlight. Dropping this is
    # the other half of the same problem: roughness widens the lobe, specular is
    # how much energy goes into it at all.
    specular = expr(mat, unreal.MaterialExpressionConstant, -100, 550)
    specular.set_editor_property("r", spec.get("specular", 0.15))
    MEL.connect_material_property(specular, "", unreal.MaterialProperty.MP_SPECULAR)

    # Wind. Three things have to be true or a field of this reads as a chorus
    # line rather than as weather.
    #
    # It travels across the ground in both axes: phased on world X alone, every
    # clump sharing an X moves in lockstep, and a row of grass dances together.
    #
    # Each clump has its own offset into the wave, from the per-instance random
    # the instanced component already provides -- without it, neighbours a
    # centimetre apart are in perfect step, which nothing in a field ever is.
    #
    # And the amplitude is small against the clump. Nine units on a clump forty
    # five tall is a fifth of its own height, which is not a breeze.
    world = expr(mat, unreal.MaterialExpressionWorldPosition, -1400, 800)
    world.set_editor_property(
        "world_position_shader_offset",
        unreal.WorldPositionIncludedOffsets.WPT_EXCLUDE_ALL_SHADER_OFFSETS,
    )

    # Masked rather than asked for "R": world position has one unnamed output,
    # and a connection naming a channel it does not publish is not an error when
    # it is made -- it is a material that fails to compile and silently draws as
    # the default one. The mask's own input is unnamed for the same reason the
    # sine's is.
    def channel(source, red, green, y):
        node = expr(mat, unreal.MaterialExpressionComponentMask, -1200, y)
        node.set_editor_property("r", red)
        node.set_editor_property("g", green)
        node.set_editor_property("b", False)
        node.set_editor_property("a", False)
        link(source, "", node, "")
        return node

    wavelength = spec.get("wind_wavelength", 0.0025)

    # Which way the weather is going, read from the shared collection rather than
    # built in here. A material carrying its own copy cannot be told the wind has
    # turned, and two materials each carrying one eventually disagree about which
    # way it was going in the first place.
    collection = spec.get("wind_collection")

    def wind(name, y):
        node = expr(mat, unreal.MaterialExpressionCollectionParameter, -1500, y)
        node.set_editor_property("collection", collection)
        node.set_editor_property("parameter_name", name)
        return node

    heading3 = wind("WindTravelDirection", 900)

    # The gust travels along the wind rather than across each axis separately.
    # Phasing on X and Y independently makes a chequerwork whose fronts run at
    # whatever angle the two wavelengths happen to give; projecting the ground
    # position onto the wind direction makes the fronts square to it, so what
    # crosses the field is a gust going one way and not a pattern.
    ground = expr(mat, unreal.MaterialExpressionComponentMask, -1200, 800)
    ground.set_editor_property("r", True)
    ground.set_editor_property("g", True)
    ground.set_editor_property("b", False)
    ground.set_editor_property("a", False)
    link(world, "", ground, "")

    heading = expr(mat, unreal.MaterialExpressionComponentMask, -1350, 900)
    heading.set_editor_property("r", True)
    heading.set_editor_property("g", True)
    heading.set_editor_property("b", False)
    heading.set_editor_property("a", False)
    link(heading3, "", heading, "")

    downwind = expr(mat, unreal.MaterialExpressionDotProduct, -1000, 850)
    link(ground, "", downwind, "A")
    link(heading, "", downwind, "B")

    stretch = expr(mat, unreal.MaterialExpressionConstant, -1000, 960)
    stretch.set_editor_property("r", wavelength)
    phase = expr(mat, unreal.MaterialExpressionMultiply, -800, 900)
    link(downwind, "", phase, "A")
    link(stretch, "", phase, "B")

    time = expr(mat, unreal.MaterialExpressionTime, -1200, 1200)
    speed = wind("WindSpeed", 1400)
    advance = expr(mat, unreal.MaterialExpressionMultiply, -1000, 1300)
    link(time, "", advance, "A")
    link(speed, "", advance, "B")

    # A nudge out of step with the neighbours, not a random place in the cycle.
    # A full turn of per-instance offset decorrelates the field completely: one
    # clump leans while the one beside it stands up, which is not wind, it is
    # each plant having its own private weather. A fraction of a turn keeps the
    # gust legible and still stops the field moving as one rigid sheet.
    turn = expr(mat, unreal.MaterialExpressionConstant, -1200, 1700)
    turn.set_editor_property("r", 6.2831853 * spec.get("wind_scatter", 0.12))
    stagger = expr(mat, unreal.MaterialExpressionMultiply, -1000, 1600)
    link(scatter, "", stagger, "A")
    link(turn, "", stagger, "B")

    moving = expr(mat, unreal.MaterialExpressionAdd, -800, 1300)
    link(advance, "", moving, "A")
    link(stagger, "", moving, "B")

    argument = expr(mat, unreal.MaterialExpressionAdd, -600, 1100)
    link(phase, "", argument, "A")
    link(moving, "", argument, "B")

    # The input pin is unnamed. Naming it "Input" -- which is what the property
    # is called -- connects nothing, and the material then fails to compile with
    # "Missing Sine input" long after the script has reported success.
    swing = expr(mat, unreal.MaterialExpressionSine, -400, 1100)
    link(argument, "", swing, "")

    # Gusts, not oscillation. A sine spends half its cycle negative, and a
    # negative displacement leans the blade into the wind -- so half the field is
    # always bending upwind, which is the thing that reads as wobble rather than
    # weather. Folded to nought-and-one the grass only ever leans downwind, and
    # what varies is how hard it is pushed.
    wave = expr(mat, unreal.MaterialExpressionLinearInterpolate, -250, 1060)
    wave.set_editor_property("const_a", spec.get("wind_lull", 0.15))
    wave.set_editor_property("const_b", 1.0)
    link(swing, "", wave, "Alpha")

    # Bent like a cantilever rather than sheared like a stack of cards.
    #
    # Weighting the sway by height directly is a straight line from a still root
    # to a moving tip, which puts real travel into the lower third of the blade
    # -- and a plant whose base swings is a plant that is not rooted in anything.
    # Raising it concentrates the movement at the top, where a blade actually
    # gives, and stiffens the bottom towards nothing.
    bend_curve = expr(mat, unreal.MaterialExpressionPower, -250, 1140)
    link(lifted, "", bend_curve, "Base")
    bend_curve.set_editor_property("const_exponent", spec.get("wind_stiffness", 2.4))

    weighted = expr(mat, unreal.MaterialExpressionMultiply, -200, 1100)
    link(wave, "", weighted, "A")
    link(bend_curve, "", weighted, "B")

    # Every clump pushed the same way, because they are all standing in the same
    # wind. The strength varies with the gust above; the heading does not.
    # How far this particular plant gives stays here -- a blade of grass and a
    # branch answer the same weather by different amounts -- but it is scaled by
    # the collection's strength, which is what a gust front turns up for
    # everything at once.
    reach = expr(mat, unreal.MaterialExpressionConstant, -500, 1460)
    reach.set_editor_property("r", spec.get("wind_amplitude", 2.2))
    amplitude = expr(mat, unreal.MaterialExpressionMultiply, -350, 1420)
    link(reach, "", amplitude, "A")
    link(wind("WindStrength", 1520), "", amplitude, "B")

    # Masked to three channels: a collection parameter reads back as a float4,
    # and a four-channel offset added to a three-channel world position is not a
    # broadened type, it is a material that will not compile.
    heading_xyz = expr(mat, unreal.MaterialExpressionComponentMask, -350, 1360)
    heading_xyz.set_editor_property("r", True)
    heading_xyz.set_editor_property("g", True)
    heading_xyz.set_editor_property("b", True)
    heading_xyz.set_editor_property("a", False)
    link(heading3, "", heading_xyz, "")

    sway = expr(mat, unreal.MaterialExpressionMultiply, -200, 1400)
    link(heading_xyz, "", sway, "A")
    link(amplitude, "", sway, "B")
    offset = expr(mat, unreal.MaterialExpressionMultiply, 0, 1200)
    link(weighted, "", offset, "A")
    link(sway, "", offset, "B")

    # Clumps shrink into their own pivot as they go away, each starting at its
    # own distance.
    #
    # A cull distance alone is a line in the world that things wink out of
    # crossing, and every clump crosses it at the same range -- so what the eye
    # catches is not one clump disappearing but a ring of them doing it at once.
    # Collapsing to the pivot spreads that disappearance over hundreds of units,
    # and the per-instance random spreads the ring itself into a band, so nothing
    # shares its moment with a neighbour.
    #
    # Distance is measured to the pivot rather than to the vertex: the pivot is
    # constant over a clump, so the whole thing shrinks together instead of its
    # far half leading its near half.
    camera = expr(mat, unreal.MaterialExpressionCameraPositionWS, -1400, 1900)
    span = expr(mat, unreal.MaterialExpressionDistance, -1200, 1950)
    link(camera, "", span, "A")
    link(pivot, "", span, "B")

    stagger_amount = spec.get("fade_stagger", 0.45)
    spread = expr(mat, unreal.MaterialExpressionConstant, -1400, 2100)
    spread.set_editor_property("r", stagger_amount)
    jitter = expr(mat, unreal.MaterialExpressionMultiply, -1200, 2100)
    link(scatter, "", jitter, "A")
    link(spread, "", jitter, "B")

    base_start = expr(mat, unreal.MaterialExpressionConstant, -1400, 2200)
    base_start.set_editor_property("r", 1.0 - stagger_amount * 0.5)
    scaled_start = expr(mat, unreal.MaterialExpressionAdd, -1000, 2150)
    link(jitter, "", scaled_start, "A")
    link(base_start, "", scaled_start, "B")

    begin = expr(mat, unreal.MaterialExpressionConstant, -1000, 2250)
    begin.set_editor_property("r", spec.get("fade_start", 2400.0))
    start = expr(mat, unreal.MaterialExpressionMultiply, -800, 2200)
    link(scaled_start, "", start, "A")
    link(begin, "", start, "B")

    past = expr(mat, unreal.MaterialExpressionSubtract, -600, 1950)
    link(span, "", past, "A")
    link(start, "", past, "B")

    reach = expr(mat, unreal.MaterialExpressionConstant, -600, 2100)
    reach.set_editor_property("r", 1.0 / max(spec.get("fade_range", 900.0), 1.0))
    ramp = expr(mat, unreal.MaterialExpressionMultiply, -400, 1950)
    link(past, "", ramp, "A")
    link(reach, "", ramp, "B")

    gone = expr(mat, unreal.MaterialExpressionClamp, -200, 1950)
    link(ramp, "", gone, "")

    # The wind goes with it, or a clump shrunk to nothing still swings its
    # vanished self about and flickers a pixel where it used to be.
    standing = expr(mat, unreal.MaterialExpressionOneMinus, -200, 1750)
    link(gone, "", standing, "")
    settled = expr(mat, unreal.MaterialExpressionMultiply, 0, 1400)
    link(offset, "", settled, "A")
    link(standing, "", settled, "B")

    to_pivot = expr(mat, unreal.MaterialExpressionSubtract, -1000, 1800)
    link(pivot, "", to_pivot, "A")
    link(world, "", to_pivot, "B")
    collapse = expr(mat, unreal.MaterialExpressionMultiply, 0, 1700)
    link(to_pivot, "", collapse, "A")
    link(gone, "", collapse, "B")

    total = expr(mat, unreal.MaterialExpressionAdd, 200, 1500)
    link(settled, "", total, "A")
    link(collapse, "", total, "B")
    MEL.connect_material_property(total, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)

    MEL.recompile_material(mat)
    EAL.save_asset(path)
    unreal.log(f"built {path}")

    build_foliage_atlas(spec, mat)


def build_foliage_atlas(spec, material):
    """Bake a sheet's cells beside its material, for the field to draw from.

    Cells are pixel rectangles in the config and UV rectangles in the asset,
    because a rectangle is measured off an image and consumed as a coordinate,
    and converting at the boundary means neither end has to know about the
    other's units.

    They are authored rather than detected, and that is not laziness: a cutout
    pack lays its clumps out to fill the sheet, and a pack built around a model
    spends most of its sheet on UV islands for single blades. A component pass
    over the mask returns hundreds of slivers for the second kind and merges
    overlapping clumps in the first. Someone has to say which rectangles are a
    plant.
    """
    cells = spec.get("cells")
    if not cells:
        return

    path = spec["atlas"]
    sheet = float(spec.get("sheet", 1024))

    # Updated in place rather than deleted and remade. Two builders write to
    # this asset -- this one owns the material, the weight and the cells, and the
    # model importer owns the clumps -- and recreating it here silently threw the
    # importer's half away. The field then fell back to cutting cards out of the
    # sheet, which it is entitled to do and says nothing about, so the packs'
    # own models disappeared every time the textures were rebuilt.
    if EAL.does_asset_exist(path):
        atlas = EAL.load_asset(path)
    else:
        pkg_dir, pkg_name = path.rsplit("/", 1)
        factory = unreal.DataAssetFactory()
        factory.set_editor_property("data_asset_class", unreal.KBVEWorldGrassAtlas)
        atlas = ASSET_TOOLS.create_asset(pkg_name, pkg_dir, unreal.KBVEWorldGrassAtlas, factory)

    atlas.set_editor_property("material", material)
    atlas.set_editor_property("weight", spec.get("weight", 1))
    atlas.set_editor_property(
        "cells",
        [unreal.Vector4(x0 / sheet, y0 / sheet, x1 / sheet, y1 / sheet) for x0, y0, x1, y1 in cells],
    )
    EAL.save_asset(path)
    kept = len(atlas.get_editor_property("clumps") or [])
    unreal.log(f"built {path} with {len(cells)} cells, {kept} models kept")


def build_wind_collection(spec):
    """The one wind every material that moves in it reads from.

    A parameter collection rather than a constant in each material, because the
    wind is a property of the weather and not of the grass. Baked per material it
    cannot gust, cannot turn, cannot be told a storm is coming, and -- worse --
    each material carries its own copy of the answer, so the day one of them is
    retuned the field and the sky quietly start disagreeing about which way the
    weather is going.

    Named for where the wind is going rather than where it comes from. Both
    conventions are ordinary -- a meteorologist's "north-westerly" blows towards
    the south-east -- and a name that has to be qualified every time it is read
    is a name that will eventually be read wrong by something that then leans the
    opposite way to everything else.
    """
    # Updated in place, never recreated. Every material that reads the wind refers
    # to this asset by name, and so does the map -- delete it and the delete is
    # refused as in-use, the create then hands back nothing, and the texture build
    # falls over on its second run having worked perfectly on its first.
    path = spec["path"]
    if EAL.does_asset_exist(path):
        collection = EAL.load_asset(path)
    else:
        pkg_dir, pkg_name = path.rsplit("/", 1)
        collection = ASSET_TOOLS.create_asset(
            pkg_name, pkg_dir, unreal.MaterialParameterCollection, unreal.MaterialParameterCollectionFactoryNew()
        )

    dx, dy = spec.get("direction", [1.0, -1.0])[:2]
    span = math.hypot(dx, dy) or 1.0

    heading = unreal.CollectionVectorParameter()
    heading.set_editor_property("parameter_name", "WindTravelDirection")
    heading.set_editor_property("default_value", unreal.LinearColor(dx / span, dy / span, 0.0, 0.0))
    collection.set_editor_property("vector_parameters", [heading])

    scalars = []
    for name, value in (
        ("WindSpeed", spec.get("speed", 0.85)),
        ("WindStrength", spec.get("strength", 1.0)),
    ):
        entry = unreal.CollectionScalarParameter()
        entry.set_editor_property("parameter_name", name)
        entry.set_editor_property("default_value", value)
        scalars.append(entry)
    collection.set_editor_property("scalar_parameters", scalars)

    EAL.save_asset(path)
    unreal.log(f"built {path}")
    return collection


def build_glass_material(spec):
    # Thin Translucent, which is Unreal's model for a pane: a sheet with no
    # interior worth simulating, where the tint belongs to how much light gets
    # through rather than to a surface colour. A plain translucent surface with a
    # low opacity fogs whatever is behind it instead of tinting it.
    path = spec["path"]
    mat = create_material(path)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_THIN_TRANSLUCENT)

    # Surface ForwardShading, which Thin Translucent does not merely prefer but
    # requires: the engine refuses to compile the pair otherwise and falls the
    # material back to the opaque default, so the glass comes out a solid wall.
    # The label in the editor is "Surface ForwardShading"; the enum it stands for
    # is TLM_SURFACE_PER_PIXEL_LIGHTING. TLM_SURFACE is a different mode, the one
    # labelled "Surface TranslucencyVolume".
    mat.set_editor_property(
        "translucency_lighting_mode",
        unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING,
    )

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

    # How much of the pane's own surface shows -- its sheen -- not how solid it
    # is. What you can see through it is the transmittance below.
    MEL.connect_material_property(scalar(spec["opacity"], 460), "", unreal.MaterialProperty.MP_OPACITY)

    glass_out = expr(mat, unreal.MaterialExpressionThinTranslucentMaterialOutput, -100, 600)
    link(colour(spec["transmittance"], 600), "", glass_out, "TransmittanceColor")

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

    wind_collection = None
    if config.get("wind_collection"):
        wind_collection = build_wind_collection(config["wind_collection"])

    if config.get("terrain_material"):
        build_terrain_material(config["terrain_material"], textures)
    for spec in config.get("surface_materials", []):
        build_surface_material(spec, textures)
    for spec in config.get("foliage_materials", []):
        # The ground a clump blends its root into is the terrain's, so it is
        # taken from the terrain rather than restated per foliage set and left
        # to drift out of step with it.
        spec["wind_collection"] = wind_collection
        terrain = config.get("terrain_material") or {}
        spec.setdefault("ground", terrain.get("ground"))
        spec.setdefault("ground_repeat_uu", terrain.get("repeat_uu", 512))
        build_foliage_material(spec, textures)
    if config.get("water_material"):
        build_water_material(config["water_material"])
    if config.get("glass_material"):
        build_glass_material(config["glass_material"])


build(load_config())
