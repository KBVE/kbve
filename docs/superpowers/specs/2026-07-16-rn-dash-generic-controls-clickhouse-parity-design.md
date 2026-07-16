# RN Dashboard Generic Controls + ClickHouse 1:1 Parity — Design

Date: 2026-07-16
Branch: `feat/rn-dash-generics`
Status: Draft (pending user review)

## Problem

The live ClickHouse logs dashboard at `kbve.com/dashboard/clickhouse` was migrated to a React Native core (`@kbve/rn/dash`) rendered via the Astro rn-web bridge. The RN version is a thin `StreamView` + `clickhouseLens` and lost most features of the old web-only React island (`ReactCH*` components + `clickhouseService.ts` nanostores):

- Hard-coded `minutes=60`, `limit=200`. "Total Logs 200" is the 200-row cap counted client-side, not a real total. No way to widen the window or pull more.
- No time-range selector, no server-side filters, no namespace rollup grid, no error digest, no query tabs, no presets.

The old island is now fully unmounted (no `.astro`/`.mdx` renders any `ReactCH*`), so it is dead code — but we cannot delete it until the RN dashboard reaches feature parity, because deleting first would regress the live page.

## Goals

1. **Full 1:1 feature parity** in RN for the ClickHouse dashboard (all 10 old features).
2. Build parity as **generic, reusable, additive** primitives in `@kbve/rn/dash` so Grafana/Argo/Forgejo/Kasm dashboards can adopt them later. Generic-first is the point of the RN migration (shared, performant components).
3. **Additive / backward-compatible**: existing dashboards that don't opt in are byte-for-byte unaffected. No breaking changes to `StreamView`/`StreamStore` public contracts.
4. Run on **both** targets: rn-web (Astro bridge) and native mobile (Expo). Strictly platform-agnostic — RN primitives only, `kvStore` for persistence, no DOM/`localStorage`.
5. After parity ships and the RN page is verified, **delete the 9 dead `ReactCH*` files** and slim `clickhouseService.ts` to its still-used export.

## Non-goals

- No changes to the auth/token flow beyond what parity needs (token already provided by the bridge).
- No new ClickHouse SQL commands beyond those the backend already exposes (`query`, `stats`, `error_groups`) plus the ALL-window sentinel.
- No refactor of other dashboards to adopt the new primitives in this effort (they gain the option, not the obligation).

## Feature parity matrix

| # | Old feature (source) | RN target | Where it lands |
|---|---|---|---|
| 1 | Time-range selector 15m/1h/6h/24h/7d (`ReactCHHeader`) | Selector incl. **ALL**: 6h/12h/24h/72h/ALL | generic `controls` (segmented) |
| 2 | Refresh-all button (`ReactCHHeader`) | Refresh button | generic `StreamView` header action (`store.refresh`) |
| 3 | Auth gate (`ReactCHAuth`) | Token via bridge; forbidden state surfaced | existing `getToken` + `ErrorState` |
| 4 | Summary tiles, click→filter (`ReactCHSummary`) | True totals + clickable tiles | generic clickable `StatGrid` + `fetchMeta` |
| 5 | Namespace rollup grid: counts, sort, drill (`ReactCHNamespaceGrid`) | Namespace grid panel | generic `metaPanel` fed by `fetchMeta` stats |
| 6 | Filter bar: level/namespace/service (server-side) + debounced search (`ReactCHFilterBar`) | Server-side filters + search | generic `controls` (select + search) → `setParams` |
| 7 | Log stream rows (`ReactCHLogStream`) | Rows list | existing `StreamView` + `clickhouseLens` (raise limit) |
| 8 | Error digest: signatures, scope, drill (`ReactCHErrorDigest`) | Error digest panel | secondary `StreamStore` (`command:error_groups`) + lens |
| 9 | Query tabs, per-tab poll (`ReactCHQueryTabs`) | Saved query tabs | generic `savedViews` subsystem |
| 10 | Presets: save/load/import/export (`ReactCHQueryTabs`) | Presets | generic `savedViews` persistence (kvStore) |

## Architecture

Layered, generic-additive. Nothing below changes existing call sites; every capability is opt-in via new optional config.

```
@kbve/rn/dash  (generic framework — shared by all dashboards)
├── createStreamSource.ts   + params state + setParams(patch) → abort + refetch
│                           + fetch/fetchMeta receive current params
├── types.ts                + StreamParams, StreamControl, SavedView, StreamState additions
├── controls/ControlBar.tsx NEW  segmented | select | search controls (from lens.controls)
├── views/savedViews.ts     NEW  tabs + presets engine, kvStore-persisted, generic
├── StatGrid.tsx            + optional onPress per tile
├── StreamView.tsx          + renders ControlBar + SavedViewTabs + Refresh (all conditional)
└── clickhouse/             ClickHouse composition (first full consumer)
    ├── clickhouseStream.ts   adapter: params → query body, fetchMeta → stats, controls list
    ├── errorGroupsStream.ts  secondary stream: command error_groups
    ├── NamespaceGrid.tsx     metaPanel renderer (counts/sort/drill)
    ├── ErrorDigest.tsx       panel bound to errorGroupsStream
    └── ClickHouseView.tsx    composes StreamView + NamespaceGrid + ErrorDigest
```

Bridge/mounts (route and component are separate layers — `ClickHouseView` never locates or owns its route):
- Web: `apps/kbve/astro-kbve/src/components/rnweb/ReactClickHouseDashRN.tsx` renders `ClickHouseView`.
- Native: `apps/kbve/kbve-react-native` is a plain Expo app (no expo-router). `App.tsx` renders `<HomeView/>` from `@kbve/rn` inside `AuthGate`, with `OverlayHost` already mounted (so the `Sheet`-backed `Select` works). A `ClickHouseScreen` (thin wrapper: `<ClickHouseView/>` + native token provider) is registered in `@kbve/rn` and made reachable from `HomeView`'s navigation, mirroring the existing `HomeScreen` pattern. This gives an immediate native compile + runtime target without inventing a full native dashboard shell; it can later be relocated into a proper native dashboard/nav group without touching `ClickHouseView`.

### Core idea: params are server-side query state

Today `minutes`/`limit`/filters are baked into the `fetch` closure at store construction and are immutable. We introduce **`params`**: a plain object of server-side query state held in `StreamState`. Controls mutate params via `store.setParams(patch)`, which aborts any in-flight request and refetches with the new params. `fetch`/`fetchMeta` are refactored to receive the current params as an argument.

This is the single mechanism behind time-range, server-side filters, and query-tab switching — all of them are just different `params` snapshots.

## Generic primitives (contracts)

### 1. Params + `setParams`

```ts
// types.ts
export type StreamParams = Record<string, string | number | undefined>;

// StreamState<TItem> gains:
params: StreamParams;

// StreamStore<TItem> gains:
setParams: (patch: StreamParams) => void;      // shallow-merge, abort, refetch
resetParams: () => void;                        // back to initialParams

// StreamSourceConfig gains:
initialParams?: StreamParams;
fetch:     (ctx: FetchContext, params: StreamParams) => Promise<TRaw[]>;
fetchMeta?: (ctx: FetchContext, params: StreamParams) => Promise<unknown>;
```

`setParams` merges into `state.params`, writes it, calls `runFetch()` (which already aborts the previous controller). Params are included in the cache key so distinct windows/filters cache independently. Existing sources that ignore the second arg keep working unchanged (params defaults to `{}`).

Cache-key note: `createStreamSource` currently derives `cacheKey` from `config.key` once. It changes to `dash:${key}:${serializeParams(params)}` computed per fetch, so switching params does not clobber another window's cache.

### 2. Controls + `ControlBar`

```ts
export type StreamControl =
  | { kind: 'segmented'; param: string; label?: string;
      options: { label: string; value: string | number }[] }
  | { kind: 'select';    param: string; label?: string; placeholder?: string;
      options: { label: string; value: string }[];
      optionsFromMeta?: (meta: unknown) => { label: string; value: string }[] }
  | { kind: 'search';    param: string; placeholder?: string; debounceMs?: number };

// StreamLens<TItem> gains:
controls?: readonly StreamControl[];
```

`ControlBar` reads `state.params[control.param]`, renders RN primitives (`Pressable` segments, the shared `Select` primitive below, `TextInput` with internal debounce), and calls `store.setParams({ [param]: value })` on change. `optionsFromMeta` lets a `select` populate from the `fetchMeta` payload (e.g. namespace list from stats), avoiding a separate fetch.

`StreamView` renders `<ControlBar>` only when `lens.controls?.length`.

#### Shared `Select` primitive (resolves the native-`<select>` gap)

RN has no DOM `<select>`. Add a shared `Select` abstraction with one cross-platform contract; feature code (`ControlBar`, `ClickHouseView`) consumes only the contract and never imports a native picker directly.

```ts
// ui/controls/Select.types.ts
export interface SelectOption<T extends string = string> { label: string; value: T; disabled?: boolean; }
export interface SelectProps<T extends string = string> {
  value?: T;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  onValueChange: (value: T) => void;
}
```

Platform split follows the package's existing convention — **base file = native, `.web` = web override** (mirrors `store/kv.ts` + `kv.web.ts`, `ui/theme` + `theme.web`). No `.native.tsx` suffix.

- `ui/controls/Select.tsx` (native): a `Pressable` trigger that opens the existing `ui/overlays/Sheet` (`{ visible, onClose, placement:'bottom' }`) listing options; styled from `tokens`. Falls back to `Modal` only if `Sheet` proves unsuitable. Does **not** pull in `@react-native-picker/picker` — avoids a native dep.
- `ui/controls/Select.web.tsx` (web): a real `<select>` styled from `tokens`.

Re-export `Select` + types via `dash/_ui` so `ControlBar` imports it alongside `Text`/`Stack`. The `select`-kind control in `ControlBar` renders this `Select`.

### 3. True totals + namespace grid via `fetchMeta`

`fetchMeta` and `lens.metaPanel` already exist. CH uses them:
- `fetchMeta(params)` → `command:'stats'` → `{ rows: [{pod_namespace, service, level, cnt}] }`.
- `clickhouseLens.stats(items, meta)` derives Total/Errors/Warns from **meta** (real `count()` sums, uncapped) instead of `items.length`.
- `lens.metaPanel(meta)` → `NamespaceGrid`: per-namespace totals, client sort, tap a namespace/severity → `store.setParams({ pod_namespace, level })` (drill).

### 4. Clickable `StatGrid`

`StatModel` already has an optional `onPress`. Wire `StatGrid` tiles to call it. CH stat tiles set `onPress` to apply the matching level filter via `setParams`.

### 5. Saved views (tabs + presets)

Generic engine `views/savedViews.ts`, persisted via `kvStore` (works web + native):

```ts
export interface SavedView { id: string; name: string; params: StreamParams; pollMs?: number | null; }

// StreamSourceConfig gains:  defaultViews?: SavedView[];   // seeded presets
// StreamState gains:  views: SavedView[]; activeViewId: string | null;
// StreamStore gains:
saveView(name: string): void;            // snapshot current params
applyView(id: string): void;             // setParams(view.params)
removeView(id: string): void;
renameView(id: string, name: string): void;
reorderViews(ids: string[]): void;
exportViews(): string;                    // JSON
importViews(json: string): number;        // returns count
```

Persistence key: `dash:${storeKey}:views`. Tabs and presets are the same structure; "tab" = an open view, "preset" = a saved view the user can re-open. `StreamView` renders `SavedViewTabs` above the list when `state.views.length` or an explicit `enableViews` flag is set. Per-view polling reuses the existing `pollMs` timer, re-armed on `applyView`.

**Optimized-in-advance (seeded default views):** the store hydrates `defaultViews` on first run (merged with any user-saved views from `kvStore`, user views winning on id). CH ships a small curated set so the dashboard is useful with zero setup, e.g. `Errors · 24h` (`{minutes:1440, level:'error'}`), `All · 6h` (`{minutes:360}`), `Warnings · 24h`. Because params are part of the cache key, applying a seeded view paints instantly from `kvStore` if that window was fetched before; on cold start the first paint uses the meta side-channel (no layout shift). Optionally the primary view can be prewarmed by kicking its `fetch` on mount so switching to it is instant. Seeded views are marked (`seeded:true` internally) so a user can hide but not accidentally lose them.

### 6. Error digest as a secondary stream

No new framework: instantiate a **second** `StreamStore` with `command:'error_groups'` and an `errorGroupsLens`. `ErrorDigest.tsx` subscribes to it and renders normalized error signatures (`cnt`, `last_seen`, `sample`), a namespace scope, and a drill action that calls the **primary** store's `setParams({ pod_namespace, level:'error' })`. The two stores share the same `params` for `minutes`/`namespace` — `ClickHouseView` propagates the primary's relevant params into the secondary via `setParams` when they change.

## ClickHouse composition

`clickhouseStream.ts`:
- `initialParams`: `{ minutes: 360, limit: 500 }` (6h default, max rows).
- `fetch(ctx, params)`: POST `command:'query'` with params.
- `fetchMeta(ctx, params)`: POST `command:'stats'` with `{ minutes }`.
- `controls`: segmented time-range (6h/12h/24h/72h/ALL, ALL → `minutes:0`), selects for namespace/service (options from meta), level, and a search control.

`ClickHouseView.tsx`: `StreamView` (logs + controls + tiles + namespace metaPanel + saved views) with `ErrorDigest` rendered as a collapsible section below the stat grid.

## Backend

Already-available commands: `query`, `stats`, `error_groups` (`packages/rust/jedi/src/entity/pipe_clickhouse/logs.rs`). One change (re-applied in this worktree; was prototyped then reverted from the main tree):

- **ALL-window sentinel**: `minutes == 0` → drop the `timestamp > now() - INTERVAL n MINUTE` condition entirely. New helper `time_condition(Option<u32>) -> Option<String>` used by `build_query_sql`, `build_stats_sql`, `build_error_groups_sql`. `clamped_minutes` unchanged. Unit test `all_sentinel_drops_time_filter`.

Row cap stays `MAX_LIMIT=500`; the logs list is inherently bounded, but the stat tiles now show true `count()` totals via `stats`, so "Total Logs" reflects reality even when only 500 rows are listed. This is called out in the UI (tiles = totals, list = newest 500).

## Data flow

```
control change ─▶ store.setParams(patch) ─▶ abort in-flight ─▶ runFetch(params)
                                                              ├─ fetch(query)   ─▶ items  ─▶ StreamView rows
                                                              └─ fetchMeta(stats) ─▶ meta ─▶ stat tiles + NamespaceGrid
tap namespace/severity ─▶ setParams({pod_namespace, level}) ─▶ (same refetch)
error digest drill      ─▶ primary.setParams({pod_namespace, level:'error'})
save view ─▶ snapshot params ─▶ kvStore
apply view ─▶ setParams(view.params) + re-arm poll
```

## Error handling

- Fetch failure: existing `patch({error})` path; `ErrorState` with retry (`store.refresh`).
- 403: surface "Access restricted" (existing).
- `fetchMeta` must resolve (not throw) on failure so it never blocks the item fetch (existing contract); on meta failure, tiles fall back to `items.length` with a subtle "counts approximate" note.
- `importViews` bad JSON: caught, returns 0, shows a toast/message; never corrupts stored views.
- Param serialization guards against `undefined` (dropped from body and cache key).

## Testing strategy

Unit (vitest, `@kbve/rn`):
- `createStreamSource`: `setParams` merges + refetches + aborts previous; params in cache key; `resetParams`.
- `savedViews`: save/apply/remove/rename/reorder/export/import round-trip; bad-JSON import returns 0.
- `ControlBar`: renders each control kind; change → `setParams` called with right param; search debounce.
- `clickhouseStream`: query body shape per params; `stats` meta → tile totals; ALL sentinel sends `minutes:0`.
- `errorGroupsStream`: body shape; drill calls primary `setParams`.

Rust (`jedi --features clickhouse`): `all_sentinel_drops_time_filter` + existing SQL builder tests stay green.

Backward-compat: existing dashboard adapter tests (Argo/Forgejo/Grafana/Kasm) unchanged and green — proves additive.

## Performance

- `VirtualList` already virtualizes rows; reconcile + `signature` reference-reuse keeps memoized rows from re-rendering across polls — preserved.
- `setParams` uses the existing single-flight `AbortController` so rapid control changes cancel stale fetches (no pile-up).
- Search control debounces client-side before hitting `setParams` (server round-trip only after idle).
- Params-scoped cache means switching back to a prior window paints instantly from `kvStore`.
- Meta side-channel is cached + hydrated first → stat grid paints with no layout shift (existing behavior, now carrying true totals).

## Deletion / rollout (after parity verified on the live RN page)

1. Delete 9 dead files: `ReactCHAuth`, `ReactCHErrorBanner`, `ReactCHErrorDigest`, `ReactCHFilterBar`, `ReactCHHeader`, `ReactCHLogStream`, `ReactCHNamespaceGrid`, `ReactCHQueryTabs`, `ReactCHSummary`.
2. Slim `clickhouseService.ts` to `fetchIndexedLogs` + `LogRow` (+ its private deps: token getter, `PROXY_BASE`), dropping the dead nanostore atoms/tabs/presets. Keep the file — still imported by `ReactArgoResourceDetail.tsx` and `kasmService.ts`.
3. Verify Argo + Kasm dashboards still build/run (they only use `fetchIndexedLogs`).
4. `IClickHouseSchema.ts` comment reference is harmless; leave or update.

## Ship order (avoids both extremes: premature native dashboard vs never-mounted-on-native component)

1. Generic primitives in `@kbve/rn/dash`: params + `setParams`, `ControlBar`, clickable `StatGrid`, `savedViews` — with unit tests, existing dashboards untouched.
2. Shared `Select` primitive (`Select.tsx` native / `Select.web.tsx`).
3. CH composition: `clickhouseStream` + `errorGroupsStream` + `NamespaceGrid` + `ErrorDigest` + `ClickHouseView` (platform-neutral).
4. Backend ALL sentinel re-applied + tests.
5. Web mount: point `ReactClickHouseDashRN.tsx` at `ClickHouseView`; verify the live page.
6. Minimal native mount: `ClickHouseScreen` reachable from `HomeView`; verify native compile + runtime.
7. Delete the 9 dead `ReactCH*` files + slim `clickhouseService.ts`; verify Argo/Kasm still build.

## Resolved decisions

- **Native `<select>`** → shared `Select` primitive with `.web`/native split, native uses the existing `Sheet` overlay; feature code consumes the contract only. (See "Shared Select primitive".)
- **Native mount** → no expo-router; register `ClickHouseScreen` in `@kbve/rn` reachable from `HomeView`; standalone/minimal now, integrate into a native dashboard shell later. (See "Bridge/mounts".)
- **Saved views optimized in advance** → seeded `defaultViews` + params-scoped cache + optional primary-view prewarm. (See "Saved views".)

## Risks & remaining unknowns

- **Worktree has no `node_modules`** (known gotcha): running vitest/tsc for `@kbve/rn` from the worktree cwd needs the main-tree toolchain or a targeted install. Verification step resolves at run time (`--skip-nx-cache`, main-binary from worktree cwd).
- **Query-tab polling** interaction with the global `pollMs` timer: one active view polls at a time (matches old per-active-tab behavior); multi-tab concurrent polling is explicitly out of scope.
- **`ControlBar` layout on narrow native screens**: many controls (time range + 3 selects + search) may need to wrap/scroll; native validation in step 6 confirms.
```
