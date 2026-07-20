# graphify-wrapper

KBVE wrapper for [Graphify](https://github.com/Graphify-Labs/graphify) - semantic knowledge graph generation for the monorepo.

## Features

- **Nx Integration**: Builds graphs scoped to Nx projects (apps, packages, or entire monorepo)
- **Custom Extractors**: Parses Nx metadata, Proto definitions, Bevy ECS systems
- **Web Export**: Transforms Graphify output to API-friendly JSON format
- **CLI Tools**: Build, query, and export graphs from command line

## Installation

```bash
pnpm nx run graphify-wrapper:install
```

## Usage

### Build Full Monorepo Graph

```bash
pnpm nx run graphify-wrapper:build-monorepo
```

Output: `packages/data/graphify/output/monorepo/graph.json`

### Build App-Specific Graph

```bash
pnpm nx run graphify-wrapper:build-app --app=herbmail
```

Output: `packages/data/graphify/output/apps/herbmail/graph.json`

### Query the Graph

```bash
pnpm nx run graphify-wrapper:query --q="Where is user authentication handled?"
```

### Export for Web

```bash
pnpm nx run graphify-wrapper:export-web
```

Copies to: `apps/kbve/astro-kbve/public/graphify/monorepo.json`

## Configuration

Edit `packages/data/graphify/configs/.graphify.yml` to customize:

- LLM backend (Ollama, Anthropic, etc.)
- File ignore patterns
- Extractor settings

## Architecture

- **CLI** (`graphify_wrapper/cli.py`): Command-line interface
- **Nx Integration** (`graphify_wrapper/nx_integration.py`): Workspace parsing
- **Exporters** (`graphify_wrapper/export.py`): Web API format conversion
- **Config** (`graphify_wrapper/config.py`): Settings management
