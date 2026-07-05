# Bento-wrap the RN Dashboard Kit — Design

**Date:** 2026-07-05
**Status:** Draft — awaiting user review
**Scope:** Make the KBVE web dashboard match the site's bento visual language by wrapping the existing `@kbve/rn/dash` kit in a bento outer shell and retheming its web token layer. Core dashboard logic (adapters, streams, lenses, StreamView) is not touched.

## Problem

The web dashboard (`apps/kbve/astro-kbve/src/components/dashboard/React*.tsx`) is a large set of inline-styled React components, visually inconsistent with the rest of the site now that pages are migrating onto `bento.css` (home, register, discord, and — this session — `/dashboard/` + `/dashboard/agents/`).

A parallel, well-factored dashboard already exists: `@kbve/rn/dash` — a React Native kit (per-service `adapters` + generic `StreamView` + `StatGrid` + primitives) that is web-bridged today via `react-native-web` (`src/components/rnweb/*DashRN.tsx`, labeled a "proof"). We want to standardize on the RN kit as the dashboard core so web and mobile share one implementation, and use bento only as presentation chrome.

## Goals

1. Web dashboard cards adopt the bento look (near-black cell, hairline border, gold accent, bento radius) — matching the site.
2. Reuse the RN dash kit as the shared core. No rewrite, no logic changes.
3. bento.css owns the **outer shell** only (section band, centered frame, eyebrow/heading, island container).
4. Prove the pattern on one simple surface and one complex surface before mass rollout.

## Non-goals

- Reskinning the entire mobile app.
- Native (Expo) dashboard palette parity — see "Native parity (deferred)".
- Converting pages that have no RN adapter yet (Kanban, IDE, Settings, NxReport, Home service-cards, Alerts). Those remain legacy for now; separate later plans.
- Any change to data fetching, auth, streams, lenses, or adapter logic.

## Key architecture facts (verified)

- `apps/kbve/astro-kbve/astro.config.mjs` sets vite `resolve.extensions` to prefer `.web.ts`/`.web.tsx` and aliases `react-native` → `react-native-web`. So on the web build, every `import { tokens } from '../theme'` in the kit resolves to **`packages/npm/rn/src/ui/theme.web.ts`**.
- `theme.web.ts` already defines tokens as **CSS-var strings** (e.g. `surface: 'var(--sl-color-bg-nav, #1b1814)'`, `border: 'var(--sl-color-hairline, #3a2f1f)'`, `primary: 'var(--sl-color-accent, #c9a56a)'`). `react-native-web` passes these strings through to the DOM, so the kit's web chrome is already driven by the Starlight CSS cascade — no `useTheme` wiring needed on web.
- `bento.css` defines `--bento-cell-bg` (= `--sl-color-black`), `--bento-hairline`, `--bento-hairline-strong`, `--bento-radius` (0.625rem = 10px), plus `--sl-color-accent-high` (gold in dark theme).
- The kit's `radius.lg` is already `10`, matching `--bento-radius`. `space` scale is compatible.
- `BentoShell.astro` already provides the bento section/frame/eyebrow/heading + scroll-reveal observer and is the reuse point for every page shell.

## Design

### Phase 1 — Foundation: retheme the web token layer

Edit **`packages/npm/rn/src/ui/theme.web.ts`** color + (if needed) radius values to point at bento tokens. Illustrative mapping:

| token                        | before                        | after                                                                                     |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `surface`                    | `var(--sl-color-bg-nav)`      | `var(--bento-cell-bg, var(--sl-color-black))`                                             |
| `surfaceAlt`                 | `var(--sl-color-gray-5)`      | elevated bento surface (e.g. `color-mix(in srgb, var(--sl-color-white) 4%, transparent)`) |
| `border`                     | `var(--sl-color-hairline)`    | `var(--bento-hairline-strong)`                                                            |
| `primary`                    | `var(--sl-color-accent)`      | `var(--sl-color-accent-high)`                                                             |
| `primaryDeep`                | `var(--sl-color-accent-high)` | keep / accent-high                                                                        |
| `bg`, `bgSubtle`             | current                       | bento black tokens                                                                        |
| `success`/`danger`/`warning` | hex                           | unchanged (semantic)                                                                      |

Effect: **every adapter's cards, rows, StatGrid, and StreamView chrome reskin to bento at once**, because they all render through these tokens on web. Native `theme.ts` is untouched → the mobile app is unaffected.

Verification: `nx run astro-kbve:check`, then visual on any DashRN surface in both light and dark themes.

### Phase 2 — Shell + pilot page conversions

**Bento shell pattern** (per page):

```
BentoShell (eyebrow + heading + reveal, from src/components/hero/BentoShell.astro)
  └─ bento-frame
       └─ <ReactXxxDashRN client:only="react" />   // the rnweb bridge
```

Replace the legacy `AstroXxxDashboard.astro` body (which mounts `React*.tsx`) with this shell + the `rnweb/*DashRN` bridge.

**Pilot A — Argo (complex):** `AstroArgoDashboard.astro` → `BentoShell` + `ReactArgoDashRN`. Exercises the hard path: summary stats + a large grouped/virtualized table (`StreamView layout="rows"`) + expandable detail. This is the representative "stats + table + detail" shape most pages share, so it validates the vocabulary for rollout.

**Pilot B — Home:** keep the bento shell already applied this session (`AstroDashboardHome.astro` / `AstroAlertsSummary.astro`). No RN adapter exists for the home summary; it stays legacy-but-bento-shelled. (Optionally, later, a summary adapter can replace the legacy service cards.)

### Rollout (post-pilot, separate plans)

Pages with an existing adapter — **forgejo, edge, vm, clickhouse, grafana, rows, deployment, factorio, minecraft** — each convert to the same shell + DashRN pattern, one plan (or a small batch) at a time. Each needs its `rnweb/*DashRN.tsx` bridge (Argo + Grafana bridges exist; others created per rollout).

Pages with no adapter — Kanban, IDE (CodeIDE), Settings, NxReport, Home service-cards, Alerts — remain legacy; either className-migrated to bento.css or given new adapters in future work. Out of scope here.

## Native parity (deferred — decision needed)

Making the **native** (Expo) dashboard render the same bento palette, scoped to the dashboard only (without reskinning the whole mobile app), is expensive:

- The dash layer imports `tokens` **statically** and builds `StyleSheet.create(...)` / `TONE_COLOR` maps at module scope across **13 files**: `StatGrid`, `StreamView`, `shared`, `types`, and the 10 `adapters/*`.
- Native has no CSS variables, so a scoped `ThemeProvider` bento-override only reaches these if all 13 are migrated from the static `tokens` import to `useTheme()`, with their module-scope `StyleSheet.create` moved into the component (memoized). That is presentation-only plumbing (no logic change) but a real, broad refactor and a perf-pattern change.
- Alternative (changing `theme.ts` values directly) reskins the entire mobile app, which is a non-goal.

**Recommendation:** ship Phase 1+2 (web parity with the site — the actual original goal) now; treat native dashboard palette parity as a separate, explicitly green-lit effort. Flag for user decision at review.

## Known limitations

- **Hover glow:** RN-web cards are styled via tokens (CSS-var values), not bento.css classes, so the per-card pointer-tracked accent glow used on the homepage board is not automatic. Cards get bento color/border/radius; accent-glow, if wanted, lives on the outer shell or a web-only wrapper — a later enhancement.
- **Decorative hex in adapters:** some adapters may hardcode non-semantic hex. Semantic status colors (green/amber/red) stay. During the pilot, scan adapters for any _decorative_ hex that clashes with the monochrome + gold language and route it through a token.

## Testing / verification

- `nx run astro-kbve:check` — typecheck + content schema (baseline already has 19 pre-existing unrelated errors; touched files must stay clean).
- Visual: `/dashboard/argo/` and `/dashboard/` in light + dark themes, and with `prefers-reduced-motion`.
- Confirm native build is unaffected (theme.ts untouched) — RN kit unit tests still pass (`nx test rn` or equivalent).

## Files touched (pilot)

- `packages/npm/rn/src/ui/theme.web.ts` — retheme (Phase 1).
- `apps/kbve/astro-kbve/src/components/dashboard/AstroArgoDashboard.astro` — bento shell + DashRN (Phase 2).
- Possibly a small addition to `apps/kbve/astro-kbve/src/components/rnweb/ReactArgoDashRN.tsx` if header/props need shell alignment (bridge already exists).
