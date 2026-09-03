#!/usr/bin/env bash
set -euo pipefail

# Rebuild the tiered monorepo graph consumed by the dashboard Graph Explorer.
#
#   1. graphify update    — re-extract code symbols (tree-sitter AST, no LLM)
#   2. graphify cluster    — Leiden communities (deterministic, no LLM, no viz)
#   3. graphify_tiered.py  — precompute the dir -> file -> symbol LOD chunks
#   4. enrich_unified.py   — fuse NX project deps + doc references into one graph
#
# Output lands in apps/kbve/astro-kbve/public/graphify/ so the static Astro
# build serves it. Requires the graphify CLI: `uv tool install graphifyy`.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
GRAPH="$ROOT/graphify-out/graph.json"
OUT="$ROOT/apps/kbve/astro-kbve/public/graphify"
# Staged beside the real output and swapped in only once every step has passed.
# This used to `rm -rf "$OUT"` and write in place, so a failure in step 3 or 4
# left nothing behind -- and the daily workflow committed that emptiness, which
# is how 91 files and 929k lines of graph data left the repository in one
# commit and took the site build with them.
TMP="$OUT.tmp"

if ! command -v graphify &>/dev/null; then
	echo "❌ graphify not found — install: uv tool install graphifyy" >&2
	exit 1
fi

echo "🔍 [1/3] extracting code symbols…"
graphify update "$ROOT" --no-cluster

echo "🧩 [2/3] clustering (Leiden, no LLM)…"
graphify cluster-only "$ROOT" --no-viz --no-label

echo "📐 [3/4] precomputing tiered LOD layout…"
rm -rf "$TMP"
trap 'rm -rf "$TMP"' EXIT
# Pin the scientific stack: the force layout (spring/forceatlas2, seed 1337) is
# only reproducible for a fixed networkx/numpy/scipy — floating them churns node
# coordinates on every rebuild and buries real code changes in layout noise.
#
# The interpreter is pinned with them. Neither numpy 2.2.6 nor scipy 1.15.3
# publishes a cp314 wheel, and uv otherwise takes the 3.14 this repository pins
# everywhere else, falls back to building scipy from source, and dies for want
# of a Fortran compiler. That is what emptied public/graphify: the failure
# landed after the output directory had already been removed.
#
# --no-project because moon runs this from the graphify-wrapper project, whose
# requires-python is >=3.14,<3.15 and would reject the pin. Neither script here
# imports the wrapper; both are stdlib plus the stack named on this line.
uv run --no-project --python 3.13 --with 'networkx==3.4.2' --with 'numpy==2.2.6' --with 'scipy==1.15.3' python \
	"$SCRIPT_DIR/graphify_tiered.py" "$GRAPH" "$TMP"

echo "🔗 [4/4] fusing NX project deps + doc references (unified graph)…"
uv run --no-project python "$SCRIPT_DIR/enrich_unified.py" "$TMP/overview.json" \
	--nx-graph "$ROOT/apps/kbve/astro-kbve/public/data/nx/nx-graph.json" \
	--docs-root "$ROOT/apps/kbve/astro-kbve/src/content/docs"

rm -rf "$OUT"
mv "$TMP" "$OUT"
trap - EXIT

echo "✅ wrote $OUT"
du -sh "$OUT"
