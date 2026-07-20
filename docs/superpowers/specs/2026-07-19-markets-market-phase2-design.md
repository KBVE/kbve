# `@kbve/rn/markets` Phase 2 — Customer Marketplace (`/market/`)

**Date:** 2026-07-19
**Scope:** `apps/kbve/astro-kbve` + `packages/npm/rn` — port the customer marketplace (`/market/` browse+sell, `/market/listing/` detail) into the `@kbve/rn/markets` universal composition + bento splash + Commerce rail, exactly mirroring the shipped Phase 1 `/store/` ([[project_rn_markets_store]], PR #14338).

Part of the store+market epic (spec `2026-07-19-store-market-bento-design.md`). Phase 1 = `/store/` (done). **This = Phase 2, customer `/market/`.** Phase 3 (deferred) = admin/personal (`/dashboard/store/` staff, `/dashboard/market/` personal) + Expo mobile.

## Decisions (locked with user)

- **Naming:** routes stay `/market/` + `/market/listing/`; display label "Marketplace"; rn sub-area `@kbve/rn/markets/market/*`. No renames/redirects.
- **All four surfaces = splash** (Starlight sidebar removed) + the **Commerce gutter rail** (Store | Marketplace | Wallet), same as Phase 1 `/store/`. Not pure full-bleed.
- **Accent:** market = **violet** `--bento-accent:#a78bfa; --bento-accent-2:#22d3ee; --bento-btn-fg:#1a1033`.
- **Sequencing:** customer `/market/` now; admin/personal later (Phase 3).

## Phase 0 (in this phase) — Phase 1 lint retrofit

Phase 1's `markets/store/*` imports UI via `@kbve/rn/ui/...` **subpath** specifiers. Inside the `rn` project, `@nx/enforce-module-boundaries` rejects a project importing itself by package subpath. Fix: rewrite to **relative** (`../../ui/primitives/Button`) — equally web-safe (still bypasses the barrel that pulls `@expo/vector-icons`). `nx lint rn --fix` rewrites these automatically. Also replace any bare `catch {}` with `catch { void 0; }` (`no-empty`, and the no-comments rule forbids `/* ignore */`). All new Phase 2 rn code uses relative UI imports + `catch { void 0; }` from the start.

## Existing architecture reused

Identical to Phase 1: injected `create*Api({getToken, baseUrl})` factory (mirrors `dash/mc` `createRconExec`); RN components from `@kbve/rn/ui` primitives (imported **relative** inside rn); `client:only` astro bridges injecting Supabase token (`initSupa`/`getSupa`), `baseUrl=''` (public origin `/api/v1/market/*`), no staff gate (marketplace is public); bento `AstroMarketShell` (hero + `BentoShell` + `RnDashSkeleton` fallback); Commerce rail via `MarkdownContent.astro` (the `isMarket` branch + `marketNav` already exist from Phase 1 — Phase 2 only adds `template: splash` to `market/index.mdx`). Detail route `/market/listing/` already sets `sidebar: hidden`.

## Market API (from `components/market/api.ts`, to port into the composition)

Public: `listActive(cursor)` → `MarketListing[]` (`GET /api/v1/market/listings?limit&before_created_at&before_id`); `listingDetail(id)` → `MarketListingDetail`.
Authed: `myListings(cursor)`, `myBids(cursor)`, `createListing({src_item_id, qty, buy_now_price, min_bid, expires_at, idempotency_key})`, `placeBid(id, {amount, idempotency_key})`, `buyNow(id, {idempotency_key})`, `cancelListing(id, {reason})`. Currency = KHash; auctions have escrow bids + buy-now + expiry; 1% Treasury fee. `MarketApiError` (status/code).

## Changes

### A. RN composition — `packages/npm/rn/src/markets/market/`

```
market/
  index.ts          # barrel (named exports); markets/index.ts re-exports ./market
  types.ts          # MarketListing, MarketListingDetail, MyListing, MyBid, IdResponse, ListingStatus, BidStatus, Cursor
  api.ts            # createMarketApi({getToken, baseUrl}) -> MarketApi (public + authed, injects idempotency_key)
  format.ts         # KHash/price formatting (port of components/market/format.ts)
  countdown.ts      # expiry countdown formatting + a useCountdown hook (port of components/market/countdown.ts)
  ItemIcon.tsx      # item thumbnail (mc-texture CDN + onError fallback chain; RN Image; solid-color kind tile instead of CSS gradient)
  EnchantList.tsx   # compact enchant chips (port of components/market/enchants.ts + EnchantList.tsx)
  ListingCard.tsx   # one listing tile (item, current bid / buy-now, countdown, watch)
  MarketBrowse.tsx  # active-listings grid + kind filter + cursor "load more" + live countdown
  MarketCreateForm.tsx # sell: raw item-id (UUID) field + qty/buy-now/min-bid + expiry-duration Select -> createListing
  ListingDetail.tsx # bid / buy-now / cancel + bid history + countdown + owner/bidder states
  WatchToggle.tsx   # local watchlist toggle (port of watchlist.ts storage)
  MarketView.tsx    # MarketView({getToken, baseUrl, authenticated}) = browse + sell
  ListingDetailView.tsx # ListingDetailView({id, getToken, baseUrl, authenticated})
  __tests__/        # api.test.ts, MarketBrowse.test.tsx, ListingDetail.test.tsx (TDD)
```

`createMarketApi` mirrors `createStoreApi` exactly (shared error/idempotency patterns). Components use RN primitives imported **relative** (`../../ui/primitives/*`, `../../ui/controls/Select`, `../../ui/theme`). Reuse the store sub-area's `newIdempotencyKey`/`notifyWalletRefresh` from `../store` (or promote them to a shared `markets/shared.ts` — decide in planning to avoid a store↔market coupling; promoting to `markets/shared.ts` and having store re-export is cleaner). Cursor pagination in `MarketBrowse` = "Load more" appending pages. Countdown = a `useCountdown(expiresAt)` hook ticking once/second, cleaned up on unmount.

package.json: `@kbve/rn/markets` export already exists (Phase 1). No new subpath — `market/` ships under the existing `markets` barrel. tsconfig aliases already present.

### B. Web bridges — astro-kbve

- `components/market/ReactMarketRN.tsx` — `client:only`, injects `getToken` (Supabase) + `authenticated` (useSession), `baseUrl=''`, renders `<MarketView>`.
- `components/market/ReactMarketDetailRN.tsx` — reads the listing id from the URL (`?id=`), renders `<ListingDetailView id=... >`. Public browse; bid/buy/cancel show sign-in affordances when unauthenticated.

### C. Astro chrome

- `AstroMarketShell.astro` → bento: `app-hub`/`market-hub` wrapper + violet accent + backdrop; `bento-hero` (badge, title, lede, CTA `#market` + `/store/`, static KHash/fee/escrow stat tiles); one `<BentoShell id="market">` wrapping `<ReactMarketRN client:only>` + `RnDashSkeleton` fallback + reserved height. Keep the Ctrl+K search trigger in the hero.
- `AstroMarketDetailShell.astro` → bento: a `BentoShell` wrapping `<ReactMarketDetailRN client:only>` + skeleton fallback (route already `sidebar: hidden`; keep it full-width).
- `content/docs/market/index.mdx` → add `template: splash`.

### D. Phase 0 lint retrofit

`nx lint rn --fix` over `packages/npm/rn/src/markets/store/**` (relative UI imports + `catch { void 0; }`); commit separately as the first task. Verify `nx lint rn` clean afterward.

## Non-goals (YAGNI / Phase 3)

- `/dashboard/store/` (staff admin: `StoreAdmin`, `StaffOrderQueue`) and `/dashboard/market/` (personal `MarketProfileShell`) stay old DOM this phase.
- No new axum routes; consume existing `/api/v1/market/*`.
- Expo mobile screens.
- `IdiotCard`-style flourishes.
- Old DOM `components/market/*` kept until Phase 3 retires their last importer (`market.css` still referenced by admin/profile shells — do not sweep).

## Verification (Phase 2)

- `nx lint rn` clean (Phase 0 retrofit + new market code — relative imports, no boundary violations, no `no-empty`).
- markets vitest suite green (existing store 13 + new market api/browse/detail tests).
- `astro build` EXIT 0; `/market/` renders splash (sidebar-pane=0) + bento-hero + Commerce rail (Marketplace active) + `ReactMarketRN` island hydration + `rnsk` fallback; `/market/listing/?id=N` renders the detail island.
- Built `ReactMarketRN`/`ReactMarketDetailRN` chunks: 0 `vector-icons` (web-graph clean).
- Live-hydration proxy: build-compiles-island + clean chunk + SSR fallback (Playwright optional).

## Files (Phase 2)

- **New:** `packages/npm/rn/src/markets/market/**`; `apps/kbve/astro-kbve/src/components/market/ReactMarketRN.tsx`, `ReactMarketDetailRN.tsx`
- **Edit:** `packages/npm/rn/src/markets/index.ts` (re-export `./market`); `packages/npm/rn/src/markets/store/**` (Phase 0 lint retrofit); `apps/kbve/astro-kbve/src/components/market/AstroMarketShell.astro`, `AstroMarketDetailShell.astro`; `apps/kbve/astro-kbve/src/content/docs/market/index.mdx`
