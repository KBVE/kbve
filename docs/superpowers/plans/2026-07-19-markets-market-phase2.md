# `@kbve/rn/markets` Phase 2 — Customer Marketplace (`/market/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the customer marketplace (`/market/` browse+sell, `/market/listing/` detail) into the `@kbve/rn/markets/market/` universal React Native composition rendered on web, wrapped in bento splash + Commerce rail — mirroring the shipped Phase 1 `/store/`.

**Architecture:** New `market/` sub-area under `@kbve/rn/markets` (peer of `store/`). Injected `createMarketApi({getToken, baseUrl})` factory (mirrors `createStoreApi`). RN components (imported from `@kbve/rn/ui` primitives via **relative** paths inside the rn project). Two astro `client:only` bridges inject Supabase token + `baseUrl=''`. Bento `AstroMarketShell`/`AstroMarketDetailShell` + `template: splash`. A Phase-0 task first retrofits Phase 1's store imports to relative form (lint fix).

**Tech Stack:** React Native / react-native-web, `@kbve/rn/ui`, Astro + Starlight, vitest + @testing-library/react, Nx.

## Global Constraints

- **Package manager / Nx in worktree:** run tests with vitest-direct against worktree source: `cd <WT>/packages/npm/rn && NX_DAEMON=false /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/vitest run <paths>` (NOT `pnpm nx test rn` — that runs MAIN source in a worktree). Lint: `NX_DAEMON=false /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx lint rn --skip-nx-cache` (needs the ProjectGraph for `enforce-module-boundaries`). node_modules is symlinked to main; never stage it.
- **Worktree only:** isolated git worktree off `dev` (`GIT_LFS_SKIP_SMUDGE=1`, symlink root `node_modules`); never edit/commit the main `dev` checkout; PRs → `dev`; never push `dev`/`main`. (`feedback_worktree_no_node_modules_tooling`.)
- **No code comments** anywhere (user standing rule). All code below is comment-free; keep it so.
- **Relative UI imports inside rn:** import `@kbve/rn/ui` primitives by RELATIVE path from `markets/market/*` → `../../ui/primitives/{Button,Text,Stack,Surface,Badge,FormField}`, `../../ui/controls/Select`, `../../ui/theme`. NEVER the `@kbve/rn/ui` barrel (pulls `@expo/vector-icons` → breaks vitest + web bundle) and NEVER the `@kbve/rn/ui/...` subpath specifier from inside rn (`@nx/enforce-module-boundaries` rejects self-import). ([[project_rn_markets_store]] GOTCHA 1.)
- **No bare `catch {}`** (`no-empty` + no-comments rule): use `catch { void 0; }`.
- **Named exports only** in composition barrels.
- **Store API origin:** market endpoints on the public main origin (`/api/v1/market/*`, `/api/v1/wallet/me/balance`) — bridge injects `baseUrl=''`, no staff gate (marketplace public).
- **Commit trailer:** end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; NO "Generated with Claude Code" line. Stage only named files with explicit `git add` (never `-A`).
- **Accent (market):** violet — `--bento-accent:#a78bfa; --bento-accent-2:#22d3ee; --bento-btn-fg:#1a1033`.

**Spec:** `docs/superpowers/specs/2026-07-19-markets-market-phase2-design.md`. Pattern reference (shipped): `packages/npm/rn/src/markets/store/*`, `apps/kbve/astro-kbve/src/components/store/{ReactStoreRN.tsx,AstroStoreShell.astro}`.

---

## File Structure

**Modify (Phase 0):** `packages/npm/rn/src/markets/store/*.tsx`, `store/StoreView.tsx`, `store/BuyCredits.tsx` — rewrite `@kbve/rn/ui/...` imports to relative; `store/api.ts`/others — `catch {}` → `catch { void 0; }`.

**New — `packages/npm/rn/src/markets/`:**

- `shared.ts` — `newIdempotencyKey`, `notifyWalletRefresh` (promoted from `store/`; `store/` re-exports)
- `market/index.ts` — barrel
- `market/types.ts` — `MarketListing`, `MarketListingDetail`, `MyListing`, `MyBid`, `IdResponse`, `ListingStatus`, `BidStatus`, `Cursor`
- `market/errors.ts` — `MarketApiError`
- `market/api.ts` — `createMarketApi({getToken, baseUrl})` → `MarketApi`
- `market/format.ts` — `formatKhash`, `formatRelative`, `formatExpiry`, `itemRefLabel`, `itemRefHasEnchants`
- `market/countdown.ts` — `Countdown`, `useCountdown`, `formatCountdown`
- `market/watchlist.ts` — localStorage-backed watch store (SSR/native-safe) + pub/sub
- `market/ItemIcon.tsx`, `market/EnchantList.tsx`, `market/WatchToggle.tsx`
- `market/ListingCard.tsx`, `market/MarketBrowse.tsx`, `market/MarketCreateForm.tsx`, `market/ListingDetail.tsx`
- `market/MarketView.tsx`, `market/ListingDetailView.tsx`
- `market/__tests__/` — `api.test.ts`, `format.test.ts`, `countdown.test.ts`, `MarketBrowse.test.tsx`, `ListingDetail.test.tsx`

**New — astro-kbve:** `src/components/market/ReactMarketRN.tsx`, `ReactMarketDetailRN.tsx`
**Modify — astro-kbve:** `components/market/AstroMarketShell.astro`, `AstroMarketDetailShell.astro`, `content/docs/market/index.mdx`; `packages/npm/rn/src/markets/index.ts`

**Deferred (Phase 3):** `MarketProfileShell` (`/dashboard/market/`), `MCItemMarketSidecar` (mc "other listings"), staff admin, Expo mobile.

---

## Task 1: Phase 0 — retrofit Phase 1 store imports to relative (lint fix)

**Files:** Modify `packages/npm/rn/src/markets/store/{BuyCredits,ProductCard,CheckoutModal,OrderHistory,StoreView}.tsx`, and any `store/*.ts` with a bare `catch {}`.

**Interfaces:** none changed — imports only.

- [ ] **Step 1: Rewrite the subpath UI imports to relative**

In each `store/*.tsx`, replace `@kbve/rn/ui/primitives/X` → `../../ui/primitives/X`, `@kbve/rn/ui/controls/Select` → `../../ui/controls/Select`, `@kbve/rn/ui/theme` → `../../ui/theme`. Run the autofix first, then eyeball:

```bash
cd /Users/alappatel/Documents/GitHub/kbve/<WT>/packages/npm/rn
NX_DAEMON=false /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx lint rn --skip-nx-cache --fix
```

- [ ] **Step 2: Fix any bare `catch {}`**

Grep and replace: `grep -rn "catch {}" src/markets/store` → change each to `catch { void 0; }`.

- [ ] **Step 3: Verify lint clean + tests still green**

```bash
NX_DAEMON=false /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx lint rn --skip-nx-cache
NX_DAEMON=false /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/vitest run src/markets/store
```

Expected: lint 0 errors on `src/markets/store/**`; store suite still passes (13 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/npm/rn/src/markets/store
git commit -m "refactor(rn): relative UI imports in markets/store (enforce-module-boundaries)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: market foundation — shared, types, errors, format, countdown

**Files:**

- Create: `packages/npm/rn/src/markets/shared.ts`, `market/types.ts`, `market/errors.ts`, `market/format.ts`, `market/countdown.ts`, `market/index.ts`
- Modify: `packages/npm/rn/src/markets/store/index.ts` (re-export shared), `store/keys.ts`+`store/walletSync.ts` (re-export from shared or leave; see step)
- Test: `market/__tests__/format.test.ts`, `market/__tests__/countdown.test.ts`

**Interfaces:**

- Produces: `newIdempotencyKey()`, `notifyWalletRefresh()` (from `shared.ts`); market types; `MarketApiError`; `formatKhash/formatRelative/formatExpiry/itemRefLabel/itemRefHasEnchants`; `Countdown`, `useCountdown(iso)`, `formatCountdown(c)`.

- [ ] **Step 1: Promote shared helpers — `markets/shared.ts`**

```ts
export function newIdempotencyKey(): string {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (c?.randomUUID) return c.randomUUID();
	if (c?.getRandomValues) {
		const b = c.getRandomValues(new Uint8Array(16));
		b[6] = (b[6] & 0x0f) | 0x40;
		b[8] = (b[8] & 0x3f) | 0x80;
		const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
		return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
	}
	return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const WALLET_BROADCAST = 'kbve-wallet-sync';

export function notifyWalletRefresh(): void {
	const B = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
		.BroadcastChannel;
	if (!B) return;
	try {
		const ch = new B(WALLET_BROADCAST);
		ch.postMessage({ type: 'refresh' });
		ch.close();
	} catch {
		void 0;
	}
}
```

Then make `store/keys.ts` and `store/walletSync.ts` re-export from shared (keeps store's public API stable, removes duplication):

- `store/keys.ts`: `export { newIdempotencyKey } from '../shared';`
- `store/walletSync.ts`: `export { notifyWalletRefresh } from '../shared';`

- [ ] **Step 2: `market/types.ts`**

```ts
export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';
export type BidStatus = 'active' | 'outbid' | 'won' | 'refunded' | 'cancelled';

export interface MarketListing {
	listing_id: number;
	seller_account: string;
	item_ref: Record<string, unknown>;
	currency: string;
	buy_now_price: number | null;
	min_bid: number | null;
	current_bid: number | null;
	expires_at: string;
	created_at: string;
}

export interface MarketListingDetail extends MarketListing {
	current_bid_id: number | null;
	listing_status: ListingStatus;
	updated_at: string;
	settled_at: string | null;
	bids: Array<Record<string, unknown>>;
}

export interface MyListing {
	listing_id: number;
	item_ref: Record<string, unknown>;
	currency: string;
	buy_now_price: number | null;
	min_bid: number | null;
	current_bid: number | null;
	current_bid_account: string | null;
	buyer_account: string | null;
	listing_status: ListingStatus;
	expires_at: string;
	created_at: string;
	settled_at: string | null;
}

export interface MyBid {
	bid_id: number;
	listing_id: number;
	amount: number;
	bid_status: BidStatus;
	placed_at: string;
	settled_at: string | null;
	escrow_ledger_id: number;
	refund_ledger_id: number | null;
}

export interface IdResponse {
	id: number;
}

export interface Cursor {
	limit?: number;
	before_created_at?: string | null;
	before_id?: number | null;
}
```

- [ ] **Step 3: `market/errors.ts`**

```ts
export class MarketApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = 'MarketApiError';
		this.status = status;
		this.code = code;
	}
}
```

- [ ] **Step 4: `market/format.ts`** (port of `components/market/format.ts`)

```ts
export function formatKhash(n: number | null | undefined): string {
	if (n === null || n === undefined) return '—';
	return `${n.toLocaleString()} KHash`;
}

export function formatRelative(iso: string): string {
	const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 48) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}

export function formatExpiry(iso: string): string {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return 'expired';
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s left`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m left`;
	const h = Math.round(m / 60);
	if (h < 48) return `${h}h left`;
	return `${Math.round(h / 24)}d left`;
}

export function itemRefLabel(itemRef: unknown): string {
	if (itemRef && typeof itemRef === 'object') {
		const o = itemRef as Record<string, unknown>;
		const kind = typeof o.kind === 'string' ? o.kind : '';
		const id = typeof o.id === 'string' ? o.id : '';
		if (kind && id) return `${kind}:${id}`;
		if (id) return id;
		return JSON.stringify(itemRef).slice(0, 64);
	}
	return 'Unknown item';
}

export function itemRefHasEnchants(itemRef: unknown): boolean {
	if (!itemRef || typeof itemRef !== 'object') return false;
	const e = (itemRef as Record<string, unknown>).enchants;
	return Array.isArray(e) && e.length > 0;
}
```

- [ ] **Step 5: `market/countdown.ts`** (port of `components/market/countdown.ts`)

```ts
import { useEffect, useState } from 'react';

export interface Countdown {
	expired: boolean;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	totalMs: number;
}

const ZERO: Countdown = {
	expired: true,
	days: 0,
	hours: 0,
	minutes: 0,
	seconds: 0,
	totalMs: 0,
};

function compute(iso: string): Countdown {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return ZERO;
	const totalSec = Math.floor(ms / 1000);
	return {
		expired: false,
		days: Math.floor(totalSec / 86400),
		hours: Math.floor((totalSec % 86400) / 3600),
		minutes: Math.floor((totalSec % 3600) / 60),
		seconds: totalSec % 60,
		totalMs: ms,
	};
}

export function useCountdown(iso: string | null | undefined): Countdown {
	const [c, setC] = useState<Countdown>(() => (iso ? compute(iso) : ZERO));
	useEffect(() => {
		if (!iso) return;
		setC(compute(iso));
		const fast = compute(iso).totalMs < 60_000;
		const id = setInterval(() => setC(compute(iso)), fast ? 1000 : 30_000);
		return () => clearInterval(id);
	}, [iso]);
	return c;
}

export function formatCountdown(c: Countdown): string {
	if (c.expired) return 'expired';
	if (c.days > 0) return `${c.days}d ${c.hours}h`;
	if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
	if (c.minutes > 0)
		return `${c.minutes}m ${String(c.seconds).padStart(2, '0')}s`;
	return `${c.seconds}s`;
}
```

- [ ] **Step 6: `market/index.ts` (barrel — this task's exports only)**

```ts
export * from './types';
export { MarketApiError } from './errors';
export * from './format';
export { useCountdown, formatCountdown } from './countdown';
export type { Countdown } from './countdown';
```

- [ ] **Step 7: Re-export shared from `store/index.ts`** — leave store's existing `newIdempotencyKey`/`notifyWalletRefresh` exports as-is (they now come through the re-export shim). No change needed if store/index re-exports keys/walletSync already.

- [ ] **Step 8: Write `market/__tests__/format.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatKhash, itemRefLabel, itemRefHasEnchants } from '../format';

describe('format', () => {
	it('formatKhash', () => {
		expect(formatKhash(null)).toBe('—');
		expect(formatKhash(1500)).toBe('1,500 KHash');
	});
	it('itemRefLabel', () => {
		expect(itemRefLabel({ kind: 'mc_item', id: 'diamond' })).toBe(
			'mc_item:diamond',
		);
		expect(itemRefLabel({ id: 'x' })).toBe('x');
		expect(itemRefLabel(5)).toBe('Unknown item');
	});
	it('itemRefHasEnchants', () => {
		expect(itemRefHasEnchants({ enchants: [{}] })).toBe(true);
		expect(itemRefHasEnchants({ enchants: [] })).toBe(false);
		expect(itemRefHasEnchants({})).toBe(false);
	});
});
```

- [ ] **Step 9: Write `market/__tests__/countdown.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatCountdown } from '../countdown';

describe('formatCountdown', () => {
	it('expired', () => {
		expect(
			formatCountdown({
				expired: true,
				days: 0,
				hours: 0,
				minutes: 0,
				seconds: 0,
				totalMs: 0,
			}),
		).toBe('expired');
	});
	it('days/hours/minutes/seconds tiers', () => {
		expect(
			formatCountdown({
				expired: false,
				days: 2,
				hours: 3,
				minutes: 0,
				seconds: 0,
				totalMs: 1,
			}),
		).toBe('2d 3h');
		expect(
			formatCountdown({
				expired: false,
				days: 0,
				hours: 5,
				minutes: 9,
				seconds: 0,
				totalMs: 1,
			}),
		).toBe('5h 9m');
		expect(
			formatCountdown({
				expired: false,
				days: 0,
				hours: 0,
				minutes: 4,
				seconds: 3,
				totalMs: 1,
			}),
		).toBe('4m 03s');
		expect(
			formatCountdown({
				expired: false,
				days: 0,
				hours: 0,
				minutes: 0,
				seconds: 8,
				totalMs: 1,
			}),
		).toBe('8s');
	});
});
```

- [ ] **Step 10: Run tests + commit**

```bash
NX_DAEMON=false /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/vitest run src/markets/market/__tests__/format.test.ts src/markets/market/__tests__/countdown.test.ts
```

Expected: PASS. Then:

```bash
git add packages/npm/rn/src/markets/shared.ts packages/npm/rn/src/markets/market/{index,types,errors,format,countdown}.ts packages/npm/rn/src/markets/market/__tests__ packages/npm/rn/src/markets/store/keys.ts packages/npm/rn/src/markets/store/walletSync.ts
git commit -m "feat(rn): markets/market foundation — types, format, countdown, shared

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `createMarketApi` factory (TDD)

**Files:** Create `market/api.ts`; modify `market/index.ts` (append api exports); Test `market/__tests__/api.test.ts`.

**Interfaces:**

- Consumes: `MarketApiError`, `newIdempotencyKey` (from `../shared`), market types.
- Produces:

    ```ts
    interface MarketApiOptions {
    	getToken: () => Promise<string | null>;
    	baseUrl?: string;
    }
    interface MarketApi {
    	listActive(c?: Cursor): Promise<MarketListing[]>;
    	listingDetail(id: number): Promise<MarketListingDetail>;
    	myAccountId(): Promise<string | null>;
    	createListing(body: {
    		src_item_id: string;
    		qty: number | null;
    		buy_now_price: number | null;
    		min_bid: number | null;
    		expires_at: string;
    	}): Promise<IdResponse>;
    	placeBid(id: number, amount: number): Promise<IdResponse>;
    	buyNow(id: number): Promise<IdResponse>;
    	cancelListing(id: number, reason?: string | null): Promise<void>;
    }
    function createMarketApi(opts: MarketApiOptions): MarketApi;
    ```

    `listActive`/`listingDetail` tokenless; the rest authed (throw `MarketApiError('Not signed in', 401)` before fetch when token null). `createListing`/`placeBid`/`buyNow` inject `idempotency_key` internally. `myAccountId` GETs `/api/v1/wallet/me/balance` and returns `.account_id` (or null on any failure — it gates a UI affordance, must never throw).

- [ ] **Step 1: Write `market/__tests__/api.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMarketApi } from '../api';
import { MarketApiError } from '../errors';

const token = async () => 'tok';

describe('createMarketApi', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('listActive builds cursor query, tokenless', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => '[]',
		});
		const api = createMarketApi({
			getToken: async () => null,
			baseUrl: 'https://x',
		});
		await api.listActive({
			limit: 10,
			before_created_at: '2020',
			before_id: 5,
		});
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe(
			'https://x/api/v1/market/listings?limit=10&before_created_at=2020&before_id=5',
		);
		expect(init?.headers?.Authorization).toBeUndefined();
	});

	it('placeBid posts bearer + amount + idempotency_key', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ id: 9 }),
		});
		const api = createMarketApi({ getToken: token, baseUrl: '' });
		const res = await api.placeBid(3, 250);
		expect(res).toEqual({ id: 9 });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/market/listings/3/bid');
		expect(init.headers.Authorization).toBe('Bearer tok');
		const body = JSON.parse(init.body);
		expect(body.amount).toBe(250);
		expect(typeof body.idempotency_key).toBe('string');
	});

	it('authed call without token throws 401 without fetch', async () => {
		const api = createMarketApi({ getToken: async () => null });
		await expect(api.buyNow(1)).rejects.toMatchObject({
			name: 'MarketApiError',
			status: 401,
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('myAccountId returns account_id, null on failure', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ account_id: 'acc-1' }),
		});
		const api = createMarketApi({ getToken: token });
		expect(await api.myAccountId()).toBe('acc-1');
		(global.fetch as any).mockRejectedValue(new Error('down'));
		expect(await api.myAccountId()).toBeNull();
	});

	it('non-OK JSON error surfaces message + status + code', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 409,
			text: async () => JSON.stringify({ error: 'outbid', code: 'M12' }),
		});
		const api = createMarketApi({ getToken: token });
		const err = await api.placeBid(1, 5).catch((e) => e);
		expect(err).toBeInstanceOf(MarketApiError);
		expect(err.status).toBe(409);
		expect(err.code).toBe('M12');
		expect(err.message).toBe('outbid');
	});
});
```

- [ ] **Step 2: Run RED**

`NX_DAEMON=false <main>/node_modules/.bin/vitest run src/markets/market/__tests__/api.test.ts` → FAIL (createMarketApi missing).

- [ ] **Step 3: Write `market/api.ts`**

```ts
import { MarketApiError } from './errors';
import { newIdempotencyKey } from '../shared';
import type {
	Cursor,
	IdResponse,
	MarketListing,
	MarketListingDetail,
} from './types';

export interface MarketApiOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export interface MarketApi {
	listActive(c?: Cursor): Promise<MarketListing[]>;
	listingDetail(id: number): Promise<MarketListingDetail>;
	myAccountId(): Promise<string | null>;
	createListing(body: {
		src_item_id: string;
		qty: number | null;
		buy_now_price: number | null;
		min_bid: number | null;
		expires_at: string;
	}): Promise<IdResponse>;
	placeBid(id: number, amount: number): Promise<IdResponse>;
	buyNow(id: number): Promise<IdResponse>;
	cancelListing(id: number, reason?: string | null): Promise<void>;
}

function query(
	params: Record<string, string | number | null | undefined>,
): string {
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === null || v === undefined || v === '') continue;
		usp.set(k, String(v));
	}
	const s = usp.toString();
	return s ? `?${s}` : '';
}

interface Req {
	path: string;
	method?: string;
	body?: unknown;
	auth?: boolean;
}

export function createMarketApi(opts: MarketApiOptions): MarketApi {
	const { getToken, baseUrl = '' } = opts;

	async function call<T>({
		path,
		method = 'GET',
		body,
		auth = false,
	}: Req): Promise<T> {
		const headers: Record<string, string> = {};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (auth) {
			const token = await getToken().catch(() => null);
			if (!token) throw new MarketApiError('Not signed in', 401);
			headers.Authorization = `Bearer ${token}`;
		}
		let res: Response;
		try {
			res = await fetch(`${baseUrl}${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
			});
		} catch (e) {
			throw new MarketApiError(
				e instanceof Error ? e.message : 'request failed',
				0,
			);
		}
		const text = await res.text();
		let json: unknown;
		try {
			json = text ? JSON.parse(text) : undefined;
		} catch {
			json = undefined;
		}
		if (!res.ok) {
			const j = (json ?? {}) as {
				error?: string;
				message?: string;
				code?: string;
			};
			throw new MarketApiError(
				j.error ?? j.message ?? (text || `HTTP ${res.status}`),
				res.status,
				j.code,
			);
		}
		return json as T;
	}

	return {
		listActive: (c = {}) =>
			call<MarketListing[]>({
				path: `/api/v1/market/listings${query({
					limit: c.limit ?? 25,
					before_created_at: c.before_created_at,
					before_id: c.before_id,
				})}`,
			}),
		listingDetail: (id) =>
			call<MarketListingDetail>({
				path: `/api/v1/market/listings/${id}`,
			}),
		myAccountId: async () => {
			try {
				const r = await call<{ account_id?: string }>({
					path: '/api/v1/wallet/me/balance',
					auth: true,
				});
				return r?.account_id ?? null;
			} catch {
				return null;
			}
		},
		createListing: (body) =>
			call<IdResponse>({
				path: '/api/v1/market/listings',
				method: 'POST',
				body: { ...body, idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		placeBid: (id, amount) =>
			call<IdResponse>({
				path: `/api/v1/market/listings/${id}/bid`,
				method: 'POST',
				body: { amount, idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		buyNow: (id) =>
			call<IdResponse>({
				path: `/api/v1/market/listings/${id}/buy-now`,
				method: 'POST',
				body: { idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		cancelListing: (id, reason = null) =>
			call<void>({
				path: `/api/v1/market/listings/${id}/cancel`,
				method: 'POST',
				body: { reason },
				auth: true,
			}),
	};
}
```

- [ ] **Step 4: Append to `market/index.ts`**

```ts
export { createMarketApi } from './api';
export type { MarketApi, MarketApiOptions } from './api';
```

- [ ] **Step 5: Run GREEN + commit**

`vitest run src/markets/market/__tests__/api.test.ts` → PASS (5 cases). Commit:

```bash
git add packages/npm/rn/src/markets/market/api.ts packages/npm/rn/src/markets/market/index.ts packages/npm/rn/src/markets/market/__tests__/api.test.ts
git commit -m "feat(rn): createMarketApi injected factory

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: watchlist store + `WatchToggle`

**Files:** Create `market/watchlist.ts`, `market/WatchToggle.tsx`; modify `market/index.ts`.

**Interfaces:**

- Produces: `WatchEntry`, `getWatchList()`, `isWatched(e)`, `toggleWatch(e)`, `subscribe(fn)`; `WatchToggle({ kind, ref, size? })`.

- [ ] **Step 1: Port `market/watchlist.ts`** (near-verbatim of `components/market/watchlist.ts`; SSR/native-safe via `typeof window` guard — on native `localStorage` is absent so it degrades to in-memory + pub/sub, which is correct). Reproduce the module: `STORAGE_KEY='kbve:market:watchlist:v1'`, module `subscribers: Set<() => void>`, `isBrowser()`, `entryKey(e)=`${kind}::${ref}``, `readRaw()`/`writeRaw()`(localStorage,`catch { void 0; }`on parse/quota),`notify()`, `getWatchList()`, `isWatched(e)`, `addToWatch(e)`, `removeFromWatch(e)`, `toggleWatch(e): boolean`, `subscribe(fn): () => void`(adds to set; if browser also`window.addEventListener('storage', ...)`filtered to`STORAGE_KEY`; returns unsubscribe). All bare catches use `catch { void 0; }`. No comments.

- [ ] **Step 2: Write `market/WatchToggle.tsx`** (RN port of `components/market/WatchToggle.tsx`)

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../../ui/primitives/Text';
import {
	isWatched as readIsWatched,
	subscribe,
	toggleWatch,
} from './watchlist';

export interface WatchToggleProps {
	kind: string;
	itemRef: string;
	size?: 'sm' | 'md';
}

export function WatchToggle({ kind, itemRef, size = 'md' }: WatchToggleProps) {
	const [watched, setWatched] = useState(false);
	useEffect(() => {
		const entry = { kind, ref: itemRef };
		setWatched(readIsWatched(entry));
		return subscribe(() => setWatched(readIsWatched(entry)));
	}, [kind, itemRef]);
	const onPress = useCallback(() => {
		toggleWatch({ kind, ref: itemRef });
	}, [kind, itemRef]);
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={
				watched ? 'Remove from watch list' : 'Add to watch list'
			}
			style={styles.btn}>
			<Text
				variant={size === 'sm' ? 'caption' : 'body'}
				tone={watched ? 'default' : 'muted'}>
				{watched ? '★' : '☆'}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({ btn: { padding: 4 } });
```

Note the prop rename `ref` → `itemRef` (React reserves `ref` as a prop name; the DOM version used `ref` which would collide in RN/React). Update all call sites accordingly.

- [ ] **Step 3: Append export + commit**

`market/index.ts`: `export { WatchToggle } from './WatchToggle';` and `export { getWatchList, isWatched, toggleWatch, subscribe } from './watchlist'; export type { WatchEntry } from './watchlist';`

Verify barrel compiles: `vitest run src/markets/market/__tests__/format.test.ts` (fast smoke that the barrel still type-checks). Commit:

```bash
git add packages/npm/rn/src/markets/market/watchlist.ts packages/npm/rn/src/markets/market/WatchToggle.tsx packages/npm/rn/src/markets/market/index.ts
git commit -m "feat(rn): market watchlist store + WatchToggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `ItemIcon` + `EnchantList`

**Files:** Create `market/ItemIcon.tsx`, `market/EnchantList.tsx`, `market/enchants.ts` (port helper); modify `market/index.ts`.

**Interfaces:** `ItemIcon({ itemRef, size? })`, `EnchantList({ itemRef, compact? })`.

- [ ] **Step 1: Port `market/enchants.ts`** — copy the exported helpers from `components/market/enchants.ts` verbatim (pure data/format functions; read that file and reproduce). No comments.

- [ ] **Step 2: Write `market/ItemIcon.tsx`** (RN port of `components/market/ItemIcon.tsx`)

RN `Image` with the same 2-candidate mc-texture fallback chain (`errIdx` state advancing item→block URL); the placeholder branch renders a solid-color `View` per kind (NOT a CSS gradient — RN can't take gradient strings) with the kind initial. Constants: `MC_TEXTURE_BASE='https://mcasset.cloud/1.21.5/assets/minecraft/textures/item'`, `MC_BLOCK_BASE='https://mcasset.cloud/1.21.5/assets/minecraft/textures/block'`. `kindColor(kind)`: `mc_item`→`#16a34a`, `rareicon_item`→`#a855f7`, default→`#475569`. `kindInitial`: mc_item→'M', rareicon_item→'R', generic→'G', else first char upper or '?'.

```tsx
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/primitives/Text';

export interface ItemIconProps {
	itemRef: Record<string, unknown> | null | undefined;
	size?: number;
}

function mcCandidates(id: string): string[] {
	const clean = id.replace(/^minecraft:/, '').toLowerCase();
	return [
		`https://mcasset.cloud/1.21.5/assets/minecraft/textures/item/${clean}.png`,
		`https://mcasset.cloud/1.21.5/assets/minecraft/textures/block/${clean}.png`,
	];
}

const KIND_COLOR: Record<string, string> = {
	mc_item: '#16a34a',
	rareicon_item: '#a855f7',
};

function kindInitial(kind: string): string {
	if (kind === 'mc_item') return 'M';
	if (kind === 'rareicon_item') return 'R';
	if (kind === 'generic') return 'G';
	return kind ? kind[0].toUpperCase() : '?';
}

export function ItemIcon({ itemRef, size = 64 }: ItemIconProps) {
	const meta = useMemo(() => {
		const o = (itemRef ?? {}) as Record<string, unknown>;
		return {
			kind: typeof o.kind === 'string' ? o.kind : 'generic',
			id: typeof o.id === 'string' ? o.id : '',
		};
	}, [itemRef]);
	const [errIdx, setErrIdx] = useState(0);
	const candidates =
		meta.kind === 'mc_item' && meta.id ? mcCandidates(meta.id) : [];
	const exhausted = errIdx >= candidates.length;

	if (candidates.length > 0 && !exhausted) {
		return (
			<Image
				source={{ uri: candidates[errIdx] }}
				onError={() => setErrIdx((i) => i + 1)}
				resizeMode="contain"
				style={{ width: size, height: size }}
			/>
		);
	}
	return (
		<View
			style={[
				styles.ph,
				{
					width: size,
					height: size,
					backgroundColor: KIND_COLOR[meta.kind] ?? '#475569',
				},
			]}>
			<Text
				variant="title"
				style={{ fontSize: size * 0.42, color: '#fff' }}>
				{kindInitial(meta.kind)}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	ph: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
});
```

- [ ] **Step 3: Write `market/EnchantList.tsx`** (RN port of `components/market/EnchantList.tsx`) — read the original, render its enchant chips as RN `Badge`/`Text` chips in a `Stack direction="row"`; `compact` prop reduces to a count/short form as the original does. Use `enchants.ts` helpers. Import UI relative.

- [ ] **Step 4: Append exports + commit**

`market/index.ts`: `export { ItemIcon } from './ItemIcon'; export { EnchantList } from './EnchantList';`. Commit:

```bash
git add packages/npm/rn/src/markets/market/{ItemIcon,EnchantList,enchants}.tsx packages/npm/rn/src/markets/market/enchants.ts packages/npm/rn/src/markets/market/index.ts
git commit -m "feat(rn): market ItemIcon + EnchantList

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Adjust `git add` to the actual file extensions created — `enchants.ts` is `.ts`, components `.tsx`.)

---

## Task 6: `ListingCard` + `MarketBrowse` (TDD)

**Files:** Create `market/ListingCard.tsx`, `market/MarketBrowse.tsx`; modify `market/index.ts`; Test `market/__tests__/MarketBrowse.test.tsx`.

**Interfaces:**

- Produces: `ListingCard({ row, onOpen })`, `MarketBrowse({ api, onOpen })` where `api: MarketApi`, `onOpen: (listingId: number) => void`.

- [ ] **Step 1: Write `market/__tests__/MarketBrowse.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MarketBrowse } from '../MarketBrowse';
import type { MarketApi } from '../api';

const ROWS = [
	{
		listing_id: 1,
		seller_account: 's',
		item_ref: { kind: 'mc_item', id: 'diamond' },
		currency: 'khash',
		buy_now_price: 500,
		min_bid: null,
		current_bid: null,
		expires_at: new Date(Date.now() + 86400000).toISOString(),
		created_at: '2020',
	},
];

function stubApi(over: Partial<MarketApi> = {}): MarketApi {
	return {
		listActive: vi.fn(async () => ROWS as any),
		listingDetail: vi.fn(),
		myAccountId: vi.fn(),
		createListing: vi.fn(),
		placeBid: vi.fn(),
		buyNow: vi.fn(),
		cancelListing: vi.fn(),
		...over,
	} as MarketApi;
}

describe('MarketBrowse', () => {
	beforeEach(() => {});
	it('loads and renders a listing card with its buy-now price', async () => {
		const { findByText } = render(
			<MarketBrowse api={stubApi()} onOpen={vi.fn()} />,
		);
		expect(await findByText(/500 KHash/)).toBeTruthy();
	});
	it('shows empty state when no listings', async () => {
		const { findByText } = render(
			<MarketBrowse
				api={stubApi({ listActive: vi.fn(async () => []) })}
				onOpen={vi.fn()}
			/>,
		);
		expect(await findByText(/No active listings/)).toBeTruthy();
	});
});
```

- [ ] **Step 2: RED** — `vitest run src/markets/market/__tests__/MarketBrowse.test.tsx` → FAIL.

- [ ] **Step 3: Write `market/ListingCard.tsx`** — RN `Pressable` (calls `onOpen(row.listing_id)`) wrapping `ItemIcon`, `itemRefLabel`, price rows (`formatKhash(buy_now_price)` labelled "Buy"; `formatKhash(current_bid ?? min_bid)` labelled "Bid"/"Min"), a `useCountdown(row.expires_at)` + `formatCountdown` line (urgent tone when `totalMs < 3_600_000`), and `WatchToggle` when `item_ref.kind`+`id` present. Use `Surface`/`Stack`/`Text`/`Badge` relative imports.

- [ ] **Step 4: Write `market/MarketBrowse.tsx`** — port of `components/market/MarketBrowse.tsx`: state `rows/loading/error/hasMore/kindFilter`; `load(after?)` calls `api.listActive({limit:25, before_created_at: after?.created_at ?? null, before_id: after?.listing_id ?? null})`, appends when `after`, sets `hasMore = page.length === 25`; initial load in effect; kind filter `Select` (`all/mc_item/rareicon_item/generic`, `generic` = non-string kind); `filtered` memo; render: filter `Select` + count + refresh `Button`; loading/empty/error status `Text`; grid of `ListingCard` (RN `View` with `flexWrap:'row'`); "Load more" `Button` when `hasMore`. `MarketBrowse({ api, onOpen })`. PAGE_SIZE=25.

- [ ] **Step 5: GREEN + commit**

`vitest run src/markets/market/__tests__/MarketBrowse.test.tsx` → PASS. Append `ListingCard`/`MarketBrowse` to barrel. Commit:

```bash
git add packages/npm/rn/src/markets/market/{ListingCard,MarketBrowse}.tsx packages/npm/rn/src/markets/market/index.ts packages/npm/rn/src/markets/market/__tests__/MarketBrowse.test.tsx
git commit -m "feat(rn): market ListingCard + MarketBrowse grid

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `MarketCreateForm`

**Files:** Create `market/MarketCreateForm.tsx`; modify `market/index.ts`.

**Interfaces:** `MarketCreateForm({ api, authenticated, onCreated })` — `api: MarketApi`, `authenticated: boolean`, `onCreated?: (id: number) => void`.

- [ ] **Step 1: Write `market/MarketCreateForm.tsx`** — RN port of `components/market/MarketCreateForm.tsx`:
    - Not authenticated → `Text` "Sign in to list an item for sale."
    - Fields: `FormField` for `srcItemId` (UUID text), `qty` (numeric, optional), `buyNow` (numeric KHash), `minBid` (numeric KHash); **expiry via a duration `Select`** (`24h`/`3d`/`7d`/`14d`/`30d`, default `24h`) → on submit compute `expires_at = new Date(Date.now() + durationMs).toISOString()` (replaces the DOM `datetime-local`, which has no RN equivalent).
    - Validation (on submit, matching the DOM logic): `srcItemId.trim()` must match UUID regex `/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/` else error 'inventory item id must be a UUID'; at least one of buyNow/minBid required ('set a buy-now price or a min bid'); each present price must be finite & > 0 (floored); qty if present must be positive integer.
    - Submit → `api.createListing({ src_item_id, qty, buy_now_price, min_bid, expires_at })` (api injects idempotency_key). Success → `Text` "Listing #{id} created" + a `Button`/`Pressable` calling `onCreated?.(id)`; reset srcItemId/qty/buyNow/minBid. Error → `Text tone="danger"` with `e.message` (or 'create failed'). `busy` disables submit.
    - Import UI relative.

- [ ] **Step 2: Append export + full suite + commit**

`market/index.ts`: `export { MarketCreateForm } from './MarketCreateForm';`. Run full markets suite:
`vitest run src/markets` → all green. Commit:

```bash
git add packages/npm/rn/src/markets/market/MarketCreateForm.tsx packages/npm/rn/src/markets/market/index.ts
git commit -m "feat(rn): market MarketCreateForm (sell)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `ListingDetail` + `ListingDetailView` (TDD)

**Files:** Create `market/ListingDetail.tsx`, `market/ListingDetailView.tsx`; modify `market/index.ts`; Test `market/__tests__/ListingDetail.test.tsx`.

**Interfaces:**

- `ListingDetail({ api, listingId, authenticated, myAccount, onBack })` — presentational + actions; loads detail via `api.listingDetail`.
- `ListingDetailView({ id, getToken, baseUrl, authenticated, onBack? })` — builds `api` via `createMarketApi`, resolves `myAccount` via `api.myAccountId()` when authenticated, renders `ListingDetail`.

- [ ] **Step 1: Write `market/__tests__/ListingDetail.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ListingDetail } from '../ListingDetail';
import type { MarketApi } from '../api';

const DETAIL = {
	listing_id: 7,
	seller_account: 'seller',
	item_ref: { kind: 'generic', id: 'x' },
	currency: 'khash',
	buy_now_price: 1000,
	min_bid: 100,
	current_bid: null,
	current_bid_id: null,
	listing_status: 'active',
	expires_at: new Date(Date.now() + 86400000).toISOString(),
	created_at: '2020',
	updated_at: '2020',
	settled_at: null,
	bids: [],
};

function stubApi(over: Partial<MarketApi> = {}): MarketApi {
	return {
		listActive: vi.fn(),
		listingDetail: vi.fn(async () => DETAIL as any),
		myAccountId: vi.fn(),
		createListing: vi.fn(),
		placeBid: vi.fn(async () => ({ id: 1 })),
		buyNow: vi.fn(async () => ({ id: 2 })),
		cancelListing: vi.fn(async () => undefined),
		...over,
	} as MarketApi;
}

describe('ListingDetail', () => {
	it('renders buy-now for a non-seller authenticated viewer and fires buyNow', async () => {
		const buyNow = vi.fn(async () => ({ id: 2 }));
		const { findByText } = render(
			<ListingDetail
				api={stubApi({ buyNow })}
				listingId={7}
				authenticated
				myAccount="buyer"
				onBack={vi.fn()}
			/>,
		);
		const btn = await findByText(/Buy Now/);
		fireEvent.click(btn);
		await waitFor(() => expect(buyNow).toHaveBeenCalledWith(7));
	});

	it('shows cancel for the seller, not buy-now', async () => {
		const { findByText, queryByText } = render(
			<ListingDetail
				api={stubApi()}
				listingId={7}
				authenticated
				myAccount="seller"
				onBack={vi.fn()}
			/>,
		);
		expect(await findByText(/Cancel Listing/)).toBeTruthy();
		expect(queryByText(/Buy Now/)).toBeNull();
	});

	it('signed-out viewer sees a sign-in affordance, no actions', async () => {
		const { findByText, queryByText } = render(
			<ListingDetail
				api={stubApi()}
				listingId={7}
				authenticated={false}
				myAccount={null}
				onBack={vi.fn()}
			/>,
		);
		expect(await findByText(/Sign in to bid or buy/)).toBeTruthy();
		expect(queryByText(/Buy Now/)).toBeNull();
	});
});
```

- [ ] **Step 2: RED** — FAIL (ListingDetail missing).

- [ ] **Step 3: Write `market/ListingDetail.tsx`** — RN port of `components/market/MarketListingDetail.tsx`, but `listingId`/`authenticated`/`myAccount` are PROPS (not URL/session — the View injects them). State: `row/loading/error/actionError/actionBusy/bidInput`. Effect loads `api.listingDetail(listingId)` on mount/`listingId` change. Derived: `isSeller = row.seller_account === myAccount`, `active = row.listing_status === 'active'`, `minNextBid = (row.current_bid ?? ((row.min_bid ?? 1) - 1)) + 1`. Countdown via `useCountdown(row?.expires_at)`. Actions (all require `authenticated`; no confirm dialogs; set `actionBusy`, clear `actionError`, `await refresh()` on success): `onBid` (validate bidInput finite>0 → `api.placeBid(listing_id, Math.floor(amount))`), `onBuyNow` (`api.buyNow(listing_id)`), `onCancel` (`api.cancelListing(listing_id)`); each `.catch` → `actionError = e instanceof MarketApiError ? e.message : '<verb> failed'`, `notifyWalletRefresh()` after bid/buy success. Panels: `active && authenticated && !isSeller` → bid `FormField`+`Button` (when `min_bid !== null`) and Buy-Now `Button` (when `buy_now_price !== null`, label `Buy Now · {formatKhash}`); `active && authenticated && isSeller` → "Cancel Listing" `Button`; `active && !authenticated` → `Text`/`Pressable` "Sign in to bid or buy". Bid history: `row.bids.slice(0,25)` → `Stack` of `Text` (`formatKhash(amount)` + status `Badge` + `formatRelative(placed_at)`); empty → "No bids yet". Loading/error/`listingId==null` early `Text` states. `onBack` → a "← Browse" `Pressable`. Import UI relative; use `ItemIcon`/`EnchantList`/`WatchToggle`.

- [ ] **Step 4: Write `market/ListingDetailView.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { createMarketApi } from './api';
import { ListingDetail } from './ListingDetail';

export interface ListingDetailViewProps {
	id: number;
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
	onBack?: () => void;
}

export function ListingDetailView({
	id,
	getToken,
	baseUrl = '',
	authenticated,
	onBack,
}: ListingDetailViewProps) {
	const api = useMemo(
		() => createMarketApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [myAccount, setMyAccount] = useState<string | null>(null);
	useEffect(() => {
		if (!authenticated) {
			setMyAccount(null);
			return;
		}
		let live = true;
		void api.myAccountId().then((a) => {
			if (live) setMyAccount(a);
		});
		return () => {
			live = false;
		};
	}, [api, authenticated]);
	return (
		<ListingDetail
			api={api}
			listingId={id}
			authenticated={authenticated}
			myAccount={myAccount}
			onBack={
				onBack ??
				(() => {
					window.location.href = '/market/';
				})
			}
		/>
	);
}
```

- [ ] **Step 5: GREEN + commit**

`vitest run src/markets/market/__tests__/ListingDetail.test.tsx` → PASS (3 cases). Append `ListingDetail`/`ListingDetailView` to barrel. Commit:

```bash
git add packages/npm/rn/src/markets/market/{ListingDetail,ListingDetailView}.tsx packages/npm/rn/src/markets/market/index.ts packages/npm/rn/src/markets/market/__tests__/ListingDetail.test.tsx
git commit -m "feat(rn): market ListingDetail + ListingDetailView (bid/buy/cancel)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `MarketView` compose + markets barrel

**Files:** Create `market/MarketView.tsx`; modify `market/index.ts`, `packages/npm/rn/src/markets/index.ts`.

**Interfaces:** `MarketView({ getToken, baseUrl, authenticated, onOpen? })` — builds `api`, renders `MarketBrowse` + a collapsible `MarketCreateForm` (sell); `onOpen(id)` defaults to navigating `/market/listing/?id=${id}` on web.

- [ ] **Step 1: Write `market/MarketView.tsx`**

```tsx
import { useMemo } from 'react';
import { Stack } from '../../ui/primitives/Stack';
import { Text } from '../../ui/primitives/Text';
import { createMarketApi } from './api';
import { MarketBrowse } from './MarketBrowse';
import { MarketCreateForm } from './MarketCreateForm';

export interface MarketViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
	onOpen?: (listingId: number) => void;
}

export function MarketView({
	getToken,
	baseUrl = '',
	authenticated,
	onOpen,
}: MarketViewProps) {
	const api = useMemo(
		() => createMarketApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const open =
		onOpen ??
		((id: number) => {
			window.location.href = `/market/listing/?id=${id}`;
		});
	return (
		<Stack gap="lg">
			<Text variant="subtitle">Sell an item</Text>
			<MarketCreateForm
				api={api}
				authenticated={authenticated}
				onCreated={open}
			/>
			<Text variant="subtitle">Active listings</Text>
			<MarketBrowse api={api} onOpen={open} />
		</Stack>
	);
}
```

- [ ] **Step 2: Barrel exports**

`market/index.ts`: `export { MarketView } from './MarketView'; export type { MarketViewProps } from './MarketView'; export { ListingDetailView } from './ListingDetailView'; export type { ListingDetailViewProps } from './ListingDetailView';`
`packages/npm/rn/src/markets/index.ts`: add `export * from './market';`

- [ ] **Step 3: Full markets suite + web-graph sanity + commit**

`vitest run src/markets` → all green (store 13 + market: format, countdown, api 5, browse 2, detail 3). Commit:

```bash
git add packages/npm/rn/src/markets/market/MarketView.tsx packages/npm/rn/src/markets/market/index.ts packages/npm/rn/src/markets/index.ts
git commit -m "feat(rn): MarketView compose + markets barrel re-export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: astro-kbve web bridges

**Files:** Create `apps/kbve/astro-kbve/src/components/market/ReactMarketRN.tsx`, `ReactMarketDetailRN.tsx`.

- [ ] **Step 1: Write `ReactMarketRN.tsx`** (mirror `ReactStoreRN.tsx`)

```tsx
import { useMemo } from 'react';
import { useSession } from '@kbve/astro';
import { MarketView } from '@kbve/rn/markets';
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

export default function ReactMarketRN() {
	const { ready, authenticated } = useSession();
	const token = useMemo(() => getToken, []);
	if (!ready) return null;
	return (
		<MarketView getToken={token} baseUrl="" authenticated={authenticated} />
	);
}
```

- [ ] **Step 2: Write `ReactMarketDetailRN.tsx`** — reads `?id=` from `window.location.search`, renders `ListingDetailView`. Guard invalid id.

```tsx
import { useMemo } from 'react';
import { useSession } from '@kbve/astro';
import { ListingDetailView } from '@kbve/rn/markets';
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

function readId(): number | null {
	if (typeof window === 'undefined') return null;
	const raw = new URLSearchParams(window.location.search).get('id');
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ReactMarketDetailRN() {
	const { ready, authenticated } = useSession();
	const token = useMemo(() => getToken, []);
	const id = useMemo(() => readId(), []);
	if (!ready) return null;
	if (id === null) return <div>Missing or invalid ?id= parameter.</div>;
	return (
		<ListingDetailView
			id={id}
			getToken={token}
			baseUrl=""
			authenticated={authenticated}
		/>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/market/ReactMarketRN.tsx apps/kbve/astro-kbve/src/components/market/ReactMarketDetailRN.tsx
git commit -m "feat(astro-kbve): ReactMarketRN + ReactMarketDetailRN bridges

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: astro chrome — bento shells + splash

**Files:** Modify `apps/kbve/astro-kbve/src/components/market/AstroMarketShell.astro`, `AstroMarketDetailShell.astro`, `apps/kbve/astro-kbve/src/content/docs/market/index.mdx`.

- [ ] **Step 1: Rewrite `AstroMarketShell.astro`** — model on the shipped `AstroStoreShell.astro` (read it first). `market-hub` wrapper + **violet** accent tokens + backdrop; `bento-hero` (badge "marketplace", title + accent, lede about KHash auctions + 1% fee, CTA `#market` + `/store/`, three static `bento-stat` tiles: "Settled in KHash" / "1% Treasury fee" / "Escrow bids"); keep the existing `data-kbve-search-trigger` Ctrl+K button in the hero CTA row; one `<BentoShell id="market" eyebrow="Browse" heading="Marketplace">` wrapping `<ReactMarketRN client:only="react"><RnDashSkeleton slot="fallback" tiles={3} rows={4} /></ReactMarketRN>` inside a `.market-island { min-height: 60vh }` wrapper. Accent via **raw** `.astro` `<style is:global>` (NOT MDX template-literal — [[project_rn_markets_store]] GOTCHA 2):

```astro
<style is:global>
	.market-hub {
		--bento-accent: #a78bfa;
		--bento-accent-2: #22d3ee;
		--bento-btn-fg: #1a1033;
	}
</style>
```

- [ ] **Step 2: Rewrite `AstroMarketDetailShell.astro`** — a single `<BentoShell eyebrow="Marketplace" heading="Listing">` (violet `market-hub` wrapper) wrapping `<ReactMarketDetailRN client:only="react"><RnDashSkeleton slot="fallback" tiles={2} rows={3} /></ReactMarketDetailRN>` with a `min-height: 60vh` wrapper. The route already sets `sidebar: hidden`.

- [ ] **Step 3: Add `template: splash` to `content/docs/market/index.mdx`** (after the `description:` block, keep all other frontmatter).

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/market/AstroMarketShell.astro apps/kbve/astro-kbve/src/components/market/AstroMarketDetailShell.astro apps/kbve/astro-kbve/src/content/docs/market/index.mdx
git commit -m "feat(astro-kbve): bento market shells + splash for /market/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: End-to-end verification

**Files:** none.

- [ ] **Step 1: Lint clean**

`NX_DAEMON=false <main>/node_modules/.bin/nx lint rn --skip-nx-cache` → 0 errors (relative imports throughout `markets/**`, no `no-empty`, no boundary violations).

- [ ] **Step 2: Full markets suite**

`cd <WT>/packages/npm/rn && NX_DAEMON=false <main>/node_modules/.bin/vitest run src/markets` → all green (store 13 + market suites).

- [ ] **Step 3: astro build (worktree source)**

```bash
rm -rf <WT>/apps/kbve/astro-kbve/.astro <main>/node_modules/.vite
cd <WT>/apps/kbve/astro-kbve && NX_DAEMON=false <main>/node_modules/.bin/astro build
```

Expected: EXIT 0. Then assert the built pages under `<WT>/dist/apps/astro-kbve`:

- `/market/index.html`: splash (`grep -c sidebar-pane` = 0) + `bento-hero` + Commerce `dash-rail` + `market-hub` + `ReactMarketRN.*.js` island script + `rnsk` fallback.
- `/market/listing/index.html`: `ReactMarketDetailRN.*.js` island + `rnsk` fallback.

- [ ] **Step 4: Web-graph cleanliness**

`grep -c 'vector-icons\|createIconSet'` the built `ReactMarketRN.*.js` and `ReactMarketDetailRN.*.js` chunks under `dist/apps/astro-kbve/_astro/` → both 0.

- [ ] **Step 5: Open PR to dev**

```bash
git push -u origin <branch>
gh pr create --base dev --title "feat: /market/ on @kbve/rn/markets + bento (Phase 2)" --body "Phase 2 of the store/market epic. Spec: docs/superpowers/specs/2026-07-19-markets-market-phase2-design.md. Includes Phase-0 lint retrofit of Phase 1 store imports. No kube/infra changes."
```

---

## Self-Review

**Spec coverage:**

- Phase 0 lint retrofit: Task 1. ✓
- market foundation (types/format/countdown/shared): Task 2. ✓
- `createMarketApi` (+ myAccountId): Task 3. ✓
- watchlist + WatchToggle: Task 4. ✓
- ItemIcon + EnchantList: Task 5. ✓
- ListingCard + MarketBrowse: Task 6. ✓
- MarketCreateForm (duration Select): Task 7. ✓
- ListingDetail + ListingDetailView (bid/buy/cancel/history/seller-vs-bidder/signed-out): Task 8. ✓
- MarketView + barrel: Task 9. ✓
- bridges: Task 10. ✓
- bento shells + splash: Task 11. ✓
- verification (lint + suite + build + web-graph): Task 12. ✓
- Deferred (MarketProfileShell, MCItemMarketSidecar, admin, mobile): non-goals. ✓

**Placeholder scan:** Ports in Tasks 5/6/7/8 that say "port of `components/market/X`" pair a precise interface + behavior spec (from the reader analysis in the spec) with the original file as structural source — the DOM→RN primitive mapping and exact API calls/validation are stated. The new-logic files (shared, types, errors, format, countdown, api, bridges, View, DetailView, WatchToggle, ItemIcon) have complete code. Full component bodies for EnchantList, ListingCard, MarketBrowse, MarketCreateForm, ListingDetail are specified by interface + behavior + primitive mapping (the implementer reads the original DOM file and transcribes to the named RN primitives) — acceptable for a mechanical port, not an unfilled blank.

**Type consistency:** `MarketApi`/`MarketApiOptions` names match across Tasks 3–10. `createMarketApi` signature stable. `ListingDetail` prop set (`api/listingId/authenticated/myAccount/onBack`) identical in Task 8 def, test, and `ListingDetailView` use. `MarketBrowse({api,onOpen})` consistent Task 6 ↔ Task 9. `WatchToggle` prop renamed `ref`→`itemRef` consistently (Task 4 def + Task 6/8 consumers). `MarketView`/`MarketViewProps`, `ListingDetailView`/`ListingDetailViewProps` consistent Task 9 ↔ Task 10 bridges. `notifyWalletRefresh`/`newIdempotencyKey` sourced from `../shared` throughout.
