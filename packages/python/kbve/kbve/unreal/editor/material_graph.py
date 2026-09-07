"""The handful of things every material builder in here needs.

Split out because they are the only code the builders share, and a builder that
had to import its neighbour to get at `link` would make the two of them a cycle.
Nothing in here knows what a terrain or a leaf is.
"""

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


