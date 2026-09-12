#!/usr/bin/env bash
# Asserts the .gitattributes LFS rules survive a product-directory rename.
#
# The repo moves each product into its own directory named after the product
# -- apps/rareicon/unreal becomes apps/rareicon/unreal-rareicon -- while the
# LFS rules name those directories. A rule pinned to the old name matches
# nothing after the move and the next .umap commits as a plain git blob, so
# the paths below are checked against the names they will have, not the ones
# they have now.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fails=0

expect() {
	local want="$1" path="$2"
	local got
	got=$(git check-attr filter -- "$path" | sed 's/.*: //')
	if [ "$got" != "$want" ]; then
		echo "FAIL  $path: filter=$got, wanted $want"
		fails=$((fails + 1))
	fi
}

expect lfs apps/rareicon/unreal/Content/Levels/L_Main.umap
expect lfs apps/rareicon/unreal-rareicon/Content/Levels/L_Main.umap
expect lfs apps/rareicon/unreal-rareicon/Content/Meshes/SM_Rock.uasset
expect lfs apps/rentearth/unreal-rentearth/Content/Levels/L_Main.umap
expect lfs apps/friendslop/godot-friendslop/assets/props/crate.glb
expect lfs apps/friendslop/godot-rewrite/assets/props/crate.glb
expect lfs apps/herbmail/game/public/models/gem.glb
expect lfs apps/herbmail/game-herbmail/public/models/gem.glb
expect lfs apps/cryptothrone/web-cryptothrone/public/assets/tiles/grass.png
expect lfs apps/agones/arpg/web-arpg/public/assets/arcade/arpg/sprites/hero.png

expect unspecified packages/unreal/KBVEROWS/Source/ThirdParty/lib/libkbve.a
expect unspecified apps/rareicon/unreal-rareicon/Config/DefaultEngine.ini

python3 tools/guards/check-lfs-coverage.py >/dev/null || {
	echo "FAIL  guard is not green on the current tree"
	fails=$((fails + 1))
}

if [ "$fails" -ne 0 ]; then
	echo "$fails assertion(s) failed"
	exit 1
fi
echo "lfs coverage rules OK"
