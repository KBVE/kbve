#!/usr/bin/env bash
set -euo pipefail

# Build monorepo knowledge graph using Graphify
# Usage: ./build-monorepo-graph.sh [--semantic]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Three up from the project (packages/python/graphify-wrapper), not from
# scripts/ — that resolved to `packages/` and every path built on it was wrong.
WORKSPACE_ROOT="$(cd "$PROJECT_DIR/../../.." && pwd)"
OUTPUT_DIR="$WORKSPACE_ROOT/packages/data/graph/output/monorepo"
CONFIG_FILE="$PROJECT_DIR/configs/.graphify.yml"

echo "🔍 Building monorepo knowledge graph..."
echo "📁 Workspace: $WORKSPACE_ROOT"
echo "📊 Output: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if graphify is installed
if ! command -v graphify &> /dev/null; then
    echo "❌ Error: 'graphify' command not found"
    echo "Install with: uv tool install graphifyy"
    exit 1
fi

# Build graph
GRAPHIFY_CMD="graphify \"$WORKSPACE_ROOT\" --output \"$OUTPUT_DIR\" --config \"$CONFIG_FILE\""

# Add --no-semantic flag unless --semantic is passed
if [[ "${1:-}" != "--semantic" ]]; then
    GRAPHIFY_CMD="$GRAPHIFY_CMD --no-semantic"
    echo "🚀 Mode: AST-only (fast, no LLM)"
else
    echo "🧠 Mode: Semantic analysis (uses LLM)"
fi

echo "Running: $GRAPHIFY_CMD"
eval "$GRAPHIFY_CMD"

# Check output
if [[ -f "$OUTPUT_DIR/graph.json" ]]; then
    SIZE=$(du -h "$OUTPUT_DIR/graph.json" | cut -f1)
    echo "✅ Graph built successfully: $OUTPUT_DIR/graph.json ($SIZE)"

    # Count nodes and edges
    if command -v jq &> /dev/null; then
        NODES=$(jq '.nodes | length' "$OUTPUT_DIR/graph.json")
        EDGES=$(jq '.edges | length' "$OUTPUT_DIR/graph.json")
        echo "📊 Stats: $NODES nodes, $EDGES edges"
    fi
else
    echo "❌ Error: graph.json not created"
    exit 1
fi
