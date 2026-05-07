# RareIcon icons codegen

Build-time codegen package for the RareIcon catalog. Pulls icon SVGs
from upstream FOSS packs (Lucide, Tabler, Phosphor, Simple Icons, Game
Icons, plus a growing set of Iconify bundles) and emits one IconTerm
MDX per concept under
`apps/rareicon/astro-rareicon/src/content/docs/icons/`.

## Why this lives outside the root workspace

The icon-source packages (`@iconify-json/*`, `@phosphor-icons/core`,
`simple-icons`, `@tabler/icons`, `lucide`) are **build-time only** — the
generated MDX is the artifact, the deps are not part of the runtime
bundle. Pulling them into the root `package.json` would bloat every
fresh `pnpm install` for every developer, even those who never touch
the catalog.

Instead, this package:

1. Declares its deps in **its own** `package.json`
2. Is marked `private` and **opts out of the workspace install** with
   `--ignore-workspace` so root `pnpm install` skips the icon deps
3. Is installed on-demand only when regenerating the catalog
4. Can be cleaned (`rm -rf node_modules`) when done

The committed artifact is the MDX catalog itself plus the dedup
ledger (`dedup-keys.json`) — those are checked into git and version-
controlled with the rest of the repo.

## One-time install / regen / cleanup flow

```sh
# 1. Pull deps (only when regenerating)
npx nx run astro-rareicon:gen:icons-install

# 2. Run a full regen + merge pass
npx nx run astro-rareicon:gen:all-icons

# 3. Clean up after — drops ~700MB of node_modules
npx nx run astro-rareicon:gen:icons-clean
```

Per-pack regens (skip the install step if you've already pulled deps):

```sh
npx nx run astro-rareicon:gen:icons          # Lucide
npx nx run astro-rareicon:gen:brand-icons    # Simple Icons
npx nx run astro-rareicon:gen:tabler-icons
npx nx run astro-rareicon:gen:phosphor-icons
npx nx run astro-rareicon:gen:game-icons
npx nx run astro-rareicon:gen:iconify-icons  # Heroicons + Octicons + Iconoir + Carbon + Material + Fluent + MDI
npx nx run astro-rareicon:gen:merge-variants
```

`pnpm gen:iconify --only material-symbols` runs a single Iconify pack.
All scripts accept `--dry-run` and `--no-clean`.

## Pack registry

| Pack             | License    | Curated | Suffix on collision | Generated tag                |
| ---------------- | ---------- | ------- | ------------------- | ---------------------------- |
| Lucide           | ISC        | all     | n/a                 | `lucide`                     |
| Simple Icons     | CC0        | yes     | `-simple`           | `simple-icons-generated`     |
| Tabler           | MIT        | yes     | `-tabler`           | `tabler-generated`           |
| Phosphor         | MIT        | yes     | `-phosphor`         | `phosphor-generated`         |
| Game Icons       | CC BY 3.0  | yes     | `-game`             | `game-icons-generated`       |
| Heroicons        | MIT        | yes     | `-hero`             | `heroicons-generated`        |
| Octicons         | MIT        | yes     | `-octicon`          | `octicons-generated`         |
| Iconoir          | MIT        | yes     | `-iconoir`          | `iconoir-generated`          |
| Carbon           | Apache 2.0 | yes     | `-carbon`           | `carbon-generated`           |
| Material Symbols | Apache 2.0 | yes     | `-material`         | `material-symbols-generated` |
| Fluent UI System | MIT        | yes     | `-fluent`           | `fluent-generated`           |
| MDI              | Apache 2.0 | yes     | `-mdi`              | `mdi-generated`              |

Hand-crafted lock: every pack respects pre-existing `<ref>.mdx`. If the
base is hand-crafted (no generated tag), the pack writes to
`<ref>-<suffix>.mdx` instead, and the merger leaves the hand-crafted
base alone.

## Dedup ledger (`dedup-keys.json`)

The merger writes a stable, sorted JSON ledger every time it runs:

```json
{
	"sword": {
		"lucide": "sword",
		"tabler": "sword",
		"phosphor": "sword",
		"game": "broadsword"
	},
	"shield": {
		"lucide": "shield",
		"phosphor": "shield",
		"game": "magic-shield"
	}
}
```

Each top-level key is the **base ref** (the canonical concept slug in
the catalog). The inner map records which **upstream pack** contributed
which **source slug** to that concept's variants. The ledger is
checked into git so:

- Reviewers can grep `dedup-keys.json` to see what a "sword" page pulls
  from upstream without diffing 1000+ MDX files
- Re-runs stay deterministic — if a pack rename breaks an entry, the
  diff in `dedup-keys.json` is the surface that flags it
- Future automated dedup logic (synonym mapping, near-miss collapse)
  can read the ledger as its source of truth instead of re-parsing MDX

## Adding a new Iconify-bundle pack

1. `cd apps/rareicon/icons-codegen && pnpm add @iconify-json/<pack> --ignore-workspace`
2. Append a config object to `PACKS` in `scripts/gen-iconify-icons.mjs`:
    ```js
    {
      prefix, bundle, suffix, genTag,
      license, licenseLine, author, homeUrl, sourceUrlPrefix,
      pagefindFilter,
      curated: [{ slug, ref, cat }, …],
    }
    ```
3. Add `<suffix>` to `PACK_SUFFIXES` in `scripts/gen-merge-variants.mjs`
   and add `<genTag>` to `isGenerated`'s sentinel list.
4. Run `pnpm gen:iconify` then `pnpm gen:merge`.

## Frontmatter contract

Generated MDX carries:

- `ref` — catalog term slug (kebab-case)
- `default_license` — schema enum + `attribution_line` + `source_url`;
  rendered as a footer chip on the term page (highlighted gold when
  `attribution_required: true`, e.g. CC BY 3.0)
- `tags` — first entry is the generator marker (e.g. `tabler-generated`)
- `pagefindFilters` — for the catalog browser facet UI

Hand-crafted MDX must NOT carry any `*-generated` tag — the merger
treats the base as locked when it sees one.
