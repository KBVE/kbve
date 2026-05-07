# RareIcon catalog codegen

Scripts that build the catalog at `src/content/docs/icons/`. Pattern:
each pack has its own codegen that emits one MDX per term, then a final
merger pass consolidates `<ref>-<pack>.mdx` siblings into the base
`<ref>.mdx` whenever the base is generator-emitted.

## Pipeline

```
gen-lucide-icons.mjs      → writes lucide-only outline terms (no curation)
gen-simple-icons.mjs      → writes Simple Icons CC0 brand glyphs (curated)
gen-tabler-icons.mjs      → writes Tabler MIT outline terms (curated)
gen-phosphor-icons.mjs    → writes Phosphor MIT terms with 6 weight variants each (curated)
gen-gameicons.mjs         → writes Game Icons CC BY 3.0 gamedev terms (curated)
gen-iconify-icons.mjs     → writes Heroicons / Octicons / Iconoir / Carbon /
                            Material Symbols / Fluent / MDI from Iconify
                            JSON bundles, all driven by one PACKS registry
gen-merge-variants.mjs    → consolidates <ref>-<pack>.mdx siblings into base
                            <ref>.mdx, namespaces incoming variant refs by
                            pack, refreshes description, deletes suffix file
```

Run end-to-end:

```sh
npx nx run astro-rareicon:gen:all-icons
```

Per pack:

```sh
npx nx run astro-rareicon:gen:lucide-icons      # via gen:icons
npx nx run astro-rareicon:gen:brand-icons       # gen-simple-icons.mjs
npx nx run astro-rareicon:gen:tabler-icons
npx nx run astro-rareicon:gen:phosphor-icons
npx nx run astro-rareicon:gen:game-icons
npx nx run astro-rareicon:gen:iconify-icons     # all Iconify packs
npx nx run astro-rareicon:gen:merge-variants
```

`gen-iconify-icons.mjs --only <prefix>` runs a single Iconify pack
(e.g. `--only material-symbols`).

All scripts accept `--dry-run` (no writes) and `--no-clean` (skip the
delete-previously-generated step).

## Per-pack rules

| Pack             | License    | Curation               | Suffix on collision | Generated tag                |
| ---------------- | ---------- | ---------------------- | ------------------- | ---------------------------- |
| Lucide           | ISC        | none — emits all icons | n/a                 | `lucide`                     |
| Simple Icons     | CC0        | yes (~150 brands)      | `-simple` (rare)    | `simple-icons-generated`     |
| Tabler           | MIT        | yes                    | `-tabler`           | `tabler-generated`           |
| Phosphor         | MIT        | yes (6 weights / term) | `-phosphor`         | `phosphor-generated`         |
| Game Icons       | CC BY 3.0  | yes                    | `-game`             | `game-icons-generated`       |
| Heroicons        | MIT        | yes                    | `-hero`             | `heroicons-generated`        |
| Octicons         | MIT        | yes                    | `-octicon`          | `octicons-generated`         |
| Iconoir          | MIT        | yes                    | `-iconoir`          | `iconoir-generated`          |
| Carbon           | Apache 2.0 | yes                    | `-carbon`           | `carbon-generated`           |
| Material Symbols | Apache 2.0 | yes                    | `-material`         | `material-symbols-generated` |
| Fluent UI System | MIT        | yes                    | `-fluent`           | `fluent-generated`           |
| MDI              | Apache 2.0 | yes                    | `-mdi`              | `mdi-generated`              |

Hand-crafted lock: every pack respects pre-existing `<ref>.mdx`. If the
base is hand-crafted (no generated tag), the pack writes to
`<ref>-<suffix>.mdx` instead, and the merger leaves the hand-crafted
base alone — the suffix sibling remains as a separate page.

## Adding a new pack

For Iconify-bundle packs (most common):

1. `pnpm add -D @iconify-json/<pack>` at the workspace root.
2. Append a config object to `PACKS` in `gen-iconify-icons.mjs`:
    ```js
    {
      prefix, bundle, suffix, genTag,
      license, licenseLine, author, homeUrl, sourceUrlPrefix,
      pagefindFilter,
      curated: [{ slug, ref, cat }, …],
    }
    ```
3. Add `<suffix>` to `PACK_SUFFIXES` in `gen-merge-variants.mjs` and
   add `<genTag>` to `isGenerated`'s sentinel list.
4. Run `gen:iconify-icons` then `gen:merge-variants`.

For non-Iconify packs (Lucide / Simple Icons / Tabler / Phosphor / Game
Icons each ship as their own npm shape), copy whichever existing script
matches the source format and adjust `loadXxxSvgBody` accordingly.

## Frontmatter contract

Generated mdx carries:

- `ref` — catalog term slug (kebab-case)
- `default_license` — schema enum + attribution_line + source_url;
  rendered as a footer chip on the term page (highlighted gold when
  `attribution_required: true`, e.g. CC BY 3.0)
- `tags` — first entry is the generator marker (e.g. `tabler-generated`)
- `pagefindFilters` — for the catalog browser facet UI

Hand-crafted mdx must NOT carry any `*-generated` tag — the merger
treats the base as locked when it sees one.
