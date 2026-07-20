#!/usr/bin/env bash
set -euo pipefail

# Rebuild the tiered monorepo graph consumed by the dashboard Graph Explorer.
#
#   1. graphify update    — re-extract code symbols (tree-sitter AST, no LLM)
#   2. graphify cluster    — Leiden communities (deterministic, no LLM, no viz)
#   3. graphify_tiered.py  — precompute the dir -> file -> symbol LOD chunks
#
# Output lands in apps/kbve/astro-kbve/public/graphify/ so the static Astro
# build serves it. Requires the graphify CLI: `uv tool install graphifyy`.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
GRAPH="$ROOT/graphify-out/graph.json"
OUT="$ROOT/apps/kbve/astro-kbve/public/graphify"

if ! command -v graphify &>/dev/null; then
	echo "❌ graphify not found — install: uv tool install graphifyy" >&2
	exit 1
fi

echo "🔍 [1/3] extracting code symbols…"
graphify update "$ROOT" --no-cluster

echo "🧩 [2/3] clustering (Leiden, no LLM)…"
graphify cluster-only "$ROOT" --no-viz --no-label

echo "📐 [3/3] precomputing tiered LOD layout…"
rm -rf "$OUT"
uv run --with networkx --with numpy --with scipy python \
	"$SCRIPT_DIR/graphify_tiered.py" "$GRAPH" "$OUT"

echo "✅ wrote $OUT"
du -sh "$OUT"
