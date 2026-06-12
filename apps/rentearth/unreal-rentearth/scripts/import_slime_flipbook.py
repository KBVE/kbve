import unreal

DEST = "/Game/NPC/Slime"
PNG = unreal.Paths.project_content_dir() + "NPC/Slime/mm-crawl.png"
COLS, ROWS, CELL = 5, 3, 64

atools = unreal.AssetToolsHelpers.get_asset_tools()
eal = unreal.EditorAssetLibrary


def import_texture():
    task = unreal.AssetImportTask()
    task.filename = PNG
    task.destination_path = DEST
    task.destination_name = "T_SlimeCrawl"
    task.automated = True
    task.save = True
    task.replace_existing = True
    atools.import_asset_tasks([task])
    tex = eal.load_asset(DEST + "/T_SlimeCrawl")
    if tex:
        tex.set_editor_property("filter", unreal.TextureFilter.TF_NEAREST)
        tex.set_editor_property(
            "lod_group", unreal.TextureGroup.TEXTUREGROUP_PIXELS2D)
        tex.set_editor_property("srgb", True)
        eal.save_loaded_asset(tex)
    return tex


def make_sprites(tex):
    count = 0
    factory = unreal.PaperSpriteFactory()
    factory.set_editor_property("initial_texture", tex)
    for r in range(ROWS):
        for c in range(COLS):
            idx = r * COLS + c
            name = "SPR_Slime_%02d" % idx
            path = DEST + "/" + name
            if eal.does_asset_exist(path):
                eal.delete_asset(path)
            spr = atools.create_asset(name, DEST, unreal.PaperSprite, factory)
            spr.set_editor_property("source_texture", tex)
            spr.set_editor_property(
                "source_uv", unreal.Vector2D(c * CELL, r * CELL))
            spr.set_editor_property(
                "source_dimension", unreal.Vector2D(CELL, CELL))
            eal.save_loaded_asset(spr)
            count += 1
    return count


tex = import_texture()
if not tex:
    unreal.log_error("[slime] texture import failed")
else:
    n = make_sprites(tex)
    unreal.log("[slime] done: %d sprites created at %s" % (n, DEST))
