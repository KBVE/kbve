# Projects page → Bento redesign

**Date:** 2026-07-05
**App:** `apps/kbve/astro-kbve` (Starlight docs site)
**Route:** `/projects/` — `src/content/docs/projects.mdx`

## Problem

The `/projects/` page is visually disconnected from the home page. It uses:

- `DeferredProjectGallery` → `ProjectGallery.astro`: a hardcoded cyberpunk-accordion of **4** Unsplash cards, unrelated to the real project collection.
- `PackagesTable.astro`: three vertically stacked bordered-row groups (Rust crates / NPM / Python), keyed off `pipeline`.

The home page (`index.mdx`) runs a cohesive Bento design system (`BentoHero`, `BentoBoard`, `BentoGallery`, …) backed by `src/styles/bento.css` (imported site-wide via `global.css`). The projects page should adopt that same system and become data-driven off the 112-entry `project` collection.

## Goals

- Unify `/projects/` with the home-page Bento look, reusing `bento.css` tokens and BentoBoard cell patterns.
- Drive everything from the `project` content collection (112 entries), not hardcoded data.
- Feature a curated subset as large bento cells; let users filter the rest by category.
- Convert published-packages into tabbed bento cards (NPM / Crates / pip).
- **Fully tag-driven**: tags classify both project category and package registry.

## Non-goals

- No search/sort (YAGNI; vanilla tab filter only).
- No changes to the CI/dispatch meaning of `pipeline` — it stays a build field.
- No redesign of the home page or shared `bento.css`.

## Data model / schema

Add two optional fields to the project collection schema
(`src/data/ci/project-schema.ts`, `ProjectSchemaWithEngine`):

```ts
tags: z.array(z.string()).optional(),
featured: z.boolean().optional(),
```

`tags` is currently written as empty `tags:` in some MDX frontmatter but is
**stripped** because the schema never declares it. Declaring it makes it live.

### Tags already exist — no seeding

**All 112 project MDX files already carry populated `tags:` blocks.** They were
being silently stripped because the schema never declared `tags`. Declaring it
(above) makes the existing rich vocabulary live — no migration needed.

Existing tag frequencies (top): `rust`×36, `unreal`×28, `crates`×24,
`docker`×23, `bevy`×19, `gamedev`×8, `game`×8, `agones`×6, `gaming`×5,
`gameplay`×5, `ue5`×4, `server`×4, `python`×4, `npm`×4, `api`×4, `infrastructure`×4,
plus a long tail.

### Category derivation (project-card tabs)

The four user-facing tabs are **derived** from the existing tags via a keyword
map. A cell's `data-category` holds every category it matches (a project can be
both a game and a service).

| tab       | matches any tag in                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Games     | game, gamedev, gaming, gameplay, unreal, ue5, bevy, unity, godot, phaser, arpg, multiplayer, game-server, gameserver, game-client               |
| Libraries | crates, npm, python, rust, typescript, node, react, proto, wasm, ffi (AND has a package/crate/pypi identifier)                                  |
| Services  | docker, agones, kubernetes, server, infrastructure, api, backend, database, observability, telemetry, devops, firecracker, kubevirt, networking |
| Tools     | tool, utility, cli, editor, git, workers, bot, ows                                                                                              |

The map lives in one place (a shared `projectTags.ts` helper) so tabs and
derivation stay in sync. Uncategorised projects still show under **All**.

### Registry derivation (package tabs)

Packages section keeps the existing gate: only projects with a publish
`pipeline` (`crates` / `npm` / `python`) **and** a package identifier
(`package_name` / `pypi_name` / crate) appear — this is the accurate
"actually published to a registry" signal (the `rust` tag alone is too broad;
many rust projects are `docker` apps, not crates). Registry label maps
`crates`→Crates, `npm`→NPM, `python`→pip, and each project already carries the
matching language tag.

`featured: true` is set by hand on the handful of hero projects.

## Components

### `ProjectBento.astro` (new)

- `src/components/kbve/ProjectBento.astro`.
- `getCollection('project')`, filter out entries without a title.
- `featured: true` → wide/tall bento cells with `img` as background (BentoGallery-style); others → normal cells (BentoBoard-style).
- Filter tabs: **All / Games / Tools / Libraries / Services**, driven by category tags. Each cell carries `data-category` (its category tags, space-joined) for the filter island.
- Cell content: title, description, status pill (`active`/`beta`), link to `/project/<slug>/`.
- Reuses BentoBoard cell CSS (hairline grid, glow-on-hover, span classes). Extract the shared cell CSS into a small partial or duplicate the scoped styles — decide during implementation; prefer extraction if BentoBoard's styles are cleanly liftable.

### `PackagesBento.astro` (refactor of `PackagesTable.astro`)

- Same registry data, now derived from **language tags** instead of `pipeline`
  (rust→Crates, python→pip, js/javascript/typescript→NPM).
- Tabbed (NPM / Crates / pip) instead of stacked groups.
- Bento-card styling (reuse `bento.css` tokens) instead of the current bordered rows.
- Keeps registry + source links and version.

### Reused

- `BentoShell.astro` — eyebrow/heading/frame + scroll-reveal wrapper for each section.
- `bento.css` — `.bento-section`, `.bento-frame`, `.bento-eyebrow`, `.bento-heading`, tokens.

## Interactivity

Filter/registry tabs use a **React island + nanostores**, following the
codebase-native pattern in `BentoController.tsx` / `bentoStore.ts`: Astro
renders the cells as static HTML; a small React island discovers them from the
DOM via `data-*` attributes and drives state through a nanostore atom. This
keeps cells server-rendered (SEO, no 112-card JSON hydration) while giving React

- nanostores flexibility for future integrations (search, sort, shared state).

* New `projectFilterStore.ts` — `$activeCategory` and `$activeRegistry` atoms.
* Cells carry `data-category` (space-joined category tags); package rows carry `data-registry`.
* `ProjectFilterTabs.tsx` (React, `client:visible`) — renders the tab bar, writes the active atom on click.
* A subscriber (in the same island's effect, mirroring BentoController's DOM discovery) toggles `hidden` on cells whose `data-category` / `data-registry` doesn't match the active atom (`all` shows everything).
* Progressive enhancement: with JS off, all cells/rows render visible; tabs are inert but nothing is hidden.

## `projects.mdx` changes

```mdx
---
title: Projects
template: splash # unchanged
---

import ProjectBento from '@/components/kbve/ProjectBento.astro';
import PackagesBento from '@/components/kbve/PackagesBento.astro';

<ProjectBento />
<PackagesBento />
```

Removes `DeferredProjectGallery` + `PackagesTable` usage.

## Removals

- Delete `src/components/kbve/ProjectGallery.astro` (cyberpunk accordion).
- Delete `src/components/kbve/DeferredProjectGallery.astro` (its only wrapper).
- Delete `src/components/kbve/PackagesTable.astro` once `PackagesBento` replaces it (verify no other importers first).

## Testing / verification

- `nx build astro-kbve` succeeds (schema change + new components compile).
- `/projects/` renders featured cells, category tabs filter correctly, package tabs switch registries.
- Content-collection validation passes with seeded `tags` on all 112 MDX files.
- Visual parity with home-page bento (tokens, hairlines, glow).
- Grep confirms no remaining importers of the three deleted components.

## Open questions

- Seeding approach (auto-seed from pipeline → tags-as-truth) is assumed per
  "tags everywhere" + impracticality of hand-tagging 112 files. Confirm at review.
- Which projects get `featured: true` — to be picked during implementation
  (candidates: rareicon, python-kbve, kbvelibgit, rentearth, cryptothrone).
