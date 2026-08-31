#!/usr/bin/env bash
# Runs a kbve.blender tool from CI.
#
# The implementation lives in the kbve pip package (packages/python/kbve),
# where the bpy scripts sit beside the launcher that finds Blender and runs
# them -- see kbve/blender/cli.py. This is the thin CI face of it, so a
# workflow step names an operation and nothing else:
#
#   bash tools/blender/blender.sh render --blend x.blend --out dist
#
# It exists rather than the workflow calling `uv run` directly because the
# --project path and the console-script naming are details CI should not have
# to restate at every call site, and because a locally-installed kbve on PATH
# should be used as-is instead of forcing a sync.
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }

cmd="${1:?usage: blender.sh <which|render|export|batch-export|retarget|vat> [args...]}"
shift

case "$cmd" in
which | render | export | batch-export | retarget | vat) ;;
*) die "Unknown blender tool '$cmd'. Known: which, render, export, batch-export, retarget, vat." ;;
esac

script="kbve-blender-$cmd"

# A console script already on PATH means the package is installed -- the local
# case, and the runner case once it has been provisioned. Only fall back to uv
# when it is not, so CI does not pay for a sync it does not need.
if command -v "$script" > /dev/null 2>&1; then
	exec "$script" "$@"
fi

command -v uv > /dev/null 2>&1 ||
	die "$script is not on PATH and uv is not available to run it. Install the kbve package on the runner."

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec uv run --quiet --project "$root/packages/python/kbve" "$script" "$@"
