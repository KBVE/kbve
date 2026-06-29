# Workflows Content Collection — Plan

Astro content collection documenting agentic workflows (Claude Code superpowers,
multi-agent orchestration, skill chains, prompt recipes).

Named `workflows` (NOT `skills`) to avoid collision with Claude Code's own skills
concept + the plugin skill registry.

## Decision: docs-only, no proto

Workflows = prose docs, not game data decoded by a Rust sim / UE. So it follows
the lightweight `application` / `gdd` pattern: a plain `glob` loader, NO proto,
NO codegen, NO data.json. Schema is a small inline Zod object (optional) just to
validate frontmatter for the index/listing page.

This is the opposite of the `*db` collections (itemdb/spelldb/etc) which are
proto source-of-truth pipelines.

## Layout

```
apps/kbve/astro-kbve/src/content/docs/workflows/
  index.mdx            # landing / catalog page
  <slug>.mdx           # one file per workflow
```

## Schema (optional, light)

Define inline in `src/content.config.ts` (no @/data/schema file needed unless it
grows). Frontmatter fields:

| field         | type                                          | notes                                  |
| ------------- | --------------------------------------------- | -------------------------------------- |
| `title`       | string                                        | starlight                              |
| `description` | string                                        | starlight + listing                    |
| `slug`        | string (kebab)                                | stable id                              |
| `trigger`     | string                                        | when-to-use, mirrors skill frontmatter |
| `category`    | enum (process/implementation/research/review) | grouping                               |
| `tags`        | string[]                                      | filtering                              |
| `source`      | object { plugin?, version?, url?, author? }   | provenance                             |
| `related`     | string[] (slugs)                              | cross-links                            |
| `draft`       | boolean                                       | hide from listing                      |

If schema stays this small, keep it inline. If it grows / gets reused, promote to
`@/data/schema/IWorkflowSchema.ts` (plain Zod, no proto).

## Steps

1. `mkdir src/content/docs/workflows/`, add `index.mdx` + 1-2 sample workflow MDX.
2. In `src/content.config.ts`:
    - define `const workflows = defineCollection({ loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/workflows' }), schema: <inline zod> })`
    - add `workflows` to the `collections` export.
3. In `apps/kbve/astro-kbve/astro.config.mjs` sidebar: add a `Workflows`
   group with `autogenerate: { directory: 'workflows' }` (place under a Docs or
   new top-level group, NOT under "Game Data").
4. `./kbve.sh -nx astro-kbve:sync` (runs `astro sync`) to regen content types.
5. Build check: `./kbve.sh -nx astro-kbve:build`.

## Out of scope (YAGNI)

- proto / binpb / Rust / UE consumers
- data.json codegen
- per-workflow runnable execution (this is docs, not a runner)

## Open questions

- Sidebar home: own top-level group vs nested under existing "Docs"?
- Does listing need a custom index page (cards) or is autogenerate enough?
