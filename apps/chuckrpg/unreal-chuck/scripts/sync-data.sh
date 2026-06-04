#!/usr/bin/env bash
#
# Copy canonical generated data artifacts (itemdb / npcdb / mapdb / questdb)
# from packages/data/codegen/generated/ into Content/Data/ so chuck's runtime
# subsystems load the fresh JSON every time.
#
# Run from monorepo root via:
#   ./kbve.sh -nx unreal-chuck:sync-data
#   ./kbve.sh -nx unreal-chuck:sync           # composite (LFS + data)
#
# MDX -> JSON regeneration is upstream of this script. Edit the MDX, run
# the astro-kbve codegen, then this script picks up the fresh JSON.

set -uo pipefail

SRC_DIR="packages/data/codegen/generated"
DST_DIR="apps/chuckrpg/unreal-chuck/Content/Data"

FILES=(
	"itemdb-data.json"
	"npcdb-data.json"
	"mapdb-data.json"
	"questdb-data.json"
)

# Atlas PNG lives next to the unity output (same codegen, different consumer).
ATLAS_SRC="apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb-atlas.png"
ATLAS_DST="$DST_DIR/itemdb-atlas.png"

if [ ! -d "$SRC_DIR" ]; then
	echo "error: $SRC_DIR not found. run from monorepo root." >&2
	exit 1
fi

mkdir -p "$DST_DIR"

MISSING=0
COPIED=0
for FILE in "${FILES[@]}"; do
	SRC="$SRC_DIR/$FILE"
	DST="$DST_DIR/$FILE"
	if [ ! -f "$SRC" ]; then
		echo "skip:    $FILE (not present in $SRC_DIR)"
		MISSING=$((MISSING + 1))
		continue
	fi
	if [ -f "$DST" ] && cmp -s "$SRC" "$DST"; then
		echo "unchanged: $FILE"
		continue
	fi
	cp "$SRC" "$DST"
	SIZE=$(wc -c <"$DST" | tr -d ' ')
	echo "synced:  $FILE ($SIZE bytes)"
	COPIED=$((COPIED + 1))
done

if [ -f "$ATLAS_SRC" ]; then
	if [ -f "$ATLAS_DST" ] && cmp -s "$ATLAS_SRC" "$ATLAS_DST"; then
		echo "unchanged: itemdb-atlas.png"
	else
		cp "$ATLAS_SRC" "$ATLAS_DST"
		SIZE=$(wc -c <"$ATLAS_DST" | tr -d ' ')
		echo "synced:  itemdb-atlas.png ($SIZE bytes)"
		COPIED=$((COPIED + 1))
	fi
else
	echo "skip:    itemdb-atlas.png (not present at $ATLAS_SRC)"
	MISSING=$((MISSING + 1))
fi

echo ""
echo "$COPIED file(s) updated, $MISSING missing in source"
