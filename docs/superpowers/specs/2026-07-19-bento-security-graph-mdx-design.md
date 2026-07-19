# Bento-native security + graph dashboard MDX

**Date:** 2026-07-19
**Status:** Approved

## Problem

`render_security_mdx` + `render_graph_mdx` (`packages/python/kbve/kbve/nx/render.py`) emit plain Starlight `Card/CardGrid/Tabs` under the default doc layout. The rest of the dashboard (portal.mdx, infrastructure.mdx) uses the site's **Bento** design system (`template: splash` + `BentoShell` + `bento.css` classes). Make the two generated pages match.

## Decisions

- **Hand-rolled BentoShell** pattern (matches infrastructure.mdx / portal.mdx), NOT BentoDoc (avoids the proto icon-key schema; better for generated per-ecosystem data).
- **Keep tables + mermaid** — wrap the existing markdown tables and mermaid charts in `<BentoProse>` sections (prose styling preserved). Only the hero, KPI counts, and breakdown become Bento cards.
- **Static markup** — the Python builder emits repeated card markup in a loop (no `export const` + `{arr.map()}` JSX); deterministic and safe for generated content.
- **Verify structurally** (regenerate + assert markup), no live browser.

## Target markup (emulate infrastructure.mdx)

**Frontmatter** (both pages): `template: splash`, `tableOfContents: false`, `editUrl: false`, `lastUpdated: false`, `next: false`, `prev: false`, keep `title`/`description`/`sidebar {label, order}`. security order 102, graph order 101.

**Imports:** `import BentoShell from '@/components/hero/BentoShell.astro';` + `import BentoProse from '@/components/hero/BentoProse.astro';`

**Wrapper:** `<div class="dash-report" style={...}>` … `</div>` + a trailing `<style is:global>{`.dash-report{--bento-accent:…;--bento-accent-2:…}`}</style>`. security accent amber/red (`#f59e0b`/`#f43f5e`), graph accent violet/blue (`#a78bfa`/`#38bdf8`).

**Hero band** — `<section class="bento-hero bento-section not-content">` › `bento-hero__frame bento-frame` › `bento-board bento-board--hero`:
- `bento-cell bento-hero-copy bento-card bento-card--glass` with a `bento-badge bento-chip` (icon + "auto-generated · daily"), `bento-title` + `bento-title__accent`, `bento-lede` (the summary sentence — e.g. "28 critical/high findings" for security), and a `bento-cta` with jump buttons.
- The stat tiles as the hero's right-side cells (see below), OR a dedicated stat strip in a BentoShell.

**KPI stat tiles** (security: critical/high/medium/low/info; graph: apps/libs/e2e/dependencies) — a `bento-board bento-board--cols-5` (or 4) of:
```
<div class="bento-cell bento-stat bento-card bento-card--glass bento-card--interactive">
  <span class="bento-icon-tile"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="…"/></svg></span>
  <span class="bento-stat__value">3</span>
  <span class="bento-stat__label">Critical</span>
</div>
```

**Breakdown cards** — `<BentoShell id="…" eyebrow="…" heading="…">` › `bento-board bento-board--cols-3` of `bento-cell bento-linkcard bento-card bento-card--glass bento-card--interactive` (security: one per ecosystem with count + `#eco-<name>` anchor; graph: top-hub projects with dependent counts). Each: `bento-icon-tile` + `bento-linkcard__title` + `bento-linkcard__copy` + `bento-linkcard__go` arrow.

**Prose sections** — `<BentoProse id="findings" heading="…">` wrapping the existing mermaid pies + per-ecosystem tables (security) / mermaid `graph LR` + project-index + details tables (graph). Move the current `<Tabs>` content into prose (either keep `<Tabs>` inside BentoProse, or flatten to `###` subsections — flatten preferred so it reads as one scannable page).

**Footer:** keep the `---` + italic auto-generated link inside a final BentoProse or plain band.

## Inline SVG icon set (path `d` strings)

Provide a small dict in render.py (24×24 stroke paths), e.g.:
- severity: critical/high `M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z` (triangle-alert); medium `M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z` (info-circle); low/info `M20 6 9 17l-5-5` (check).
- ecosystems: npm/cargo/python/codeql/dependabot — reuse simple box/package/search/git paths.
- graph types: app `M9 11 3 3 3-3M12 2v12` rocket-ish / lib puzzle / e2e check / dependencies `M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3…`.
Exact paths are the implementer's choice as long as they're valid 24×24 stroke paths (copy from infrastructure.mdx / bento-icons where handy).

## Data shapes (unchanged — consume as today)

- security: `data["summary"]` = `{critical,high,medium,low,info}`; `data["ecosystems"][eco]` = `{total, severities{…}, advisories|alerts[…]}`.
- graph: `GraphData` — `by_type{ptype:set}`, `rows[Row(name,project_type,root,dep_count,dependent_count)]`, `edges`, `edges_by_source`, `deps`, `nodes`; `top_hubs(rows,5)`.

## Tests

Update `render.py` tests: assert the new structure — `template: splash`, `import BentoShell`, `bento-stat`, `bento-linkcard`, `BentoProse`, absence of `<CardGrid>`. Keep asserting the real data values render (counts, ecosystem names, project names). Full suite stays green.

## Regenerate for review

Re-render both committed pages from the committed JSON so the PR diff shows the real new look:
- `render_security_mdx(json.load(nx-security.json), <ts>)` → `dashboard/security.mdx`
- graph: parse `nx-graph.json` via `parse_graph` → `render_graph_mdx(…, <ts>)` → `dashboard/graph.mdx`
Use a fixed timestamp string for a stable diff.

## Out of scope

report.mdx (separate ci-dashboard generator); the JSON renderers (`render_security_json`, `render_graph_json`) — unchanged.
