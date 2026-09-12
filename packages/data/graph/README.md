# Graph data

Every graph the monorepo publishes about itself, committed in one place.

```
packages/data/graph/
├── monorepo/               # the committed artifacts (read these)
│   ├── projects.json       # moon project graph — {graph: {nodes, dependencies}}
│   ├── overview.json       # graphify tiered overview: directory bubbles, edges, meta
│   └── dir/<top-level>.json  # per-directory file→symbol chunks (LOD tier 2/3)
└── output/                 # raw graphify export, git-ignored and rebuildable
```

This directory is data. What produces it is code, and lives with the rest of the
code: `packages/python/graphify-wrapper` holds the CLI wrapper, the build
scripts (`scripts/`) and the graphify config (`configs/.graphify.yml`).

## What writes what

| artifact                         | producer                                           | cadence |
| -------------------------------- | -------------------------------------------------- | ------- |
| `monorepo/projects.json`         | `graph` route (`moon query projects`)              | daily   |
| `monorepo/overview.json`, `dir/` | `graphify` route → `scripts/build-tiered-graph.sh` | weekly  |

Both run from `ci-daily-content.yml` and open their own PR. Nothing here is
hand-edited.

`scripts/build-tiered-graph.sh` ends by fusing the two: `enrich_unified.py` folds moon
project identity and project→project edges onto the directory bubbles, and
attaches a `ref` — the doc that documents that code area — to each node. It
walks **both** docs roots (`docs/` and what remains in
`apps/kbve/astro-kbve/src/content/docs`), because a node with no `ref` is a node
the explorer cannot link to its documentation.

## Who reads it

- **The site.** `astro-kbve:sync-graph` copies `monorepo/` into the app's
  `public/` at build time — `/graphify/*` and `/data/dashboard/graph.json` —
  because the browser fetches the chunks at runtime. Those copies are
  git-ignored; this package is the source of truth. Build-time readers
  (`src/lib/graph/dataPaths.ts`) resolve this package directly, so a build does
  not depend on the copy having happened.
- **`/graph/`** on <https://kbve.com/graph/>, and the dashboard Graph Explorer.
- **Agents working in this repository.** The chunks answer "where does symbol X
  live" without re-running extraction — a full rebuild is a tree-sitter pass
  over the monorepo plus a force layout, far too slow to do on demand.

## Rebuilding locally

```bash
moon run graphify-wrapper:build-tiered   # overview.json + dir/, needs: uv tool install graphifyy
moon run astro-kbve:sync-graph           # refresh the site's served copies
```

The scientific stack is pinned inside the script (networkx/numpy/scipy, seed
1337): the force layout is only reproducible for a fixed set, and floating it
churns every node coordinate on each rebuild.
