# `@kbve/rn/markets` Phase 1 — Store (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/store/` as a single universal `@kbve/rn/markets` React Native island (rendered on web via react-native-web), wrapped in the bento splash + Commerce gutter-rail chrome.

**Architecture:** A new `@kbve/rn/markets` composition family mirrors `@kbve/rn/dash/mc`: an injected `createStoreApi({getToken, baseUrl})` factory owns fetch/auth/error-mapping; RN components (Button/Text/Stack/FormField/Select from `@kbve/rn/ui`) render native + web; one `StoreView({getToken, baseUrl, authenticated})` composes them. An astro-kbve `client:only` bridge (`ReactStoreRN`) injects Supabase token + session; `AstroStoreShell` wraps it in `bento-hero` + `BentoShell` with an `RnDashSkeleton` fallback. A new `marketNav` + `MarkdownContent.astro` branch adds the Commerce rail.

**Tech Stack:** React Native / react-native-web, `@kbve/rn/ui` kit, Astro + Starlight (astro-kbve), vitest + @testing-library/react, Nx.

## Global Constraints

- **Package manager prefix:** run Nx via `pnpm nx …` (never global nx, never raw cargo/vitest). Copied from CLAUDE.md.
- **Worktree only:** execute in an isolated git worktree created via `superpowers:using-git-worktrees`; never edit/commit on the main `dev` checkout; never push to `dev`/`main`; PRs target `dev`. Worktrees have **no `node_modules`** — use the tooling recipe (symlink root `node_modules`, `GIT_LFS_SKIP_SMUDGE=1`, `--skip-nx-cache`) from `feedback_worktree_no_node_modules_tooling`.
- **No comments:** do not add code comments (user standing rule `feedback_no_comments_at_all`) — the code samples below are comment-free; keep them so.
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do NOT add a "Generated with Claude Code" line to commits (user rule `feedback_no_claude_code_link`).
- **Web-safety:** the `@kbve/rn/markets` barrel and everything it imports must stay clear of `@expo/vector-icons` (breaks web bundlers) — import UI only from `@kbve/rn/ui` primitives, never `./nav`/rails.
- **Store API origin:** store endpoints are on the public main origin (`/api/v1/store/*`) — the web bridge injects `baseUrl=''` (relative), NOT the dash proxy.
- **Named exports only** in composition barrels (default exports caused TS2308 in the dash port).

**Spec:** `docs/superpowers/specs/2026-07-19-store-market-bento-design.md` (Phase 1 section).

---

## File Structure

**New — `packages/npm/rn/src/markets/`:**
- `index.ts` — family barrel (re-exports `./store`)
- `store/index.ts` — store barrel (named exports)
- `store/types.ts` — `StoreProduct`, `StoreVariant`, `StoreProductDetail`, `StoreEntitlement`, `StoreItem`, `StoreOrder`, `CreditPack`, `ShippingAddress`, `Fulfillment`, `OrderStatus`, `CREDIT_PACKS`, `FEATURED_SLUG`
- `store/errors.ts` — `StoreApiError`
- `store/api.ts` — `createStoreApi({getToken, baseUrl})` → `StoreApi`
- `store/keys.ts` — `newIdempotencyKey()`
- `store/walletSync.ts` — `notifyWalletRefresh()` (web BroadcastChannel, native no-op)
- `store/openCheckout.ts` / `store/openCheckout.web.ts` — Stripe redirect platform split
- `store/BuyCredits.tsx` — credit packs → `topupCheckout` → `openCheckout`
- `store/ProductCard.tsx` — one product tile (digital buy / physical → modal / owned)
- `store/CheckoutModal.tsx` — physical checkout (variant + shipping form → `buyPhysical`)
- `store/OrderHistory.tsx` — order list
- `store/StoreView.tsx` — `StoreView({getToken, baseUrl, authenticated})` composes all
- `store/__tests__/api.test.ts`, `__tests__/BuyCredits.test.tsx`, `__tests__/StoreView.test.tsx`

**New — astro-kbve:**
- `src/components/store/ReactStoreRN.tsx` — web bridge island
- `src/components/market/marketNav.ts` — shared Commerce rail data

**Modify:**
- `packages/npm/rn/package.json` — add `"./markets"` export
- `apps/kbve/astro-kbve/src/components/store/AstroStoreShell.astro` — bento rewrite
- `apps/kbve/astro-kbve/src/components/dashboard/MarkdownContent.astro` — Commerce rail branch
- `apps/kbve/astro-kbve/src/content/docs/store/index.mdx` — `template: splash`

**Deferred (not Phase 1):** `IdiotCard` animated reveal (featured card renders as a normal `ProductCard`); marketplace; Expo mobile screens; staff admin surfaces.

---

## Task 1: markets scaffold — types, errors, helpers, barrel, subpath export

**Files:**
- Create: `packages/npm/rn/src/markets/store/types.ts`, `store/errors.ts`, `store/keys.ts`, `store/walletSync.ts`, `store/openCheckout.ts`, `store/openCheckout.web.ts`, `store/index.ts`, `markets/index.ts`
- Modify: `packages/npm/rn/package.json`
- Test: `packages/npm/rn/src/markets/store/__tests__/keys.test.ts`

**Interfaces:**
- Produces: types + `StoreApiError` + `newIdempotencyKey(): string` + `notifyWalletRefresh(): void` + `openCheckout(url: string): void`, consumed by every later task.

- [ ] **Step 1: Write `store/types.ts`**

```ts
export type Fulfillment = 'digital' | 'physical' | 'both';

export type OrderStatus =
	| 'paid'
	| 'processing'
	| 'shipped'
	| 'delivered'
	| 'cancelled'
	| 'refunded';

export interface StoreProduct {
	product_id: string;
	slug: string;
	title: string;
	description: string | null;
	price: number;
	currency: string;
	fulfillment: Fulfillment;
	asset_ref: Record<string, unknown>;
	variant_count: number;
	created_at: string;
}

export interface StoreVariant {
	variant_id: string;
	sku: string;
	attributes: Record<string, unknown>;
	price: number;
	stock: number | null;
}

export interface StoreProductDetail {
	product: Omit<StoreProduct, 'fulfillment' | 'variant_count'> & {
		fulfillment?: Fulfillment;
	};
	variants: StoreVariant[];
}

export interface StoreEntitlement {
	item_id: string;
	slug: string;
	product_id: string;
	title: string | null;
	granted_at: string;
}

export interface StoreItem {
	item_id: string;
}

export interface StoreOrder {
	order_id: number;
	product_id: string;
	variant_id: string | null;
	qty: number;
	credits_amount: number;
	status: OrderStatus;
	tracking: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface ShippingAddress {
	name: string;
	line1: string;
	line2?: string;
	city: string;
	region: string;
	postal_code: string;
	country: string;
}

export interface CreditPack {
	pack_id: string;
	credits: number;
	label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
	{ pack_id: 'small', credits: 100, label: '100 credits · $1' },
	{ pack_id: 'medium', credits: 550, label: '550 credits · $5' },
	{ pack_id: 'large', credits: 1200, label: '1200 credits · $10' },
];

export const FEATURED_SLUG = 'i-am-an-idiot';
```

- [ ] **Step 2: Write `store/errors.ts`**

```ts
export class StoreApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = 'StoreApiError';
		this.status = status;
		this.code = code;
	}
}
```

- [ ] **Step 3: Write `store/keys.ts`**

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
```

- [ ] **Step 4: Write `store/walletSync.ts`**

```ts
const WALLET_BROADCAST = 'kbve-wallet-sync';

export function notifyWalletRefresh(): void {
	const B = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
		.BroadcastChannel;
	if (!B) return;
	try {
		const ch = new B(WALLET_BROADCAST);
		ch.postMessage({ type: 'refresh' });
		ch.close();
	} catch {}
}
```

- [ ] **Step 5: Write the checkout redirect split**

`store/openCheckout.ts` (native):

```ts
import { Linking } from 'react-native';

export function openCheckout(url: string): void {
	void Linking.openURL(url);
}
```

`store/openCheckout.web.ts` (web, wins under `.web.ts` resolve):

```ts
export function openCheckout(url: string): void {
	window.location.assign(url);
}
```

- [ ] **Step 6: Write `store/index.ts` (barrel, named only)**

Export only the modules created in this task. Tasks 2–5 append their own export lines as each file lands (keeps the barrel type-checking green at every commit — no forward references to files that don't exist yet).

```ts
export * from './types';
export { StoreApiError } from './errors';
export { newIdempotencyKey } from './keys';
export { notifyWalletRefresh } from './walletSync';
export { openCheckout } from './openCheckout';
```

- [ ] **Step 7: Write `markets/index.ts`**

```ts
export * from './store';
```

- [ ] **Step 8: Add the subpath export to `packages/npm/rn/package.json`**

In the `"exports"` object, after the `"./store"` entry, add:

```json
"./markets": {
	"types": "./src/markets/index.ts",
	"import": "./src/markets/index.ts"
},
```

- [ ] **Step 9: Write the failing test `store/__tests__/keys.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newIdempotencyKey } from '../keys';

describe('newIdempotencyKey', () => {
	it('returns a unique non-empty string each call', () => {
		const a = newIdempotencyKey();
		const b = newIdempotencyKey();
		expect(a).toBeTruthy();
		expect(typeof a).toBe('string');
		expect(a).not.toBe(b);
	});
});
```

- [ ] **Step 10: Run tests**

Run: `pnpm nx test rn --skip-nx-cache`
Expected: PASS (keys test green; no type errors from the new barrel).

- [ ] **Step 11: Commit**

```bash
git add packages/npm/rn/src/markets packages/npm/rn/package.json
git commit -m "feat(rn): scaffold @kbve/rn/markets store types + helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `createStoreApi` factory (TDD)

**Files:**
- Create: `packages/npm/rn/src/markets/store/api.ts`
- Modify: `packages/npm/rn/src/markets/store/index.ts` (append api exports)
- Test: `packages/npm/rn/src/markets/store/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `StoreApiError`, `newIdempotencyKey`, types from Task 1.
- Produces:
  ```ts
  interface StoreApiOptions { getToken: () => Promise<string | null>; baseUrl?: string; }
  interface StoreApi {
    catalog(): Promise<StoreProduct[]>;
    productDetail(slug: string): Promise<StoreProductDetail>;
    myEntitlements(): Promise<StoreEntitlement[]>;
    myOrders(): Promise<StoreOrder[]>;
    buyProduct(slug: string): Promise<StoreItem>;
    buyPhysical(variantId: string, body: { qty: number; shipping_address: ShippingAddress }): Promise<{ order_id: number }>;
    topupCheckout(packId: string): Promise<{ checkout_url: string }>;
  }
  function createStoreApi(opts: StoreApiOptions): StoreApi
  ```
  Authed methods (`myEntitlements`, `myOrders`, `buyProduct`, `buyPhysical`, `topupCheckout`) throw `StoreApiError('Not signed in', 401)` when `getToken()` yields null. `buyProduct`/`buyPhysical` inject `idempotency_key` internally. Non-OK responses throw `StoreApiError(message, status, code)` where `message`/`code` come from a JSON `{ error?, message?, code? }` body when present.

- [ ] **Step 1: Write the failing test `store/__tests__/api.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStoreApi } from '../api';
import { StoreApiError } from '../errors';

const token = async () => 'tok';

describe('createStoreApi', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('catalog GETs products tokenless from baseUrl', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify([{ product_id: 'p1', slug: 's' }]),
		});
		const api = createStoreApi({ getToken: async () => null, baseUrl: 'https://x' });
		const rows = await api.catalog();
		expect(rows).toEqual([{ product_id: 'p1', slug: 's' }]);
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/store/products');
		expect(init?.headers?.Authorization).toBeUndefined();
	});

	it('buyProduct posts with bearer + injected idempotency_key', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ item_id: 'i1' }),
		});
		const api = createStoreApi({ getToken: token, baseUrl: '' });
		const res = await api.buyProduct('i-am-an-idiot');
		expect(res).toEqual({ item_id: 'i1' });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('/api/v1/store/products/i-am-an-idiot/buy');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(typeof JSON.parse(init.body).idempotency_key).toBe('string');
	});

	it('authed call without token throws StoreApiError 401 and does not fetch', async () => {
		const api = createStoreApi({ getToken: async () => null });
		await expect(api.myOrders()).rejects.toMatchObject({
			name: 'StoreApiError',
			status: 401,
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('non-OK JSON body surfaces error message + status + code', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 402,
			text: async () => JSON.stringify({ error: 'insufficient', code: 'P1001' }),
		});
		const api = createStoreApi({ getToken: token });
		const err = await api.buyProduct('x').catch((e) => e);
		expect(err).toBeInstanceOf(StoreApiError);
		expect(err.status).toBe(402);
		expect(err.code).toBe('P1001');
		expect(err.message).toBe('insufficient');
	});

	it('topupCheckout returns checkout_url', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ checkout_url: 'https://pay' }),
		});
		const api = createStoreApi({ getToken: token });
		expect(await api.topupCheckout('small')).toEqual({ checkout_url: 'https://pay' });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/api.test.ts`
Expected: FAIL — `createStoreApi` not exported.

- [ ] **Step 3: Write `store/api.ts`**

```ts
import { StoreApiError } from './errors';
import { newIdempotencyKey } from './keys';
import type {
	ShippingAddress,
	StoreEntitlement,
	StoreItem,
	StoreOrder,
	StoreProduct,
	StoreProductDetail,
} from './types';

export interface StoreApiOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export interface StoreApi {
	catalog(): Promise<StoreProduct[]>;
	productDetail(slug: string): Promise<StoreProductDetail>;
	myEntitlements(): Promise<StoreEntitlement[]>;
	myOrders(): Promise<StoreOrder[]>;
	buyProduct(slug: string): Promise<StoreItem>;
	buyPhysical(
		variantId: string,
		body: { qty: number; shipping_address: ShippingAddress },
	): Promise<{ order_id: number }>;
	topupCheckout(packId: string): Promise<{ checkout_url: string }>;
}

interface Req {
	path: string;
	method?: string;
	body?: unknown;
	auth?: boolean;
}

export function createStoreApi(opts: StoreApiOptions): StoreApi {
	const { getToken, baseUrl = '' } = opts;

	async function call<T>({ path, method = 'GET', body, auth = false }: Req): Promise<T> {
		const headers: Record<string, string> = {};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (auth) {
			const token = await getToken().catch(() => null);
			if (!token) throw new StoreApiError('Not signed in', 401);
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
			throw new StoreApiError(e instanceof Error ? e.message : 'request failed', 0);
		}
		const text = await res.text();
		let json: unknown;
		try {
			json = text ? JSON.parse(text) : undefined;
		} catch {
			json = undefined;
		}
		if (!res.ok) {
			const j = (json ?? {}) as { error?: string; message?: string; code?: string };
			throw new StoreApiError(
				j.error ?? j.message ?? text ?? `HTTP ${res.status}`,
				res.status,
				j.code,
			);
		}
		return json as T;
	}

	return {
		catalog: () => call<StoreProduct[]>({ path: '/api/v1/store/products' }),
		productDetail: (slug) =>
			call<StoreProductDetail>({
				path: `/api/v1/store/products/${encodeURIComponent(slug)}`,
			}),
		myEntitlements: () =>
			call<StoreEntitlement[]>({ path: '/api/v1/store/me/entitlements', auth: true }),
		myOrders: () => call<StoreOrder[]>({ path: '/api/v1/store/me/orders', auth: true }),
		buyProduct: (slug) =>
			call<StoreItem>({
				path: `/api/v1/store/products/${encodeURIComponent(slug)}/buy`,
				method: 'POST',
				body: { idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		buyPhysical: (variantId, body) =>
			call<{ order_id: number }>({
				path: `/api/v1/store/variants/${encodeURIComponent(variantId)}/buy`,
				method: 'POST',
				body: { ...body, idempotency_key: newIdempotencyKey() },
				auth: true,
			}),
		topupCheckout: (packId) =>
			call<{ checkout_url: string }>({
				path: '/api/v1/wallet/topup/checkout',
				method: 'POST',
				body: { pack_id: packId },
				auth: true,
			}),
	};
}
```

- [ ] **Step 4: Append api exports to `store/index.ts`**

Add after the `openCheckout` export line:

```ts
export { createStoreApi } from './api';
export type { StoreApi, StoreApiOptions } from './api';
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/api.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/markets/store/api.ts packages/npm/rn/src/markets/store/index.ts packages/npm/rn/src/markets/store/__tests__/api.test.ts
git commit -m "feat(rn): createStoreApi injected factory for markets store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `BuyCredits` RN component (TDD)

**Files:**
- Create: `packages/npm/rn/src/markets/store/BuyCredits.tsx`
- Modify: `store/index.ts` (append `BuyCredits`)
- Test: `store/__tests__/BuyCredits.test.tsx`

**Interfaces:**
- Consumes: `StoreApi`, `CREDIT_PACKS`, `openCheckout`, `StoreApiError`.
- Produces: `BuyCredits({ api, authenticated }: { api: StoreApi; authenticated: boolean })`.

- [ ] **Step 1: Write failing test `store/__tests__/BuyCredits.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { BuyCredits } from '../BuyCredits';
import type { StoreApi } from '../api';

function stubApi(over: Partial<StoreApi> = {}): StoreApi {
	return {
		catalog: vi.fn(),
		productDetail: vi.fn(),
		myEntitlements: vi.fn(),
		myOrders: vi.fn(),
		buyProduct: vi.fn(),
		buyPhysical: vi.fn(),
		topupCheckout: vi.fn(async () => ({ checkout_url: 'https://pay' })),
		...over,
	} as StoreApi;
}

describe('BuyCredits', () => {
	it('renders a button per credit pack', () => {
		const { getByText } = render(<BuyCredits api={stubApi()} authenticated />);
		expect(getByText('100 credits · $1')).toBeTruthy();
		expect(getByText('550 credits · $5')).toBeTruthy();
		expect(getByText('1200 credits · $10')).toBeTruthy();
	});

	it('calls topupCheckout when a pack is pressed while authenticated', async () => {
		const topupCheckout = vi.fn(async () => ({ checkout_url: 'https://pay' }));
		const { getByText } = render(
			<BuyCredits api={stubApi({ topupCheckout })} authenticated />,
		);
		fireEvent.click(getByText('100 credits · $1'));
		await waitFor(() => expect(topupCheckout).toHaveBeenCalledWith('small'));
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/BuyCredits.test.tsx`
Expected: FAIL — `BuyCredits` not found.

- [ ] **Step 3: Write `store/BuyCredits.tsx`**

```tsx
import { useState } from 'react';
import { Button, Stack, Surface, Text } from '@kbve/rn/ui';
import type { StoreApi } from './api';
import { CREDIT_PACKS } from './types';
import { StoreApiError } from './errors';
import { openCheckout } from './openCheckout';

export interface BuyCreditsProps {
	api: StoreApi;
	authenticated: boolean;
}

export function BuyCredits({ api, authenticated }: BuyCreditsProps) {
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const buy = async (packId: string) => {
		setBusy(packId);
		setError(null);
		try {
			const { checkout_url } = await api.topupCheckout(packId);
			openCheckout(checkout_url);
		} catch (e) {
			if (e instanceof StoreApiError && e.status === 503)
				setError('Credit top-up is not available yet.');
			else if (e instanceof StoreApiError && e.status === 401)
				setError('Sign in to buy credits.');
			else setError(e instanceof Error ? e.message : 'checkout failed');
			setBusy(null);
		}
	};

	return (
		<Surface>
			<Stack gap="sm">
				<Text variant="subtitle">Buy credits</Text>
				<Text variant="caption" tone="muted">
					Top up with Stripe. Credits buy anything in the store.
				</Text>
				{error ? (
					<Text variant="caption" tone="danger">
						{error}
					</Text>
				) : null}
				<Stack direction="row" gap="sm">
					{CREDIT_PACKS.map((p) => (
						<Button
							key={p.pack_id}
							title={busy === p.pack_id ? 'Redirecting…' : p.label}
							variant="secondary"
							disabled={!authenticated || busy !== null}
							onPress={() => void buy(p.pack_id)}
						/>
					))}
				</Stack>
				{!authenticated ? (
					<Text variant="caption" tone="muted">
						Sign in to buy credits.
					</Text>
				) : null}
			</Stack>
		</Surface>
	);
}
```

- [ ] **Step 4: Append export to `store/index.ts`**

```ts
export { BuyCredits } from './BuyCredits';
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/BuyCredits.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/markets/store/BuyCredits.tsx packages/npm/rn/src/markets/store/index.ts packages/npm/rn/src/markets/store/__tests__/BuyCredits.test.tsx
git commit -m "feat(rn): BuyCredits markets store component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `ProductCard` + `CheckoutModal` RN components

**Files:**
- Create: `packages/npm/rn/src/markets/store/ProductCard.tsx`, `store/CheckoutModal.tsx`
- Modify: `store/index.ts` (append both)
- Test: `store/__tests__/ProductCard.test.tsx`

**Interfaces:**
- Consumes: `StoreProduct`, `StoreVariant`, `ShippingAddress`, `StoreApi`, `StoreApiError`, `notifyWalletRefresh`.
- Produces:
  ```ts
  ProductCard({ product, owned, authenticated, busy, onBuyDigital, onBuyPhysical }: {
    product: StoreProduct; owned: boolean; authenticated: boolean; busy: boolean;
    onBuyDigital: (slug: string) => void; onBuyPhysical: (slug: string) => void;
  })
  CheckoutModal({ api, slug, onClose, onPurchased }: {
    api: StoreApi; slug: string; onClose: () => void; onPurchased?: (orderId: number) => void;
  })
  ```

- [ ] **Step 1: Write failing test `store/__tests__/ProductCard.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ProductCard } from '../ProductCard';
import type { StoreProduct } from '../types';

const digital: StoreProduct = {
	product_id: 'p1', slug: 'coin', title: 'Coin', description: 'shiny',
	price: 50, currency: 'credits', fulfillment: 'digital', asset_ref: {},
	variant_count: 0, created_at: '',
};

describe('ProductCard', () => {
	it('shows Owned badge and no buy button when owned', () => {
		const { getByText, queryByText } = render(
			<ProductCard product={digital} owned authenticated busy={false}
				onBuyDigital={vi.fn()} onBuyPhysical={vi.fn()} />,
		);
		expect(getByText('Owned')).toBeTruthy();
		expect(queryByText(/Buy/)).toBeNull();
	});

	it('fires onBuyDigital for a digital product when authenticated', () => {
		const onBuyDigital = vi.fn();
		const { getByText } = render(
			<ProductCard product={digital} owned={false} authenticated busy={false}
				onBuyDigital={onBuyDigital} onBuyPhysical={vi.fn()} />,
		);
		fireEvent.click(getByText(/Buy/));
		expect(onBuyDigital).toHaveBeenCalledWith('coin');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/ProductCard.test.tsx`
Expected: FAIL — `ProductCard` not found.

- [ ] **Step 3: Write `store/ProductCard.tsx`**

```tsx
import { Badge } from '@kbve/rn/ui/primitives/Badge';
import { Button } from '@kbve/rn/ui/primitives/Button';
import { Stack } from '@kbve/rn/ui/primitives/Stack';
import { Surface } from '@kbve/rn/ui/primitives/Surface';
import { Text } from '@kbve/rn/ui/primitives/Text';
import type { StoreProduct } from './types';

export interface ProductCardProps {
	product: StoreProduct;
	owned: boolean;
	authenticated: boolean;
	busy: boolean;
	onBuyDigital: (slug: string) => void;
	onBuyPhysical: (slug: string) => void;
}

export function ProductCard({
	product,
	owned,
	authenticated,
	busy,
	onBuyDigital,
	onBuyPhysical,
}: ProductCardProps) {
	const price = `${product.price.toLocaleString()} ${product.currency}`;
	const physical = product.fulfillment !== 'digital';
	return (
		<Surface>
			<Stack gap="xs">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{product.title}</Text>
					<Badge tone="neutral">{product.fulfillment}</Badge>
				</Stack>
				<Text variant="caption" tone="muted">
					{owned ? 'Unlocked. You own this.' : (product.description ?? '')}
				</Text>
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="body">{price}</Text>
					{owned ? (
						<Badge tone="success">Owned</Badge>
					) : !authenticated ? (
						<Text variant="caption" tone="muted">{`Sign in to buy · ${price}`}</Text>
					) : (
						<Button
							title={busy ? 'Purchasing…' : `Buy · ${price}`}
							variant="primary"
							disabled={busy}
							onPress={() =>
								physical
									? onBuyPhysical(product.slug)
									: onBuyDigital(product.slug)
							}
						/>
					)}
				</Stack>
			</Stack>
		</Surface>
	);
}
```

- [ ] **Step 4: Write `store/CheckoutModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button } from '@kbve/rn/ui/primitives/Button';
import { FormField } from '@kbve/rn/ui/primitives/FormField';
import { Select } from '@kbve/rn/ui/controls/Select';
import { Stack } from '@kbve/rn/ui/primitives/Stack';
import { Surface } from '@kbve/rn/ui/primitives/Surface';
import { Text } from '@kbve/rn/ui/primitives/Text';
import type { StoreApi } from './api';
import type { ShippingAddress, StoreVariant } from './types';
import { StoreApiError } from './errors';
import { notifyWalletRefresh } from './walletSync';

const EMPTY_ADDR: ShippingAddress = {
	name: '', line1: '', line2: '', city: '', region: '', postal_code: '', country: '',
};

const ADDR_FIELDS: [keyof ShippingAddress, string][] = [
	['name', 'Full name'],
	['line1', 'Address line 1'],
	['line2', 'Address line 2'],
	['city', 'City'],
	['region', 'State / region'],
	['postal_code', 'Postal code'],
	['country', 'Country'],
];

export interface CheckoutModalProps {
	api: StoreApi;
	slug: string;
	onClose: () => void;
	onPurchased?: (orderId: number) => void;
}

export function CheckoutModal({ api, slug, onClose, onPurchased }: CheckoutModalProps) {
	const [variants, setVariants] = useState<StoreVariant[]>([]);
	const [variantId, setVariantId] = useState('');
	const [qty, setQty] = useState('1');
	const [addr, setAddr] = useState<ShippingAddress>(EMPTY_ADDR);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<number | null>(null);

	useEffect(() => {
		void api
			.productDetail(slug)
			.then((d) => {
				setVariants(d.variants);
				if (d.variants[0]) setVariantId(d.variants[0].variant_id);
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'load failed'));
	}, [api, slug]);

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			const res = await api.buyPhysical(variantId, {
				qty: Math.max(1, Number(qty) || 1),
				shipping_address: addr,
			});
			notifyWalletRefresh();
			setDone(res.order_id);
			onPurchased?.(res.order_id);
		} catch (e) {
			if (e instanceof StoreApiError) {
				if (e.status === 402) setError('Not enough credits.');
				else if (e.code === 'P1020' || e.status === 409)
					setError('Out of stock or duplicate. Try again.');
				else if (e.status === 401) setError('Sign in to buy.');
				else setError(e.message || 'purchase failed');
			} else setError(e instanceof Error ? e.message : 'purchase failed');
		} finally {
			setBusy(false);
		}
	};

	const set = (k: keyof ShippingAddress) => (v: string) =>
		setAddr((a) => ({ ...a, [k]: v }));

	const invalid =
		busy || !variantId || !addr.name || !addr.line1 || !addr.city ||
		!addr.postal_code || !addr.country;

	return (
		<Surface>
			<Stack gap="sm">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="subtitle">{done ? `Order #${done} placed` : 'Checkout'}</Text>
					<Button title="Close" variant="ghost" onPress={onClose} accessibilityLabel="Close" />
				</Stack>
				{done ? (
					<Text variant="caption" tone="muted">
						Paid in credits. Track it in your order history.
					</Text>
				) : (
					<>
						{error ? (
							<Text variant="caption" tone="danger">{error}</Text>
						) : null}
						<Select
							value={variantId}
							onChange={setVariantId}
							options={variants.map((v) => ({
								value: v.variant_id,
								label: `${v.sku} · ${v.price} credits · ${v.stock === null ? 'in stock' : `${v.stock} left`}`,
							}))}
						/>
						<FormField
							label="Qty"
							keyboardType="number-pad"
							value={qty}
							onChangeText={setQty}
						/>
						{ADDR_FIELDS.map(([k, label]) => (
							<FormField
								key={k}
								label={label}
								value={addr[k] ?? ''}
								onChangeText={set(k)}
							/>
						))}
						<Button
							title={busy ? 'Placing…' : 'Buy with credits'}
							variant="primary"
							disabled={invalid}
							onPress={() => void submit()}
						/>
					</>
				)}
			</Stack>
		</Surface>
	);
}
```

- [ ] **Step 5: Append exports to `store/index.ts`**

```ts
export { ProductCard } from './ProductCard';
export { CheckoutModal } from './CheckoutModal';
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/ProductCard.test.tsx`
Expected: PASS. (If `Select`'s `onChange`/`options` prop names differ, check `packages/npm/rn/src/ui/controls/Select.types.ts` and adjust — the barrel exports `SelectOption`/`SelectProps`.)

- [ ] **Step 7: Commit**

```bash
git add packages/npm/rn/src/markets/store/ProductCard.tsx packages/npm/rn/src/markets/store/CheckoutModal.tsx packages/npm/rn/src/markets/store/index.ts packages/npm/rn/src/markets/store/__tests__/ProductCard.test.tsx
git commit -m "feat(rn): ProductCard + CheckoutModal markets store components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `OrderHistory` + `StoreView` composition (TDD)

**Files:**
- Create: `packages/npm/rn/src/markets/store/OrderHistory.tsx`, `store/StoreView.tsx`
- Modify: `store/index.ts` (append both)
- Test: `store/__tests__/StoreView.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  OrderHistory({ orders }: { orders: StoreOrder[] })
  StoreView({ getToken, baseUrl, authenticated }: StoreViewProps)
  interface StoreViewProps { getToken: () => Promise<string | null>; baseUrl?: string; authenticated: boolean; }
  ```

- [ ] **Step 1: Write failing test `store/__tests__/StoreView.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StoreView } from '../StoreView';

const PRODUCTS = [
	{ product_id: 'p1', slug: 'i-am-an-idiot', title: 'Idiot', description: 'gag',
		price: 100, currency: 'credits', fulfillment: 'digital', asset_ref: {},
		variant_count: 0, created_at: '' },
	{ product_id: 'p2', slug: 'mug', title: 'Mug', description: 'cup',
		price: 500, currency: 'credits', fulfillment: 'physical', asset_ref: {},
		variant_count: 1, created_at: '' },
];

describe('StoreView', () => {
	beforeEach(() => {
		global.fetch = vi.fn(async (url: string) => ({
			ok: true,
			status: 200,
			text: async () =>
				url.includes('/products') ? JSON.stringify(PRODUCTS)
					: url.includes('/entitlements') ? JSON.stringify([])
					: JSON.stringify([]),
		})) as any;
	});

	it('loads and renders catalog products', async () => {
		const { findByText } = render(
			<StoreView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText('Idiot')).toBeTruthy();
		expect(await findByText('Mug')).toBeTruthy();
	});

	it('renders the Buy credits panel', async () => {
		const { findByText } = render(
			<StoreView getToken={async () => null} baseUrl="" authenticated={false} />,
		);
		expect(await findByText('Buy credits')).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/StoreView.test.tsx`
Expected: FAIL — `StoreView` not found.

- [ ] **Step 3: Write `store/OrderHistory.tsx`**

```tsx
import { Stack } from '@kbve/rn/ui/primitives/Stack';
import { Surface } from '@kbve/rn/ui/primitives/Surface';
import { Text } from '@kbve/rn/ui/primitives/Text';
import type { StoreOrder } from './types';

export interface OrderHistoryProps {
	orders: StoreOrder[];
}

export function OrderHistory({ orders }: OrderHistoryProps) {
	if (orders.length === 0) return null;
	return (
		<Surface>
			<Stack gap="xs">
				<Text variant="subtitle">Your orders</Text>
				{orders.map((o) => (
					<Stack key={o.order_id} direction="row" justify="space-between">
						<Text variant="caption">
							{`#${o.order_id} · ${o.qty}× · ${o.credits_amount} credits · ${o.status}`}
						</Text>
						<Text variant="caption" tone="muted">
							{new Date(o.created_at).toLocaleDateString()}
						</Text>
					</Stack>
				))}
			</Stack>
		</Surface>
	);
}
```

- [ ] **Step 4: Write `store/StoreView.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from '@kbve/rn/ui/primitives/Stack';
import { Text } from '@kbve/rn/ui/primitives/Text';
import { tokens } from '@kbve/rn/ui/theme';
import { createStoreApi } from './api';
import { BuyCredits } from './BuyCredits';
import { ProductCard } from './ProductCard';
import { CheckoutModal } from './CheckoutModal';
import { OrderHistory } from './OrderHistory';
import { StoreApiError } from './errors';
import { notifyWalletRefresh } from './walletSync';
import { FEATURED_SLUG } from './types';
import type { StoreEntitlement, StoreOrder, StoreProduct } from './types';

export interface StoreViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
}

export function StoreView({ getToken, baseUrl = '', authenticated }: StoreViewProps) {
	const api = useMemo(() => createStoreApi({ getToken, baseUrl }), [getToken, baseUrl]);
	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [entitlements, setEntitlements] = useState<StoreEntitlement[]>([]);
	const [orders, setOrders] = useState<StoreOrder[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busySlug, setBusySlug] = useState<string | null>(null);
	const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setProducts(await api.catalog());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'load failed');
		}
		if (authenticated) {
			const [ents, ords] = await Promise.all([
				api.myEntitlements().catch(() => [] as StoreEntitlement[]),
				api.myOrders().catch(() => [] as StoreOrder[]),
			]);
			setEntitlements(ents);
			setOrders(ords);
		} else {
			setEntitlements([]);
			setOrders([]);
		}
	}, [api, authenticated]);

	useEffect(() => {
		void load();
	}, [load]);

	const owns = useCallback(
		(slug: string) => entitlements.some((e) => e.slug === slug),
		[entitlements],
	);

	const buyDigital = useCallback(
		async (slug: string) => {
			setBusySlug(slug);
			try {
				await api.buyProduct(slug);
				notifyWalletRefresh();
				setEntitlements(await api.myEntitlements().catch(() => entitlements));
			} catch (e) {
				if (e instanceof StoreApiError && e.status === 409) {
					notifyWalletRefresh();
					setEntitlements(await api.myEntitlements().catch(() => entitlements));
				} else {
					setError(e instanceof Error ? e.message : 'purchase failed');
				}
			} finally {
				setBusySlug(null);
			}
		},
		[api, entitlements],
	);

	const featured = products.find((p) => p.slug === FEATURED_SLUG);
	const rest = products.filter((p) => p.slug !== FEATURED_SLUG);

	return (
		<Stack gap="lg">
			<BuyCredits api={api} authenticated={authenticated} />
			{error ? (
				<Text variant="caption" tone="danger">{error}</Text>
			) : null}
			{featured ? (
				<ProductCard
					product={featured}
					owned={owns(featured.slug)}
					authenticated={authenticated}
					busy={busySlug === featured.slug}
					onBuyDigital={(s) => void buyDigital(s)}
					onBuyPhysical={setCheckoutSlug}
				/>
			) : null}
			<Text variant="subtitle">All products</Text>
			<View style={styles.grid}>
				{rest.map((p) => (
					<View key={p.product_id} style={styles.cell}>
						<ProductCard
							product={p}
							owned={owns(p.slug)}
							authenticated={authenticated}
							busy={busySlug === p.slug}
							onBuyDigital={(s) => void buyDigital(s)}
							onBuyPhysical={setCheckoutSlug}
						/>
					</View>
				))}
			</View>
			<OrderHistory orders={orders} />
			{checkoutSlug ? (
				<CheckoutModal
					api={api}
					slug={checkoutSlug}
					onClose={() => setCheckoutSlug(null)}
					onPurchased={() => void load()}
				/>
			) : null}
		</Stack>
	);
}

const styles = StyleSheet.create({
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md },
	cell: { flexGrow: 1, flexBasis: 300, maxWidth: '100%' },
});
```

- [ ] **Step 5: Append exports to `store/index.ts`**

```ts
export { OrderHistory } from './OrderHistory';
export { StoreView } from './StoreView';
export type { StoreViewProps } from './StoreView';
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm nx test rn --skip-nx-cache -- src/markets/store/__tests__/StoreView.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 7: Run the full rn suite + web-graph cleanliness check**

Run: `pnpm nx test rn --skip-nx-cache`
Expected: PASS (pre-existing rn tsc noise in rows.tsx/ClusterChartsPanel/Sheet is known — new markets files add none).

- [ ] **Step 8: Commit**

```bash
git add packages/npm/rn/src/markets/store/OrderHistory.tsx packages/npm/rn/src/markets/store/StoreView.tsx packages/npm/rn/src/markets/store/index.ts packages/npm/rn/src/markets/store/__tests__/StoreView.test.tsx
git commit -m "feat(rn): StoreView + OrderHistory compose markets store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: astro-kbve web bridge — `ReactStoreRN`

**Files:**
- Create: `apps/kbve/astro-kbve/src/components/store/ReactStoreRN.tsx`

**Interfaces:**
- Consumes: `StoreView` from `@kbve/rn/markets`; `initSupa`/`getSupa` from `@/lib/supa`; `useSession` from `@kbve/astro`.
- Produces: default-export React component (island entry).

- [ ] **Step 1: Write `ReactStoreRN.tsx`**

Model on `src/components/rnweb/ReactMinecraftDashRN.tsx` (token via `initSupa`/`getSupa`), but **no staff gate** (store is public) and `baseUrl=''` (public origin). Auth reactivity comes from `@kbve/astro` `useSession`.

```tsx
import { useMemo } from 'react';
import { useSession } from '@kbve/astro';
import { StoreView } from '@kbve/rn/markets';
import { initSupa, getSupa } from '@/lib/supa';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa().getSession().catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

export default function ReactStoreRN() {
	const { authenticated } = useSession();
	const token = useMemo(() => getToken, []);
	return <StoreView getToken={token} baseUrl="" authenticated={authenticated} />;
}
```

- [ ] **Step 2: Verify `useSession`'s returned shape**

Run: `grep -n "authenticated" apps/kbve/astro-kbve/src/components/store/BuyCredits.tsx`
Expected: confirms `useSession()` yields `{ ready, authenticated }` (the old DOM `BuyCredits` used it). If `ready` matters for first paint, gate: `if (!ready) return null;` — add it before the return if present in the hook.

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/store/ReactStoreRN.tsx
git commit -m "feat(astro-kbve): ReactStoreRN bridge for @kbve/rn/markets StoreView

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `AstroStoreShell` bento rewrite

**Files:**
- Modify: `apps/kbve/astro-kbve/src/components/store/AstroStoreShell.astro`

**Interfaces:**
- Consumes: `ReactStoreRN` (Task 6), `BentoShell.astro`, `RnDashSkeleton.astro`.

- [ ] **Step 1: Rewrite `AstroStoreShell.astro`**

Replace the whole file. One `StoreView` island inside one primary `BentoShell` (`id="orders"` anchors the rail's Orders link); a `bento-hero`; amber accent; `RnDashSkeleton` fallback + reserved height.

```astro
---
import BentoShell from '@/components/hero/BentoShell.astro';
import RnDashSkeleton from '@/components/dashboard/RnDashSkeleton.astro';
import ReactStoreRN from './ReactStoreRN';

const backdrop = 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?q=80&w=2400&auto=format&fit=crop';
---

<div class="store-hub" style={`--bento-hero-bg: url('${backdrop}')`}>
	<section class="bento-hero bento-section not-content" aria-label="KBVE Store">
		<div class="bento-hero__bg" aria-hidden="true"></div>
		<div class="bento-hero__frame bento-frame">
			<div class="bento-board bento-board--hero">
				<div class="bento-cell bento-hero-copy bento-card bento-card--glass">
					<span class="bento-badge bento-chip"><span>store</span></span>
					<h1 class="bento-title">Spend credits,
						<span class="bento-title__accent">own the drop.</span></h1>
					<p class="bento-lede">
						Buy collectibles and merch with credits. Every purchase mints an
						inventory item you own — and can later list on the marketplace.
					</p>
					<div class="bento-cta">
						<a class="bento-btn bento-btn--primary" href="#store">Browse the store
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M13 6l6 6-6 6" /></svg>
						</a>
						<a class="bento-btn bento-btn--ghost" href="/market/">Marketplace</a>
					</div>
				</div>
				{[
					{ v: 'Own it', l: 'Purchases mint inventory items' },
					{ v: 'Trade later', l: 'List on the marketplace' },
					{ v: 'Credits → items', l: 'Top up with Stripe' },
				].map((s) => (
					<div class="bento-cell bento-stat bento-card bento-card--glass">
						<span class="bento-stat__value">{s.v}</span>
						<span class="bento-stat__label">{s.l}</span>
					</div>
				))}
			</div>
		</div>
	</section>

	<BentoShell id="store" eyebrow="Browse" heading="Store">
		<div class="store-island">
			<ReactStoreRN client:only="react">
				<RnDashSkeleton slot="fallback" tiles={3} rows={4} />
			</ReactStoreRN>
		</div>
		<div id="orders" aria-hidden="true"></div>
	</BentoShell>
</div>

<style>
	.store-island { min-height: 60vh; }
</style>

<style is:global>{`
	.store-hub {
		--bento-accent: #fbbf24;
		--bento-accent-2: #f59e0b;
		--bento-btn-fg: #3a2a05;
	}
`}</style>
```

- [ ] **Step 2: Verify `RnDashSkeleton` prop names**

Run: `grep -nE "tiles|rows|Props|interface" apps/kbve/astro-kbve/src/components/dashboard/RnDashSkeleton.astro | head`
Expected: confirms `tiles`/`rows` props exist. Adjust the `<RnDashSkeleton>` attributes if the real prop names differ.

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/store/AstroStoreShell.astro
git commit -m "feat(astro-kbve): bento store shell wrapping @kbve/rn StoreView

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Commerce rail — `marketNav` + `MarkdownContent` branch + splash frontmatter

**Files:**
- Create: `apps/kbve/astro-kbve/src/components/market/marketNav.ts`
- Modify: `apps/kbve/astro-kbve/src/components/dashboard/MarkdownContent.astro`, `apps/kbve/astro-kbve/src/content/docs/store/index.mdx`, `tsconfig.base.json`, `apps/kbve/astro-kbve/tsconfig.json`

**Interfaces:**
- Consumes: `DashboardNavEntry`, `DashboardNavGroup`, `DashboardNavItem`, `buildBreadcrumbIn`, `isActiveIn`, `BreadcrumbCrumb` from `../dashboard/dashboardNav`.
- Produces: `MARKET_NAV`, `STORE_ROOT`, `MARKET_ROOT`, `buildStoreBreadcrumb`, `buildMarketBreadcrumb`.

- [ ] **Step 0: Add the `@kbve/rn/markets` tsconfig path aliases** (the bridge in Task 6 imports `@kbve/rn/markets`; tsconfig paths are explicit per-subpath, no `@kbve/rn/*` wildcard, so the subpath won't resolve without these).

In `tsconfig.base.json`, in `compilerOptions.paths`, after the `"@kbve/rn/dash"` line, add:

```json
"@kbve/rn/markets": ["packages/npm/rn/src/markets/index.ts"],
```

In `apps/kbve/astro-kbve/tsconfig.json`, in `compilerOptions.paths`, after the `"@kbve/rn/dash"` line, add:

```json
"@kbve/rn/markets": ["../../../packages/npm/rn/src/markets/index.ts"],
```

(No `.web` variant needed — `markets/index.ts` has no native-only code; its UI resolves through the existing `@kbve/rn/ui/*` alias whose `.web` variants win under vite's web resolve extensions.)

- [ ] **Step 1: Write `components/market/marketNav.ts`**

```ts
import type {
	BreadcrumbCrumb,
	DashboardNavEntry,
	DashboardNavItem,
} from '../dashboard/dashboardNav';
import { buildBreadcrumbIn } from '../dashboard/dashboardNav';

export const STORE_ROOT: DashboardNavItem = { label: 'Store', href: '/store/' };
export const MARKET_ROOT: DashboardNavItem = { label: 'Marketplace', href: '/market/' };

export const MARKET_NAV: DashboardNavEntry[] = [
	{
		label: 'Commerce',
		eyebrow: 'Buy & trade',
		href: '/store/',
		icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
		items: [
			{ label: 'Store', href: '/store/', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0', copy: 'Spend credits on collectibles.' },
			{ label: 'Marketplace', href: '/market/', icon: 'M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01', copy: 'Player listings settled in KHash.' },
		],
	},
	{
		label: 'Wallet',
		visibility: 'auth',
		href: '/dashboard/account/',
		icon: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z',
		items: [
			{ label: 'Account & Credits', href: '/dashboard/account/', icon: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z' },
			{ label: 'Orders', href: '/store/#orders', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z' },
		],
	},
];

export const buildStoreBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, STORE_ROOT, pathname);

export const buildMarketBreadcrumb = (pathname: string): BreadcrumbCrumb[] =>
	buildBreadcrumbIn(MARKET_NAV, MARKET_ROOT, pathname);
```

- [ ] **Step 2: Wire `MarkdownContent.astro` — imports**

Add after the existing `mapNav` import group (near line 29):

```ts
import {
	MARKET_NAV,
	STORE_ROOT,
	MARKET_ROOT,
	buildStoreBreadcrumb,
	buildMarketBreadcrumb,
} from '../market/marketNav';
```

- [ ] **Step 3: Wire `MarkdownContent.astro` — detection**

After the `const isMapdb = …` line (~line 49) add:

```ts
const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
const isStore = norm(pathname) === '/store/';
const isMarket = norm(pathname) === '/market/';
```

- [ ] **Step 4: Wire `MarkdownContent.astro` — shell branches**

In the `shell = …` ternary chain, insert two branches before the final `: undefined;` (i.e. after the `isMapdb` branch):

```ts
: isStore
	? {
			entries: MARKET_NAV,
			root: STORE_ROOT,
			menuLabel: 'Commerce menu',
			navLabel: 'Commerce',
			crumbs: buildStoreBreadcrumb(pathname),
			collapsible: true,
			withToc: true,
		}
	: isMarket
		? {
				entries: MARKET_NAV,
				root: MARKET_ROOT,
				menuLabel: 'Commerce menu',
				navLabel: 'Commerce',
				crumbs: buildMarketBreadcrumb(pathname),
				collapsible: true,
				withToc: true,
			}
```

(Attach these so the chain reads `… : isMapdb ? {…} : isStore ? {…} : isMarket ? {…} : undefined;`.)

- [ ] **Step 5: Add `template: splash` to `content/docs/store/index.mdx`**

Add `template: splash` to the frontmatter (after `description:` block, before `tableOfContents:`), leaving the rest intact:

```yaml
title: Store
description: |
    Spend credits to unlock KBVE collectibles. Purchases mint an inventory
    item you own and can later trade on the marketplace.
template: splash
tableOfContents: false
```

- [ ] **Step 6: Type-check the astro app**

Run: `pnpm nx run astro-kbve:check` (or `pnpm nx build astro-kbve` per `feedback_astro_kbve_build_via_nx`)
Expected: no new type errors from `marketNav.ts` / `MarkdownContent.astro`.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.base.json apps/kbve/astro-kbve/tsconfig.json apps/kbve/astro-kbve/src/components/market/marketNav.ts apps/kbve/astro-kbve/src/components/dashboard/MarkdownContent.astro apps/kbve/astro-kbve/src/content/docs/store/index.mdx
git commit -m "feat(astro-kbve): Commerce gutter rail + splash for /store/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build astro-kbve**

Run: `pnpm nx build astro-kbve --skip-nx-cache`
Expected: build succeeds; `/store/` emitted. If the rn-web island fails to bundle, confirm `astro.config.mjs` `optimizeDeps.include`/`define` cover the markets graph (it inherits the existing rn-web config; no new native-only deps were added).

- [ ] **Step 2: Web-graph cleanliness (no vector-icons)**

Run a focused esbuild over `@kbve/rn/markets` (alias `react-native`→`react-native-web`, `.web.tsx`/`.web.ts` resolve, external peer deps) and grep the metafile inputs.
Expected: no `@expo/vector-icons` in the markets island graph (per `project_rn_web_astro_bridge` point 7). If present, trace the offending import and route it through `@kbve/rn/ui` primitives.

- [ ] **Step 3: SSR fallback present (no-JS)**

Serve the build (`pnpm nx preview astro-kbve` or the repo's static preview) and:
Run: `curl -s http://localhost:4321/store/ | grep -c "rn-dash-skeleton"` (use the real skeleton class from `RnDashSkeleton.astro`)
Expected: count ≥ 1 (Astro emits the fallback inline + in a `<template>`, so a double count is normal, not a bug).

- [ ] **Step 4: Client hydration (headless)**

Drive `/store/` with headless Playwright (`chrome-headless-shell` from the ms-playwright cache), listening for `pageerror`/`console` errors.
Expected: no `pageerror`; the store island mounts; catalog products render; the "Buy credits" panel is visible; the Commerce rail highlights Store; breadcrumb reads `Store`. (curl cannot see hydration — Playwright is required, per bridge point 3.)

- [ ] **Step 5: Manual smoke (optional, if a dev session is available)**

`pnpm nx dev astro-kbve`, open `/store/`, confirm: catalog loads, a Buy-credits pack press redirects toward Stripe, the Wallet rail group is hidden when signed out.

- [ ] **Step 6: Final commit / open PR**

```bash
git push -u origin HEAD
gh pr create --base dev --title "feat: /store/ on @kbve/rn/markets + bento Commerce rail" --body "Phase 1 of the store/market → @kbve/rn/markets epic. Spec: docs/superpowers/specs/2026-07-19-store-market-bento-design.md. Kube/docs changes: none."
```

(PR targets `dev`. Do not push to `dev`/`main` directly.)

---

## Self-Review

**Spec coverage:**
- Spec §A (RN composition markets/store): Tasks 1–5. ✓ (`IdiotCard` reveal explicitly deferred per spec non-goals; featured renders as `ProductCard`.)
- Spec §B (web bridge `ReactStoreRN`, baseUrl='', no staff gate): Task 6. ✓
- Spec §C (bento `AstroStoreShell`, amber accent, one island, `RnDashSkeleton`, `#orders`): Task 7. ✓
- Spec §D (marketNav, MarkdownContent exact-root branch, splash): Task 8. ✓
- Verification (build, web-graph, SSR fallback, Playwright, rail/breadcrumb): Task 9. ✓
- package.json `./markets` export: Task 1 Step 8. ✓

**Placeholder scan:** No TBD/TODO. Two "verify the real prop name" steps (6.2, 7.2) are guarded fallbacks against upstream API drift, each with the exact grep to run — not unfilled blanks. The Task-1 barrel note resolves to a concrete comment-free file.

**Type consistency:** `createStoreApi`/`StoreApi`/`StoreApiOptions` names match across Tasks 2–5. `StoreView`/`StoreViewProps` consistent (Task 5 defines, Tasks 6–7 consume). `ProductCard` prop set (`onBuyDigital`/`onBuyPhysical`/`busy`/`owned`/`authenticated`) identical in Task 4 def and Task 5 use. `MARKET_NAV`/`STORE_ROOT`/`MARKET_ROOT`/`buildStoreBreadcrumb`/`buildMarketBreadcrumb` consistent between Task 8 marketNav and MarkdownContent wiring. `notifyWalletRefresh`/`openCheckout`/`newIdempotencyKey` names stable from Task 1.
