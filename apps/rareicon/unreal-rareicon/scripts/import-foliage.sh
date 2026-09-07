#!/usr/bin/env bash
#
# Export a foliage pack's clump models out of its .blend and import them.
#
# Two stages for the same reason the weapons and terrain ingests have them:
# Blender is the only thing that can read a .blend, and the editor is the only
# thing that can write a uasset. The export is skipped when the FBX is already
# there, so the usual case -- a fresh clone with Art/ pulled from LFS -- needs
# neither Blender nor the source packs.
#
# Point FOLIAGE_SRC at the unpacked downloads to force a re-export.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR_CMD="$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd"
FOLIAGE_SRC="${FOLIAGE_SRC:-$HOME/Downloads}"
BLENDER="${BLENDER:-blender}"
ART="$PROJ_DIR/Art/Foliage/Models"
CONFIG="$PROJ_DIR/scripts/config/foliage.json"

PACKS=$(python3 -c "import json,sys; print(' '.join(p['pack'] for p in json.load(open('$CONFIG'))['packs']))")

for PACK in $PACKS; do
	OUT="$ART/$PACK"
	if [ -d "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then
		echo "== $PACK already exported"
		continue
	fi
	BLEND="$FOLIAGE_SRC/$PACK/$PACK.blend"
	if [ ! -f "$BLEND" ]; then
		echo "== $PACK: no blend at $BLEND, skipping export" >&2
		continue
	fi
	if ! command -v "$BLENDER" >/dev/null 2>&1; then
		echo "error: $PACK needs exporting and Blender is not installed" >&2
		exit 127
	fi
	echo "== exporting $PACK"
	"$BLENDER" --background "$BLEND" --python "$PROJ_DIR/scripts/export_foliage.py" -- "$OUT" \
		2>&1 | grep -E "FOLIAGE_EXPORTED|Error" || true
done

echo "== importing"
KBVE_FOLIAGE_CONFIG="$PWD/$CONFIG" \
KBVE_FOLIAGE_ART="$PWD/$PROJ_DIR/Art" \
"$EDITOR_CMD" "$PWD/$PROJ_DIR/RareIcon.uproject" \
	-run=pythonscript -script="$PWD/packages/python/kbve/kbve/unreal/editor/foliage_models.py" \
	-unattended -nosound -nosplash 2>&1 | grep -E "imported |carries |Error:|error:" || true
