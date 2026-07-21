# Cube Dashboard Polish — Design

Date: 2026-07-20
Status: Approved, pre-implementation

## Context

The Cube semantic layer is live in k8s (ns `cube`, ArgoCD Synced/Healthy) and the
consumer dashboard ships via `@kbve/rn/dash/cube` fed by the staff-gated
`axum-kbve` proxy at `/dashboard/cube/proxy` (PR #14330, merged). Current UI:
two `TrendChart`s (log volume by level/day, signups by month) plus three
`StatGrid` tiles (total logs, errors, users).

This is a polish pass. It adds interactivity and surfaces data already present in
the Cube models. Zero changes to Cube models, the proxy, RBAC, or infrastructure.

## Goals

1. Interactive time-window control across all charts.
2. Surface log volume broken down by service and namespace.
3. Surface federated Minecraft player activity (proves PG⋈CH rollup_join in the UI).
4. Add derived stat tiles (error rate, signup delta).

## Non-Goals (YAGNI)

- Drilldown / click-to-filter (CubeView is not a StreamStore; keep it local-state).
- Saved views, custom calendar date picker.
- Any Cube model, proxy, or RBAC change.

## Available Data (existing models, no change)

- `ch_logs`: `count`; dims `timestamp` (time), `service`, `level`, `pod_namespace`.
  Pre-agg `logs_by_day` (level+service, granularity day).
- `pg_users`: `count`; time dim `created_at`.
- `ch_mc_snapshots` ⋈ `pg_mc_player`: `snapshots_by_player` rollup_join yields
  `ch_mc_snapshots.count` by `pg_mc_player.player_name`.

## Architecture

CubeView keeps its existing local-state polling model (30s interval,
`AbortController`, `setTimeout` re-arm). No StreamStore adoption — the stream
machinery (ControlBar, StreamStore) is coupled to the streaming dashboards and
is heavier than this view needs. The range control is a small local component
whose value lives in CubeView state and is threaded into each query.

### Components

**`cube/RangeControl.tsx` (new)**
- Segmented pills: `24h` / `7d` / `30d` / `All`. Style mirrors `ControlBar`'s
  segmented look (pill, border, `onPrimary` when active) but is self-contained.
- Props: `value: RangeKey`, `onChange: (k: RangeKey) => void`.
- `RangeKey = '24h' | '7d' | '30d' | 'all'`.

**`cube/RankedRows.tsx` (new)**
- Shared read-only ranked list. Props: `title`, `rows: RankedRow[]`,
  `format?: (n) => string`. Each row: label (grow) + value (muted), optional
  danger badge. Reuses `Surface`, `Stack`, `Text`, `Badge`, `tokens`. No press
  handler (read-only).
- `RankedRow = { key: string; label: string; value: number; badge?: string }`.

**`cube/cubeApi.ts` (edit)**
- `CubeQuery` already carries `timeDimensions[].dateRange` and `limit`; no type
  change needed.
- Add `fmtPct(n: number): string` (1 decimal, `%` suffix).
- Add range→dateRange mapping helper: `rangeToDateRange(k: RangeKey): string | undefined`
  and `rangeToGranularity(k, base)` where base picks `hour` for 24h else the
  natural granularity (`day` for logs, `month` for signups when `all`, else `day`).

**`adapters/cube.tsx` (edit)**
- `topServicesToRows(rows): RankedRow[]` — sum `ch_logs.count` by `ch_logs.service`,
  desc, already limited by query.
- `topNamespacesToRows(rows): RankedRow[]` — same by `ch_logs.pod_namespace`.
- `mcPlayersToRows(rows): RankedRow[]` — `ch_mc_snapshots.count` by
  `pg_mc_player.player_name`.
- Extend `buildCubeStats(logs, signups)`: add `error rate %` tile
  (`errors/total`, `fmtPct`, tone danger) and a signup-delta tile
  (last period vs prior period from the signups series; `+N` / `-N`, tone by sign).

**`cube/CubeView.tsx` (edit)**
- Add `range` state (default `'7d'`), render `RangeControl` at top.
- Existing 2 time queries gain `dateRange` + range-derived granularity.
- Add 3 non-time queries (services, namespaces, MC players) with `limit: 8` and
  the same `dateRange` on the relevant time dimension where applicable
  (services/namespaces filter by `ch_logs.timestamp` dateRange; MC players use the
  snapshot rollup, dateRange applied if `ch_mc_snapshots.timestamp` is queryable —
  otherwise unfiltered, documented in code as all-time).
- Fetch all queries in one `Promise.all`. Render order: RangeControl → StatGrid →
  log TrendChart → signup TrendChart → RankedRows(services) → RankedRows(namespaces)
  → RankedRows(MC players).

### Query detail

Log volume (existing, + dateRange):
```
measures: ['ch_logs.count'], dimensions: ['ch_logs.level'],
timeDimensions: [{ dimension: 'ch_logs.timestamp', granularity, dateRange }]
```

Top services:
```
measures: ['ch_logs.count'], dimensions: ['ch_logs.service'],
timeDimensions: [{ dimension: 'ch_logs.timestamp', dateRange }],
order: { 'ch_logs.count': 'desc' }, limit: 8
```
(top namespaces identical with `ch_logs.pod_namespace`.)

MC players:
```
measures: ['ch_mc_snapshots.count'], dimensions: ['pg_mc_player.player_name'],
order: { 'ch_mc_snapshots.count': 'desc' }, limit: 8
```

## Error Handling

Unchanged model: a failed tick sets `error`, keeps last data, re-arms poll.
403 → "Access restricted". Empty result arrays render nothing (RankedRows returns
null on empty, matching NamespaceGrid). Malformed numbers coerced via existing
`num()` guard.

## Testing

Adapter unit tests in `dash/__tests__` (pure functions, no RN render):
- `topServicesToRows` / `topNamespacesToRows` sort desc, coerce, drop nulls.
- `mcPlayersToRows` maps federated keys.
- `buildCubeStats` error-rate math (incl. divide-by-zero → 0%) and signup delta
  sign.
- `rangeToDateRange` / `rangeToGranularity` mapping table.

## Files

- `packages/npm/rn/src/dash/cube/RangeControl.tsx` (new)
- `packages/npm/rn/src/dash/cube/RankedRows.tsx` (new)
- `packages/npm/rn/src/dash/cube/cubeApi.ts` (edit)
- `packages/npm/rn/src/dash/cube/CubeView.tsx` (edit)
- `packages/npm/rn/src/dash/adapters/cube.tsx` (edit)
- `packages/npm/rn/src/dash/__tests__/cube-*.test.ts` (new)

Astro/MDX island (`ReactCubeDashRN`, `/dashboard/cube`) unchanged — it renders
CubeView; new UI appears automatically.

## Verification

Worktree has no node_modules; CI typechecks TS + runs vitest. Deploy = ArgoCD
reconcile after dev→main (astro-kbve build). No infra step.
