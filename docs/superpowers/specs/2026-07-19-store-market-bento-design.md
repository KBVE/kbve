# Store & Market → Bento Ecosystem

**Date:** 2026-07-19
**Scope:** `apps/kbve/astro-kbve` — migrate `/store/` and `/market/` into the bento shell/rail ecosystem used by dashboard, application, and projects. Wrapper-only (React islands untouched).

## Goal

`/store/` and `/market/` currently render bespoke flex shells (`kbve-store` / `kbve-market`, `kbve-dashboard-page`) inside the Starlight docs sidebar. Bring them into the same visual system as `/application/`, `/dashboard/`, `/projects/`: full-bleed **splash** pages, a shared **Commerce gutter rail** (like the application/osrs/mc rails), and **bento hero + BentoShell** section chrome around the existing live React islands.

Interactive React islands (`BuyCredits`, `ReactStoreCard`, `StoreCatalog`, `OrderHistory`, `MarketCreateForm`, `MarketBrowse`) are **not** modified — only their surrounding Astro chrome changes. Card interiors can be polished to `bento-card--glass` in a later pass.

## Architecture (existing, reused)

`components/dashboard/MarkdownContent.astro` is the Starlight `MarkdownContent` override. It matches `Astro.url.pathname` against known route prefixes and, on a match, wraps the page in the `dash-shell` gutter-rail grid (`dash-grid` = 15rem rail + main, top/bottom breadcrumb bands, `DashboardGutterNav` rail). Each domain contributes one nav-data module (`applicationNav.ts`, `osrsNav.ts`, …) and one branch in the `shell` selection chain. `template: splash` frontmatter and the gutter rail coexist — `/dashboard/` (splash) already gets the rail.

Nav data shape: `DashboardNavGroup[] | DashboardNavItem[]` from `dashboardNav.ts` (`label`, `href`, `icon` SVG path `d`, `copy`, `visibility?: 'auth'|'staff'`, group `eyebrow`). Breadcrumbs via `buildBreadcrumbIn(nav, root, pathname)`; active state via `isActiveIn(rootHref, pathname, href)`.

Bento chrome: `BentoShell.astro` (`eyebrow`/`heading`/`id` → `bento-shell` section with `bento-frame` inner + reveal-on-scroll). `bento.css` supplies `bento-hero`, `bento-board`, `bento-card--glass`, `bento-btn`, `bento-chip`, `bento-stat`, accent tokens (`--bento-accent`, `--bento-accent-2`, `--bento-btn-fg`). Pattern reference: `content/docs/application/index.mdx`.

## Changes

### 1. New nav module — `components/market/marketNav.ts`

Mirrors `applicationNav.ts`. Reuses types + `buildBreadcrumbIn` / `isActiveIn` from `../dashboard/dashboardNav`.

```ts
export const STORE_ROOT:  DashboardNavItem = { label: 'Store',       href: '/store/'  };
export const MARKET_ROOT: DashboardNavItem = { label: 'Marketplace', href: '/market/' };

export const MARKET_NAV: DashboardNavEntry[] = [
  { label: 'Commerce', eyebrow: 'Buy & trade', href: '/store/', icon: <bag>, items: [
      { label: 'Store',       href: '/store/',  icon: <bag>,  copy: 'Spend credits on collectibles.' },
      { label: 'Marketplace', href: '/market/', icon: <tag>,  copy: 'Player listings settled in KHash.' },
  ]},
  { label: 'Wallet', visibility: 'auth', href: '/dashboard/account/', icon: <wallet>, items: [
      { label: 'Account & Credits', href: '/dashboard/account/', icon: <wallet> },
      { label: 'Orders',            href: '/store/#orders',       icon: <receipt> },
  ]},
];

export const buildStoreBreadcrumb  = (p: string) => buildBreadcrumbIn(MARKET_NAV, STORE_ROOT,  p);
export const buildMarketBreadcrumb = (p: string) => buildBreadcrumbIn(MARKET_NAV, MARKET_ROOT, p);
```

Single shared `MARKET_NAV` → identical rail on both pages (the "ecosystem" cross-link). Icons are 24×24 stroke SVG path `d` strings, matching existing nav modules.

### 2. Wire `MarkdownContent.astro`

Add detection + shell config alongside the existing chain. Match the two landing roots **exactly** so dynamic market routes that render their own shells — profile (`/market/@user/`) and listing detail (`/market/<id>/`) via `AstroMarketProfileShell` / `AstroMarketDetailShell` — are not captured:

```ts
const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
const isStore  = norm(pathname) === '/store/';
const isMarket = norm(pathname) === '/market/';
```

(Sub-pages can opt into the rail later by widening these matches.)

Both branches: `entries: MARKET_NAV`, `collapsible: true`, `withToc: true`; store branch uses `STORE_ROOT` + `buildStoreBreadcrumb` + `navLabel:'Commerce'` + `menuLabel:'Commerce menu'`; market branch uses `MARKET_ROOT` + `buildMarketBreadcrumb` + same labels.

### 3. Frontmatter — `store/index.mdx` + `market/index.mdx`

Add `template: splash`. Keep existing `title`/`description`/`tags`. Drop `tableOfContents`/`graph` as needed to match splash pages. The rail + breadcrumbs come from the override, not the Starlight sidebar.

### 4. Rewrite the two shells (wrapper-only)

`AstroStoreShell.astro` and `AstroMarketShell.astro` — replace the `kbve-store`/`kbve-market` flex markup with bento chrome; keep the React island imports and `client:only="react"` usages verbatim; keep `import './store.css'` / `'./market.css'` for island internals.

Structure (both):
- Outer `<div class="app-hub" style="--bento-hero-bg:url(<backdrop>)">` carrying accent tokens.
- `bento-hero` section: badge chip, `bento-title` + accent span, `bento-lede`, `bento-cta` buttons, static feature `bento-stat` tiles (no live numbers — e.g. Store: "Own your items" / "Trade later" / "Credits → items"; Market: "Settled in KHash" / "1% Treasury fee" / "Escrow bids").
- Each island in its own `<BentoShell eyebrow heading id>`:
  - **Store:** `credits`→`<BuyCredits/>`, `featured`→`<ReactStoreCard/>`, `products`→`<StoreCatalog/>`, `orders`→`<OrderHistory/>` (`id="orders"` — breadcrumb/rail Orders anchor targets it).
  - **Market:** `sell`→`<MarketCreateForm/>` (promoted out of the `<details>`), `listings`→`<MarketBrowse/>`. Keep the `data-kbve-search-trigger` Ctrl+K button inside the hero CTA row.
- Accent tokens via a page `<style is:global>`: Store `--bento-accent:#fbbf24; --bento-accent-2:#f59e0b; --bento-btn-fg:#3a2a05`. Market `--bento-accent:#a78bfa; --bento-accent-2:#22d3ee; --bento-btn-fg:#1a1033`.

## Non-goals (YAGNI)

- No changes to any `.tsx` island logic or internal card CSS.
- No new sub-pages under `/store/` or `/market/`.
- No retirement of `store.css` / `market.css` (kept for island internals).
- Dynamic market profile/detail shells untouched.

## Verification

- `nx run` build/check for `astro-kbve` passes.
- `/store/` and `/market/` render splash + Commerce rail + bento hero; islands still mount and function (buy credits, catalog, orders / create listing, browse).
- Rail active-state highlights the current page; Wallet group hidden when unauthenticated (`visibility:'auth'`).
- Dynamic routes (`/market/<id>/`, `/market/@user/`) still render their own shells, no Commerce rail.
- Breadcrumbs: `Store` on /store/, `Marketplace` on /market/.

## Files

- **New:** `apps/kbve/astro-kbve/src/components/market/marketNav.ts`
- **Edit:** `components/dashboard/MarkdownContent.astro`, `components/store/AstroStoreShell.astro`, `components/market/AstroMarketShell.astro`, `content/docs/store/index.mdx`, `content/docs/market/index.mdx`
