# Icon Proto — Universal Icon / SVG Registry

Source of truth for the SVG / icon catalog served by astro-rareicon (and anywhere else in KBVE that needs icon metadata).

## File

- **`icons.proto`** — complete icon schema with collection + registry

## Scope

Each `Icon` entry captures:

- **Identity** — `id` (ULID), `ref` (slug), `name`, optional `description`
- **Classification** — `style` enum, multi-category taxonomy, free-form tags, parent `collection_ref`
- **Source asset** — inline `svg_body` (preferred for Pagefind index), or `svg_path` / raster fallback / icon-font codepoint
- **Rendering** — viewBox, default fill/stroke, recommended sizes, monochrome flag
- **Variants** — sibling refs for the same concept in other styles (outline ↔ filled ↔ bold)
- **Search** — keywords, aliases, primary category, search weight
- **License** — `IconLicense` enum (CC0, CC-BY, MIT, OFL, PROPRIETARY, CUSTOM, …) + attribution metadata; fields left unset inherit from `IconCollection.license`
- **Offering** — marketing flow: free / paid / donation / preview, price, download or purchase URL
- **Accessibility** — default `aria-label` and `role`
- **Extensions** — `IconExtension` key-value pairs for site-specific or game-specific data

`IconCollection` groups icons that share a viewBox, style, and license; individual icons inherit any fields it defines. `IconRegistry` is the on-disk wrapper.

## Conventions

- `ref` is the canonical slug — URL-safe, lowercase, hyphen-separated (`arrow-right`, `shield-cross`). Keep it generic; per-game mechanics go in `extensions[...]` under a namespaced key (e.g. `"rareicon.inventory_icon"`), matching the itemdb policy.
- Inline SVG (`svg_body`) wins over external paths because Pagefind indexes the rendered MDX body; having the raw markup in the proto keeps codegen and MDX generation aligned.
- `style` is an enum, not a free-form string — add a new enum value if a new style surfaces, don't overload existing ones.
- Licenses are enum-first. If a pack ships under a bespoke license, use `ICON_LICENSE_CUSTOM` and fill in `license_text` / `license_url`.
- Variants use `ref` links rather than nesting — each style is a standalone `Icon` so Pagefind indexes them independently and URLs stay one-per-icon.

## Downstream

- **astro-rareicon** — `buf.gen.yaml` already targets `packages/data/proto`; `npx nx run astro-rareicon:proto` regenerates TS types into `src/generated/proto/`.
- **MDX flow** (next phase) — script reads a JSON corpus conforming to `IconRegistry`, emits one MDX per icon with frontmatter derived from `search` + `categories`, body inlines `svg_body` so Pagefind picks it up.
