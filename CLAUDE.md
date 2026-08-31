# General Guidelines for working with moon

- Run tasks through moon (`moon run <project>:<task>`, `moon check`, `moon ci`) rather than the underlying tool directly. The task config carries the inputs, outputs and dependencies that make a run cacheable and correct.
- `moon query projects` and `moon query tasks` answer "what exists" as JSON; `moon project <id>` and `moon task <target>` explain one of them. Prefer these over reading config files by hand.
- A task id spells a colon as a hyphen. Nx's `astro-kbve:sync:itemdb` is `astro-kbve:sync-itemdb`.
- `moon project-graph` and `moon task-graph` open the graphs. `moon clean` clears the cache.
- NEVER guess CLI flags — check `--help` first.

## Where configuration lives

- `.moon/workspace.yml` — the project graph. Everything outside `crates/` is named explicitly; read the comment there before adding a glob.
- `.moon/toolchains.yml` — node, pnpm, rust and the typescript/javascript layers.
- `.moon/tasks/*.yml` — the presets. A file's `inheritedBy` is either a tag (`astro`, `docker`, `npm`, `playwright`, `vite`, `vitest`, `eslint`, `tauri`, `lfs`, `uv`) or a toolchain (`rust`, `node`). Most projects need no tasks of their own; they declare tags and inherit.
- `<project>/moon.yml` — only what the tags do not already provide.

## Adding a project

1. Give it a `moon.yml` with `layer`, `language` and its tags.
2. Add it to `projects.sources` in `.moon/workspace.yml` — a project outside `crates/` is not in the graph until it is named there.
3. Write tasks only where the preset is wrong for it.

## Common pitfalls

- **Inherited tasks merge, they do not override.** args, deps, inputs and outputs from a preset are appended to the project's own. To replace rather than extend, set `options.mergeOutputs: 'replace'` (and the equivalent for the other fields).
- **Two presets that define the same task id will merge their commands into nonsense.** This is why a rust project with a vitest config does not get the `vitest` tag, and why rust and python projects never get `eslint` — `test` and `lint` already belong to cargo and to ruff.
- **A glob in `projects.sources` registers every matching directory**, with or without a moon.yml. `apps/` and `packages/` have repeated basenames (`kbve`, `relay`, `server`, `web`) and globbing them breaks the graph outright.
- **Affected runs** take `--affected --base <ref> --head <ref>`; add `--query` to filter further.

@AGENTS.md
