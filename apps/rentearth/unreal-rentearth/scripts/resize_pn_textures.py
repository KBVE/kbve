import unreal

# One-time, ahead-of-time downscale of oversized PN_GrassLibrary textures.
# Caps build/stream resolution to 2k (Skyrim-style close ground). Source stays
# in the uasset; only the cooked/streamed size drops -> no runtime 8k upload.
# EXCLUDES PivPainterTextures (per-vertex wind pivot data; downscaling corrupts wind).

MAX_SIZE = 2048
TARGET_DIRS = [
    "/Game/PN_GrassLibrary/Textures/LandscapeTextures",
    "/Game/PN_GrassLibrary/Textures/grassTextures/MasterTextures",
]
EXCLUDE = "PivPainter"

EAL = unreal.EditorAssetLibrary
changed = []
skipped = 0

for base in TARGET_DIRS:
    for path in EAL.list_assets(base, recursive=True, include_folder=False):
        if EXCLUDE in path:
            skipped += 1
            continue
        asset = EAL.load_asset(path)
        if not isinstance(asset, unreal.Texture2D):
            continue
        try:
            cur = asset.get_editor_property("max_texture_size")
        except Exception:
            cur = 0
        if cur == MAX_SIZE:
            continue
        asset.set_editor_property("max_texture_size", MAX_SIZE)
        EAL.save_loaded_asset(asset)
        changed.append(path)

unreal.log("[resize_pn_textures] capped %d textures to %d (skipped %d PivPainter)" % (
    len(changed), MAX_SIZE, skipped))
for p in changed:
    unreal.log("  capped: %s" % p)
