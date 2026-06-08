import json
import os
import unreal

# Editor automation for KBVENPCSprite assets. Walks Content/NPC/ for every monster
# atlas PNG, imports each as a crisp pixel-art Texture2D, (best-effort) builds the
# shared unlit masked SubUV billboard material, and creates a UKBVENpcSpriteDef
# wired to both. Source PNGs are committed via LFS under Content/NPC/.
#
# Defaults assume a 5x3 grid (columns = animation frames, rows = front/side/back).
# Override per atlas by dropping a sidecar JSON next to the PNG named
# "<stem>.sprite.json" with any of: columns, rows, frames_per_anim, fps,
# row_front, row_side, row_back, world_size [w,h], pivot_z, ref.
#
# Run from inside the editor:
#   Tools > Execute Python Script... > this file
#   or console: py "<repo>/apps/chuckrpg/unreal-chuck/scripts/import_npc_sprite.py"
# Headless:
#   UnrealEditor-Cmd <project> -ExecutePythonScript="<abs path to this file>"

ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary

MATERIAL_PATH = "/Game/NPC/Materials/M_KBVENpcSprite"

# Filesystem subfolder (under Content/) scanned for monster atlases.
SCAN_SUBDIR = "NPC"
# Re-import + overwrite defs that already exist (False preserves hand edits).
FORCE = False

DEFAULTS = {
    "columns": 5,
    "rows": 3,
    "frames_per_anim": 5,
    "fps": 10.0,
    "row_front": 0,
    "row_side": 1,
    "row_back": 2,
    "world_size": (128.0, 128.0),
    "pivot_z": 0.0,
}


def import_atlas_texture(png_abs_path, dest_path, texture_name):
    task = unreal.AssetImportTask()
    task.filename = png_abs_path
    task.destination_path = dest_path
    task.destination_name = texture_name
    task.automated = True
    task.replace_existing = True
    task.save = True
    ASSET_TOOLS.import_asset_tasks([task])

    asset_path = "%s/%s" % (dest_path, texture_name)
    texture = EAL.load_asset(asset_path)
    if not isinstance(texture, unreal.Texture2D):
        unreal.log_error(
            "[import_npc_sprite] texture import failed: %s" % asset_path)
        return None

    texture.set_editor_property("filter", unreal.TextureFilter.TF_NEAREST)
    texture.set_editor_property(
        "mip_gen_settings", unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
    texture.set_editor_property(
        "compression_settings", unreal.TextureCompressionSettings.TC_EDITOR_ICON)
    texture.set_editor_property("srgb", True)
    texture.set_editor_property(
        "lod_group", unreal.TextureGroup.TEXTUREGROUP_UI)
    EAL.save_loaded_asset(texture)
    return texture


def get_or_create_sprite_material():
    if EAL.does_asset_exist(MATERIAL_PATH):
        return EAL.load_asset(MATERIAL_PATH)

    pkg_path, name = MATERIAL_PATH.rsplit("/", 1)
    try:
        mat = ASSET_TOOLS.create_asset(
            name, pkg_path, unreal.Material, unreal.MaterialFactoryNew())
        mel = unreal.MaterialEditingLibrary

        mat.set_editor_property(
            "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
        mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        mat.set_editor_property("two_sided", False)

        tex_param = mel.create_material_expression(
            mat, unreal.MaterialExpressionTextureSampleParameter2D, -350, 0)
        tex_param.set_editor_property("parameter_name", "Atlas")
        tex_param.set_editor_property(
            "sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)

        uv = mel.create_material_expression(
            mat, unreal.MaterialExpressionTextureCoordinate, -1100, 0)

        off_u = mel.create_material_expression(
            mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 200)
        off_u.set_editor_property("data_index", 0)
        off_v = mel.create_material_expression(
            mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 300)
        off_v.set_editor_property("data_index", 1)
        scale_u = mel.create_material_expression(
            mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 400)
        scale_u.set_editor_property("data_index", 2)
        scale_v = mel.create_material_expression(
            mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 500)
        scale_v.set_editor_property("data_index", 3)

        scale_vec = mel.create_material_expression(
            mat, unreal.MaterialExpressionAppendVector, -850, 350)
        off_vec = mel.create_material_expression(
            mat, unreal.MaterialExpressionAppendVector, -850, 250)
        mul = mel.create_material_expression(
            mat, unreal.MaterialExpressionMultiply, -650, 100)
        add = mel.create_material_expression(
            mat, unreal.MaterialExpressionAdd, -500, 50)

        mel.connect_material_expressions(scale_u, "", scale_vec, "A")
        mel.connect_material_expressions(scale_v, "", scale_vec, "B")
        mel.connect_material_expressions(off_u, "", off_vec, "A")
        mel.connect_material_expressions(off_v, "", off_vec, "B")
        mel.connect_material_expressions(uv, "", mul, "A")
        mel.connect_material_expressions(scale_vec, "", mul, "B")
        mel.connect_material_expressions(mul, "", add, "A")
        mel.connect_material_expressions(off_vec, "", add, "B")
        mel.connect_material_expressions(add, "", tex_param, "UVs")

        mel.connect_material_property(
            tex_param, "RGB", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
        mel.connect_material_property(
            tex_param, "A", unreal.MaterialProperty.MP_OPACITY_MASK)

        mel.recompile_material(mat)
        EAL.save_loaded_asset(mat)
        unreal.log("[import_npc_sprite] created material %s" % MATERIAL_PATH)
        return mat
    except Exception as e:
        msg = "material build failed (%s); author %s by hand (see module README)" % (
            e, MATERIAL_PATH)
        unreal.log_warning("[import_npc_sprite] " + msg)
        return None


def import_npc_sprite(cfg):
    repo_root = unreal.Paths.convert_relative_path_to_full(
        unreal.Paths.project_dir())
    png_abs = os.path.normpath(os.path.join(repo_root, cfg["png"]))
    if not os.path.exists(png_abs):
        unreal.log_error("[import_npc_sprite] missing PNG: %s" % png_abs)
        return

    texture = import_atlas_texture(png_abs, cfg["dest"], cfg["texture_name"])
    if not texture:
        return
    material = get_or_create_sprite_material()

    def_path = "%s/%s" % (cfg["dest"], cfg["def_name"])
    if EAL.does_asset_exist(def_path):
        if not FORCE:
            unreal.log(
                "[import_npc_sprite] skip existing %s (set FORCE=True to rebuild)" % def_path)
            return
        EAL.delete_asset(def_path)
    sprite_def = ASSET_TOOLS.create_asset(
        cfg["def_name"], cfg["dest"], unreal.KBVENpcSpriteDef, unreal.DataAssetFactory())
    if not sprite_def:
        unreal.log_error(
            "[import_npc_sprite] could not create def %s" % def_path)
        return

    sprite_def.set_editor_property("ref", unreal.Name(cfg["ref"]))
    sprite_def.set_editor_property("atlas", texture)
    if material:
        sprite_def.set_editor_property("sprite_material", material)
    sprite_def.set_editor_property("columns", cfg["columns"])
    sprite_def.set_editor_property("rows", cfg["rows"])
    sprite_def.set_editor_property("frames_per_anim", cfg["frames_per_anim"])
    sprite_def.set_editor_property("fps", cfg["fps"])
    sprite_def.set_editor_property("row_front", cfg["row_front"])
    sprite_def.set_editor_property("row_side", cfg["row_side"])
    sprite_def.set_editor_property("row_back", cfg["row_back"])
    sprite_def.set_editor_property("world_size", unreal.Vector2D(
        cfg["world_size"][0], cfg["world_size"][1]))
    sprite_def.set_editor_property("pivot_z", cfg["pivot_z"])
    EAL.save_loaded_asset(sprite_def)
    unreal.log("[import_npc_sprite] wrote %s" % def_path)


def _camel(stem):
    parts = stem.replace("-", "_").replace(" ", "_").split("_")
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def discover_sprites():
    content_dir = unreal.Paths.convert_relative_path_to_full(
        unreal.Paths.project_content_dir())
    scan_dir = os.path.join(content_dir, SCAN_SUBDIR)
    found = []
    if not os.path.isdir(scan_dir):
        unreal.log_warning("[import_npc_sprite] no scan dir: %s" % scan_dir)
        return found

    for root, _dirs, files in os.walk(scan_dir):
        for fname in files:
            if not fname.lower().endswith(".png"):
                continue
            abs_png = os.path.join(root, fname)
            stem = os.path.splitext(fname)[0]
            safe = _camel(stem)
            rel_dir = os.path.relpath(root, content_dir).replace(os.sep, "/")
            dest = "/Game/%s" % rel_dir

            cfg = dict(DEFAULTS)
            cfg.update({
                "png": os.path.relpath(abs_png, unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())),
                "dest": dest,
                "texture_name": "T_%s" % safe,
                "def_name": "DA_%s" % safe,
                "ref": stem.replace("-", "_").lower(),
            })

            sidecar = os.path.join(root, "%s.sprite.json" % stem)
            if os.path.exists(sidecar):
                try:
                    with open(sidecar, "r") as f:
                        cfg.update(json.load(f))
                except Exception as e:
                    unreal.log_warning(
                        "[import_npc_sprite] bad sidecar %s: %s" % (sidecar, e))

            found.append(cfg)
    return found


sprites = discover_sprites()
unreal.log("[import_npc_sprite] found %d atlas(es) under Content/%s" %
           (len(sprites), SCAN_SUBDIR))
for sprite in sprites:
    import_npc_sprite(sprite)
