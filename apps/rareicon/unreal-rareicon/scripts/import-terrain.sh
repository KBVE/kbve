#!/usr/bin/env bash
#
# Ingest the terrain source textures and import them into the project.
#
# Two stages, because the second cannot do the first. ImageMagick flattens the
# PolyHaven EXR maps to 8-bit PNG, flips each normal map's green channel from
# the OpenGL convention the source ships to the DirectX convention Unreal
# samples, and packs roughness + height into one texture. Then the editor runs
# headless to import the result and rebuild the ground material.
#
# Sources are the 2k PolyHaven downloads: their downsample, not ours, and no 4k
# decode in the middle of it.
#
# Stage one is skipped when the converted PNGs already exist, so the usual case
# -- a fresh clone with the PNGs pulled from LFS -- needs no source set and no
# ImageMagick. Point TERRAIN_SRC at the directory holding the unpacked sets to
# force a reconvert.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd"
TERRAIN_SRC="${TERRAIN_SRC:-$HOME/Downloads}"
OUT="$PROJ_DIR/Art/Terrain"
RES="${TERRAIN_RES:-2048}"

# <asset stem>:<polyhaven set>:<has displacement>
SETS=(
	"T_RockyTerrain02:rocky_terrain_02_2k:1"
	"T_GrassMedium02:grass_medium_02_2k:0"
)

if [ ! -f "$PROJ_DIR/RareIcon.uproject" ]; then
	echo "error: run this from the monorepo root" >&2
	exit 1
fi

mkdir -p "$OUT"

needs_convert=0
for entry in "${SETS[@]}"; do
	stem="${entry%%:*}"
	for suffix in D N RH; do
		[ -f "$OUT/${stem}_${suffix}.png" ] || needs_convert=1
	done
done

convert_set() {
	local stem="$1" pack="$2" has_disp="$3"
	local dir="$TERRAIN_SRC/$pack/textures"
	local base="${pack%_2k}"

	if [ ! -d "$dir" ]; then
		echo "error: source set not found at: $dir" >&2
		return 1
	fi
	echo "  $stem <- $pack"

	magick "$dir/${base}_diff_2k.jpg" -resize "${RES}x${RES}" -depth 8 \
		"$OUT/${stem}_D.png" || return 1

	# -set, not -colorspace: the EXR values are already the encoding we want,
	# and converting would gamma-shift a normal map into nonsense.
	magick "$dir/${base}_nor_gl_2k.exr" -set colorspace sRGB -resize "${RES}x${RES}" \
		-channel G -negate +channel -depth 8 PNG24:"$OUT/${stem}_N.png" || return 1

	# R = roughness, G = height, B unused. One sample instead of two. Sets with
	# no displacement map get a flat mid-grey height so the channel stays
	# meaningful rather than black.
	local height_src
	if [ "$has_disp" = "1" ]; then
		height_src="( $dir/${base}_disp_2k.png -set colorspace sRGB -resize ${RES}x${RES} -channel R -separate +channel )"
	else
		height_src="( -clone 0 -fill gray50 -colorize 100 )"
	fi
	# shellcheck disable=SC2086
	magick \
		\( "$dir/${base}_rough_2k.exr" -set colorspace sRGB -resize "${RES}x${RES}" -channel R -separate +channel \) \
		$height_src \
		\( -clone 0 -fill black -colorize 100 \) \
		-channel RGB -combine -colorspace sRGB -depth 8 PNG24:"$OUT/${stem}_RH.png" || return 1
}

if [ "$needs_convert" = "1" ]; then
	if ! command -v magick >/dev/null 2>&1; then
		echo "error: converted textures are missing and ImageMagick is not installed" >&2
		echo "       either 'git lfs pull' the PNGs or 'brew install imagemagick'" >&2
		exit 127
	fi

	echo "converting source textures from $TERRAIN_SRC"
	for entry in "${SETS[@]}"; do
		IFS=: read -r stem pack has_disp <<<"$entry"
		convert_set "$stem" "$pack" "$has_disp" || exit 1
	done
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
	| grep -E "LogPython: (Display|Warning|Error)|LogPythonScriptCommandlet|: (Error|Fatal): " \
	| grep -v "LogInit: Display:"
STATUS=${PIPESTATUS[0]}

if [ "$STATUS" != "0" ]; then
	echo "error: import failed (exit $STATUS)" >&2
	exit "$STATUS"
fi
echo "terrain import complete"
