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

### Tag vocabulary (the contract)

**Category tags** — drive project-card filter tabs:

| tag       | tab       |
| --------- | --------- |
| `game`    | Games     |
| `tool`    | Tools     |
| `library` | Libraries |
| `service` | Services  |

**Language tags** — drive package-registry tabs:

| tag                                | registry |
| ---------------------------------- | -------- |
| `rust`                             | Crates   |
| `python`                           | pip      |
| `js` / `javascript` / `typescript` | NPM      |

A project may carry several tags (e.g. a Rust library published to crates.io:
`["library", "rust"]`).

### Tag seeding

112 files is too many to hand-tag. A one-time migration script seeds initial
tags from existing signals, then tags become the source of truth:

| `pipeline`                                     | seeded tags         |
| ---------------------------------------------- | ------------------- |
| `unreal`, `unity`, `unreal_game`, `ue5_server` | `game`              |
| `crates`                                       | `library`, `rust`   |
| `npm`                                          | `library`, `js`     |
| `python`                                       | `library`, `python` |
| `docker`                                       | `service`           |

The script edits each MDX's frontmatter `tags:` in place (idempotent — skips
files that already have non-empty tags). After seeding, the page reads only
tags; future projects add tags by hand. `featured` is set by hand on the
handful of hero projects (none seeded).

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

Filter tabs and registry tabs use a **small vanilla-JS island**, same
`onMount` pattern as `BentoBoard.astro`'s existing `<script>`:

- Tab buttons carry `data-filter="<category>"`.
- On click, toggle `hidden` on cells whose `data-category` doesn't match (All shows everything).
- Registry tabs work identically on the packages section.
- Progressive enhancement: with JS off, all cells/rows render visible; tabs are inert but nothing is hidden.

No React island (avoids client weight; no state beyond active tab).

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
