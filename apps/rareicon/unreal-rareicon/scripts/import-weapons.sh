#!/usr/bin/env bash
#
# Rig the weapon sources, convert their textures, and import both.
#
# Three stages, for the same reason the terrain ingest has two: none of them can
# do the others' work. Blender builds the armature and writes an FBX, ImageMagick
# flattens the PolyHaven maps and packs them, and the editor runs headless to
# import the result and build the materials.
#
# PolyHaven ships weapons as loose rigid parts with no armature, so the rig is
# generated rather than authored -- see rig_weapon.py, which takes the bolt axis
# and its throw off the geometry instead of nominating them by eye.
#
# Stage one and two are skipped when their outputs already exist, so the usual
# case -- a fresh clone with Art/ pulled from LFS -- needs neither Blender nor
# ImageMagick nor the sources. Point WEAPON_SRC at the unpacked downloads to
# force a regenerate.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd"
WEAPON_SRC="${WEAPON_SRC:-$HOME/Downloads}"
ART="$PROJ_DIR/Art/Weapons"
BLENDER="${BLENDER:-blender}"

# The body carries the detail an aiming player looks straight down, so it gets
# the full sheet. The sling and scope housing are never that close to camera.
BODY_RES="${WEAPON_BODY_RES:-2048}"
ACC_RES="${WEAPON_ACC_RES:-1024}"

# <asset stem>:<polyhaven pack>
#
# Sourced from the 2k download whatever the output resolution: downsampling once
# here beats shipping a second copy of the set for the accessory maps.
SETS=(
	"SK_Rifle_BoltAction762:bolt_action_rifle_7_62_2k"
)

if [ ! -f "$PROJ_DIR/RareIcon.uproject" ]; then
	echo "error: run this from the monorepo root" >&2
	exit 1
fi

mkdir -p "$ART"

needs_rig=0
needs_convert=0
for entry in "${SETS[@]}"; do
	IFS=: read -r stem _pack <<<"$entry"
	[ -f "$ART/${stem}.fbx" ] || needs_rig=1
	for suffix in D N ORM Acc_D Acc_N Acc_ORM Acc_A; do
		[ -f "$ART/${stem}_${suffix}.png" ] || needs_convert=1
	done
done

rig_set() {
	local stem="$1" pack="$2"
	local blend="$WEAPON_SRC/$pack/$pack.blend"

	if [ ! -f "$blend" ]; then
		echo "error: source blend not found at: $blend" >&2
		return 1
	fi
	echo "  rigging $stem <- $pack"

	local abs_script
	abs_script="$(cd "$PROJ_DIR/scripts" && pwd)/rig_weapon.py"
	"$BLENDER" -b "$blend" --python "$abs_script" -- \
		--out "$(cd "$ART" && pwd)/${stem}.fbx" 2>&1 \
		| grep -E "^rig:|Error: |error: " || return 1
}

convert_set() {
	local stem="$1" pack="$2"
	local dir="$WEAPON_SRC/$pack/textures"
	local base="${pack%_2k}"

	if [ ! -d "$dir" ]; then
		echo "error: source textures not found at: $dir" >&2
		return 1
	fi
	echo "  converting $stem <- $pack"

	magick "$dir/${base}_diff_2k.jpg" -resize "${BODY_RES}x${BODY_RES}" -depth 8 \
		"$ART/${stem}_D.png" || return 1

	# -set, not -colorspace: the EXR values are already the encoding we want,
	# and converting would gamma-shift a normal map into nonsense. Green is
	# negated to move from the OpenGL convention PolyHaven ships to the DirectX
	# convention Unreal samples.
	magick "$dir/${base}_nor_gl_2k.exr" -set colorspace sRGB -resize "${BODY_RES}x${BODY_RES}" \
		-channel G -negate +channel -depth 8 PNG24:"$ART/${stem}_N.png" || return 1

	# R = ambient occlusion, G = roughness, B = metallic: the order Unreal's own
	# material templates assume. There is no AO map in the source, so R is white
	# rather than black -- an unlit-by-default channel would darken the whole
	# weapon.
	magick \
		\( "$dir/${base}_rough_2k.exr" -set colorspace sRGB -resize "${BODY_RES}x${BODY_RES}" -channel R -separate +channel -fill white -colorize 100 \) \
		\( "$dir/${base}_rough_2k.exr" -set colorspace sRGB -resize "${BODY_RES}x${BODY_RES}" -channel R -separate +channel \) \
		\( "$dir/${base}_metal_2k.exr" -set colorspace sRGB -resize "${BODY_RES}x${BODY_RES}" -channel R -separate +channel \) \
		-channel RGB -combine -colorspace sRGB -depth 8 PNG24:"$ART/${stem}_ORM.png" || return 1

	# The accessory set is the scope housing and the sling, and it is the one
	# with a cutout: its alpha drives a masked material rather than an opaque one.
	magick "$dir/${base}_accesories_diff_2k.png" -resize "${ACC_RES}x${ACC_RES}" -depth 8 \
		PNG24:"$ART/${stem}_Acc_D.png" || return 1

	magick "$dir/${base}_accesories_nor_gl_2k.png" -resize "${ACC_RES}x${ACC_RES}" \
		-channel G -negate +channel -depth 8 PNG24:"$ART/${stem}_Acc_N.png" || return 1

	magick \
		\( "$dir/${base}_accesories_rough_2k.png" -resize "${ACC_RES}x${ACC_RES}" -channel R -separate +channel -fill white -colorize 100 \) \
		\( "$dir/${base}_accesories_rough_2k.png" -resize "${ACC_RES}x${ACC_RES}" -channel R -separate +channel \) \
		\( "$dir/${base}_accesories_metal_2k.png" -resize "${ACC_RES}x${ACC_RES}" -channel R -separate +channel \) \
		-channel RGB -combine -colorspace sRGB -depth 8 PNG24:"$ART/${stem}_Acc_ORM.png" || return 1

	magick "$dir/${base}_accesories_alpha_2k.png" -resize "${ACC_RES}x${ACC_RES}" \
		-colorspace Gray -depth 8 PNG24:"$ART/${stem}_Acc_A.png" || return 1
}

if [ "$needs_rig" = "1" ]; then
	if ! command -v "$BLENDER" >/dev/null 2>&1; then
		echo "error: the rigged FBX is missing and Blender is not installed" >&2
		echo "       either 'git lfs pull' Art/Weapons or 'brew install --cask blender'" >&2
		exit 127
	fi
	echo "rigging weapon sources from $WEAPON_SRC"
	for entry in "${SETS[@]}"; do
		IFS=: read -r stem pack <<<"$entry"
		rig_set "$stem" "$pack" || exit 1
	done
else
	echo "rigged FBX already present, skipping rig"
fi

if [ "$needs_convert" = "1" ]; then
	if ! command -v magick >/dev/null 2>&1; then
		echo "error: converted textures are missing and ImageMagick is not installed" >&2
		echo "       either 'git lfs pull' Art/Weapons or 'brew install imagemagick'" >&2
		exit 127
	fi
	echo "converting weapon textures from $WEAPON_SRC"
	for entry in "${SETS[@]}"; do
		IFS=: read -r stem pack <<<"$entry"
		convert_set "$stem" "$pack" || exit 1
	done
else
	echo "converted textures already present, skipping ingest"
fi

if [ ! -x "$EDITOR_CMD" ]; then
	echo "error: UnrealEditor-Cmd not found at: $EDITOR_CMD" >&2
	exit 127
fi

ABS_UPROJECT="$(cd "$PROJ_DIR" && pwd)/RareIcon.uproject"
ABS_SCRIPT="$(cd "$PROJ_DIR/scripts" && pwd)/import_weapons.py"

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
echo "weapon import complete"
