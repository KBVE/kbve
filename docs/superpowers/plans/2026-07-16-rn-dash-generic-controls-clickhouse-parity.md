# RN Dashboard Generic Controls + ClickHouse 1:1 Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach 1:1 feature parity with the retired `ReactCH*` ClickHouse dashboard inside the RN `@kbve/rn/dash` framework, delivered as generic, additive, reusable primitives (server-param controls, saved views, cross-platform Select, meta-driven stats), then delete the dead code.

**Architecture:** Add opt-in generic capabilities to `@kbve/rn/dash` (params + `setParams` → refetch, `ControlBar`, clickable `StatGrid`, `savedViews`, shared `Select`). ClickHouse becomes the first full consumer, composing `StreamView` + a namespace `metaPanel` + an error-digest secondary stream. Mount on web (Astro bridge) and native (minimal Expo screen). Existing dashboards are untouched until they opt in.

**Tech Stack:** TypeScript, React, React Native / react-native-web, nanostore-style `createSignal` (`@kbve/core`), `kvStore` (AsyncStorage), Vitest, Rust (jedi, ClickHouse SQL builders).

## Global Constraints

- Platform-agnostic only: RN primitives, `kvStore` for persistence. No DOM APIs, no `localStorage`, no direct native-picker imports in feature code.
- Additive / backward-compatible: no breaking change to existing `StreamStore`/`StreamView`/`StreamLens`/`StreamSourceConfig` public shapes. New fields optional; new store methods added, none removed or renamed. Existing dashboard adapter tests must stay green.
- Platform split convention (existing in this package): base file = native, `.web.tsx`/`.web.ts` = web override. Do NOT use `.native.tsx`.
- `StreamParams = Record<string, string | number | undefined>`; `undefined` values are dropped from request bodies and cache keys.
- Backend row cap stays `MAX_LIMIT = 500`. Time-range `ALL` = `minutes: 0` sentinel (drops the timestamp filter). Default CH window `minutes: 360` (6h), `limit: 500`.
- Worktree has no `node_modules`. Run Vitest via the main checkout's toolchain (see "Running tests" note in Task 0).
- Commit style: Conventional Commits, no Claude co-author/link line.

---

## File structure

Generic framework (`packages/npm/rn/src/`):
- `dash/types.ts` — MODIFY: `StreamParams`, `StreamControl`, `SavedView`; extend `StreamState`, `StreamStore`, `StreamSourceConfig`, `StreamLens`.
- `dash/createStreamSource.ts` — MODIFY: params state, `setParams`/`resetParams`, params-scoped cache key, params passed to `fetch`/`fetchMeta`, saved-views state + methods + hydrate/seed.
- `dash/savedViews.ts` — CREATE: pure helpers (seed-merge, add/remove/rename/reorder, export/import).
- `dash/controls/ControlBar.tsx` — CREATE: renders `segmented`/`select`/`search` controls from `lens.controls`.
- `dash/controls/SavedViewTabs.tsx` — CREATE: tab strip for saved views.
- `dash/StatGrid.tsx` — MODIFY: honor optional `onPress` per tile.
- `dash/StreamView.tsx` — MODIFY: render `ControlBar`, `SavedViewTabs`, Refresh action (all conditional).
- `dash/_ui.ts` — MODIFY: re-export `Select`, `SelectOption`, `SelectProps`.
- `ui/controls/Select.types.ts` — CREATE: shared contract.
- `ui/controls/Select.tsx` — CREATE: native (Sheet-backed).
- `ui/controls/Select.web.tsx` — CREATE: web (`<select>`).

ClickHouse composition (`packages/npm/rn/src/dash/clickhouse/`):
- `clickhouseStream.ts` — CREATE: `createClickHouseStream` v2 (params + fetchMeta stats + controls + defaultViews). Supersedes the adapter's stream factory.
- `errorGroupsStream.ts` — CREATE: secondary stream (`command:'error_groups'`) + `errorGroupsLens`.
- `NamespaceGrid.tsx` — CREATE: `metaPanel` renderer.
- `ErrorDigest.tsx` — CREATE: panel bound to error-groups stream.
- `ClickHouseView.tsx` — CREATE: composed view.
- `index.ts` — CREATE: re-exports for `@kbve/rn/dash`.
- `dash/adapters/clickhouse.tsx` — MODIFY: keep `LogItem`/`normalize`/`clickhouseLens` (extended with `controls` + meta stats); re-export from new location or delegate.

Backend (`packages/rust/jedi/src/entity/pipe_clickhouse/`):
- `logs.rs` — MODIFY: `time_condition` helper + `minutes:0` ALL sentinel in `build_query_sql`/`build_stats_sql`/`build_error_groups_sql` + test.

Web mount:
- `apps/kbve/astro-kbve/src/components/rnweb/ReactClickHouseDashRN.tsx` — MODIFY: render `ClickHouseView`.

Native mount:
- `packages/npm/rn/src/.../ClickHouseScreen.tsx` — CREATE: thin wrapper (`<ClickHouseView/>` + token provider), exported and reachable from `HomeView`.

Deletion (final task):
- Delete 9 `ReactCH*` files; slim `apps/kbve/astro-kbve/src/components/dashboard/clickhouseService.ts` to `fetchIndexedLogs` + `LogRow`.

---

## Task 0: Baseline — confirm tests run from the worktree

**Files:** none (environment check).

- [ ] **Step 1: Run the existing dash tests via the main checkout toolchain**

The worktree has no `node_modules`. Run Vitest against the worktree sources using the main checkout's installed binary, pointing at the rn package project:

Run:
```bash
cd /Users/alappatel/Documents/GitHub/kbve && \
  pnpm vitest run --root packages/npm/rn --dir /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics/packages/npm/rn/src/dash
```
If that path form is awkward, alternatively run the rn package's vitest from the worktree with the main `node_modules` on `NODE_PATH`:
```bash
cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics/packages/npm/rn && \
  NODE_PATH=/Users/alappatel/Documents/GitHub/kbve/node_modules \
  node /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/vitest run src/dash
```
Expected: existing `dash/adapters/__tests__/clickhouse.test.ts` passes. Record the exact working command; every later "Run tests" step uses it (referred to below as **`<VITEST> <path>`**).

- [ ] **Step 2: Commit nothing** — this is a discovery step. Note the working command in the plan's margin if needed.

---

## Task 1: Types — params, controls, saved views

**Files:**
- Modify: `packages/npm/rn/src/dash/types.ts`

**Interfaces:**
- Produces:
  - `type StreamParams = Record<string, string | number | undefined>`
  - `interface SavedView { id: string; name: string; params: StreamParams; pollMs?: number | null; seeded?: boolean }`
  - `type StreamControl` (union of `segmented` | `select` | `search`)
  - `StreamState<TItem>` gains `params: StreamParams; views: SavedView[]; activeViewId: string | null`
  - `StreamStore<TItem>` gains `setParams`, `resetParams`, `saveView`, `applyView`, `removeView`, `renameView`, `reorderViews`, `exportViews`, `importViews`
  - `StreamSourceConfig<TRaw,TItem>`: `fetch` and `fetchMeta` gain a second `params: StreamParams` arg; add `initialParams?`, `defaultViews?`
  - `StreamLens<TItem>` gains `controls?: readonly StreamControl[]`

- [ ] **Step 1: Add the new types** (append/modify in `types.ts`)

```ts
export type StreamParams = Record<string, string | number | undefined>;

export interface SavedView {
	id: string;
	name: string;
	params: StreamParams;
	pollMs?: number | null;
	/** Seeded by the adapter's defaultViews; hidden-not-deleted on removal. */
	seeded?: boolean;
}

export type StreamControl =
	| {
			kind: 'segmented';
			param: string;
			label?: string;
			options: { label: string; value: string | number }[];
	  }
	| {
			kind: 'select';
			param: string;
			label?: string;
			placeholder?: string;
			options?: { label: string; value: string }[];
			optionsFromMeta?: (meta: unknown) => { label: string; value: string }[];
	  }
	| {
			kind: 'search';
			param: string;
			placeholder?: string;
			debounceMs?: number;
	  };
```

- [ ] **Step 2: Extend `StreamState`** — add three fields:

```ts
	// inside interface StreamState<TItem>
	params: StreamParams;
	views: SavedView[];
	activeViewId: string | null;
```

- [ ] **Step 3: Extend `StreamSourceConfig`** — change fetch signatures and add config:

```ts
	fetch: (ctx: FetchContext, params: StreamParams) => Promise<TRaw[]>;
	fetchMeta?: (ctx: FetchContext, params: StreamParams) => Promise<unknown>;
	initialParams?: StreamParams;
	defaultViews?: SavedView[];
```

- [ ] **Step 4: Extend `StreamStore`** — add methods:

```ts
	setParams: (patch: StreamParams) => void;
	resetParams: () => void;
	saveView: (name: string) => void;
	applyView: (id: string) => void;
	removeView: (id: string) => void;
	renameView: (id: string, name: string) => void;
	reorderViews: (ids: string[]) => void;
	exportViews: () => string;
	importViews: (json: string) => number;
```

- [ ] **Step 5: Extend `StreamLens`** — add:

```ts
	controls?: readonly StreamControl[];
```

- [ ] **Step 6: Typecheck**

Run: `<VITEST> src/dash` (types compile is exercised by the test run; a dedicated `tsc --noEmit` is optional).
Expected: existing tests still pass (no runtime change yet). If TS errors surface in `createStreamSource.ts` for the changed `fetch` signature, that is expected and fixed in Task 2.

- [ ] **Step 7: Commit**

```bash
git add packages/npm/rn/src/dash/types.ts
git commit -m "feat(rn-dash): add StreamParams, StreamControl, SavedView types"
```

---

## Task 2: `savedViews` pure helpers

**Files:**
- Create: `packages/npm/rn/src/dash/savedViews.ts`
- Test: `packages/npm/rn/src/dash/__tests__/savedViews.test.ts`

**Interfaces:**
- Consumes: `SavedView`, `StreamParams` (Task 1).
- Produces:
  - `seedViews(seeded: SavedView[], stored: SavedView[]): SavedView[]`
  - `addView(views: SavedView[], view: SavedView): SavedView[]`
  - `removeView(views: SavedView[], id: string): SavedView[]`
  - `renameView(views: SavedView[], id: string, name: string): SavedView[]`
  - `reorderViews(views: SavedView[], ids: string[]): SavedView[]`
  - `exportViews(views: SavedView[]): string`
  - `importViews(json: string): SavedView[]` (throws on bad JSON; caller catches)
  - `makeViewId(name: string, index: number): string` (deterministic — no `Date.now`/`Math.random`, which are unavailable in some sandboxes and non-deterministic for tests)

- [ ] **Step 1: Write the failing test**

```ts
// packages/npm/rn/src/dash/__tests__/savedViews.test.ts
import { describe, it, expect } from 'vitest';
import {
	seedViews, addView, removeView, renameView,
	reorderViews, exportViews, importViews, makeViewId,
} from '../savedViews';
import type { SavedView } from '../types';

const v = (id: string, name = id): SavedView => ({ id, name, params: { minutes: 360 } });

describe('savedViews', () => {
	it('seeds defaults, user views win on id', () => {
		const seeded = [{ ...v('errors-24h'), seeded: true }];
		const stored = [{ ...v('errors-24h'), name: 'My Errors' }];
		const out = seedViews(seeded, stored);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe('My Errors');
	});

	it('keeps seeded views not overridden by user', () => {
		const seeded = [{ ...v('a'), seeded: true }, { ...v('b'), seeded: true }];
		const out = seedViews(seeded, [{ ...v('a'), name: 'Custom A' }]);
		expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
		expect(out.find((x) => x.id === 'a')!.name).toBe('Custom A');
	});

	it('adds, renames, removes, reorders', () => {
		let list = addView([], v('x'));
		list = addView(list, v('y'));
		list = renameView(list, 'x', 'X2');
		expect(list.find((i) => i.id === 'x')!.name).toBe('X2');
		list = reorderViews(list, ['y', 'x']);
		expect(list.map((i) => i.id)).toEqual(['y', 'x']);
		list = removeView(list, 'y');
		expect(list.map((i) => i.id)).toEqual(['x']);
	});

	it('round-trips export/import', () => {
		const list = [v('a'), v('b')];
		expect(importViews(exportViews(list))).toEqual(list);
	});

	it('throws on bad import JSON', () => {
		expect(() => importViews('not json')).toThrow();
	});

	it('makeViewId is deterministic and unique-ish', () => {
		expect(makeViewId('Errors 24h', 0)).toBe(makeViewId('Errors 24h', 0));
		expect(makeViewId('Errors 24h', 0)).not.toBe(makeViewId('Errors 24h', 1));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<VITEST> src/dash/__tests__/savedViews.test.ts`
Expected: FAIL — module `../savedViews` not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/npm/rn/src/dash/savedViews.ts
import type { SavedView } from './types';

export function makeViewId(name: string, index: number): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	return `${slug || 'view'}-${index}`;
}

export function seedViews(seeded: SavedView[], stored: SavedView[]): SavedView[] {
	const byId = new Map<string, SavedView>();
	for (const s of seeded) byId.set(s.id, { ...s, seeded: true });
	for (const u of stored) byId.set(u.id, { ...byId.get(u.id), ...u });
	return [...byId.values()];
}

export function addView(views: SavedView[], view: SavedView): SavedView[] {
	return [...views.filter((v) => v.id !== view.id), view];
}

export function removeView(views: SavedView[], id: string): SavedView[] {
	return views.filter((v) => v.id !== id);
}

export function renameView(views: SavedView[], id: string, name: string): SavedView[] {
	return views.map((v) => (v.id === id ? { ...v, name } : v));
}

export function reorderViews(views: SavedView[], ids: string[]): SavedView[] {
	const byId = new Map(views.map((v) => [v.id, v]));
	const ordered = ids.map((id) => byId.get(id)).filter((v): v is SavedView => !!v);
	const rest = views.filter((v) => !ids.includes(v.id));
	return [...ordered, ...rest];
}

export function exportViews(views: SavedView[]): string {
	return JSON.stringify(views);
}

export function importViews(json: string): SavedView[] {
	const parsed = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error('views JSON must be an array');
	return parsed as SavedView[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<VITEST> src/dash/__tests__/savedViews.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/savedViews.ts packages/npm/rn/src/dash/__tests__/savedViews.test.ts
git commit -m "feat(rn-dash): saved-views pure helpers with seed/merge and import/export"
```

---

## Task 3: `createStreamSource` — params, setParams, params-scoped cache

**Files:**
- Modify: `packages/npm/rn/src/dash/createStreamSource.ts`
- Test: `packages/npm/rn/src/dash/__tests__/createStreamSource.params.test.ts`

**Interfaces:**
- Consumes: `StreamParams`, extended `StreamState`/`StreamStore`/`StreamSourceConfig` (Task 1).
- Produces: a store whose `fetch`/`fetchMeta` receive `state.params`; `setParams(patch)` merges + refetches; `resetParams()` restores `initialParams`; cache key `dash:${key}:${serializeParams(params)}`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/npm/rn/src/dash/__tests__/createStreamSource.params.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createStreamSource } from '../createStreamSource';

function make(fetchSpy: (params: unknown) => Promise<unknown[]>) {
	return createStreamSource<{ id: string }, { id: string }>({
		key: 'test',
		initialParams: { minutes: 60 },
		fetch: (_ctx, params) => fetchSpy(params) as Promise<{ id: string }[]>,
		normalize: (r) => r,
		id: (i) => i.id,
	});
}

describe('createStreamSource params', () => {
	it('passes initialParams to fetch', async () => {
		const spy = vi.fn(async () => []);
		const store = make(spy);
		await store.refresh();
		expect(spy).toHaveBeenCalledWith({ minutes: 60 });
	});

	it('setParams merges and refetches with new params', async () => {
		const spy = vi.fn(async () => []);
		const store = make(spy);
		await store.refresh();
		store.setParams({ minutes: 360, level: 'error' });
		// setParams triggers an async refetch; flush microtasks
		await Promise.resolve();
		await Promise.resolve();
		expect(spy).toHaveBeenLastCalledWith({ minutes: 360, level: 'error' });
		expect(store.get().params).toEqual({ minutes: 360, level: 'error' });
	});

	it('resetParams restores initialParams', async () => {
		const spy = vi.fn(async () => []);
		const store = make(spy);
		store.setParams({ minutes: 1440 });
		store.resetParams();
		await Promise.resolve();
		await Promise.resolve();
		expect(store.get().params).toEqual({ minutes: 60 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<VITEST> src/dash/__tests__/createStreamSource.params.test.ts`
Expected: FAIL — `setParams`/`resetParams` undefined, or `fetch` called without params.

- [ ] **Step 3: Implement — update `EMPTY`, add `serializeParams`, thread params through fetch, add methods**

In `createStreamSource.ts`:

Update `EMPTY` to seed params/views:
```ts
const EMPTY = <TItem>(initialParams: StreamParams): StreamState<TItem> => ({
	items: [],
	meta: null,
	loading: true,
	error: null,
	lastUpdated: null,
	fromCache: false,
	expandedId: null,
	search: '',
	filterId: null,
	groupKey: null,
	actionBusy: null,
	actionError: null,
	actionMsg: null,
	params: initialParams,
	views: [],
	activeViewId: null,
});
```

Add near the top:
```ts
function serializeParams(params: StreamParams): string {
	const keys = Object.keys(params).filter((k) => params[k] !== undefined).sort();
	return keys.map((k) => `${k}=${params[k]}`).join('&');
}
```

In the factory body, destructure `initialParams = {}` from config, and initialize the signal:
```ts
const signal = createSignal<StreamState<TItem>>(EMPTY<TItem>(initialParams));
```

Change `runFetch` to read current params and pass them, and make the cache key params-scoped:
```ts
const runFetch = async (): Promise<void> => {
	controller?.abort();
	const ctrl = new AbortController();
	controller = ctrl;
	const params = signal.get().params;
	const scopedKey = `dash:${key}:${serializeParams(params)}`;
	try {
		const [raw, meta] = await Promise.all([
			fetch({ signal: ctrl.signal }, params),
			fetchMeta ? fetchMeta({ signal: ctrl.signal }, params).catch(() => undefined) : Promise.resolve(undefined),
		]);
		if (ctrl.signal.aborted) return;
		const items = reconcile(raw.map(normalize));
		patch({ items, ...(fetchMeta ? { meta: meta ?? null } : {}), loading: false, error: null, fromCache: false, lastUpdated: Date.now() });
		if (cacheTtlMs) {
			void kvStore.set(scopedKey, { value: items, storedAt: Date.now() });
			if (fetchMeta) void kvStore.set(`${scopedKey}:meta`, { value: meta ?? null, storedAt: Date.now() });
		}
	} catch (e: unknown) {
		if (ctrl.signal.aborted) return;
		patch({ loading: false, error: e instanceof Error ? e.message : 'Request failed' });
	}
};
```
> Note: `Date.now()` is used in the existing file and is fine at runtime here (this is app code, not a workflow sandbox).

Update `hydrate` to use the params-scoped key:
```ts
const hydrate = async (): Promise<void> => {
	if (!cacheTtlMs) return;
	const params = signal.get().params;
	const scopedKey = `dash:${key}:${serializeParams(params)}`;
	try {
		const [cached, cachedMeta] = await Promise.all([
			kvStore.get<CacheEntry<TItem[]>>(scopedKey),
			fetchMeta ? kvStore.get<CacheEntry<unknown>>(`${scopedKey}:meta`) : Promise.resolve(null),
		]);
		if (cachedMeta) patch({ meta: cachedMeta.value });
		if (cached && signal.get().items.length === 0) {
			prevById = new Map(cached.value.map((i) => [id(i), i]));
			patch({ items: cached.value, loading: false, fromCache: true, lastUpdated: cached.storedAt });
		}
	} catch { /* cache miss */ }
};
```

Add methods to the returned store object:
```ts
	setParams: (patchParams) => {
		patch({ params: { ...signal.get().params, ...patchParams } });
		void runFetch();
	},
	resetParams: () => {
		patch({ params: { ...initialParams } });
		void runFetch();
	},
```
(Leave `saveView`/`applyView`/etc. as stubs added in Task 4 — but to keep this task's store type-complete, add temporary no-op stubs now that Task 4 replaces:)
```ts
	saveView: () => {},
	applyView: () => {},
	removeView: () => {},
	renameView: () => {},
	reorderViews: () => {},
	exportViews: () => '[]',
	importViews: () => 0,
```

Import `StreamParams` in the type import line.

- [ ] **Step 4: Run test to verify it passes**

Run: `<VITEST> src/dash/__tests__/createStreamSource.params.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full dash suite to prove backward-compat**

Run: `<VITEST> src/dash`
Expected: PASS — existing adapter tests unaffected (their `fetch` ignores the new 2nd arg).

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/dash/createStreamSource.ts packages/npm/rn/src/dash/__tests__/createStreamSource.params.test.ts
git commit -m "feat(rn-dash): params state + setParams/resetParams with params-scoped cache"
```

---

## Task 4: `createStreamSource` — saved-views wiring

**Files:**
- Modify: `packages/npm/rn/src/dash/createStreamSource.ts`
- Test: `packages/npm/rn/src/dash/__tests__/createStreamSource.views.test.ts`

**Interfaces:**
- Consumes: `savedViews.ts` helpers, `defaultViews` config, `setParams`.
- Produces: working `saveView`/`applyView`/`removeView`/`renameView`/`reorderViews`/`exportViews`/`importViews`; views persisted to `dash:${key}:views`; `defaultViews` seeded on `start`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/npm/rn/src/dash/__tests__/createStreamSource.views.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createStreamSource } from '../createStreamSource';

function make() {
	return createStreamSource<{ id: string }, { id: string }>({
		key: 'vt',
		initialParams: { minutes: 60 },
		defaultViews: [{ id: 'errors', name: 'Errors', params: { minutes: 1440, level: 'error' }, seeded: true }],
		fetch: async () => [],
		normalize: (r) => r,
		id: (i) => i.id,
	});
}

describe('createStreamSource saved views', () => {
	it('saveView snapshots current params', () => {
		const store = make();
		store.setParams({ minutes: 720 });
		store.saveView('Half day');
		const saved = store.get().views.find((v) => v.name === 'Half day');
		expect(saved?.params).toEqual({ minutes: 720 });
	});

	it('applyView sets params from the view', async () => {
		const store = make();
		store.saveView('snap'); // snapshot minutes:60
		store.setParams({ minutes: 999 });
		const id = store.get().views.find((v) => v.name === 'snap')!.id;
		store.applyView(id);
		expect(store.get().params.minutes).toBe(60);
		expect(store.get().activeViewId).toBe(id);
	});

	it('exportViews/importViews round-trips', () => {
		const store = make();
		store.saveView('a');
		const json = store.exportViews();
		const n = store.importViews(json);
		expect(n).toBeGreaterThan(0);
	});

	it('importViews returns 0 on bad JSON without throwing', () => {
		const store = make();
		expect(store.importViews('nope')).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<VITEST> src/dash/__tests__/createStreamSource.views.test.ts`
Expected: FAIL — stubs return no-ops.

- [ ] **Step 3: Implement — replace the Task-3 stubs with real methods**

Import helpers:
```ts
import * as SV from './savedViews';
```

Destructure `defaultViews = []` from config. Add a views-persistence key and a writer:
```ts
const viewsKey = `dash:${key}:views`;
const persistViews = (views: import('./types').SavedView[]) =>
	void kvStore.set(viewsKey, { value: views, storedAt: Date.now() });
```

In `start()`, after `hydrate()`, seed views from kvStore + defaults:
```ts
start: () => {
	if (started) return;
	started = true;
	void (async () => {
		let stored: import('./types').SavedView[] = [];
		try {
			const entry = await kvStore.get<{ value: import('./types').SavedView[] }>(viewsKey);
			stored = entry?.value ?? [];
		} catch { /* ignore */ }
		patch({ views: SV.seedViews(defaultViews, stored) });
	})();
	void hydrate().then(runFetch);
	if (pollMs && pollMs > 0) timer = setInterval(() => void runFetch(), pollMs);
},
```

Replace the stub methods:
```ts
	saveView: (name) => {
		const view = {
			id: SV.makeViewId(name, signal.get().views.length),
			name,
			params: { ...signal.get().params },
		};
		const views = SV.addView(signal.get().views, view);
		patch({ views });
		persistViews(views);
	},
	applyView: (id) => {
		const view = signal.get().views.find((v) => v.id === id);
		if (!view) return;
		patch({ params: { ...view.params }, activeViewId: id });
		void runFetch();
	},
	removeView: (id) => {
		const views = SV.removeView(signal.get().views, id);
		patch({ views });
		persistViews(views);
	},
	renameView: (id, name) => {
		const views = SV.renameView(signal.get().views, id, name);
		patch({ views });
		persistViews(views);
	},
	reorderViews: (ids) => {
		const views = SV.reorderViews(signal.get().views, ids);
		patch({ views });
		persistViews(views);
	},
	exportViews: () => SV.exportViews(signal.get().views),
	importViews: (json) => {
		try {
			const incoming = SV.importViews(json);
			const merged = incoming.reduce((acc, v) => SV.addView(acc, v), signal.get().views);
			patch({ views: merged });
			persistViews(merged);
			return incoming.length;
		} catch {
			return 0;
		}
	},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<VITEST> src/dash/__tests__/createStreamSource.views.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full dash suite green**

Run: `<VITEST> src/dash`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/dash/createStreamSource.ts packages/npm/rn/src/dash/__tests__/createStreamSource.views.test.ts
git commit -m "feat(rn-dash): saved-views store methods with kvStore persistence + seeding"
```

---

## Task 5: Shared `Select` primitive (native + web)

**Files:**
- Create: `packages/npm/rn/src/ui/controls/Select.types.ts`
- Create: `packages/npm/rn/src/ui/controls/Select.tsx` (native, Sheet-backed)
- Create: `packages/npm/rn/src/ui/controls/Select.web.tsx` (web `<select>`)
- Modify: `packages/npm/rn/src/dash/_ui.ts` (re-export)
- Test: `packages/npm/rn/src/ui/controls/__tests__/Select.web.test.tsx`

**Interfaces:**
- Produces: `SelectOption<T>`, `SelectProps<T>`, `Select` component with identical contract on both platforms.

- [ ] **Step 1: Write the contract**

```ts
// packages/npm/rn/src/ui/controls/Select.types.ts
export interface SelectOption<T extends string = string> {
	label: string;
	value: T;
	disabled?: boolean;
}
export interface SelectProps<T extends string = string> {
	value?: T;
	options: SelectOption<T>[];
	placeholder?: string;
	disabled?: boolean;
	onValueChange: (value: T) => void;
}
```

- [ ] **Step 2: Write the failing web test**

```tsx
// packages/npm/rn/src/ui/controls/__tests__/Select.web.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Select } from '../Select.web';

describe('Select.web', () => {
	it('renders options and fires onValueChange', () => {
		const onChange = vi.fn();
		const { getByRole } = render(
			<Select
				value="a"
				options={[{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]}
				onValueChange={onChange}
			/>,
		);
		const select = getByRole('combobox') as HTMLSelectElement;
		fireEvent.change(select, { target: { value: 'b' } });
		expect(onChange).toHaveBeenCalledWith('b');
	});
});
```
> If `@testing-library/react` is not already a dev dependency of the package, check `packages/npm/rn/package.json`; existing component tests indicate the RN testing setup. If web DOM testing isn't configured, downgrade this to a pure render-less unit test of an extracted `onChange` handler and note it. Prefer the DOM test if the toolchain supports it.

- [ ] **Step 3: Run test to verify it fails**

Run: `<VITEST> src/ui/controls/__tests__/Select.web.test.tsx`
Expected: FAIL — `../Select.web` not found.

- [ ] **Step 4: Implement web Select**

```tsx
// packages/npm/rn/src/ui/controls/Select.web.tsx
import type { SelectProps } from './Select.types';
import { tokens } from '../theme';

export function Select<T extends string>({
	value, options, placeholder, disabled, onValueChange,
}: SelectProps<T>) {
	return (
		<select
			value={value ?? ''}
			disabled={disabled}
			onChange={(e) => onValueChange(e.target.value as T)}
			style={{
				color: tokens.color.text,
				background: tokens.color.surface,
				border: `1px solid ${tokens.color.border}`,
				borderRadius: tokens.radius.md,
				padding: '6px 10px',
				fontSize: 13,
			}}>
			{placeholder ? <option value="" disabled>{placeholder}</option> : null}
			{options.map((o) => (
				<option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
			))}
		</select>
	);
}
export type { SelectProps, SelectOption } from './Select.types';
```

- [ ] **Step 5: Implement native Select (Sheet-backed)**

```tsx
// packages/npm/rn/src/ui/controls/Select.tsx
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../primitives/Text';
import { Stack } from '../primitives/Stack';
import { Sheet } from '../overlays/Sheet';
import { tokens } from '../theme';
import type { SelectProps } from './Select.types';

export function Select<T extends string>({
	value, options, placeholder = 'Select…', disabled, onValueChange,
}: SelectProps<T>) {
	const [open, setOpen] = useState(false);
	const selected = options.find((o) => o.value === value);
	return (
		<>
			<Pressable
				disabled={disabled}
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityState={{ disabled, expanded: open }}
				style={[styles.trigger, disabled && styles.disabled]}>
				<Text variant="caption">{selected?.label ?? placeholder}</Text>
			</Pressable>
			<Sheet visible={open} onClose={() => setOpen(false)} placement="bottom">
				<Stack gap="xs" style={styles.sheet}>
					{options.map((o) => (
						<Pressable
							key={o.value}
							disabled={o.disabled}
							onPress={() => { onValueChange(o.value); setOpen(false); }}
							style={styles.option}>
							<Text variant="caption" weight={o.value === value ? 'medium' : undefined}>
								{o.label}
							</Text>
						</Pressable>
					))}
				</Stack>
			</Sheet>
		</>
	);
}
const styles = StyleSheet.create({
	trigger: {
		paddingHorizontal: tokens.space.md, paddingVertical: 6,
		borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border,
		backgroundColor: tokens.color.surface,
	},
	disabled: { opacity: 0.4 },
	sheet: { padding: tokens.space.md },
	option: { paddingVertical: tokens.space.sm, paddingHorizontal: tokens.space.md },
});
export type { SelectProps, SelectOption } from './Select.types';
```
> Verify `Sheet`'s prop names against `ui/overlays/Sheet.tsx` (`visible`, `onClose`, `placement`) and `Text`/`Stack` prop shapes against their primitives before finalizing. Adjust imports if `Text`/`Stack` accept different variant/weight props.

- [ ] **Step 6: Re-export via `_ui`**

Append to `packages/npm/rn/src/dash/_ui.ts`:
```ts
export { Select } from '../ui/controls/Select';
export type { SelectOption, SelectProps } from '../ui/controls/Select.types';
```

- [ ] **Step 7: Run web test**

Run: `<VITEST> src/ui/controls/__tests__/Select.web.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/npm/rn/src/ui/controls packages/npm/rn/src/dash/_ui.ts
git commit -m "feat(rn-ui): cross-platform Select primitive (native Sheet + web select)"
```

---

## Task 6: `ControlBar`

**Files:**
- Create: `packages/npm/rn/src/dash/controls/ControlBar.tsx`
- Test: `packages/npm/rn/src/dash/controls/__tests__/ControlBar.test.tsx`

**Interfaces:**
- Consumes: `StreamControl`, `StreamStore`, `StreamState`, `Select`.
- Produces: `<ControlBar store={} controls={} meta={} />` — renders each control, calls `store.setParams`.

- [ ] **Step 1: Write the failing test** (logic-level: a `resolveOptions` helper + a `controlValue` reader, so the test is DOM-free)

```tsx
// packages/npm/rn/src/dash/controls/__tests__/ControlBar.test.tsx
import { describe, it, expect } from 'vitest';
import { resolveSelectOptions } from '../ControlBar';
import type { StreamControl } from '../../types';

describe('ControlBar helpers', () => {
	it('resolveSelectOptions prefers static options', () => {
		const c: StreamControl = { kind: 'select', param: 'ns', options: [{ label: 'A', value: 'a' }] };
		expect(resolveSelectOptions(c, null)).toEqual([{ label: 'A', value: 'a' }]);
	});
	it('resolveSelectOptions falls back to optionsFromMeta', () => {
		const c: StreamControl = {
			kind: 'select', param: 'ns',
			optionsFromMeta: (m) => (m as string[]).map((v) => ({ label: v, value: v })),
		};
		expect(resolveSelectOptions(c, ['x', 'y'])).toEqual([
			{ label: 'x', value: 'x' }, { label: 'y', value: 'y' },
		]);
	});
	it('resolveSelectOptions returns [] when neither present', () => {
		const c: StreamControl = { kind: 'select', param: 'ns' };
		expect(resolveSelectOptions(c, null)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<VITEST> src/dash/controls/__tests__/ControlBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ControlBar`**

```tsx
// packages/npm/rn/src/dash/controls/ControlBar.tsx
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, Text, tokens, Select } from '../_ui';
import type { StreamControl, StreamStore } from '../types';

export function resolveSelectOptions(
	control: Extract<StreamControl, { kind: 'select' }>,
	meta: unknown,
): { label: string; value: string }[] {
	if (control.options?.length) return control.options;
	if (control.optionsFromMeta) return control.optionsFromMeta(meta);
	return [];
}

interface ControlBarProps<T> {
	store: StreamStore<T>;
	controls: readonly StreamControl[];
	params: Record<string, string | number | undefined>;
	meta: unknown;
}

export function ControlBar<T>({ store, controls, params, meta }: ControlBarProps<T>) {
	return (
		<Stack direction="row" gap="sm" align="center" wrap>
			{controls.map((c) => {
				if (c.kind === 'segmented') {
					return (
						<Stack key={c.param} direction="row" gap="xs">
							{c.options.map((o) => {
								const on = params[c.param] === o.value;
								return (
									<Pressable
										key={String(o.value)}
										onPress={() => store.setParams({ [c.param]: o.value })}
										style={[styles.seg, on ? styles.segOn : null]}>
										<Text variant="caption" weight={on ? 'medium' : undefined}
											style={{ color: on ? tokens.color.onPrimary : tokens.color.textMuted }}>
											{o.label}
										</Text>
									</Pressable>
								);
							})}
						</Stack>
					);
				}
				if (c.kind === 'select') {
					const opts = resolveSelectOptions(c, meta);
					return (
						<Select
							key={c.param}
							value={params[c.param] as string | undefined}
							placeholder={c.placeholder ?? c.label}
							options={opts}
							onValueChange={(v) => store.setParams({ [c.param]: v || undefined })}
						/>
					);
				}
				return (
					<SearchControl
						key={c.param}
						value={(params[c.param] as string) ?? ''}
						placeholder={c.placeholder ?? 'Search…'}
						debounceMs={c.debounceMs ?? 300}
						onChange={(v) => store.setParams({ [c.param]: v || undefined })}
					/>
				);
			})}
		</Stack>
	);
}

function SearchControl({ value, placeholder, debounceMs, onChange }: {
	value: string; placeholder: string; debounceMs: number; onChange: (v: string) => void;
}) {
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	useEffect(() => {
		const t = setTimeout(() => { if (text !== value) onChange(text); }, debounceMs);
		return () => clearTimeout(t);
	}, [text, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
	return (
		<TextInput
			value={text}
			onChangeText={setText}
			placeholder={placeholder}
			placeholderTextColor={tokens.color.textFaint}
			style={styles.search}
		/>
	);
}

const styles = StyleSheet.create({
	seg: { paddingHorizontal: tokens.space.md, paddingVertical: 4, borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: tokens.color.border },
	segOn: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
	search: { minWidth: 160, paddingHorizontal: tokens.space.md, paddingVertical: 6, color: tokens.color.text, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<VITEST> src/dash/controls/__tests__/ControlBar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/controls/ControlBar.tsx packages/npm/rn/src/dash/controls/__tests__/ControlBar.test.tsx
git commit -m "feat(rn-dash): ControlBar (segmented/select/search) driving setParams"
```

---

## Task 7: `SavedViewTabs` + clickable `StatGrid` + `StreamView` wiring

**Files:**
- Create: `packages/npm/rn/src/dash/controls/SavedViewTabs.tsx`
- Modify: `packages/npm/rn/src/dash/StatGrid.tsx`
- Modify: `packages/npm/rn/src/dash/StreamView.tsx`

**Interfaces:**
- Consumes: `StreamStore`, `state.views`, `state.activeViewId`, `lens.controls`, `StatModel.onPress`, `ControlBar`.
- Produces: `StreamView` conditionally renders `ControlBar` (when `lens.controls?.length`), `SavedViewTabs` (when `state.views.length`), and a Refresh action; `StatGrid` tiles are pressable when `onPress` is set.

- [ ] **Step 1: `SavedViewTabs` component**

```tsx
// packages/npm/rn/src/dash/controls/SavedViewTabs.tsx
import { Pressable, StyleSheet } from 'react-native';
import { Stack, Text, tokens } from '../_ui';
import type { StreamStore, SavedView } from '../types';

export function SavedViewTabs<T>({ store, views, activeViewId }: {
	store: StreamStore<T>; views: SavedView[]; activeViewId: string | null;
}) {
	if (!views.length) return null;
	return (
		<Stack direction="row" gap="xs" wrap>
			{views.map((v) => {
				const on = v.id === activeViewId;
				return (
					<Pressable key={v.id} onPress={() => store.applyView(v.id)}
						style={[styles.tab, on ? styles.tabOn : null]}>
						<Text variant="caption" weight={on ? 'medium' : undefined}
							style={{ color: on ? tokens.color.onPrimary : tokens.color.textMuted }}>
							{v.name}
						</Text>
					</Pressable>
				);
			})}
		</Stack>
	);
}
const styles = StyleSheet.create({
	tab: { paddingHorizontal: tokens.space.md, paddingVertical: 4, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border },
	tabOn: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
});
```

- [ ] **Step 2: Make `StatGrid` tiles pressable**

In `StatGrid.tsx`, wrap each tile: if `stat.onPress` is defined, render inside a `Pressable` calling it. Preserve existing markup when `onPress` is absent. (Read the file first; add a `Pressable` wrapper around the tile content guarded by `stat.onPress`.)

- [ ] **Step 3: Wire `StreamView`**

In `StreamView.tsx`, import `ControlBar` and `SavedViewTabs`. Above the existing filter/search `Stack` (around line 252), render:
```tsx
{state.views.length ? (
	<SavedViewTabs store={storeU} views={state.views} activeViewId={state.activeViewId} />
) : null}
{lens.controls?.length ? (
	<ControlBar store={storeU} controls={lens.controls} params={state.params} meta={state.meta} />
) : null}
```
Add a Refresh action in the header row:
```tsx
<Pressable onPress={() => void store.refresh()} style={styles.refresh}>
	<Text variant="caption" tone="muted">↻ Refresh</Text>
</Pressable>
```
(Add a `refresh` style entry mirroring `chip`.)

- [ ] **Step 4: Run the full dash suite (backward-compat + no crash)**

Run: `<VITEST> src/dash`
Expected: PASS — dashboards without `controls`/`views` render exactly as before (conditionals are false).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/controls/SavedViewTabs.tsx packages/npm/rn/src/dash/StatGrid.tsx packages/npm/rn/src/dash/StreamView.tsx
git commit -m "feat(rn-dash): StreamView renders ControlBar + SavedViewTabs + Refresh; clickable StatGrid"
```

---

## Task 8: Backend — ALL-window sentinel

**Files:**
- Modify: `packages/rust/jedi/src/entity/pipe_clickhouse/logs.rs`

**Interfaces:**
- Produces: `pub(crate) fn time_condition(raw: Option<u32>) -> Option<String>`; `minutes:0` drops the timestamp filter in `query`/`stats`/`error_groups`.

- [ ] **Step 1: Add the failing test** (append inside `mod tests`)

```rust
#[test]
fn all_sentinel_drops_time_filter() {
	assert!(time_condition(Some(0)).is_none());
	assert!(time_condition(None).is_some());

	let query = build_query_sql(&LogsQueryParams { minutes: Some(0), ..Default::default() });
	assert!(!query.contains("INTERVAL"));

	let stats = build_stats_sql(&LogsStatsParams { minutes: Some(0) });
	assert!(!stats.contains("INTERVAL"));
	assert!(!stats.contains("WHERE"));
	assert!(stats.contains("GROUP BY pod_namespace, service, level"));

	let groups = build_error_groups_sql(&ErrorGroupsParams { pod_namespace: None, minutes: Some(0), limit: Some(10) });
	assert!(!groups.contains("INTERVAL"));
	assert!(groups.contains("level = 'error'"));
}
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics && \
  cargo test -p jedi --lib --features clickhouse all_sentinel 2>&1 | tail -20
```
Expected: FAIL — `time_condition` not found.

- [ ] **Step 3: Implement** — add helper after `clamped_minutes`:

```rust
pub(crate) fn time_condition(raw: Option<u32>) -> Option<String> {
	match raw {
		Some(0) => None,
		other => Some(format!("timestamp > now() - INTERVAL {} MINUTE", clamped_minutes(other))),
	}
}
```

In `build_query_sql`, replace the initial `conditions` seed:
```rust
	let limit = clamped_limit(params.limit);
	let mut conditions: Vec<String> = Vec::new();
	if let Some(cond) = time_condition(params.minutes) { conditions.push(cond); }
```
(remove the now-unused `let minutes = clamped_minutes(...)` line in this fn).

In `build_stats_sql`, make the WHERE optional:
```rust
	let where_clause = match time_condition(params.minutes) {
		Some(cond) => format!("WHERE {} ", cond),
		None => String::new(),
	};
	format!(
		"SELECT pod_namespace, service, level, count() AS cnt \
		 FROM logs_distributed {}GROUP BY pod_namespace, service, level ORDER BY cnt DESC LIMIT 5000",
		where_clause
	)
```

In `build_error_groups_sql`, replace the seed of `conditions`:
```rust
	let limit = clamped_error_groups(params.limit);
	let mut conditions: Vec<String> = Vec::new();
	if let Some(cond) = time_condition(params.minutes) { conditions.push(cond); }
	conditions.push("level = 'error'".to_string());
```
(remove its now-unused `let minutes = ...` line).

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics && \
  cargo test -p jedi --lib --features clickhouse pipe_clickhouse::logs 2>&1 | tail -25
```
Expected: PASS — `all_sentinel_drops_time_filter` + all existing SQL-builder tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/rust/jedi/src/entity/pipe_clickhouse/logs.rs
git commit -m "feat(jedi): minutes=0 ALL-window sentinel for query/stats/error_groups"
```

---

## Task 9: ClickHouse stream v2 (params + fetchMeta stats + controls + seeded views)

**Files:**
- Create: `packages/npm/rn/src/dash/clickhouse/clickhouseStream.ts`
- Test: `packages/npm/rn/src/dash/clickhouse/__tests__/clickhouseStream.test.ts`

**Interfaces:**
- Consumes: `createStreamSource`, `StreamControl`, `SavedView`, existing `normalize`/`LogItem` (import from `../adapters/clickhouse`).
- Produces: `createClickHouseStream(opts)` returning a `StreamStore<LogItem>` whose `fetch` posts `command:'query'` with params, `fetchMeta` posts `command:'stats'`; exports `CH_CONTROLS`, `CH_DEFAULT_VIEWS`, `buildStatsTotals(meta)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/npm/rn/src/dash/clickhouse/__tests__/clickhouseStream.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClickHouseStream, buildStatsTotals } from '../clickhouseStream';

describe('clickhouseStream v2', () => {
	const getToken = vi.fn(async () => 'tok');
	beforeEach(() => { vi.clearAllMocks(); });

	it('query body carries params (minutes 360 default, limit 500)', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
		global.fetch = fetchSpy;
		const store = createClickHouseStream({ getToken });
		await store.refresh();
		const body = JSON.parse(fetchSpy.mock.calls.find((c) => JSON.parse(c[1].body).command === 'query')![1].body);
		expect(body).toMatchObject({ command: 'query', minutes: 360, limit: 500 });
	});

	it('ALL sends minutes:0', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
		global.fetch = fetchSpy;
		const store = createClickHouseStream({ getToken });
		store.setParams({ minutes: 0 });
		await Promise.resolve(); await Promise.resolve();
		const last = fetchSpy.mock.calls.map((c) => JSON.parse(c[1].body)).filter((b) => b.command === 'query').pop();
		expect(last.minutes).toBe(0);
	});

	it('buildStatsTotals sums count() from stats meta (uncapped)', () => {
		const meta = { rows: [
			{ pod_namespace: 'a', service: 's', level: 'error', cnt: 30 },
			{ pod_namespace: 'a', service: 's', level: 'info', cnt: 1200 },
			{ pod_namespace: 'b', service: 's', level: 'warn', cnt: 45 },
		] };
		expect(buildStatsTotals(meta)).toEqual({ total: 1275, errors: 30, warnings: 45 });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `<VITEST> src/dash/clickhouse/__tests__/clickhouseStream.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/npm/rn/src/dash/clickhouse/clickhouseStream.ts
import { createStreamSource } from '../createStreamSource';
import type { StreamControl, SavedView, StreamParams, StreamStore } from '../types';
import { normalize } from '../adapters/clickhouse';
import type { LogItem, RawLogRow } from '../adapters/clickhouse';

export interface ClickHouseStreamOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

const PROXY = '/dashboard/clickhouse/proxy';

function buildBody(command: string, params: StreamParams): Record<string, unknown> {
	const body: Record<string, unknown> = { command };
	for (const k of ['minutes', 'limit', 'pod_namespace', 'service', 'level', 'search']) {
		if (params[k] !== undefined && params[k] !== '') body[k] = params[k];
	}
	return body;
}

async function post(baseUrl: string, token: string | null, body: unknown, signal: AbortSignal) {
	const res = await fetch(`${baseUrl}${PROXY}`, {
		method: 'POST',
		headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal,
	});
	if (res.status === 403) throw new Error('Access restricted');
	if (!res.ok) throw new Error(`ClickHouse API error: ${res.status}`);
	return res.json();
}

export interface StatsTotals { total: number; errors: number; warnings: number; }

export function buildStatsTotals(meta: unknown): StatsTotals {
	const rows = (meta as { rows?: { level?: string; cnt?: number }[] })?.rows ?? [];
	let total = 0, errors = 0, warnings = 0;
	for (const r of rows) {
		const cnt = Number(r.cnt ?? 0);
		total += cnt;
		const lvl = (r.level ?? '').toLowerCase();
		if (lvl === 'error') errors += cnt;
		else if (lvl === 'warn' || lvl === 'warning') warnings += cnt;
	}
	return { total, errors, warnings };
}

export const CH_CONTROLS: readonly StreamControl[] = [
	{ kind: 'segmented', param: 'minutes', options: [
		{ label: '6h', value: 360 }, { label: '12h', value: 720 },
		{ label: '24h', value: 1440 }, { label: '72h', value: 4320 }, { label: 'ALL', value: 0 },
	] },
	{ kind: 'select', param: 'pod_namespace', placeholder: 'namespace',
		optionsFromMeta: (m) => {
			const rows = (m as { rows?: { pod_namespace?: string }[] })?.rows ?? [];
			const set = [...new Set(rows.map((r) => r.pod_namespace).filter(Boolean) as string[])].sort();
			return [{ label: 'all namespaces', value: '' }, ...set.map((v) => ({ label: v, value: v }))];
		} },
	{ kind: 'select', param: 'level', placeholder: 'level', options: [
		{ label: 'all levels', value: '' }, { label: 'error', value: 'error' },
		{ label: 'warn', value: 'warn' }, { label: 'info', value: 'info' },
	] },
	{ kind: 'search', param: 'search', placeholder: 'filter message…' },
];

export const CH_DEFAULT_VIEWS: SavedView[] = [
	{ id: 'errors-24h', name: 'Errors · 24h', params: { minutes: 1440, level: 'error' }, seeded: true },
	{ id: 'all-6h', name: 'All · 6h', params: { minutes: 360 }, seeded: true },
	{ id: 'warnings-24h', name: 'Warnings · 24h', params: { minutes: 1440, level: 'warn' }, seeded: true },
];

export function createClickHouseStream(opts: ClickHouseStreamOptions): StreamStore<LogItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;
	return createStreamSource<RawLogRow, LogItem>({
		key: 'clickhouse:logs',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { minutes: 360, limit: 500 },
		defaultViews: CH_DEFAULT_VIEWS,
		id: (it) => it.id,
		signature: (it) => `${it.timestamp}|${it.level}|${it.message}`,
		normalize,
		fetch: async ({ signal }, params) => {
			const token = await getToken();
			const json = (await post(baseUrl, token, buildBody('query', params), signal)) as { rows?: RawLogRow[] };
			return (json?.rows ?? []).sort((a, b) =>
				new Date(b.timestamp.replace(' ', 'T') + 'Z').getTime() -
				new Date(a.timestamp.replace(' ', 'T') + 'Z').getTime());
		},
		fetchMeta: async ({ signal }, params) => {
			const token = await getToken();
			return post(baseUrl, token, buildBody('stats', { minutes: params.minutes }), signal);
		},
	});
}
```
> Requires `normalize`, `LogItem`, and `RawLogRow` to be exported from `dash/adapters/clickhouse.tsx`. Task 10 exports them.

- [ ] **Step 4: Run to verify it passes**

Run: `<VITEST> src/dash/clickhouse/__tests__/clickhouseStream.test.ts`
Expected: PASS (3 tests). If it fails on missing `RawLogRow` export, do Task 10 Step 1 first, then re-run.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/clickhouse/clickhouseStream.ts packages/npm/rn/src/dash/clickhouse/__tests__/clickhouseStream.test.ts
git commit -m "feat(rn-dash): ClickHouse stream v2 with params, stats meta totals, controls, seeded views"
```

---

## Task 10: Extend `clickhouseLens` for controls + meta-driven stats; export `normalize`/types

**Files:**
- Modify: `packages/npm/rn/src/dash/adapters/clickhouse.tsx`
- Test: `packages/npm/rn/src/dash/adapters/__tests__/clickhouse.test.ts` (extend)

**Interfaces:**
- Produces: `export` on `normalize`, `RawLogRow`; `clickhouseLens.controls = CH_CONTROLS`; `clickhouseLens.stats(items, meta)` uses `buildStatsTotals(meta)` when `meta` present, else falls back to `items.length`.

- [ ] **Step 1: Export `normalize` and `RawLogRow`**

In `clickhouse.tsx`, change `interface RawLogRow` → `export interface RawLogRow`, and `function normalize` → `export function normalize`.

- [ ] **Step 2: Write the failing test** (append to existing adapter test)

```ts
import { buildStatsTotals } from '../../clickhouse/clickhouseStream';
// ...
it('lens stats use meta totals when present', () => {
	const meta = { rows: [{ level: 'error', cnt: 5 }, { level: 'info', cnt: 95 }] };
	const stats = clickhouseLens.stats!([], meta);
	const total = stats.find((s) => s.id === 'total')!.value;
	const errors = stats.find((s) => s.id === 'errors')!.value;
	expect(total).toBe(100);
	expect(errors).toBe(5);
});
it('lens stats fall back to items.length without meta', () => {
	const items = [{ level: 'error' }, { level: 'info' }] as never[];
	const stats = clickhouseLens.stats!(items, undefined);
	expect(stats.find((s) => s.id === 'total')!.value).toBe(2);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `<VITEST> src/dash/adapters/__tests__/clickhouse.test.ts`
Expected: FAIL — stats still counts items only.

- [ ] **Step 4: Implement — update `clickhouseLens.stats` and attach `controls`**

Replace the `stats` function in `clickhouseLens`:
```ts
	stats: (items, meta) => {
		const t = meta ? buildStatsTotals(meta) : {
			total: items.length,
			errors: items.filter((i) => i.level === 'error').length,
			warnings: items.filter((i) => i.level === 'warn' || i.level === 'warning').length,
		};
		return [
			{ id: 'total', label: 'Total Logs', value: t.total, onPress: undefined },
			{ id: 'errors', label: 'Errors', tone: 'danger', value: t.errors },
			{ id: 'warnings', label: 'Warnings', tone: 'warning', value: t.warnings },
		];
	},
	controls: CH_CONTROLS,
```
Add imports at top of `clickhouse.tsx`:
```ts
import { buildStatsTotals, CH_CONTROLS } from '../clickhouse/clickhouseStream';
```
> Guard against an import cycle: `clickhouseStream.ts` imports `normalize`/types from `clickhouse.tsx`, and `clickhouse.tsx` now imports `buildStatsTotals`/`CH_CONTROLS` from `clickhouseStream.ts`. These are value+type imports with no top-level execution coupling, so ES modules resolve them fine. If a cycle warning appears, move `buildStatsTotals` and `CH_CONTROLS` into a third leaf file `clickhouse/chShared.ts` and import from there in both.

- [ ] **Step 5: Run tests**

Run: `<VITEST> src/dash/adapters/__tests__/clickhouse.test.ts`
Expected: PASS — new + existing.

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/dash/adapters/clickhouse.tsx packages/npm/rn/src/dash/adapters/__tests__/clickhouse.test.ts
git commit -m "feat(rn-dash): clickhouse lens uses stats-meta totals + exposes controls"
```

---

## Task 11: Error-groups secondary stream

**Files:**
- Create: `packages/npm/rn/src/dash/clickhouse/errorGroupsStream.ts`
- Test: `packages/npm/rn/src/dash/clickhouse/__tests__/errorGroupsStream.test.ts`

**Interfaces:**
- Produces: `createErrorGroupsStream(opts)` → `StreamStore<ErrorGroupItem>`; `errorGroupsLens`. Body posts `command:'error_groups'` with `{minutes, pod_namespace, limit}`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/npm/rn/src/dash/clickhouse/__tests__/errorGroupsStream.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createErrorGroupsStream } from '../errorGroupsStream';

describe('errorGroupsStream', () => {
	it('posts command error_groups with params', async () => {
		const getToken = vi.fn(async () => 'tok');
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: [] }) });
		global.fetch = fetchSpy;
		const store = createErrorGroupsStream({ getToken });
		store.setParams({ minutes: 1440, pod_namespace: 'kbve' });
		await Promise.resolve(); await Promise.resolve();
		const body = JSON.parse(fetchSpy.mock.calls.at(-1)![1].body);
		expect(body).toMatchObject({ command: 'error_groups', minutes: 1440, pod_namespace: 'kbve' });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `<VITEST> src/dash/clickhouse/__tests__/errorGroupsStream.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/npm/rn/src/dash/clickhouse/errorGroupsStream.ts
import { createStreamSource } from '../createStreamSource';
import type { StreamParams, StreamStore, StreamLens } from '../types';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';

export interface RawErrorGroup { pod_namespace?: string; service?: string; signature?: string; cnt?: number; last_seen?: string; sample?: string; }
export interface ErrorGroupItem { id: string; namespace: string; service: string; signature: string; count: number; lastSeen: string; sample: string; }

const PROXY = '/dashboard/clickhouse/proxy';

function normalize(r: RawErrorGroup): ErrorGroupItem {
	return {
		id: `${r.pod_namespace ?? ''}:${(r.signature ?? '').slice(0, 60)}`,
		namespace: r.pod_namespace ?? '',
		service: r.service ?? '',
		signature: r.signature ?? '',
		count: Number(r.cnt ?? 0),
		lastSeen: r.last_seen ?? '',
		sample: r.sample ?? '',
	};
}

export interface ErrorGroupsStreamOptions { getToken: () => Promise<string | null>; baseUrl?: string; pollMs?: number; }

export function createErrorGroupsStream(opts: ErrorGroupsStreamOptions): StreamStore<ErrorGroupItem> {
	const { getToken, baseUrl = '', pollMs = 30_000 } = opts;
	return createStreamSource<RawErrorGroup, ErrorGroupItem>({
		key: 'clickhouse:error_groups',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { minutes: 360, limit: 25 },
		id: (it) => it.id,
		signature: (it) => `${it.signature}|${it.count}`,
		normalize,
		fetch: async ({ signal }, params: StreamParams) => {
			const token = await getToken();
			const body: Record<string, unknown> = { command: 'error_groups' };
			for (const k of ['minutes', 'limit', 'pod_namespace']) if (params[k] !== undefined && params[k] !== '') body[k] = params[k];
			const res = await fetch(`${baseUrl}${PROXY}`, {
				method: 'POST',
				headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
				body: JSON.stringify(body), signal,
			});
			if (res.status === 403) throw new Error('Access restricted');
			if (!res.ok) throw new Error(`ClickHouse API error: ${res.status}`);
			const json = (await res.json()) as { rows?: RawErrorGroup[] };
			return json?.rows ?? [];
		},
	});
}

export const errorGroupsLens: StreamLens<ErrorGroupItem> = {
	searchText: (it) => `${it.namespace} ${it.service} ${it.signature}`,
	row: (it) => (
		<Surface style={{ padding: tokens.space.md }}>
			<Stack gap="xs">
				<Stack direction="row" gap="xs" align="center">
					<Badge label={`×${it.count}`} tone="danger" />
					<Text variant="caption" tone="faint">{it.namespace}{it.service ? ` / ${it.service}` : ''}</Text>
				</Stack>
				<Text variant="caption" numberOfLines={2}>{it.signature}</Text>
			</Stack>
		</Surface>
	),
};
```
> `errorGroupsStream.ts` uses JSX → it must be `.tsx`. Rename accordingly: create `errorGroupsStream.tsx`. Update the test import path if needed (Vitest resolves extension automatically).

- [ ] **Step 4: Run to verify it passes**

Run: `<VITEST> src/dash/clickhouse/__tests__/errorGroupsStream.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/clickhouse/errorGroupsStream.tsx packages/npm/rn/src/dash/clickhouse/__tests__/errorGroupsStream.test.ts
git commit -m "feat(rn-dash): error-groups secondary stream + lens"
```

---

## Task 12: `NamespaceGrid` metaPanel + `ErrorDigest` panel

**Files:**
- Create: `packages/npm/rn/src/dash/clickhouse/NamespaceGrid.tsx`
- Create: `packages/npm/rn/src/dash/clickhouse/ErrorDigest.tsx`

**Interfaces:**
- Consumes: `StreamStore<LogItem>` (primary), `buildNamespaceRollup(meta)`, error-groups store + `errorGroupsLens`.
- Produces: `NamespaceGrid` (as a `metaPanel` render), `ErrorDigest` (subscribes to error-groups store, renders via `StreamView` or a compact list).

- [ ] **Step 1: `buildNamespaceRollup` helper + test**

```ts
// add to clickhouse/chRollup.ts
export interface NsRollup { namespace: string; total: number; errors: number; warns: number; }
export function buildNamespaceRollup(meta: unknown): NsRollup[] {
	const rows = (meta as { rows?: { pod_namespace?: string; level?: string; cnt?: number }[] })?.rows ?? [];
	const map = new Map<string, NsRollup>();
	for (const r of rows) {
		const ns = r.pod_namespace ?? '(cluster)';
		const cur = map.get(ns) ?? { namespace: ns, total: 0, errors: 0, warns: 0 };
		const cnt = Number(r.cnt ?? 0);
		cur.total += cnt;
		const lvl = (r.level ?? '').toLowerCase();
		if (lvl === 'error') cur.errors += cnt;
		else if (lvl === 'warn' || lvl === 'warning') cur.warns += cnt;
		map.set(ns, cur);
	}
	return [...map.values()].sort((a, b) => b.total - a.total);
}
```

```ts
// clickhouse/__tests__/chRollup.test.ts
import { describe, it, expect } from 'vitest';
import { buildNamespaceRollup } from '../chRollup';
describe('buildNamespaceRollup', () => {
	it('aggregates per namespace and sorts by total desc', () => {
		const meta = { rows: [
			{ pod_namespace: 'a', level: 'error', cnt: 10 },
			{ pod_namespace: 'a', level: 'info', cnt: 100 },
			{ pod_namespace: 'b', level: 'warn', cnt: 500 },
		] };
		const out = buildNamespaceRollup(meta);
		expect(out[0].namespace).toBe('b');
		expect(out.find((r) => r.namespace === 'a')).toMatchObject({ total: 110, errors: 10 });
	});
});
```

Run: `<VITEST> src/dash/clickhouse/__tests__/chRollup.test.ts` → FAIL then PASS after adding `chRollup.ts`.

- [ ] **Step 2: `NamespaceGrid.tsx`** (metaPanel renderer; tap → primary `setParams`)

```tsx
// packages/npm/rn/src/dash/clickhouse/NamespaceGrid.tsx
import { Pressable, StyleSheet } from 'react-native';
import { Surface, Stack, Text, Badge, tokens } from '../_ui';
import type { StreamStore } from '../types';
import type { LogItem } from '../adapters/clickhouse';
import { buildNamespaceRollup } from './chRollup';

export function makeNamespaceGrid(store: StreamStore<LogItem>) {
	return function NamespaceGrid(meta: unknown) {
		const rows = buildNamespaceRollup(meta);
		if (!rows.length) return null;
		return (
			<Stack gap="xs">
				{rows.map((r) => (
					<Pressable key={r.namespace} onPress={() => store.setParams({ pod_namespace: r.namespace === '(cluster)' ? undefined : r.namespace })}>
						<Surface style={styles.row}>
							<Text variant="caption" style={{ flexGrow: 1 }}>{r.namespace}</Text>
							{r.errors ? <Badge label={`${r.errors} err`} tone="danger" /> : null}
							{r.warns ? <Badge label={`${r.warns} warn`} tone="warning" /> : null}
							<Text variant="caption" tone="muted">{r.total}</Text>
						</Surface>
					</Pressable>
				))}
			</Stack>
		);
	};
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, padding: tokens.space.sm } });
```

- [ ] **Step 3: `ErrorDigest.tsx`** (subscribes to error-groups store; drill → primary setParams)

```tsx
// packages/npm/rn/src/dash/clickhouse/ErrorDigest.tsx
import { Pressable } from 'react-native';
import { Stack, Text } from '../_ui';
import { useStream, useStreamLifecycle } from '../useStream';
import type { StreamStore } from '../types';
import type { LogItem } from '../adapters/clickhouse';
import { errorGroupsLens, type ErrorGroupItem } from './errorGroupsStream';

export function ErrorDigest({ store, primary }: {
	store: StreamStore<ErrorGroupItem>; primary: StreamStore<LogItem>;
}) {
	useStreamLifecycle(store);
	const state = useStream(store);
	if (!state.items.length) return null;
	return (
		<Stack gap="xs">
			<Text variant="label" tone="muted">Error digest</Text>
			{state.items.map((it) => (
				<Pressable key={store.id(it)} onPress={() => primary.setParams({ pod_namespace: it.namespace || undefined, level: 'error' })}>
					{errorGroupsLens.row(it, false)}
				</Pressable>
			))}
		</Stack>
	);
}
```

- [ ] **Step 4: Run tests**

Run: `<VITEST> src/dash/clickhouse`
Expected: PASS (rollup test; the two components are runtime-verified in Task 13/14).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/clickhouse/chRollup.ts packages/npm/rn/src/dash/clickhouse/__tests__/chRollup.test.ts packages/npm/rn/src/dash/clickhouse/NamespaceGrid.tsx packages/npm/rn/src/dash/clickhouse/ErrorDigest.tsx
git commit -m "feat(rn-dash): namespace rollup grid + error digest panel"
```

---

## Task 13: `ClickHouseView` composition + exports

**Files:**
- Create: `packages/npm/rn/src/dash/clickhouse/ClickHouseView.tsx`
- Create: `packages/npm/rn/src/dash/clickhouse/index.ts`
- Modify: `packages/npm/rn/src/dash/index.ts` (re-export clickhouse composition)

**Interfaces:**
- Consumes: primary `createClickHouseStream`, `createErrorGroupsStream`, `clickhouseLens` (+ `metaPanel` via `makeNamespaceGrid`), `ErrorDigest`, `StreamView`.
- Produces: `<ClickHouseView getToken baseUrl />`.

- [ ] **Step 1: Implement `ClickHouseView`**

```tsx
// packages/npm/rn/src/dash/clickhouse/ClickHouseView.tsx
import { useEffect, useMemo } from 'react';
import { Stack } from '../_ui';
import { StreamView } from '../StreamView';
import { clickhouseLens } from '../adapters/clickhouse';
import { createClickHouseStream } from './clickhouseStream';
import { createErrorGroupsStream } from './errorGroupsStream';
import { makeNamespaceGrid } from './NamespaceGrid';
import { ErrorDigest } from './ErrorDigest';

export interface ClickHouseViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function ClickHouseView({ getToken, baseUrl = '' }: ClickHouseViewProps) {
	const primary = useMemo(() => createClickHouseStream({ getToken, baseUrl }), [getToken, baseUrl]);
	const errors = useMemo(() => createErrorGroupsStream({ getToken, baseUrl }), [getToken, baseUrl]);

	// Keep the error-groups window in sync with the primary time range + namespace.
	const state = useMemo(() => primary.get(), [primary]);
	useEffect(() => {
		const unsub = primary.subscribe(() => {
			const p = primary.get().params;
			errors.setParams({ minutes: p.minutes, pod_namespace: p.pod_namespace });
		});
		return unsub;
	}, [primary, errors]);

	const lens = useMemo(() => ({ ...clickhouseLens, metaPanel: makeNamespaceGrid(primary) }), [primary]);

	return (
		<Stack gap="md">
			<StreamView store={primary} lens={lens} layout="rows" searchPlaceholder="filter by namespace / level / message" />
			<ErrorDigest store={errors} primary={primary} />
		</Stack>
	);
}
```
> `state` is illustrative; if unused, drop it to satisfy lint. The subscription bridge keeps the two streams' windows aligned (spec: "propagates the primary's relevant params into the secondary").

- [ ] **Step 2: Barrel exports**

```ts
// packages/npm/rn/src/dash/clickhouse/index.ts
export { ClickHouseView } from './ClickHouseView';
export type { ClickHouseViewProps } from './ClickHouseView';
export { createClickHouseStream, CH_CONTROLS, CH_DEFAULT_VIEWS, buildStatsTotals } from './clickhouseStream';
export { createErrorGroupsStream, errorGroupsLens } from './errorGroupsStream';
```
Append to `packages/npm/rn/src/dash/index.ts`:
```ts
export * from './clickhouse';
```

- [ ] **Step 3: Typecheck + full suite**

Run: `<VITEST> src/dash`
Expected: PASS — all tests; no import errors.

- [ ] **Step 4: Commit**

```bash
git add packages/npm/rn/src/dash/clickhouse/ClickHouseView.tsx packages/npm/rn/src/dash/clickhouse/index.ts packages/npm/rn/src/dash/index.ts
git commit -m "feat(rn-dash): ClickHouseView composition + barrel exports"
```

---

## Task 14: Web mount

**Files:**
- Modify: `apps/kbve/astro-kbve/src/components/rnweb/ReactClickHouseDashRN.tsx`

**Interfaces:**
- Consumes: `ClickHouseView` from `@kbve/rn/dash`.

- [ ] **Step 1: Point the bridge at `ClickHouseView`**

```tsx
// ReactClickHouseDashRN.tsx
import { useCallback } from 'react';
import { ClickHouseView } from '@kbve/rn/dash';
import { initSupa, getSupa } from '@/lib/supa';
import { DASH_PROXY_BASE } from './dashProxyBase';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa().getSession().catch(() => null);
		return result?.session?.access_token ?? null;
	} catch { return null; }
}

export default function ReactClickHouseDashRN() {
	const token = useCallback(getToken, []);
	return <ClickHouseView getToken={token} baseUrl={DASH_PROXY_BASE} />;
}
```

- [ ] **Step 2: Build the astro-kbve site (or the rn-web bundle) and load the page**

Run (from main checkout; astro build goes through nx per repo convention):
```bash
cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx astro-kbve:build
```
Expected: build succeeds; `@kbve/rn/dash` resolves `ClickHouseView`. Then serve/preview and open `/dashboard/clickhouse`.

- [ ] **Step 3: Manual runtime verification (use the `verify` skill)**

Load `kbve.com/dashboard/clickhouse` (or local preview). Confirm:
- Time-range segmented control switches 6h/12h/24h/72h/ALL and the list + tiles update.
- "Total Logs" reflects the `stats` total (not exactly 200/500 unless truly that many).
- Namespace/level selects and search filter server-side.
- Namespace grid renders; tapping a namespace filters.
- Error digest lists grouped errors; tapping drills in.
- Saved-view tabs (Errors·24h / All·6h / Warnings·24h) apply.
- Refresh button refetches.

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/rnweb/ReactClickHouseDashRN.tsx
git commit -m "feat(astro-kbve): mount ClickHouseView on the web dashboard bridge"
```

---

## Task 15: Minimal native mount

**Files:**
- Create: `packages/npm/rn/src/.../ClickHouseScreen.tsx` (place beside existing screens exported from `@kbve/rn`; confirm the screens dir by locating `HomeScreen`/`HomeView`)
- Modify: `@kbve/rn` barrel to export `ClickHouseScreen`
- Modify: `HomeView` navigation to reach `ClickHouseScreen` (mirror the existing `HomeScreen` entry)

**Interfaces:**
- Consumes: `ClickHouseView`, native Supabase token accessor (the same the app already uses via `KbveProvider`/`getSupa` native equivalent).

- [ ] **Step 1: Locate the native screen host + token accessor**

Run:
```bash
rtk proxy bash -c 'grep -rn "HomeScreen\|HomeView" packages/npm/rn/src --include=*.tsx -l; grep -rn "access_token\|getSession" packages/npm/rn/src/auth --include=*.ts* | head'
```
Record the screens directory and the native token function (e.g. from `auth/`).

- [ ] **Step 2: Create `ClickHouseScreen`**

```tsx
// ClickHouseScreen.tsx (in the screens dir)
import { ClickHouseView } from '../dash/clickhouse';
import { getNativeAccessToken } from '../auth'; // use the accessor found in Step 1

export function ClickHouseScreen() {
	return <ClickHouseView getToken={getNativeAccessToken} baseUrl="https://kbve.com" />;
}
```
> `baseUrl` for native must be the absolute origin (no relative `''`). Confirm the correct production/proxy origin the app uses for authed dashboard calls.

- [ ] **Step 3: Export + wire nav**

Add `export { ClickHouseScreen } from './.../ClickHouseScreen';` to the `@kbve/rn` barrel, and add a navigation entry in `HomeView` to open it (mirror how `HomeScreen` is reached).

- [ ] **Step 4: Native compile + runtime check**

Run the Expo app (per repo's RN run convention; check `apps/kbve/kbve-react-native/package.json` scripts) and open the ClickHouse screen. Confirm the segmented control opens the `Sheet`-backed `Select` and the list loads. (Use the `run` skill for the app launch.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(rn): minimal native ClickHouseScreen reachable from HomeView"
```

---

## Task 16: Delete dead code + slim `clickhouseService.ts`

**Files:**
- Delete: 9 files under `apps/kbve/astro-kbve/src/components/dashboard/`: `ReactCHAuth.tsx`, `ReactCHErrorBanner.tsx`, `ReactCHErrorDigest.tsx`, `ReactCHFilterBar.tsx`, `ReactCHHeader.tsx`, `ReactCHLogStream.tsx`, `ReactCHNamespaceGrid.tsx`, `ReactCHQueryTabs.tsx`, `ReactCHSummary.tsx`
- Modify: `apps/kbve/astro-kbve/src/components/dashboard/clickhouseService.ts` → keep only `fetchIndexedLogs` + `LogRow` + their private deps (token getter, `PROXY_BASE`); delete the dead nanostore atoms/tabs/presets/error-group logic.

- [ ] **Step 1: Confirm zero references before deleting**

Run:
```bash
cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics && \
rtk proxy grep -rnE "ReactCH(Auth|ErrorBanner|ErrorDigest|FilterBar|Header|LogStream|NamespaceGrid|QueryTabs|Summary)" apps/kbve/astro-kbve/src --include=*.astro --include=*.mdx --include=*.tsx --include=*.ts
```
Expected: no matches in `.astro`/`.mdx`; only intra-island `.tsx` cross-imports (which all get deleted together).

- [ ] **Step 2: Delete the 9 files**

```bash
cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics/apps/kbve/astro-kbve/src/components/dashboard && \
git rm ReactCHAuth.tsx ReactCHErrorBanner.tsx ReactCHErrorDigest.tsx ReactCHFilterBar.tsx ReactCHHeader.tsx ReactCHLogStream.tsx ReactCHNamespaceGrid.tsx ReactCHQueryTabs.tsx ReactCHSummary.tsx
```

- [ ] **Step 3: Slim `clickhouseService.ts`**

Open the file; identify the block exporting `fetchIndexedLogs` and `LogRow` (and any private helpers they call: token accessor, `PROXY_BASE`, `IndexedLogQuery`). Delete everything else (the `ClickHouseService` class, all `$` atoms, tabs, presets, error-group helpers, namespace summaries). Keep the file compiling with only the still-imported surface.

- [ ] **Step 4: Verify consumers still typecheck/build**

Run:
```bash
cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx astro-kbve:build
```
Expected: build succeeds; `ReactArgoResourceDetail.tsx` and `kasmService.ts` still import `fetchIndexedLogs` fine.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(astro-kbve): remove dead ReactCH* island, slim clickhouseService to fetchIndexedLogs"
```

---

## Task 17: Final verification + branch finish

- [ ] **Step 1: Full RN dash suite + rust tests green**

Run:
```bash
# JS
<VITEST> src/dash
# Rust
cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rn-dash-generics && cargo test -p jedi --lib --features clickhouse pipe_clickhouse::logs 2>&1 | tail -20
```
Expected: all PASS.

- [ ] **Step 2: Confirm existing dashboards unaffected**

Manually confirm (or via their tests) Argo/Grafana/Forgejo/Kasm dashboards render — proves the additive contract held.

- [ ] **Step 3: Invoke `superpowers:finishing-a-development-branch`** to choose merge/PR (target `dev` per repo convention; PRs → dev).

---

## Self-review notes

- **Spec coverage:** features 1-10 mapped — time-range (Task 9 CH_CONTROLS), refresh (Task 7), auth (existing token, Task 14/15), clickable tiles + true totals (Tasks 7,10), namespace grid (Task 12), server filters + search (Tasks 6,9), rows (existing + Task 9 limit 500), error digest (Tasks 11,12), query tabs + presets (Tasks 2,4,7 savedViews). Backend ALL sentinel (Task 8). Deletion (Task 16). Web+native mounts (Tasks 14,15). Seeded/optimized views (Task 9 CH_DEFAULT_VIEWS + Task 4).
- **Type consistency:** `StreamParams`, `setParams`, `saveView/applyView/...`, `buildStatsTotals`, `buildNamespaceRollup`, `CH_CONTROLS`, `CH_DEFAULT_VIEWS`, `normalize`/`RawLogRow` names are used identically across tasks.
- **Known follow-ups (not blockers):** import-cycle guard (Task 10 Step 4 fallback to `chShared.ts`); native `baseUrl`/token accessor confirmation (Task 15 Steps 1-2); `@testing-library/react` availability (Task 5 Step 2 fallback).
