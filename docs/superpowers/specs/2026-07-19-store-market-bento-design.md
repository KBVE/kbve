# Store & Market → `@kbve/rn/markets` + Bento Ecosystem (Epic)

**Date:** 2026-07-19
**Scope:** `apps/kbve/astro-kbve` + `packages/npm/rn` — rebuild `/store/` and `/market/` as a universal React Native composition (`@kbve/rn/markets`) rendered on web via the rn-astro bridge (same pattern as the `dash/*` dashboards), wrapped in the bento shell/rail ecosystem, and reused as Expo mobile screens.

Supersedes the earlier "wrapper-only, DOM islands in bento" draft: the chrome (splash + Commerce rail + bento hero/shells) is unchanged, but the **island content** moves from astro-kbve React-DOM components to `@kbve/rn/markets` universal components.

## Why

Today store + market are React-DOM-only, living in `apps/kbve/astro-kbve/src/components/{store,market}/*.tsx` (hitting axum via `@/lib/apiFetch`, `useSession` from `@kbve/astro`). Porting them into `@kbve/rn/markets` makes the commerce UI **universal** — one component library that renders on web (react-native-web via [[project_rn_web_astro_bridge]]) and in the Expo mobile app (see [[project_kbve_react_native]]) — mirroring how `@kbve/rn/dash` unified the monitoring dashboards ([[project_rn_dash_kit]], [[project_rn_dash_mc_gameops_parity]]).

`@kbve/rn/markets` is a **new composition family**, not a `dash/` adapter — `dash/` is a poll-based monitoring stream kit (T/t/n, VirtualList); commerce is transactional (checkout modals, forms, escrow bids).

Naming: `@kbve/rn/store` is already taken by the KV persistence layer, so the umbrella subpath is **`@kbve/rn/markets`** (sub-areas `markets/store/*`, `markets/market/*`).

## Phasing (each phase = its own plan → SDD)

- **Phase 1 — Foundation + Store (web).** `@kbve/rn/markets` scaffold, `markets/store/` port, web bridge, `/store/` wrapped in bento + Commerce rail + splash. **This spec details Phase 1.**
- **Phase 2 — Marketplace (web).** `markets/market/` port (Browse/Create/Detail/Watch, escrow bids), `/market/` wrapped.
- **Phase 3 — Mobile.** Expo `MarketsScreen`(s) in the RN app, nav/tab wiring.

Out of every phase: staff admin surfaces (`StoreAdmin`, `StaffOrderQueue`, `AstroStoreAdminShell`) — they live under `/dashboard/store/` and stay React-DOM for now.

## Existing architecture reused

- **Composition template** = `packages/npm/rn/src/dash/mc/`: injected `createRconExec({getToken, baseUrl})` factory (resolves-never-throws), `McView({getToken, baseUrl})` props, NAMED-only barrel `index.ts`, `useStream`/`StatGrid`/`Stack`/`Text`/`tokens` from the web-safe `../ui` barrel (no nav/`@expo/vector-icons`).
- **Web bridge** = `components/rnweb/ReactMinecraftDashRN.tsx`: wires `getToken` (`initSupa`/`getSupa` → `session.access_token`), gate via `homeService.$isStaff`, `baseUrl={DASH_PROXY_BASE}`, renders `<McView client:only>`. Store's API is the **public main origin** (`/api/v1/store/*`, `apiFetch` relative) → `baseUrl=''`, **not** the dash proxy.
- **CLS fallback** = `components/dashboard/RnDashSkeleton.astro` as `slot="fallback"` + reserved wrapper height (bridge point 6 of [[project_rn_web_astro_bridge]]).
- **Rail/chrome** = `components/dashboard/MarkdownContent.astro` route→shell router; `BentoShell.astro`; `bento.css` hero/board/card/stat/accent tokens; pattern page `content/docs/application/index.mdx`.
- **rn-web vite wiring** already present in `astro.config.mjs` (alias `react-native`→`react-native-web`, `.web.*` resolve, optimizeDeps reanimated/svg/worklets, RN global defines). New `@kbve/rn/markets` subpath inherits it; barrel must stay web-safe (no vector-icons in the island graph).

## Phase 1 changes

### A. RN composition — `packages/npm/rn/src/markets/`

```
markets/
  index.ts            # barrel, NAMED exports only, web-safe
  store/
    index.ts
    api.ts            # createStoreApi({getToken, baseUrl}) factory
    types.ts          # StoreProduct, StoreVariant, StoreEntitlement, StoreOrder, CreditPack, ShippingAddress...
    StoreView.tsx     # StoreView({ getToken, baseUrl, authenticated })
    BuyCredits.tsx    # CREDIT_PACKS -> topupCheckout -> openCheckout
    StoreCatalog.tsx  # catalog() grid of ProductCard
    ProductCard.tsx   # port of ReactStoreCard (featured + catalog cell)
    OrderHistory.tsx  # myOrders() + myEntitlements()
    CheckoutModal.tsx # physical buy: qty + ShippingAddress form -> buyPhysical
    openCheckout.ts / openCheckout.web.ts  # native Linking.openURL / web window.location.href
```

- **`createStoreApi({ getToken, baseUrl })`** mirrors `createRconExec`. Wraps the routes from `store/api.ts`: public/tokenless — `catalog` (`GET /api/v1/store/products`), `productDetail`; authed (Bearer from `getToken`) — `myEntitlements`, `buyProduct`, `myOrders`, `buyPhysical`, `topupCheckout`. Typed `StoreApiError` (status-aware: 401 → "Sign in", 503 → "not available yet"). Auth calls that lack a token surface a typed "Not signed in" error rather than firing.
- **Components** use RN primitives (`View`/`Pressable`/`StyleSheet`) + `@kbve/rn/ui` kit (`Stack`, `Text`, `Button`, `tokens`) — no DOM, no `@kbve/astro`. `authenticated` (reactive) and `getToken` are injected from the host, replacing `useSession()`.
- **`openCheckout`** platform-splits the Stripe redirect: `.web.ts` → `window.location.href`; native → `Linking.openURL`.
- **`StoreView`** composes BuyCredits + featured ProductCard + StoreCatalog + OrderHistory; a shared `useMemo(() => createStoreApi({getToken, baseUrl}), …)`.
- **package.json**: add `"./markets": { types/import → ./src/markets/index.ts }`. Keep barrel free of the vector-icons graph (verify with focused esbuild + metafile grep, per bridge point 7).

### B. Web bridge — `apps/kbve/astro-kbve/src/components/store/ReactStoreRN.tsx`

`client:only="react"` island. Wires `getToken` (`initSupa`/`getSupa` → `access_token`, same as mc), `authenticated` (from `@kbve/astro` `useSession` or a nanostore), `baseUrl=''` (public origin). Renders `<StoreView ... />`. Unauthenticated users still see catalog; buy/orders show sign-in affordances (no staff gate — store is public).

### C. Astro chrome — `AstroStoreShell.astro`

Rewrite to bento (keeps the earlier design's hero/shell/accent/rail decisions):
- Outer `app-hub` div + Store accent tokens (**amber**: `--bento-accent:#fbbf24; --bento-accent-2:#f59e0b; --bento-btn-fg:#3a2a05`) + backdrop.
- `bento-hero` (badge, title, lede, CTA, static feature `bento-stat` tiles).
- **One** `<ReactStoreRN client:only="react">` island (the whole `StoreView`) inside a single primary `<BentoShell>`, with `RnDashSkeleton` `slot="fallback"` + reserved height — matching the dashboards' single-island model (one heavy RN mount, not four). `StoreView` renders its own internal sections (buy credits, featured, catalog, orders) via RN `Stack`; the `#orders` anchor for the rail's Orders link is set on the BentoShell `id`.
- Retire `store.css` usage from the shell (island styling now lives in RN `StyleSheet`); the file stays until Phase 1 removes its last DOM importer.

### D. Commerce rail + splash (from the superseded draft, still in scope)

- **New** `components/market/marketNav.ts`: shared `MARKET_NAV` (`DashboardNavGroup[]`, reuses `buildBreadcrumbIn`/`isActiveIn` from `dashboardNav`). `STORE_ROOT`/`MARKET_ROOT`; group **Commerce** → Store `/store/`, Marketplace `/market/`; group **Wallet** (`visibility:'auth'`) → Account & Credits `/dashboard/account/`, Orders `/store/#orders`. `buildStoreBreadcrumb`/`buildMarketBreadcrumb`.
- **Wire** `MarkdownContent.astro`: exact-root match so dynamic market routes keep their own shells —
  ```ts
  const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  const isStore  = norm(pathname) === '/store/';
  const isMarket = norm(pathname) === '/market/';
  ```
  Both branches use `MARKET_NAV`, `collapsible:true`, `withToc:true`; differ in root/breadcrumb/labels (`navLabel:'Commerce'`).
- **Frontmatter**: add `template: splash` to `store/index.mdx` (Phase 2 adds it to `market/index.mdx`).

## Non-goals (YAGNI)

- No changes to axum routes; consume existing `/api/v1/store/*`.
- Marketplace port + mobile screens (Phases 2–3).
- Staff admin surfaces stay React-DOM under `/dashboard/store/`.
- No new store sub-pages under `/store/`.

## Verification (Phase 1)

- `@kbve/rn` markets barrel is web-graph clean (focused esbuild + metafile grep = no `@expo/vector-icons`); `nx test rn` (pre-existing rn tsc noise excluded).
- astro-kbve build/check passes; `/store/` renders splash + Commerce rail + bento hero; `<StoreView>` island hydrates (headless Playwright, no `pageerror`) — catalog loads, buy-credits redirects to Stripe, orders list when authed.
- `RnDashSkeleton` SSR fallback present (`curl | grep` the shimmer class); no CLS on hydrate.
- Rail active-state highlights `/store/`; Wallet group hidden when unauthenticated; breadcrumb reads `Store`.
- Store API `baseUrl=''` hits the public origin (not the dash proxy).

## Files (Phase 1)

- **New:** `packages/npm/rn/src/markets/**` (barrel + `store/*`), `apps/kbve/astro-kbve/src/components/store/ReactStoreRN.tsx`, `apps/kbve/astro-kbve/src/components/market/marketNav.ts`
- **Edit:** `packages/npm/rn/package.json` (exports), `apps/kbve/astro-kbve/src/components/store/AstroStoreShell.astro`, `components/dashboard/MarkdownContent.astro`, `content/docs/store/index.mdx`
