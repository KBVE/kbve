# `@kbve/rn/markets` Phase 3 — Admin Store + Personal Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the staff store-admin (`/dashboard/store/`) and personal marketplace (`/dashboard/market/`) surfaces into the `@kbve/rn/markets` universal composition + bento splash + Commerce rail, completing the unified customer-vs-admin store+market view.

**Architecture:** Extend the shipped `createStoreApi`/`createMarketApi` factories with staff + personal endpoints, add two RN composition views (`StoreAdminView`, `MarketProfileView`), two `client:only` astro bridges (staff-gated via `useStore($isStaff)`; auth-gated), and bento splash shells + Commerce-rail routing. Mirrors Phase 1 `/store/` and Phase 2 `/market/`.

**Tech Stack:** React Native / react-native-web, `@kbve/rn/ui`, Astro + Starlight, vitest + @testing-library/react, Nx.

## Global Constraints

- **WT** = `/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/markets-admin-phase3` (already created off `origin/dev` @ c833daabcd; `node_modules` symlinked to main). **MAIN** = `/Users/alappatel/Documents/GitHub/kbve`.
- **Tests (vitest-direct, NOT `nx test` in a worktree):** `cd $WT/packages/npm/rn && NX_DAEMON=false $MAIN/node_modules/.bin/vitest run <paths>`.
- **Lint:** `cd $WT/packages/npm/rn && NX_DAEMON=false $MAIN/node_modules/.bin/nx lint rn --skip-nx-cache` (needs ProjectGraph for `enforce-module-boundaries`). Autofix: append `--fix`.
- **Astro build:** `cd $WT/apps/kbve/astro-kbve && NX_DAEMON=false $MAIN/node_modules/.bin/astro build` (astro CLI direct).
- **Worktree only:** never edit/commit the main `dev` checkout; PRs → `dev`; never push `dev`/`main`. Never stage `node_modules`.
- **No code comments** anywhere. **No bare `catch {}`** → `catch { void 0; }`. **No browser `prompt`/`confirm`** (no RN equivalent) — use inline UI state.
- **Relative UI imports inside rn:** from `markets/store/*` and `markets/market/*`, import `@kbve/rn/ui` primitives by RELATIVE path (`../../ui/primitives/{Button,Text,Stack,Surface,Badge,FormField}`, `../../ui/controls/Select`, `../../ui/theme`). NEVER the `@kbve/rn/ui` barrel or the `@kbve/rn/ui/...` subpath specifier from inside rn.
- **Astro bridges import `@kbve/rn/markets` BARE** (out-of-project — correct).
- **Named exports only** in composition barrels.
- **baseUrl=''** (public main origin) for both bridges. Staff endpoints `/api/v1/store/staff/*`; personal `/api/v1/market/me/*`. NOT the dash proxy.
- **Error precedence (droid-match):** `message = j.message ?? j.error ?? j.detail`; `code = j.error` — the ported `createStoreApi`/`createMarketApi` `call()` already do this; new methods reuse the same `call()`.
- **Staff methods do NOT inject `idempotency_key`.**
- **Commit trailer:** end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; NO "Generated with Claude Code" line. Stage only named files with explicit `git add` (never `-A`).
- **Accent:** admin store = amber (`--bento-accent:#fbbf24; --bento-accent-2:#f59e0b; --bento-btn-fg:#3a2a05`, same vars as `AstroStoreShell`). Personal market = violet (`--bento-accent:#a78bfa; --bento-accent-2:#22d3ee; --bento-btn-fg:#1a1033`).

**Spec:** `docs/superpowers/specs/2026-07-20-markets-admin-phase3-design.md`. Pattern references (shipped): `packages/npm/rn/src/markets/store/{api.ts,StoreView.tsx}`, `markets/market/{api.ts,MarketView.tsx,MarketProfile` N/A}`, `apps/kbve/astro-kbve/src/components/store/{ReactStoreRN.tsx,AstroStoreShell.astro}`, `components/rnweb/ReactMinecraftDashRN.tsx` (staff gate). Old-DOM sources being ported: `components/store/{StoreAdmin,StaffOrderQueue}.tsx`, `components/market/MarketProfileShell.tsx`.

---

## File Structure

**Modify (rn):**
- `packages/npm/rn/src/markets/store/types.ts` — add `StaffProductBody`, `StaffVariantBody`, `StoreOrderStaff`.
- `packages/npm/rn/src/markets/store/api.ts` — add 8 staff methods to `StoreApi` + impl.
- `packages/npm/rn/src/markets/store/index.ts` — export `StoreAdminView`.
- `packages/npm/rn/src/markets/market/types.ts` — add `BidCursor`.
- `packages/npm/rn/src/markets/market/api.ts` — add `myListings`/`myBids`.
- `packages/npm/rn/src/markets/market/index.ts` — export `MarketProfileView`.

**New (rn):**
- `packages/npm/rn/src/markets/store/StoreAdminView.tsx`
- `packages/npm/rn/src/markets/market/MarketProfileView.tsx`
- Tests appended/added under `markets/store/__tests__/api.test.ts`, `markets/market/__tests__/api.test.ts`, new `markets/store/__tests__/StoreAdminView.test.tsx`, `markets/market/__tests__/MarketProfileView.test.tsx`.

**New (astro-kbve):** `src/components/store/ReactStoreAdminRN.tsx`, `src/components/market/ReactMarketProfileRN.tsx`.
**Modify (astro-kbve):** `components/store/AstroStoreAdminShell.astro`, `components/market/AstroMarketProfileShell.astro`, `components/market/marketNav.ts`, `components/dashboard/MarkdownContent.astro`, `content/docs/dashboard/store/index.mdx`.

---

## Task 1: Store staff API delta (TDD)

**Files:** Modify `markets/store/types.ts`, `markets/store/api.ts`; Test `markets/store/__tests__/api.test.ts`.

**Interfaces:**
- Produces (added to `StoreApi`):
  ```ts
  staffUpsertProduct(body: StaffProductBody): Promise<{ id: string }>;
  staffSetProductStatus(productId: string, status: string): Promise<void>;
  staffUpsertVariant(productId: string, body: StaffVariantBody): Promise<{ id: string }>;
  staffSetVariantStatus(variantId: string, status: string): Promise<void>;
  staffListOrders(status?: OrderStatus): Promise<StoreOrderStaff[]>;
  staffAdvanceOrder(orderId: number, body: { to_status: OrderStatus; tracking?: Record<string, unknown>; note?: string }): Promise<void>;
  staffRefundOrder(orderId: number, reason?: string): Promise<void>;
  staffSubmitPod(orderId: number): Promise<{ order_id: number; external_id: string }>;
  ```
- New types: `StaffProductBody`, `StaffVariantBody`, `StoreOrderStaff`.

- [ ] **Step 1: Add types to `markets/store/types.ts`** (append; `Fulfillment`/`OrderStatus`/`StoreOrder` already present)

```ts
export interface StaffProductBody {
	slug: string;
	title: string;
	description?: string | null;
	price: number;
	fulfillment?: Fulfillment;
	asset_ref?: Record<string, unknown>;
	status?: string;
}

export interface StaffVariantBody {
	sku: string;
	attributes?: Record<string, unknown>;
	price: number;
	stock?: number | null;
	status?: string;
}

export interface StoreOrderStaff extends StoreOrder {
	account_id: string;
	shipping_address: Record<string, unknown>;
}
```

- [ ] **Step 2: Write failing tests** — append to `markets/store/__tests__/api.test.ts`

```ts
it('staffUpsertProduct POSTs bearer to staff products, returns id', async () => {
	(global.fetch as any).mockResolvedValue({
		ok: true,
		status: 200,
		text: async () => JSON.stringify({ id: 'p9' }),
	});
	const api = createStoreApi({ getToken: token, baseUrl: '' });
	const res = await api.staffUpsertProduct({ slug: 's', title: 't', price: 10 });
	expect(res).toEqual({ id: 'p9' });
	const [url, init] = (global.fetch as any).mock.calls[0];
	expect(url).toBe('/api/v1/store/staff/products');
	expect(init.method).toBe('POST');
	expect(init.headers.Authorization).toBe('Bearer tok');
	expect(JSON.parse(init.body).idempotency_key).toBeUndefined();
});

it('staffListOrders GETs staff orders with status query', async () => {
	(global.fetch as any).mockResolvedValue({
		ok: true,
		status: 200,
		text: async () => '[]',
	});
	const api = createStoreApi({ getToken: token, baseUrl: 'https://x' });
	await api.staffListOrders('paid');
	const [url] = (global.fetch as any).mock.calls[0];
	expect(url).toBe('https://x/api/v1/store/staff/orders?status=paid');
});

it('staffAdvanceOrder POSTs to advance with body', async () => {
	(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '' });
	const api = createStoreApi({ getToken: token, baseUrl: '' });
	await api.staffAdvanceOrder(5, { to_status: 'shipped', tracking: { number: 'AB' } });
	const [url, init] = (global.fetch as any).mock.calls[0];
	expect(url).toBe('/api/v1/store/staff/orders/5/advance');
	expect(JSON.parse(init.body)).toEqual({ to_status: 'shipped', tracking: { number: 'AB' } });
});

it('staff call without token throws 401 without fetch', async () => {
	const api = createStoreApi({ getToken: async () => null });
	await expect(api.staffListOrders()).rejects.toMatchObject({ name: 'StoreApiError', status: 401 });
	expect(global.fetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run RED** — `NX_DAEMON=false $MAIN/node_modules/.bin/vitest run src/markets/store/__tests__/api.test.ts` → FAIL (methods missing).

- [ ] **Step 4: Implement in `markets/store/api.ts`**

Add to the `StoreApi` interface (Task-1 Interfaces block above), import the new body types, and add these to the returned object (reuse the existing `call<T>` — it already applies droid error precedence + the 401-before-fetch guard):

```ts
staffUpsertProduct: (body) =>
	call<{ id: string }>({ path: '/api/v1/store/staff/products', method: 'POST', body, auth: true }),
staffSetProductStatus: (productId, status) =>
	call<void>({ path: `/api/v1/store/staff/products/${encodeURIComponent(productId)}/status`, method: 'POST', body: { status }, auth: true }),
staffUpsertVariant: (productId, body) =>
	call<{ id: string }>({ path: `/api/v1/store/staff/products/${encodeURIComponent(productId)}/variants`, method: 'POST', body, auth: true }),
staffSetVariantStatus: (variantId, status) =>
	call<void>({ path: `/api/v1/store/staff/variants/${encodeURIComponent(variantId)}/status`, method: 'POST', body: { status }, auth: true }),
staffListOrders: (status) =>
	call<StoreOrderStaff[]>({ path: `/api/v1/store/staff/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`, auth: true }),
staffAdvanceOrder: (orderId, body) =>
	call<void>({ path: `/api/v1/store/staff/orders/${orderId}/advance`, method: 'POST', body, auth: true }),
staffRefundOrder: (orderId, reason) =>
	call<void>({ path: `/api/v1/store/staff/orders/${orderId}/refund`, method: 'POST', body: { reason }, auth: true }),
staffSubmitPod: (orderId) =>
	call<{ order_id: number; external_id: string }>({ path: `/api/v1/store/staff/orders/${orderId}/submit-pod`, method: 'POST', auth: true }),
```

Import types at top: add `OrderStatus, StaffProductBody, StaffVariantBody, StoreOrderStaff` to the `import type { ... } from './types';`.

- [ ] **Step 5: Run GREEN + commit**

`vitest run src/markets/store/__tests__/api.test.ts` → PASS (existing + 4 new). Commit:
```bash
git add packages/npm/rn/src/markets/store/api.ts packages/npm/rn/src/markets/store/types.ts packages/npm/rn/src/markets/store/__tests__/api.test.ts
git commit -m "feat(rn): store staff admin API methods on createStoreApi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Market personal API delta (TDD)

**Files:** Modify `markets/market/types.ts`, `markets/market/api.ts`; Test `markets/market/__tests__/api.test.ts`.

**Interfaces:**
- Produces (added to `MarketApi`): `myListings(c?: Cursor): Promise<MyListing[]>`, `myBids(c?: BidCursor): Promise<MyBid[]>`.
- New type `BidCursor { limit?: number; before_placed_at?: string | null; before_id?: number | null }`.

- [ ] **Step 1: Add `BidCursor` to `markets/market/types.ts`** (append)

```ts
export interface BidCursor {
	limit?: number;
	before_placed_at?: string | null;
	before_id?: number | null;
}
```

- [ ] **Step 2: Write failing tests** — append to `markets/market/__tests__/api.test.ts`

```ts
it('myListings GETs personal listings with cursor, bearer', async () => {
	(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
	const api = createMarketApi({ getToken: token, baseUrl: 'https://x' });
	await api.myListings({ limit: 50 });
	const [url, init] = (global.fetch as any).mock.calls[0];
	expect(url).toBe('https://x/api/v1/market/me/listings?limit=50');
	expect(init.headers.Authorization).toBe('Bearer tok');
});

it('myBids GETs personal bids with before_placed_at cursor', async () => {
	(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
	const api = createMarketApi({ getToken: token, baseUrl: '' });
	await api.myBids({ limit: 10, before_placed_at: '2020', before_id: 3 });
	const [url] = (global.fetch as any).mock.calls[0];
	expect(url).toBe('/api/v1/market/me/bids?limit=10&before_placed_at=2020&before_id=3');
});

it('myListings without token throws 401 without fetch', async () => {
	const api = createMarketApi({ getToken: async () => null });
	await expect(api.myListings()).rejects.toMatchObject({ name: 'MarketApiError', status: 401 });
	expect(global.fetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run RED** — `vitest run src/markets/market/__tests__/api.test.ts` → FAIL.

- [ ] **Step 4: Implement in `markets/market/api.ts`**

Add to the `MarketApi` interface: `myListings(c?: Cursor): Promise<MyListing[]>; myBids(c?: BidCursor): Promise<MyBid[]>;`. Import `BidCursor, MyBid, MyListing` into the `import type` block. Add to the returned object (reuse the existing `query()` helper + `call()`):

```ts
myListings: (c = {}) =>
	call<MyListing[]>({
		path: `/api/v1/market/me/listings${query({
			limit: c.limit ?? 25,
			before_created_at: c.before_created_at,
			before_id: c.before_id,
		})}`,
		auth: true,
	}),
myBids: (c = {}) =>
	call<MyBid[]>({
		path: `/api/v1/market/me/bids${query({
			limit: c.limit ?? 25,
			before_placed_at: c.before_placed_at,
			before_id: c.before_id,
		})}`,
		auth: true,
	}),
```

- [ ] **Step 5: Run GREEN + commit**

`vitest run src/markets/market/__tests__/api.test.ts` → PASS. Commit:
```bash
git add packages/npm/rn/src/markets/market/api.ts packages/npm/rn/src/markets/market/types.ts packages/npm/rn/src/markets/market/__tests__/api.test.ts
git commit -m "feat(rn): market personal myListings/myBids on createMarketApi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `StoreAdminView` composition (TDD render)

**Files:** Create `markets/store/StoreAdminView.tsx`; modify `markets/store/index.ts`; Test `markets/store/__tests__/StoreAdminView.test.tsx`.

**Interfaces:**
- Consumes: `createStoreApi` + all staff methods (Task 1); RN primitives (relative); `StoreProduct`, `StoreVariant`, `StoreOrderStaff`, `OrderStatus`, `Fulfillment` from `./types`.
- Produces: `StoreAdminView({ getToken, baseUrl, authenticated }): JSX` and `StoreAdminViewProps`.

**Design** (RN port of `components/store/{StoreAdmin,StaffOrderQueue}.tsx`, comment-free, primitives imported relative):

- Props: `{ getToken: () => Promise<string | null>; baseUrl?: string; authenticated: boolean }`. `const api = useMemo(() => createStoreApi({ getToken, baseUrl }), [getToken, baseUrl])`.
- `!authenticated` → `<Text tone="danger">Sign in as staff.</Text>`.
- `fmtErr(e)`: `StoreApiError` → status 403 `'Staff permissions required.'`, 401 `'Sign in as staff.'`, else `e.message`; non-Error → `'request failed'`. (Import `StoreApiError` from `./errors`.)
- **Catalog panel** (`Surface`): products state via `api.catalog()` in an effect (guarded by `authenticated`); list rows (`Text` title/slug/price/fulfillment/variant_count + a `Button title="Retire" variant="ghost"` → `api.staffSetProductStatus(p.product_id,'retired')` then reload). Upsert-product form: `FormField` slug/title, `FormField keyboardType="numeric"` price, `Select` fulfillment (`options` = digital/physical/both), `FormField` description; `Button title="Save product"` disabled when `busy || !slug || !title` → `api.staffUpsertProduct({slug,title,description:description||null,price,fulfillment})` then reload. Upsert-variant form: `Select` product (options from products, `value`=product_id), `FormField` sku, numeric price, `FormField` stock (blank→null), `FormField` attrs (JSON string; parse in submit, throw `'attributes must be valid JSON'` on failure), `Button "Save variant"` → `api.staffUpsertVariant(variantProduct,{sku,attributes,price,stock:stock===''?null:Number(stock)})`; variant list (loaded via `api.productDetail(slug).variants`) with Retire → `api.staffSetVariantStatus`.
- **Order queue panel** (`Surface`): `orders` via `api.staffListOrders()` in an effect; `NEXT: Partial<Record<OrderStatus,OrderStatus>> = { paid:'processing', processing:'shipped', shipped:'delivered' }`. Per order `Stack`: label (`#id · qty× · credits · status Badge`); `Button "Submit POD"` when `status==='paid'` → `api.staffSubmitPod(id)`; advance `Button` `→ NEXT[status]` when defined — **advancing to `'shipped'` reveals an inline `FormField` (tracking number)** held in per-order state (`trackingFor: number|null` + `trackingInput`), submitting calls `api.staffAdvanceOrder(id,{to_status:to, tracking: to==='shipped'?{number:trackingInput}:undefined})`; **two-tap Refund** (`confirmRefundFor: number|null` state — first tap sets it and relabels the button `Confirm refund` `variant="danger"`, second tap calls `api.staffRefundOrder(id,'staff refund')`) when `status` not in `refunded`/`cancelled`. NO `prompt`/`confirm`. `busy: number|null` disables the acting order's buttons.
- Shared: `error` state (`Text tone="danger"`), `busy` boolean/number. All async wrapped; `catch { void 0; }` where a caught value is intentionally ignored, else `setError(fmtErr(e))`.

- [ ] **Step 1: Write render test** `markets/store/__tests__/StoreAdminView.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { StoreAdminView } from '../StoreAdminView';

beforeEach(() => {
	global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
});

describe('StoreAdminView', () => {
	it('prompts sign-in when unauthenticated', () => {
		const { getByText } = render(
			<StoreAdminView getToken={async () => null} baseUrl="" authenticated={false} />,
		);
		expect(getByText(/Sign in as staff/)).toBeTruthy();
	});

	it('renders admin panels when authenticated', async () => {
		const { findByText } = render(
			<StoreAdminView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText(/Save product/)).toBeTruthy();
		expect(await findByText(/Order queue|Orders/)).toBeTruthy();
	});
});
```

- [ ] **Step 2: RED** — `vitest run src/markets/store/__tests__/StoreAdminView.test.tsx` → FAIL.

- [ ] **Step 3: Implement `StoreAdminView.tsx`** per Design above. Reference `markets/store/StoreView.tsx` for the api/useMemo/effect/error shape and primitive usage. Primitives relative. Comment-free.

- [ ] **Step 4: Export from barrel** — `markets/store/index.ts`: add `export { StoreAdminView } from './StoreAdminView'; export type { StoreAdminViewProps } from './StoreAdminView';`

- [ ] **Step 5: GREEN + lint + commit**

`vitest run src/markets/store/__tests__/StoreAdminView.test.tsx` → PASS. `nx lint rn --skip-nx-cache` clean for the new file. Commit:
```bash
git add packages/npm/rn/src/markets/store/StoreAdminView.tsx packages/npm/rn/src/markets/store/index.ts packages/npm/rn/src/markets/store/__tests__/StoreAdminView.test.tsx
git commit -m "feat(rn): StoreAdminView (catalog + order queue) composition

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `MarketProfileView` composition (TDD render)

**Files:** Create `markets/market/MarketProfileView.tsx`; modify `markets/market/index.ts`; Test `markets/market/__tests__/MarketProfileView.test.tsx`.

**Interfaces:**
- Consumes: `createMarketApi` + `myListings`/`myBids`/`listingDetail` (Task 2); `getWatchList`/`removeFromWatch`/`subscribe` from `./watchlist`; `ItemIcon`, `EnchantList`; `formatKhash`/`formatExpiry`/`formatRelative`/`itemRefLabel` from `./format`; `MyListing`, `MyBid`, `WatchEntry`.
- Produces: `MarketProfileView({ getToken, baseUrl, authenticated }): JSX` + `MarketProfileViewProps`.

**Design** (RN port of `components/market/MarketProfileShell.tsx`, comment-free, primitives relative):

- Props: `{ getToken; baseUrl?; authenticated }`. `api = useMemo(() => createMarketApi({ getToken, baseUrl }), ...)`.
- `!authenticated` → `<Text>Sign in to view your marketplace activity.</Text>`.
- Tabs: `type Tab='listings'|'bids'|'watching'`; `tab` state; a header `Stack direction="row"` of three `Button`s (active `variant="primary"`, else `variant="ghost"`; titles `Listings (${activeListings.length})`, `Bids (${bids.length})`, `Watching (${watchEntries.length})`) + a refresh `Button title="↻"` (disabled while `loading`).
- Data: `refresh()` → `Promise.all([api.myListings({limit:50}), api.myBids({limit:50})])`, `setListings`/`setBids`; `loading`/`error` (`MarketApiError` → `e.message`). Effect runs `refresh()` on mount when `authenticated`. Watchlist effect: `setWatchEntries(getWatchList()); const unsub = subscribe(() => setWatchEntries(getWatchList())); return unsub;`.
- Bid thumbnails: an effect resolving `item_ref` for each unique `bids[].listing_id` not already in a `bidRefs: Map<number, Record<string,unknown>>` via `api.listingDetail(id)` (`catch` → skip); `cancelled` flag on cleanup.
- `activeListings = listings.filter(r => r.listing_status==='active')`; `closedListings = rest`.
- **listings tab:** empty → `Text` "No active listings." active cards (a `Pressable` → `window.location.href='/market/listing/?id='+id` on web; guard `typeof window`); each shows `ItemIcon`, `itemRefLabel` + `EnchantList compact`, `Badge` status, prices (`formatKhash(buy_now_price)`/`current_bid`), expiry (`formatExpiry` when active else `formatRelative(settled_at)` or '—'). Closed listings under a collapsible (RN: a `Button` toggling a `showClosed` state → render `closedListings`).
- **bids tab:** empty → "No bids yet." per bid card: thumbnail from `bidRefs.get(listing_id)` (else placeholder), label `itemRefLabel(itemRef)` or `Listing #${listing_id}`, `Badge` `bid_status`, `formatKhash(amount)`, `formatRelative(placed_at)`; `Pressable` → listing.
- **watching tab:** empty → "No items watched yet. Star any item to track it here." each `watchEntries` row: `ItemIcon` (or placeholder for non-mc), `entry.ref`, `Badge` `entry.kind`, a `Button title="Unwatch"` → `removeFromWatch(entry)`. (Skip the `/api/mc-items.json` manifest enrichment + `/mc/items/` deep links from the DOM version — YAGNI here; just show `entry.ref`.)

- [ ] **Step 1: Write render test** `markets/market/__tests__/MarketProfileView.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MarketProfileView } from '../MarketProfileView';

beforeEach(() => {
	global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
});

describe('MarketProfileView', () => {
	it('prompts sign-in when unauthenticated', () => {
		const { getByText } = render(
			<MarketProfileView getToken={async () => null} baseUrl="" authenticated={false} />,
		);
		expect(getByText(/Sign in to view your marketplace activity/)).toBeTruthy();
	});

	it('renders the three tabs when authenticated', async () => {
		const { findByText } = render(
			<MarketProfileView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText(/Listings \(/)).toBeTruthy();
		expect(await findByText(/Bids \(/)).toBeTruthy();
		expect(await findByText(/Watching \(/)).toBeTruthy();
	});
});
```

- [ ] **Step 2: RED** — FAIL.

- [ ] **Step 3: Implement `MarketProfileView.tsx`** per Design. Reference `markets/market/MarketView.tsx` + `MarketBrowse.tsx` for card/primitive shape. Primitives relative. Comment-free.

- [ ] **Step 4: Export from barrel** — `markets/market/index.ts`: `export { MarketProfileView } from './MarketProfileView'; export type { MarketProfileViewProps } from './MarketProfileView';`

- [ ] **Step 5: GREEN + full markets suite + lint + commit**

`vitest run src/markets` → all green. `nx lint rn --skip-nx-cache` clean. Commit:
```bash
git add packages/npm/rn/src/markets/market/MarketProfileView.tsx packages/npm/rn/src/markets/market/index.ts packages/npm/rn/src/markets/market/__tests__/MarketProfileView.test.tsx
git commit -m "feat(rn): MarketProfileView (my listings/bids/watching) composition

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Astro bridges — `ReactStoreAdminRN` + `ReactMarketProfileRN`

**Files:** Create `apps/kbve/astro-kbve/src/components/store/ReactStoreAdminRN.tsx`, `components/market/ReactMarketProfileRN.tsx`.

**Interfaces:** Consumes `StoreAdminView`/`MarketProfileView` from `@kbve/rn/markets` (bare import), `$isStaff` from `@kbve/droid`, `useSession` from `@kbve/astro`, `initSupa`/`getSupa` from `@/lib/supa`.

- [ ] **Step 1: `ReactStoreAdminRN.tsx`** (staff-gated, mirrors `components/rnweb/ReactMinecraftDashRN.tsx`)

```tsx
import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { $isStaff } from '@kbve/droid';
import { ShieldOff } from 'lucide-react';
import { useSession } from '@kbve/astro';
import { StoreAdminView } from '@kbve/rn/markets';
import { initSupa, getSupa } from '@/lib/supa';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

const styles = {
	centered: {
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		justifyContent: 'center',
		gap: '1rem',
		minHeight: '40vh',
		textAlign: 'center' as const,
	},
	heading: { margin: 0, fontSize: '1.75rem', color: 'var(--sl-color-text, #e6edf3)' },
	sub: { margin: 0, color: 'var(--sl-color-gray-3, #8b949e)', maxWidth: '40rem' },
};

export default function ReactStoreAdminRN() {
	const { ready, authenticated } = useSession();
	const isStaff = useStore($isStaff);
	const token = useMemo(() => getToken, []);

	if (!ready) return null;
	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>The store admin console is restricted to KBVE staff.</p>
			</div>
		);
	}
	return <StoreAdminView getToken={token} baseUrl="" authenticated={authenticated} />;
}
```

Verify `$isStaff` is exported from `@kbve/droid` (grep `packages/npm/droid/src` — `ReactMinecraftDashRN.tsx` imports it from there). If it is instead `homeService.$isStaff` (as in `ReactS3BackupRN`), use whichever the codebase's store components use; prefer `@kbve/droid`'s `$isStaff` (matches `ReactMinecraftDashRN`).

- [ ] **Step 2: `ReactMarketProfileRN.tsx`** (auth-gated only — no staff)

```tsx
import { useMemo } from 'react';
import { useSession } from '@kbve/astro';
import { MarketProfileView } from '@kbve/rn/markets';
import { initSupa, getSupa } from '@/lib/supa';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

export default function ReactMarketProfileRN() {
	const { ready, authenticated } = useSession();
	const token = useMemo(() => getToken, []);
	if (!ready) return null;
	return <MarketProfileView getToken={token} baseUrl="" authenticated={authenticated} />;
}
```

- [ ] **Step 3: Commit** (astro islands; not runnable standalone — verified by the astro build in Task 8)

```bash
git add apps/kbve/astro-kbve/src/components/store/ReactStoreAdminRN.tsx apps/kbve/astro-kbve/src/components/market/ReactMarketProfileRN.tsx
git commit -m "feat(astro): staff-gated store-admin + personal market RN bridges

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Commerce rail — `marketNav` Manage group + `MarkdownContent` routing + MDX splash

**Files:** Modify `components/market/marketNav.ts`, `components/dashboard/MarkdownContent.astro`, `content/docs/dashboard/store/index.mdx`.

- [ ] **Step 1: `marketNav.ts` — add roots + a Manage group**

Add roots after `MARKET_ROOT`:
```ts
export const STORE_ADMIN_ROOT: DashboardNavItem = { label: 'Store Admin', href: '/dashboard/store/' };
export const MARKET_PROFILE_ROOT: DashboardNavItem = { label: 'My Marketplace', href: '/dashboard/market/' };
```

Append a third entry to `MARKET_NAV` (after Wallet):
```ts
{
	label: 'Manage',
	visibility: 'auth',
	href: '/dashboard/market/',
	icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
	items: [
		{ label: 'My Marketplace', href: '/dashboard/market/', icon: 'M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', copy: 'Your listings, bids, and watchlist.' },
		{ label: 'Store Admin', href: '/dashboard/store/', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z', copy: 'Staff catalog + order queue.', attrs: { 'data-auth-visibility': 'staff' } },
	],
},
```
(If `DashboardNavItem` has no `attrs` field, check `dashboardNav.ts` — the store admin MDX already uses `sidebar.attrs.data-auth-visibility`; mirror whatever key the nav item type supports. If unsupported, drop the `attrs` and rely on the MDX sidebar gate + backend 403 + the island's ShieldOff — the link is then visible but the page self-gates.)

Add breadcrumb builders:
```ts
export const buildStoreAdminBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, STORE_ADMIN_ROOT, pathname);
export const buildMarketProfileBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, MARKET_PROFILE_ROOT, pathname);
```

- [ ] **Step 2: `MarkdownContent.astro` — route the two dashboard commerce roots to the Commerce rail**

Import the new roots + builders (extend the existing `from '../market/marketNav'` import): add `STORE_ADMIN_ROOT, MARKET_PROFILE_ROOT, buildStoreAdminBreadcrumb, buildMarketProfileBreadcrumb`.

Add flags after `isMarket` (line ~59):
```ts
const isStoreAdmin = norm(pathname) === '/dashboard/store/';
const isMarketProfile = norm(pathname) === '/dashboard/market/';
```
Exclude them from the generic dashboard branch — change line 40:
```ts
const isDashboard = pathname.startsWith('/dashboard') && !isStoreAdmin && !isMarketProfile;
```
Add two branches to the `shell` ternary (place them BEFORE the final `: undefined`, e.g. after the `isMarket` branch):
```ts
: isStoreAdmin
	? {
			entries: MARKET_NAV,
			root: STORE_ADMIN_ROOT,
			menuLabel: 'Commerce menu',
			navLabel: 'Commerce',
			crumbs: buildStoreAdminBreadcrumb(pathname),
			collapsible: true,
			withToc: false,
		}
	: isMarketProfile
		? {
				entries: MARKET_NAV,
				root: MARKET_PROFILE_ROOT,
				menuLabel: 'Commerce menu',
				navLabel: 'Commerce',
				crumbs: buildMarketProfileBreadcrumb(pathname),
				collapsible: true,
				withToc: false,
			}
		: undefined;
```

- [ ] **Step 3: `content/docs/dashboard/store/index.mdx` — make it a splash page**

Add `template: splash` to the frontmatter (keep `title: Store Admin`, `sidebar.attrs.data-auth-visibility: staff`, `tableOfContents: false`). (`dashboard/market.mdx` is already `template: splash` — no change; it will pick up the new bento shell in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/market/marketNav.ts apps/kbve/astro-kbve/src/components/dashboard/MarkdownContent.astro apps/kbve/astro-kbve/src/content/docs/dashboard/store/index.mdx
git commit -m "feat(astro): Commerce rail + splash on dashboard store/market routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Bento shells — `AstroStoreAdminShell` + `AstroMarketProfileShell`

**Files:** Modify `components/store/AstroStoreAdminShell.astro`, `components/market/AstroMarketProfileShell.astro`.

**Pattern:** mirror `components/store/AstroStoreShell.astro` exactly (hero + `BentoShell` + `RnDashSkeleton` fallback + `<style is:global>` RAW CSS accent block — NOT the MDX template-literal form).

- [ ] **Step 1: Rewrite `AstroStoreAdminShell.astro`** (amber accent, staff hero)

```astro
---
import BentoShell from '@/components/hero/BentoShell.astro';
import RnDashSkeleton from '@/components/dashboard/RnDashSkeleton.astro';
import ReactStoreAdminRN from './ReactStoreAdminRN';

const backdrop = 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?q=80&w=2400&auto=format&fit=crop';
---

<div class="store-admin-hub" style={`--bento-hero-bg: url('${backdrop}')`}>
	<section class="bento-hero bento-section not-content" aria-label="Store Admin">
		<div class="bento-hero__bg" aria-hidden="true"></div>
		<div class="bento-hero__frame bento-frame">
			<div class="bento-board bento-board--hero">
				<div class="bento-cell bento-hero-copy bento-card bento-card--glass">
					<span class="bento-badge bento-chip"><span>staff</span></span>
					<h1 class="bento-title">Run the store,
						<span class="bento-title__accent">mint the drops.</span></h1>
					<p class="bento-lede">
						Manage products, variants, and the fulfillment queue. Staff only —
						every action is audited against your account.
					</p>
					<div class="bento-cta">
						<a class="bento-btn bento-btn--primary" href="#admin">Open console
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M13 6l6 6-6 6" /></svg>
						</a>
						<a class="bento-btn bento-btn--ghost" href="/store/">Customer store</a>
					</div>
				</div>
				{[
					{ v: 'Catalog', l: 'Products & variants' },
					{ v: 'Fulfillment', l: 'Advance, ship, refund' },
					{ v: 'Audited', l: 'Staff-gated actions' },
				].map((s) => (
					<div class="bento-cell bento-stat bento-card bento-card--glass">
						<span class="bento-stat__value">{s.v}</span>
						<span class="bento-stat__label">{s.l}</span>
					</div>
				))}
			</div>
		</div>
	</section>

	<BentoShell id="admin" eyebrow="Staff" heading="Store Admin">
		<div class="admin-island">
			<ReactStoreAdminRN client:only="react">
				<RnDashSkeleton slot="fallback" tiles={3} rows={4} />
			</ReactStoreAdminRN>
		</div>
	</BentoShell>
</div>

<style>
	.admin-island { min-height: 60vh; }
</style>

<style is:global>
	.store-admin-hub {
		--bento-accent: #fbbf24;
		--bento-accent-2: #f59e0b;
		--bento-btn-fg: #3a2a05;
	}
</style>
```

- [ ] **Step 2: Rewrite `AstroMarketProfileShell.astro`** (violet accent, personal hero)

Same structure, `class="market-profile-hub"`, badge `you`, title "Your listings, / bids, and watchlist.", lede about tracking your marketplace activity, CTA `#profile` "Open dashboard" + ghost `/market/` "Browse marketplace"; stat tiles `{Listings, Bids, Watching}`; `<BentoShell id="profile" eyebrow="You" heading="My Marketplace">` wrapping `<ReactMarketProfileRN client:only="react">` + `RnDashSkeleton` fallback; global accent:
```
.market-profile-hub { --bento-accent: #a78bfa; --bento-accent-2: #22d3ee; --bento-btn-fg: #1a1033; }
```

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/store/AstroStoreAdminShell.astro apps/kbve/astro-kbve/src/components/market/AstroMarketProfileShell.astro
git commit -m "feat(astro): bento splash shells for store admin + market profile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Verification + build

**Files:** none (verification only; fixes as needed).

- [ ] **Step 1: Full markets suite**

`cd $WT/packages/npm/rn && NX_DAEMON=false $MAIN/node_modules/.bin/vitest run src/markets` → all green (store + market + new staff/personal api cases + StoreAdminView + MarketProfileView).

- [ ] **Step 2: Lint**

`NX_DAEMON=false $MAIN/node_modules/.bin/nx lint rn --skip-nx-cache` → 0 errors (relative imports, no `no-empty`, no `prompt`/`confirm`).

- [ ] **Step 3: Astro build**

`cd $WT/apps/kbve/astro-kbve && NX_DAEMON=false $MAIN/node_modules/.bin/astro build` → EXIT 0.

- [ ] **Step 4: Splash + island render checks** (grep the built HTML)

```bash
cd $WT/apps/kbve/astro-kbve
grep -l 'store-admin-hub' dist/**/dashboard/store/*.html 2>/dev/null || echo "check dashboard/store output path"
grep -l 'market-profile-hub' dist/**/dashboard/market/*.html 2>/dev/null || echo "check dashboard/market output path"
```
Expect the hub class present (splash rendered, no Starlight sidebar). Confirm the Commerce rail (`navLabel Commerce`) wraps them, not the Dashboard nav.

- [ ] **Step 5: Web-graph clean — 0 vector-icons in the admin/profile island chunks**

```bash
cd $WT/apps/kbve/astro-kbve
for f in dist/_astro/ReactStoreAdminRN.*.js dist/_astro/ReactMarketProfileRN.*.js; do
	echo "$f:"; grep -c 'vector-icons\|createIconSet' "$f" 2>/dev/null || echo 0;
done
```
Expect 0 for both (the RN views import UI primitives directly, never the barrel).

- [ ] **Step 6: Push branch + open PR → dev**

```bash
cd $WT
git push -u origin feat/markets-admin-phase3
gh pr create --base dev --title "feat(markets): Phase 3 — admin store + personal marketplace on @kbve/rn/markets" --body "$(cat <<'EOF'
Phase 3 of the store+market epic — brings the admin store (`/dashboard/store/`) and personal marketplace (`/dashboard/market/`) into the `@kbve/rn/markets` universal composition + bento splash + Commerce rail, completing the unified customer-vs-admin view. Follows #14338 (customer `/store/`) and #14398 (customer `/market/`).

## What
- `createStoreApi` gains 8 staff methods (catalog CRUD + order fulfillment); `createMarketApi` gains `myListings`/`myBids`.
- New RN views `StoreAdminView` (catalog + order queue, inline tracking, two-tap refund — no browser dialogs) and `MarketProfileView` (my listings / bids / watching tabs).
- Astro bridges: `ReactStoreAdminRN` (staff-gated via `$isStaff`, ShieldOff fallback) + `ReactMarketProfileRN` (auth-gated).
- Bento splash shells (amber admin / violet profile) + Commerce rail routing for `/dashboard/store/` + `/dashboard/market/`.

## Verify
- markets vitest green (incl. new staff/personal api + view render tests); `nx lint rn` clean.
- `astro build` EXIT 0; both routes render splash + Commerce rail + island; 0 vector-icons in the island chunks.

## Deferred (Phase 4)
`MCItemMarketSidecar`, `IdiotCard` three-fiber, Expo mobile screens; old DOM `components/{store,market}/*` kept (still power those).

Docs: `docs/superpowers/specs/2026-07-20-markets-admin-phase3-design.md`, `docs/superpowers/plans/2026-07-20-markets-admin-phase3.md`.
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** store staff delta → Task 1; market personal delta → Task 2; `StoreAdminView` → Task 3; `MarketProfileView` → Task 4; bridges → Task 5; Commerce rail + splash MDX → Task 6; bento shells → Task 7; verify → Task 8. All spec sections mapped.
- **Type consistency:** `StoreOrderStaff`/`StaffProductBody`/`StaffVariantBody` defined Task 1, consumed Task 3; `BidCursor`/`MyListing`/`MyBid` Task 2, consumed Task 4. `StoreAdminViewProps`/`MarketProfileViewProps` produced Tasks 3/4, consumed by bridges Task 5.
- **Gotchas carried:** relative UI imports; `catch { void 0; }`; RAW CSS `<style is:global>` in `.astro`; `isDashboard` precedence (exclude the two exact roots BEFORE the prefix branch); staff gate in the bridge not the RN view; `baseUrl=''`.
