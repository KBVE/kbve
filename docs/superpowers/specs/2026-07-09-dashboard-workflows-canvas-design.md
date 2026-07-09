# Dashboard Workflows Canvas — POC Design

**Route:** `kbve.com/dashboard/workflows/` (+ desktop + mobile)
**Date:** 2026-07-09
**Status:** Design approved, POC scope

## Goal

A single-source-of-truth workflows canvas that proves round-trip invocation to
three script execution backends — firecracker microVMs, Supabase edge
functions, and Windmill — and renders live status per node, running identically
on the website, the desktop client, and mobile.

This is a **proof of concept**: prove the three integrations are linked
correctly, then iterate toward richer orchestration. It deliberately is not a
workflow engine.

## Platform strategy: one codebase, everywhere

The canvas is built once as React Native components in `@kbve/rn` and renders on
every target — no per-platform reimplementation, no dual ecosystem:

| Target  | Runtime                    | How it renders                                                |
| ------- | -------------------------- | ------------------------------------------------------------- |
| Mobile  | React Native (Expo SDK 56) | native Skia                                                   |
| Website | Browser                    | react-native-web + Skia CanvasKit (WASM) via `@kbve/rn-astro` |
| Desktop | Tauri (`desktop-kbve`)     | system webview → same web build                               |

Desktop and website are both DOM/webview, so they share one build; mobile is the
only native target. All three consume the same RN component tree.

### Why Skia, not React Flow

React Flow (`@xyflow/react`) is DOM-only — it cannot render on native RN, which
would force a second, mobile-only canvas implementation and a permanently
divergent codebase. `@shopify/react-native-skia` draws on a canvas surface that
runs natively **and** on web (CanvasKit/WASM), giving one implementation across
all three targets. The cost, accepted deliberately: node drag, edge paths,
pan/zoom, and hit-testing are hand-rolled rather than provided by React Flow.

### Dependency compatibility (verified)

`@shopify/react-native-skia@2.6.9` peers: `react >=19.0` (repo 19.2.3),
`react-native >=0.78` (repo 0.85.3), `react-native-reanimated >=3.19.1` (repo
4.3.1). It accepts the pinned reanimated and forces **no** `react-native-worklets`
bump, so it stays under the Expo SDK 56 worklets 0.8.x ceiling
([[project_expo56_worklets_ceiling]]). `react-native-gesture-handler@2.31.1` and
`react-native-reanimated@4.3.1` are already deps (drag/pan foundation). Skia is
the only new dependency; it is added to the ROOT `package.json` per the repo's
no-workspace dep rule ([[project_kbve_react_native]]).

## Scope

### In scope

- New workflows canvas module in `@kbve/rn`, rendering on mobile + web + desktop.
- Skia canvas: draggable nodes, visual edges, pan/zoom, hit-testing.
- One node type per backend (`edge`, `firecracker`, `windmill`); each node
  invokes a single script/function on its backend and shows status.
- New Windmill dashboard proxy in axum-kbve, authenticated through the existing
  kbve-gate SSO bridge (per-user impersonation).
- Shared invoke/poll service + nanostore run-state, RN-safe.
- Per-backend registries (what is invokable).
- Website route `/dashboard/workflows/`, desktop mount, mobile screen.

### Out of scope (the "work from there" phase)

- No run engine — edges are visual only, no node→node execution ordering.
- No data passing between nodes.
- No graph persistence / save / load.
- No scheduling or triggers.

Deferred until the three backend links are proven green across all platforms.

## Architecture

### Layers

1. **Shared core (RN-safe TS, no rendering)** — node model/types, the
   `workflowsService` (invoke + poll for the three backends), and a nanostore
   holding per-node run state. Pure logic; identical on every platform.
2. **Skia canvas (RN components)** — draws nodes and edges on a Skia surface;
   `react-native-gesture-handler` drives node drag and canvas pan, `reanimated`
   shared values hold the viewport transform. Node config controls (pick a
   script, ▶ invoke, view result) are ordinary RN components
   (`View`/`Text`/`Pressable` + existing `@kbve/rn/dash` primitives) layered
   over the canvas, not drawn in Skia — text/forms belong in RN, not a pixel
   surface.
3. **Platform mounts** — website Astro island, desktop Tauri view, mobile Expo
   screen, each mounting the same canvas component.

### Backend invocation

The dashboard already uses an established proxy pattern: axum-kbve exposes
`init_X_proxy()` + `X_proxy_handler()` pairs, staff-gated by `DASHBOARD_VIEW` /
`DASHBOARD_MANAGE`, forwarding `/dashboard/X/proxy/*` to an internal service with
injected auth. Grafana, Argo, Forgejo, KubeVirt, Kasm, firecracker, factorio,
vibeshine, and ClickHouse all follow it. `@kbve/rn/dash` already ships an `edge`
adapter, so edge-function invocation has a cross-platform precedent.

| Backend     | Path                             | Status                               |
| ----------- | -------------------------------- | ------------------------------------ |
| Edge fn     | `/dashboard/edge/proxy/{fn}`     | Exists (`edge` dash adapter)         |
| Firecracker | `/dashboard/firecracker/proxy/*` | Exists (`firecracker_proxy_handler`) |
| Windmill    | `/dashboard/workflows/proxy/*`   | **New** — this design                |

### Windmill proxy (new)

New `init_windmill_proxy()` + `windmill_proxy_handler()` in
`apps/kbve/axum-kbve/src/transport/proxy.rs`, mirroring the existing handlers,
exposing `/dashboard/workflows/proxy/*`. Authentication reuses the SSO gate
bridge already deployed for windmill.kbve.com:

```
client (kbve.com session, DASHBOARD_VIEW)
  → axum-kbve /dashboard/workflows/proxy/*
  → windmill-gate  (validates Supabase JWT, is_staff, runs bridge)
  → windmill-app   (request runs AS that staffer via impersonation)
```

axum-kbve forwards the user's Supabase token as the upstream
`Authorization: Bearer` to `windmill-gate`
(`windmill-gate.windmill.svc.cluster.local:5678`). The bridge
provisions/impersonates the user, so Windmill actions carry per-user attribution
and honor workspace permissions. No new secret — the sealed superadmin token the
bridge already holds is the only Windmill credential. The axum route stays
staff-gated so unauthenticated calls never reach the gate.

### Node model

Each node is `{ id, backend, ref, x, y, lastStatus, lastResult }`:

- `backend`: `'edge' | 'firecracker' | 'windmill'`
- `ref`: invocation target (edge fn name / firecracker job spec / Windmill script path)
- `x`, `y`: canvas position (drag-updated)
- `lastStatus`: `'idle' | 'running' | 'ok' | 'err'`
- `lastResult`: last response payload or error string

Tapping a node's ▶ control fires the backend invoke; the status badge cycles
`idle → running → ok|err`. Edges drawn between nodes are visual only in the POC.

Windmill invoke: `POST /dashboard/workflows/proxy/api/w/kbve/jobs/run/p/{path}`
returns a job id; the service polls
`GET .../api/w/kbve/jobs_u/completed/get_result_maybe/{id}` until the job
resolves, then sets `lastStatus` / `lastResult`. (Paths verified against the
Windmill 1.751.0 openapi.)

## Components

- `apps/kbve/axum-kbve/src/transport/proxy.rs` — add `init_windmill_proxy()` +
  `windmill_proxy_handler()`; register the route alongside the other dashboard
  proxies.
- `packages/npm/rn/src/workflows/` (new module):
    - `types.ts` — node model + backend types.
    - `workflowsService.ts` — three invoke functions (edge reuses the existing
      dash edge adapter path; firecracker + windmill new) + registry fetchers.
    - `store.ts` — nanostore `$workflows` for per-node run state.
    - `WorkflowsCanvas.tsx` — Skia canvas + gesture-driven drag/pan/zoom.
    - `NodeCard.tsx` / config controls — RN components layered over the canvas.
    - `index.ts` / `_ui.ts` — web-safe barrel per the dash-kit convention.
- Website: `/dashboard/workflows/` route (dashboard MDX/Astro shell) mounting the
  canvas as an island via `@kbve/rn-astro`, plus a `dashboardMenu.ts` entry.
- Desktop: mount the canvas in a `desktop-kbve` view.
- Mobile: a workflows screen in the Expo app.

### Registries

- Edge: existing manifest fetch (dash `edge` adapter).
- Windmill: `GET /dashboard/workflows/proxy/api/w/kbve/scripts/list`.
- Firecracker: existing listing surface.

## Data flow

1. Canvas mounts → `workflowsService` fetches each backend registry → seeds
   selectable node refs.
2. User adds nodes (one backend + ref each), drags them on the Skia canvas.
3. User taps ▶ on a node → `workflowsService.invoke(node)` → backend proxy →
   response updates `$workflows[nodeId]` → node badge + result panel re-render.

## Error handling

- Proxy hop failures → `lastStatus = 'err'` with the upstream status/message in
  `lastResult`.
- Windmill job completing with an error → `err` + the job error.
- axum `DASHBOARD_VIEW` rejection → 401/403 handled as the existing dashboard
  services do (session bounce).

## Web bundle note

Skia on web loads CanvasKit (WASM, ~2.9MB). It is scoped to the workflows route
only — a lazy-mounted island — never added to the global dashboard bundle, so
other dashboard pages pay nothing.

## Testing

- Unit-test `workflowsService` invoke + response parsing per backend, and the
  node-model reducers (drag, status transitions) — pure logic, no Skia. Uses the
  existing RN vitest config ([[project_rn_vitest_config]]).
- Manual: each node type round-trips green on web, desktop, and mobile against a
  real edge fn, a firecracker job, and a Windmill script.

## Follow-ups (post-POC)

Run engine (edge execution ordering), node→node data passing, graph persistence,
scheduling/triggers — sequenced after the three links are proven green on all
three platforms.
