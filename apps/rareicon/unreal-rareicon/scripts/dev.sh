#!/usr/bin/env bash
#
# Quit, build, launch -- in that order.
#
# Not a moon task with a build dependency, because moon runs the dependency
# first and the editor would still be up while UBT tried to replace the module
# it has open. See scripts/quit-editor.sh for what that silently does.

set -uo pipefail

PROJ_DIR="apps/rareicon/unreal-rareicon"
UE_ROOT="${UE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"

if [ ! -f "$PROJ_DIR/RareIcon.uproject" ]; then
	echo "error: run this from the monorepo root" >&2
	exit 1
fi

"$PROJ_DIR/scripts/quit-editor.sh" "$PROJ_DIR" || exit 1

echo "==> building RareIconEditor"
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RareIconEditor Mac Development \
	"$(cd "$PROJ_DIR" && pwd)/RareIcon.uproject" || exit 1

exec "$PROJ_DIR/scripts/launch-editor.sh"
