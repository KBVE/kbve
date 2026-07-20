# `@kbve/rn/markets` Phase 3 — Admin Store + Personal Marketplace (`/dashboard/store/`, `/dashboard/market/`)

**Date:** 2026-07-20
**Scope:** `apps/kbve/astro-kbve` + `packages/npm/rn` — port the staff store-admin surface (`/dashboard/store/`) and the personal marketplace surface (`/dashboard/market/`) into the `@kbve/rn/markets` universal composition + bento splash + Commerce rail, completing the unified customer-vs-admin store+market view. Mirrors the shipped Phase 1 `/store/` (PR #14338) and Phase 2 `/market/` (PR #14398). See [[project_rn_markets_store]].

Final phase of the store+market epic. Phase 1 = customer `/store/` (done). Phase 2 = customer `/market/` (done). **This = Phase 3, the admin/personal half.**

## Decisions (locked)

- **Two surfaces this phase:** admin `/dashboard/store/` (staff, `StoreAdmin` + `StaffOrderQueue`) and personal `/dashboard/market/` (`MarketProfileShell` = my listings / bids / watching). Both → `@kbve/rn/markets` + bento splash + Commerce gutter rail, matching the four-surface "all splash" requirement from Phase 1/2.
- **Accent:** admin store = **amber** (store family — `--bento-accent:#f59e0b; --bento-accent-2:#fbbf24; --bento-btn-fg:#1a1400`, same as `AstroStoreShell`). Personal market = **violet** (market family — `--bento-accent:#a78bfa; --bento-accent-2:#22d3ee; --bento-btn-fg:#1a1033`, same as `AstroMarketShell`).
- **Staff gate lives in the astro bridge** (dash pattern A): `ReactStoreAdminRN.tsx` gates with `useStore($isStaff)` from `@kbve/droid` (mirrors `ReactMinecraftDashRN`) → renders a `ShieldOff` "Staff Access Required" card when not staff, else mounts the RN admin view. The RN composition view itself is NOT staff-aware (takes `getToken`/`baseUrl`/`authenticated` only). Backend enforces 403 regardless. Personal market bridge is auth-gated only (no staff).
- **`baseUrl=''`** (public main origin) for both — store staff endpoints are `/api/v1/store/staff/*`, personal market is `/api/v1/market/me/*`, both on the public origin, NOT the dash proxy.
- **Commerce rail on `/dashboard/*` commerce routes:** add exact-root `/dashboard/store/` and `/dashboard/market/` branches to `MarkdownContent.astro` so they render the Commerce rail (Store | Marketplace | Wallet) instead of the generic Dashboard nav — unifying the commerce section. `marketNav.ts` gains a "Manage" group (Store Admin → `/dashboard/store/`, gated by `data-auth-visibility: staff`; My Marketplace → `/dashboard/market/`).
- **No browser `prompt`/`confirm`** (no RN equivalent, matches Phase 2 no-dialog rule): `StaffOrderQueue` advance-to-shipped reveals an inline tracking `FormField`; refund uses a two-tap "Refund → Confirm" toggle button (no `confirm()` dialog).

## Non-goals (deferred → Phase 4)

- `MCItemMarketSidecar` (public per-item widget on `/mc/items/` via `MCItemPanel.astro`) — stays old DOM; works, different section.
- `IdiotCard` three-fiber reveal (cosmetic, on customer `/store/` via `ReactStoreCard`) — stays old DOM; three-fiber RN port is its own effort.
- Expo mobile screens (`MarketsScreen`, admin screens).
- Old DOM `components/{store,market}/*` + `store.css`/`market.css` — KEPT (still power the sidecar, IdiotCard, `AstroMarketAccountSummary` DOM widget). Do not sweep.
- No new axum routes; consume existing `/api/v1/store/staff/*` + `/api/v1/market/me/*`.

## API deltas to add

### Store — extend `createStoreApi` (`markets/store/api.ts`) with staff methods

All authed (throw `StoreApiError('Not signed in', 401)` before fetch when token null). Backend returns 403 for non-staff.

| Method | Endpoint | HTTP | Body | Returns |
|---|---|---|---|---|
| `staffUpsertProduct(body)` | `/api/v1/store/staff/products` | POST | `StaffProductBody` | `{ id: string }` |
| `staffSetProductStatus(id, status)` | `/api/v1/store/staff/products/{id}/status` | POST | `{ status }` | void |
| `staffUpsertVariant(id, body)` | `/api/v1/store/staff/products/{id}/variants` | POST | `StaffVariantBody` | `{ id: string }` |
| `staffSetVariantStatus(id, status)` | `/api/v1/store/staff/variants/{id}/status` | POST | `{ status }` | void |
| `staffListOrders(status?)` | `/api/v1/store/staff/orders` (`?status=`) | GET | — | `StoreOrderStaff[]` |
| `staffAdvanceOrder(id, body)` | `/api/v1/store/staff/orders/{id}/advance` | POST | `{ to_status, tracking?, note? }` | void |
| `staffRefundOrder(id, reason?)` | `/api/v1/store/staff/orders/{id}/refund` | POST | `{ reason }` | void |
| `staffSubmitPod(id)` | `/api/v1/store/staff/orders/{id}/submit-pod` | POST | — | `{ order_id, external_id }` |

New types in `markets/store/types.ts`: `StaffProductBody` {slug,title,description?,price,fulfillment?,asset_ref?,status?}; `StaffVariantBody` {sku,attributes?,price,stock?,status?}; `StoreOrderStaff = StoreOrder & { account_id: string; shipping_address: Record<string,unknown> }`. (`StoreOrder`/`StoreVariant`/`StoreProductDetail`/`OrderStatus`/`Fulfillment`/`ShippingAddress` already exist.) Staff methods do NOT inject `idempotency_key` (mutations are keyed by target id).

### Market — extend `createMarketApi` (`markets/market/api.ts`) with personal methods

| Method | Endpoint | HTTP | Cursor params | Returns |
|---|---|---|---|---|
| `myListings(c?)` | `/api/v1/market/me/listings` | GET | `limit`, `before_created_at`, `before_id` | `MyListing[]` |
| `myBids(c?)` | `/api/v1/market/me/bids` | GET | `limit`, `before_placed_at`, `before_id` | `MyBid[]` |

Both authed. `MyListing`/`MyBid`/`Cursor` already in `markets/market/types.ts`; add a `BidCursor` (`limit`, `before_placed_at`, `before_id`) for `myBids`.

## RN composition — new views

### `markets/store/StoreAdminView.tsx`

`StoreAdminView({ getToken, baseUrl, authenticated })` — builds `api = createStoreApi`. Two stacked bento sections:
- **Catalog admin** (port of `StoreAdmin.tsx`): products list (each with a Retire `Button` → `staffSetProductStatus(id,'retired')`); upsert-product form (`FormField` slug/title/price, `Select` fulfillment, `FormField` description → `staffUpsertProduct`); upsert-variant form (`Select` product, `FormField` sku/price/stock/attrs-JSON → `staffUpsertVariant`) + variant list w/ Retire.
- **Order queue** (port of `StaffOrderQueue.tsx`): `staffListOrders()` list; per order Submit-POD (when `paid`), advance following `NEXT` map (paid→processing→shipped→delivered; advancing to `shipped` reveals an inline tracking `FormField`), two-tap Refund. No `prompt`/`confirm`.

`!authenticated` → "Sign in as staff." `Text`. Errors map 403→"Staff permissions required.", 401→"Sign in as staff." RN primitives imported **relative** (`../../ui/...`).

### `markets/market/MarketProfileView.tsx`

`MarketProfileView({ getToken, baseUrl, authenticated })` — builds `api = createMarketApi`. Port of `MarketProfileShell.tsx`: 3-tab (`listings`/`bids`/`watching`) + refresh. `myListings({limit:50})` + `myBids({limit:50})`; bids tab resolves item_ref via `api.listingDetail` for thumbnails; watching tab reads the ported `watchlist` store (`getWatchList`/`removeFromWatch`/`subscribe`). Cards reuse `ItemIcon`/`EnchantList`; open `/market/listing/?id=`. `!authenticated` → "Sign in to view your marketplace activity." No staff gate. Tabs via a segmented control of `Button`s (active `variant`).

Both views appended to their sub-area barrels + `markets/index.ts` re-exports through `./store`/`./market`.

## Web bridges — astro-kbve

- `components/store/ReactStoreAdminRN.tsx` — `client:only="react"`; `useStore($isStaff)` from `@kbve/droid`; not-staff → `ShieldOff` card (mirror `ReactMinecraftDashRN`); staff → `<StoreAdminView getToken baseUrl='' authenticated>` (`getToken` via `initSupa`/`getSupa`, `authenticated` via `useSession`).
- `components/market/ReactMarketProfileRN.tsx` — `client:only="react"`; injects `getToken`/`authenticated`/`baseUrl=''`; renders `<MarketProfileView>`. No staff gate.

Both import `@kbve/rn/markets` bare (out-of-project importer — correct; NOT relative).

## Astro chrome

- `components/store/AstroStoreAdminShell.astro` → bento splash: amber accent + backdrop; `bento-hero` (badge "Staff", title "Store Admin", lede, CTA `#admin` + `/store/`); one `<BentoShell id="admin">` wrapping `<ReactStoreAdminRN client:only>` + `RnDashSkeleton` (`rnsk`) fallback + reserved height. RAW CSS `<style is:global>` (NOT the MDX template-literal form — [[project_rn_markets_store]] GOTCHA 2).
- `components/market/AstroMarketProfileShell.astro` → bento splash: violet accent; `bento-hero` (badge "You", title "My Marketplace", CTA `#profile` + `/market/`); `<BentoShell id="profile">` wrapping `<ReactMarketProfileRN client:only>` + skeleton fallback.
- `content/docs/dashboard/store/index.mdx` → add `template: splash` (currently plain dashboard shell); keep `sidebar.attrs.data-auth-visibility: staff`.
- `content/docs/dashboard/market.mdx` → already `template: splash`; verify it renders the new bento shell.
- `components/market/marketNav.ts` → add a "Manage" group: Store Admin (`/dashboard/store/`, `data-auth-visibility: staff`) + My Marketplace (`/dashboard/market/`).
- `components/starlight/MarkdownContent.astro` → add exact-root branches `norm(p)==='/dashboard/store/'` and `norm(p)==='/dashboard/market/'` → Commerce rail (`MARKET_NAV`), so these commerce routes get Store|Marketplace|Wallet|Manage instead of the generic Dashboard nav. Guard ordering: these exact-root checks must precede the generic `isDashboard` prefix branch.

## Verification (Phase 3)

- `nx lint rn` clean (new views — relative imports, no boundary violations, no `no-empty`, no `prompt`/`confirm`).
- markets vitest suite green: existing (store + market) + new `staff` api cases + `myListings/myBids` cases + `StoreAdminView`/`MarketProfileView` render tests.
- `astro build` EXIT 0; `/dashboard/store/` renders splash + amber bento-hero + Commerce rail (Manage group, staff link visible to staff) + `ReactStoreAdminRN` island (ShieldOff for non-staff) + `rnsk` fallback; `/dashboard/market/` renders splash + violet bento-hero + Commerce rail + `ReactMarketProfileRN` island (3 tabs) + fallback.
- Built `ReactStoreAdminRN`/`ReactMarketProfileRN` chunks: 0 `vector-icons`.

## Files

- **New:** `packages/npm/rn/src/markets/store/StoreAdminView.tsx`; `market/MarketProfileView.tsx`; `apps/kbve/astro-kbve/src/components/store/ReactStoreAdminRN.tsx`, `components/market/ReactMarketProfileRN.tsx`; test files under `markets/{store,market}/__tests__/`.
- **Edit:** `markets/store/{api,types,index}.ts`; `markets/market/{api,types,index}.ts`; `apps/kbve/astro-kbve/src/components/store/AstroStoreAdminShell.astro`, `components/market/AstroMarketProfileShell.astro`, `marketNav.ts`; `components/starlight/MarkdownContent.astro`; `content/docs/dashboard/store/index.mdx`.
