#!/usr/bin/env bash
#
# Ingest the terrain source textures and import them into the project.
#
# Two stages, because the second cannot do the first: ImageMagick flattens the
# 4k EXR/PNG PolyHaven set to 2k 8-bit PNG, flips the normal map's green channel
# from the OpenGL convention the source ships to the DirectX convention Unreal
# samples, and packs roughness + height into one texture. Then the editor runs
# headless to import the result and rebuild the ground material.
#
# Stage one is skipped when the converted PNGs already exist, so the usual case
# -- a fresh clone with the PNGs pulled from LFS -- needs no source set and no
# ImageMagick. Point TERRAIN_SRC at the unpacked source to force a reconvert.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd"
TERRAIN_SRC="${TERRAIN_SRC:-$HOME/Downloads/rocky_terrain_02_4k/textures}"
OUT="$PROJ_DIR/Art/Terrain"
SCRIPT="$PROJ_DIR/scripts/import_terrain_textures.py"

if [ ! -f "$PROJ_DIR/RareIcon.uproject" ]; then
	echo "error: run this from the monorepo root" >&2
	exit 1
fi

mkdir -p "$OUT"

needs_convert=0
for f in T_RockyTerrain02_D T_RockyTerrain02_N T_RockyTerrain02_RH; do
	[ -f "$OUT/$f.png" ] || needs_convert=1
done

if [ "$needs_convert" = "1" ]; then
	if ! command -v magick >/dev/null 2>&1; then
		echo "error: converted textures are missing and ImageMagick is not installed" >&2
		echo "       either 'git lfs pull' the PNGs or 'brew install imagemagick'" >&2
		exit 127
	fi
	if [ ! -d "$TERRAIN_SRC" ]; then
		echo "error: source textures not found at: $TERRAIN_SRC" >&2
		echo "       set TERRAIN_SRC to the unpacked rocky_terrain_02_4k/textures directory" >&2
		exit 1
	fi

	echo "converting source textures from $TERRAIN_SRC"
	magick "$TERRAIN_SRC/rocky_terrain_02_diff_4k.jpg" \
		-resize 2048x2048 -depth 8 "$OUT/T_RockyTerrain02_D.png" || exit 1

	# -set (not -colorspace): the EXR values are already the encoding we want,
	# and converting would gamma-shift a normal map into nonsense.
	magick "$TERRAIN_SRC/rocky_terrain_02_nor_gl_4k.exr" \
		-set colorspace sRGB -resize 2048x2048 \
		-channel G -negate +channel \
		-depth 8 PNG24:"$OUT/T_RockyTerrain02_N.png" || exit 1

	# R = roughness, G = height, B unused. One sample instead of two.
	magick \
		\( "$TERRAIN_SRC/rocky_terrain_02_rough_4k.exr" -set colorspace sRGB -resize 2048x2048 -channel R -separate +channel \) \
		\( "$TERRAIN_SRC/rocky_terrain_02_disp_4k.png"  -set colorspace sRGB -resize 2048x2048 -channel R -separate +channel \) \
		\( -clone 0 -fill black -colorize 100 \) \
		-channel RGB -combine -colorspace sRGB -depth 8 PNG24:"$OUT/T_RockyTerrain02_RH.png" || exit 1
else
	echo "converted textures already present, skipping ingest"
fi

if [ ! -x "$EDITOR_CMD" ]; then
	echo "error: UnrealEditor-Cmd not found at: $EDITOR_CMD" >&2
	exit 127
fi

ABS_UPROJECT="$(cd "$PROJ_DIR" && pwd)/RareIcon.uproject"
ABS_SCRIPT="$(cd "$PROJ_DIR/scripts" && pwd)/import_terrain_textures.py"

echo "importing into the project"
"$EDITOR_CMD" "$ABS_UPROJECT" -run=pythonscript -script="$ABS_SCRIPT" \
	-unattended -nosplash -nosound 2>&1 \
	| grep -E "LogPython|LogAssetTools|: (Error|Warning): |Assertion failed" \
	| grep -v "LogPython: Warning: .*deprecated"
STATUS=${PIPESTATUS[0]}

if [ "$STATUS" != "0" ]; then
	echo "error: import failed (exit $STATUS)" >&2
	exit "$STATUS"
fi
echo "terrain import complete"
