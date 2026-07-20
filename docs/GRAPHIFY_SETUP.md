# Graphify Integration Setup Guide

Complete setup guide for the Graphify semantic knowledge graph integration in the KBVE monorepo.

## Overview

Graphify analyzes the codebase to create a queryable knowledge graph showing:

- File-level relationships (calls, imports, inherits)
- Semantic connections between concepts
- Community detection (subsystems)
- God nodes (most-connected files)

## Architecture

```
packages/python/graphify-wrapper/   # Python wrapper package
packages/data/graphify/              # Graph data storage
apps/kbve/astro-kbve/src/pages/api/graphify/  # API endpoints
```

## Installation

### Prerequisites

- Python 3.12+ (Graphify requires <3.13 due to Leiden algorithm)
- `uv` package manager (already installed in monorepo)
- Node.js 18+ (for Nx commands)

### Step 1: Install Graphify CLI

```bash
# Global installation (recommended)
uv tool install graphifyy

# Verify installation
graphify --version
```

### Step 2: Install Python Package Dependencies

```bash
# Install the wrapper package
pnpm nx run graphify-wrapper:install

# Lock dependencies
pnpm nx run graphify-wrapper:lock
```

### Step 3: Verify Setup

```bash
# Test with a small app (fast)
pnpm nx run graphify-wrapper:build-app --app=herbmail

# Check output
ls packages/data/graphify/output/apps/herbmail/
# Should see: graph.json, graph.html, GRAPH_REPORT.md
```

## Usage

### Building Graphs

#### Full Monorepo

```bash
# AST-only mode (fast, ~5-10 min, no LLM)
pnpm nx run graphify-wrapper:build-monorepo

# With semantic analysis (thorough, ~20-30 min, uses LLM)
./packages/data/graphify/scripts/build-monorepo-graph.sh --semantic
```

#### Specific App

```bash
pnpm nx run graphify-wrapper:build-app --app=laser
pnpm nx run graphify-wrapper:build-app --app=discordsh
```

#### Specific Package

```bash
# Modify project.json target or use CLI directly
cd packages/python/graphify-wrapper
uv run kbve-graph-build --scope package --name rust/jedi --output ../../../packages/data/graphify/output/packages/jedi
```

### Querying Graphs

```bash
# Semantic search
pnpm nx run graphify-wrapper:query --q="Where is user authentication handled?"

# Path tracing
graphify path packages/data/graphify/output/monorepo/graph.json "astro-kbve" "bevy_inventory"

# Explain a node
graphify explain packages/data/graphify/output/monorepo/graph.json "packages/rust/jedi/src/auth.rs"
```

### Exporting for Web

```bash
# Export to public web directory
pnpm nx run graphify-wrapper:export-web

# Output: apps/kbve/astro-kbve/public/graphify/monorepo.json
```

### Accessing via API

Start the dev server and access:

```bash
pnpm nx run astro-kbve:serve

# Then visit:
# http://localhost:4321/api/graphify/monorepo.json
# http://localhost:4321/api/graphify/apps/herbmail.json
```

## Configuration

### LLM Backend

Edit `packages/data/graphify/configs/.graphify.yml`:

**Option 1: Ollama (Local, Free)**

```yaml
llm:
    provider: ollama
    model: llama3
```

**Option 2: Anthropic Claude (API, Paid)**

```yaml
llm:
    provider: anthropic
    model: claude-3-5-sonnet-20241022
    api_key: ${ANTHROPIC_API_KEY}
```

Set environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Option 3: AST-Only (No LLM)**

```bash
# Pass --no-semantic flag (default in wrapper)
pnpm nx run graphify-wrapper:build-monorepo
```

### Ignore Patterns

Add to `.graphify.yml`:

```yaml
ignore:
    - custom/path/**
    - '*.generated.ts'
```

## CI/CD Setup (Future)

Create `.github/workflows/ci-daily-graph.yml`:

```yaml
name: Daily Knowledge Graph Build

on:
    schedule:
        - cron: '0 6 * * *' # 6am UTC daily
    workflow_dispatch:

jobs:
    build-graph:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4

            - name: Setup Python
              uses: actions/setup-python@v5
              with:
                  python-version: '3.12'

            - name: Install uv
              run: pip install uv

            - name: Install Graphify
              run: uv tool install graphifyy

            - name: Build Monorepo Graph
              run: pnpm nx run graphify-wrapper:build-monorepo

            - name: Export for Web
              run: pnpm nx run graphify-wrapper:export-web

            - name: Commit Graph Data
              run: |
                  git config user.name "github-actions[bot]"
                  git config user.email "github-actions[bot]@users.noreply.github.com"
                  git add apps/kbve/astro-kbve/public/graphify/
                  git diff --staged --quiet || git commit -m "chore(graph): daily knowledge graph update"
                  git push
```

## Web Visualization (Future Enhancement)

The graph can be visualized using your existing `@xyflow/react` + `d3-force` infrastructure.

See `/dashboard/graph/` for current Nx dependency graph implementation.

## Troubleshooting

### Graph Build Fails

**Error**: `graphify: command not found`

```bash
uv tool install graphifyy
which graphify  # Should show path
```

**Error**: `Python 3.13 not supported`

```bash
# Check Python version
python3 --version

# Install Python 3.12 if needed (macOS)
brew install python@3.12

# Verify wrapper uses correct version
cat packages/python/graphify-wrapper/.python-version  # Should be 3.12
```

**Error**: `No module named 'graphifyy'`

```bash
cd packages/python/graphify-wrapper
uv sync
```

### Graph Too Large

If `graph.json` exceeds 10MB:

```bash
# Use Git LFS
git lfs track "packages/data/graphify/output/**/*.json"
git add .gitattributes
git commit -m "chore: track graph files with LFS"
```

Or keep in `.gitignore` and rebuild via CI.

### Slow Build Times

**Full monorepo with semantic analysis** takes 20-30 minutes.

**Solutions**:

1. Use AST-only mode (default): ~5-10 min
2. Build per-app instead of full monorepo
3. Use Anthropic Claude API (faster than Ollama)

### Memory Issues

For very large graphs:

```bash
# Increase Node.js heap size
NODE_OPTIONS=--max-old-space-size=8192 pnpm nx run graphify-wrapper:build-monorepo
```

## Development Workflow

### Local Development

```bash
# 1. Install dependencies
pnpm nx run graphify-wrapper:install

# 2. Build a small graph for testing
pnpm nx run graphify-wrapper:build-app --app=herbmail

# 3. View the HTML visualization
open packages/data/graphify/output/apps/herbmail/graph.html

# 4. Query the graph
pnpm nx run graphify-wrapper:query --q="test query"
```

### Testing CLI Tools

```bash
cd packages/python/graphify-wrapper
uv run pytest
```

### Linting

```bash
pnpm nx run graphify-wrapper:lint
```

## Next Steps

1. **Build Initial Graph**: Run `pnpm nx run graphify-wrapper:build-monorepo`
2. **Explore Data**: Open `packages/data/graphify/output/monorepo/graph.html`
3. **Test API**: Access `/api/graphify/monorepo.json` via dev server
4. **Set up CI**: Create GitHub Action for daily rebuilds (optional)
5. **Add UI**: Extend `/dashboard/graph/` with Graphify viewer (future)

## Resources

- [Graphify Documentation](https://github.com/Graphify-Labs/graphify)
- [KBVE Monorepo Docs](https://kbve.com)
- [Nx Plugin Documentation](https://nx.dev)
