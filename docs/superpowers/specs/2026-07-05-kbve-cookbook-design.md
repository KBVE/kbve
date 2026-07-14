# Projects cookbook — faceted `/projects` browser

**Date:** 2026-07-05
**App:** `apps/kbve/astro-kbve` (Starlight docs site)
**Route:** `/projects/` (existing — upgraded)

> Supersedes the earlier "new cookbook collection" idea. No new collection, no
> new content. The cookbook IS the existing `/projects` page, upgraded into an
> e2b-style faceted browser over the 112-entry `project` collection.

## Problem

`/projects` currently uses top filter tabs (single active category) over the
bento project cards. With 112 projects it's hard to browse. e2b's cookbook —
a left faceted sidebar (multiple filter groups) + search over a card list — is
the model for making the whole catalog scannable.

## Goal

Turn `/projects` into a faceted browser: a left sidebar with **three** radio
facet groups + a search box, AND-combined, filtering the existing project bento
cards on the right. All facet data comes from existing frontmatter — no new
collection, no new fields.

## Non-goals

- No new `cookbook` content collection (dropped).
- No namespace facet (kube.stack is the source if ever re-added; sparse — 29/112).
- No changes to the published-packages section (`PackagesBento`) — stays below.
- No multi-select-OR within a group — single active value per group.

## Facets (all from existing frontmatter)

| group        | source                                              | values                                                                                                           |
| ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Language/Tag | `tags`, filtered to a curated whitelist             | rust, python, ts, unreal, bevy, unity, docker, astro, supabase, agones, kubernetes, wasm, … (only those present) |
| Category     | derived from `tags` via existing `deriveCategories` | Games / Libraries / Services / Tools                                                                             |
| Status       | `status`                                            | active / beta                                                                                                    |

- **Multi-facet AND**: a card shows iff it matches the active value in EVERY
  group (a group whose active value is `all` imposes no constraint).
- **Search**: substring match on project title.
- Sidebar shows only values actually present, with per-value counts (like the
  current category counts). Curated tag whitelist lives in `projectTags.ts`
  (`LANGUAGE_TAGS`); only whitelisted tags that appear render as filters.

## Components

### `ProjectBento.astro` (rework)

- Keep card derivation (categories, featured, img, status).
- Add per-card data attributes: `data-language` (whitelisted tags, space-joined),
  `data-category` (existing), `data-status`, `data-name` (lowercased title).
- New layout: e2b 2-column — `grid-template-columns: 240px 1fr` (sidebar + card
  grid); stacks to single column below the `lg` breakpoint (sidebar collapses
  to a horizontal scroll / disclosure on mobile).
- Compute facet groups (value + count) for each of the three groups and pass to
  the filter island.
- Render `<CookbookFilters client:visible />` in the sidebar; the existing bento
  card grid on the right.

### `CookbookFilters.tsx` (new — replaces `ProjectFilterTabs` on this page)

- React (`client:visible`). Props: the three facet groups (`{key,label,values:[{value,label,count}]}`).
- Renders three radio groups (each with an "All" reset) + a search input.
- Writes per-facet nanostore atoms; a `useEffect` toggles each card's `hidden`:

```
show = m('language',$language) && m('category',$category) && m('status',$status) && search($search)
m(facet, active) = active==='all' || card.dataset[facet].split(' ').includes(active)
search(q) = !q || card.dataset.name.includes(q.toLowerCase())
card.hidden = !show
```

- Reuses the `[hidden]{display:none}` specificity fix already added to the cells.
- `ProjectFilterTabs.tsx` is removed (superseded); `projectFilterStore.ts`'s
  single-category atom is replaced by the multi-facet store below.

### `projectFilterStore.ts` (extend)

nanostore atoms `$language`, `$category`, `$status` (string, `'all'` default) and
`$search` (string) + setters. (Registry filter for PackagesBento stays as its
own concern — either keep `$activeRegistry` here or leave PackagesBento's tabs
unchanged; PackagesBento is out of scope, so its existing single-atom filter and
`ProjectFilterTabs` usage there remain. Only the projects grid moves to the
faceted island.)

> Note: `ProjectFilterTabs` is still used by `PackagesBento` for registry tabs.
> Keep that component + its store atom; add the new faceted store/island
> alongside for the projects grid. Do not delete `ProjectFilterTabs`.

### `projectTags.ts` (extend)

- Add `LANGUAGE_TAGS: string[]` — curated whitelist of meaningful language/stack
  tags. `deriveLanguages(tags)` returns the intersection (space-joinable).
- Keep `CATEGORY_DEFS` / `deriveCategories` as-is.

## Layout / styling

- e2b-style: sticky left sidebar (facet groups stacked, each a labelled list of
  radio rows with count), card grid right.
- Reuse `bento.css` tokens + the `.project-tab` chip styles (generalise for
  sidebar radio rows or add `.facet-*` classes, global since rendered in the
  React island).
- Search input styled to match bento surfaces.

## Testing / verification

- `nx build astro-kbve` succeeds.
- `/projects/` renders sidebar (3 groups + search + counts) and card grid.
- Selecting facets filters AND-wise; "All" per group resets; search narrows.
- `grid-auto-flow: dense` reflows remaining cards (no gaps).
- PackagesBento section still renders with its registry tabs.
- **Cache gotcha**: no schema change this time, but if facet reads look empty,
  clear `.astro` + rebuild `--skip-nx-cache`
  ([[project_astro_content_schema_cache_stale]]).

## Open questions

- Curated `LANGUAGE_TAGS` exact list — seed with the common meaningful tags
  (rust, python, ts/typescript, unreal, bevy, unity, godot, docker, astro,
  supabase, agones, kubernetes, wasm, react, proto), refine during build.
- Mobile sidebar treatment (collapse to top disclosure vs horizontal scroll) —
  decide during implementation; default to stacking sidebar above grid.
