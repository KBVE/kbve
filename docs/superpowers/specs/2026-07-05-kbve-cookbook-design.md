# KBVE Cookbook — faceted recipe index

**Date:** 2026-07-05
**App:** `apps/kbve/astro-kbve` (Starlight docs site)
**Route:** `/cookbook/` (new)

## Problem

KBVE content is large and scattered — 6000+ MDX pages across osrs, mc, journal,
project, theory, guides, lab, etc. There is no curated, browsable entry point
for "how do I do X" recipes. e2b's cookbook (curated, tag-filtered use-case
index with a faceted sidebar) is the model.

## Goal

An editorial, curated `/cookbook/` — a faceted index of hand-authored recipes,
each a full MDX page, filterable by Language / Stack / Domain / Namespace with a
search box. Reuses the bento design system and the `[hidden]` filter pattern
from the projects-page work ([[project_projects_bento_page]]).

## Non-goals

- No external-repo link entries — recipes are internal MDX only.
- No indexing of the 6000 existing osrs/mc/etc pages — curated content only.
- No multi-select-OR within a facet group — single active value per group.
- No "Suggest new" Google Form — a simple GitHub new-file CTA instead.

## Content collection

New `cookbook` glob collection, base `src/content/docs/cookbook/`. Starlight
auto-routes each recipe to `/cookbook/<slug>/` (same mechanism as the `project`
collection). Registered in `src/content.config.ts`.

Schema `CookbookSchema` (new, in `src/data/schema` or inline in content.config).
Flat typed fields — **not** a nested `facets` object: nested zod objects imported
across the zod-package boundary get silently stripped here (prior burn, see
Head.astro note in content.config.ts).

```ts
const CookbookSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	language: z.array(z.string()).optional(), // facet 1
	stack: z.array(z.string()).optional(), // facet 2
	domain: z.array(z.string()).optional(), // facet 3
	namespace: z.string().optional(), // facet 4 (single owning project)
	new: z.boolean().optional(), // NEW badge
});
```

Frontmatter also carries standard Starlight fields (`sidebar`, `template`, etc).

Example recipe frontmatter:

```yaml
---
title: Deploy an Agones game server
description: Stand up a dedicated game server on Agones + Kubernetes.
language: [rust]
stack: [agones, kubernetes]
domain: [infra]
namespace: arpg
new: true
sidebar: { order: 1 }
---
```

## Faceted filter — multi-facet AND

Sidebar = four single-select radio groups + a search box, e2b-style left rail.

- **AND across groups**: a card shows iff it matches EVERY active facet. e.g.
  Language=rust AND Domain=infra narrows to recipes tagged both.
- **Single active per group**: each group is radio with an "All" reset.
- **Search**: substring match on title + tag values.

### State — `cookbookStore.ts`

nanostore atoms: `$language`, `$stack`, `$domain`, `$namespace` (each a string,
`'all'` default) and `$search` (string). Setter fns per atom.

### Island — `CookbookFilters.tsx`

React (`client:visible`). Props: the facet group definitions with values+counts.
Renders the 4 radio groups + search input; writes atoms on change. A `useEffect`
subscribes to all atoms and toggles each card's `hidden`:

```
show = matchesFacet(card, 'language', $language)
     && matchesFacet(card, 'stack', $stack)
     && matchesFacet(card, 'domain', $domain)
     && matchesFacet(card, 'namespace', $namespace)
     && matchesSearch(card, $search)
card.hidden = !show
```

`matchesFacet` = active === 'all' || card's space-joined `data-<facet>` keys
include active. Cards carry `data-language`, `data-stack`, `data-domain`,
`data-namespace`, `data-name`.

This is a NEW island — the projects `ProjectFilterTabs` (single-atom, top tabs)
is untouched; the cookbook UX (sidebar radios, AND across 4 groups) differs
enough to warrant its own component. Reuses the `[hidden]{display:none}`
specificity fix.

## Layout / components

### `CookbookIndex.astro`

- `getCollection('cookbook')`.
- Derives facet values + per-value counts from actual frontmatter (sidebar shows
  only values present, like the project category counts). Empty facet groups are
  omitted.
- e2b-style 2-column layout: `grid-template-columns: 260px 1fr` (sidebar + card
  list); stacks to single column on mobile.
- Renders `<CookbookFilters client:visible />` in the sidebar and the card grid.
- Card: title, description, facet tag chips, NEW badge (if `new`), link to
  `/cookbook/<slug>/`. Carries the `data-*` facet attributes.
- Wrapped in `BentoShell`; reuses `bento.css` tokens + the `.project-tab`-style
  chip CSS (generalised or duplicated as `.cookbook-*`).

### `cookbookFacets.ts`

Facet group definitions: ordered list of `{ key, label }` for
language/stack/domain/namespace + optional value→display-label map (e.g.
`rust`→"Rust", `ts`→"TypeScript"). Single source of truth for group order + labels.

### Hero masthead

A `CookbookHero` header echoing e2b's glitchy "COOKBOOK" title, toned to KBVE
(reuse bento eyebrow/heading typography rather than new fonts).

## Route + seed content

- `src/content/docs/cookbook/index.mdx` — `template: splash`, imports and renders
  `CookbookIndex`. (The index page itself is excluded from the recipe list by
  slug check, or lives as `index` and is filtered out.)
- Seed **4–5 starter recipes** from real KBVE topics, each a short real MDX page,
  chosen to exercise every facet:
    - Deploy an Agones game server — rust / agones,kubernetes / infra / arpg
    - Bevy turn-based combat crate — rust / bevy / gamedev / (bevy-battle)
    - Run a dbmate migration on kilobase — sql / cnpg,dbmate / data / kilobase
    - Migrate Supabase JWT to ES256/JWKS — rust / supabase / auth / kbve
    - Add an Astro content collection — typescript / astro / web / astro-kbve
- "Add a recipe →" CTA linking to the GitHub new-file URL for the cookbook dir.

## Testing / verification

- `nx build astro-kbve` succeeds (new collection + schema + components compile).
- Content-collection validation passes for seed recipes.
- `/cookbook/` renders sidebar with 4 facet groups + counts, card list, NEW badges.
- Selecting a facet filters (AND across groups); "All" resets; search narrows.
- Each `/cookbook/<slug>/` renders its MDX body via Starlight.
- **Cache gotcha**: adding the collection/schema needs a clean parse — clear
  `.astro` and rebuild `--skip-nx-cache` (see [[project_astro_content_schema_cache_stale]]).

## Open questions

- Value→label casing for facet chips — handled in `cookbookFacets.ts`, refine
  during implementation.
- Namespace values should align with real project slugs (arpg, cryptothrone,
  rareicon, chuck, factorio, kilobase, astro-kbve). Free-string for now; could
  later validate against the `project` collection.
