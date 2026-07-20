# Graphify Wrapper - Quick Start

## Installation

There's currently a uv version mismatch in the workspace. To fix:

```bash
# Option 1: Downgrade uv to workspace version
brew uninstall uv
brew install uv@0.11.28  # If available

# Option 2: Update all Python packages to use uv 0.11.29
# Then from the wrapper directory:
cd packages/python/graphify-wrapper
uv sync
```

## Alternative: Manual Installation

If uv lock fails, you can install Graphify globally and use the shell scripts:

```bash
# Install Graphify CLI globally
pip install graphifyy[neo4j,pdf,sql]

# Or use uvx (doesn't require lock file)
uvx --from graphifyy graphify --help
```

## Usage (Without Package Installation)

### Build Monorepo Graph

```bash
# Using the shell script (doesn't require Python package)
./packages/data/graphify/scripts/build-monorepo-graph.sh

# Or directly with Graphify CLI
graphify . \
  --output packages/data/graphify/output/monorepo \
  --config packages/data/graphify/configs/.graphify.yml \
  --no-semantic  # AST-only mode (fast)
```

### Build App Graph

```bash
# Example: herbmail
graphify apps/herbmail \
  --output packages/data/graphify/output/apps/herbmail \
  --config packages/data/graphify/configs/.graphify.yml
```

###Query Graph

```bash
# Once graph.json is built
graphify query packages/data/graphify/output/monorepo/graph.json \
  "Where is user authentication handled?"
```

## Next Steps

1. **Fix uv version**: Align workspace uv version
2. **Run first build**: `./packages/data/graphify/scripts/build-monorepo-graph.sh`
3. **View results**: Open `packages/data/graphify/output/monorepo/graph.html`
4. **Test API**: Start dev server and visit `/api/graphify/monorepo.json`

## Files Created

### Package Structure

- `packages/python/graphify-wrapper/` - Python wrapper package
    - `pyproject.toml` - Package config
    - `project.json` - Nx targets
    - `graphify_wrapper/cli.py` - CLI commands
    - `README.md` - Package documentation

### Data Storage

- `packages/data/graphify/` - Graph data storage
    - `configs/.graphify.yml` - Graphify configuration
    - `scripts/build-monorepo-graph.sh` - Build script
    - `output/` - Generated graphs (git-ignored)
    - `README.md` - Storage documentation

### API Endpoints

- `apps/kbve/astro-kbve/src/pages/api/graphify/`
    - `monorepo.json.ts` - Full monorepo graph API
    - `apps/[app].json.ts` - Per-app graph API

### Documentation

- `docs/GRAPHIFY_SETUP.md` - Complete setup guide
- `packages/data/graphify/README.md` - Data storage docs
- `packages/python/graphify-wrapper/README.md` - Package docs

## Troubleshooting

### uv version mismatch

The workspace requires `uv==0.11.28` but you have `0.11.29`. Options:

1. Wait for workspace update to 0.11.29
2. Use `pip` or `pipx` to install graphifyy directly
3. Use `uvx` which doesn't require lock files

### Graphify not found

```bash
# Install globally
pip install graphifyy

# Or with uv
uv tool install graphifyy

# Or use npx equivalent
uvx --from graphifyy graphify --help
```
