# Dashboard Workflows Canvas — POC Design

**Route:** `kbve.com/dashboard/workflows/`
**Date:** 2026-07-09
**Status:** Design approved, POC scope

## Goal

A React Flow canvas in the astro-kbve dashboard that proves round-trip
invocation to three script execution backends — firecracker microVMs,
Supabase edge functions, and Windmill — and renders live status per node.

This is a **proof of concept**: prove the three integrations are linked
correctly, then iterate toward richer orchestration. It deliberately is not a
workflow engine.

## Scope

### In scope

- New dashboard route `/dashboard/workflows/` with a React Flow canvas island.
- One node type per backend (`edge`, `firecracker`, `windmill`); each node
  invokes a single script/function on its backend and shows status.
- New Windmill dashboard proxy in axum-kbve, authenticated through the existing
  kbve-gate SSO bridge (per-user impersonation).
- A `workflowsService.ts` that wraps the three invoke calls plus a nanostore
  holding per-node run state.
- Backend registries (what is invokable) fetched per backend.

### Out of scope (the "work from there" phase)

- No run engine — edges are visual only, no node→node execution ordering.
- No data passing between nodes.
- No graph persistence / save / load.
- No scheduling or triggers.

These are explicitly deferred until the three backend links are proven green.

## Architecture

### Backend invocation

The dashboard already uses an established proxy pattern: axum-kbve (the kbve.com
backend) exposes `init_X_proxy()` + `X_proxy_handler()` pairs, each staff-gated
by `DASHBOARD_VIEW` / `DASHBOARD_MANAGE`, forwarding `/dashboard/X/proxy/*` to
an internal service with injected auth. Grafana, Argo, Forgejo, KubeVirt, Kasm,
firecracker, factorio, vibeshine, and ClickHouse all follow it.

| Backend     | Path                             | Status                               |
| ----------- | -------------------------------- | ------------------------------------ |
| Edge fn     | `/dashboard/edge/proxy/{fn}`     | Exists (`edgeService.ts`)            |
| Firecracker | `/dashboard/firecracker/proxy/*` | Exists (`firecracker_proxy_handler`) |
| Windmill    | `/dashboard/workflows/proxy/*`   | **New** — this design                |

### Windmill proxy (new)

New `init_windmill_proxy()` + `windmill_proxy_handler()` in
`apps/kbve/axum-kbve/src/transport/proxy.rs`, mirroring the existing handlers,
exposing `/dashboard/workflows/proxy/*`.

Authentication reuses the SSO gate bridge already deployed for
windmill.kbve.com:

```
browser (kbve.com session, DASHBOARD_VIEW)
  → axum-kbve /dashboard/workflows/proxy/*
  → windmill-gate  (validates Supabase JWT, is_staff, runs bridge)
  → windmill-app   (request runs AS that staffer via impersonation)
```

axum-kbve forwards the dashboard user's Supabase token as the upstream
`Authorization: Bearer` to `windmill-gate` (internal svc
`windmill-gate.windmill.svc.cluster.local:5678`). The gate's existing bridge
provisions/impersonates the user, so Windmill actions carry per-user
attribution and honor workspace permissions. No new secret is introduced — the
sealed superadmin token the bridge already holds is the only Windmill
credential.

The axum route stays staff-gated (`DASHBOARD_VIEW`) so unauthenticated calls
never reach the gate.

### Node model

Each node is `{ id, backend, ref, lastStatus, lastResult }` where:

- `backend`: `'edge' | 'firecracker' | 'windmill'`
- `ref`: the invocation target (edge fn name / firecracker job spec / Windmill
  script path)
- `lastStatus`: `'idle' | 'running' | 'ok' | 'err'`
- `lastResult`: last response payload or error string

Clicking the node's ▶ control fires the invoke for that backend; the status
badge cycles `idle → running → ok|err`. Edges drawn between nodes are visual
only in the POC (no execution semantics).

Windmill invoke: `POST /dashboard/workflows/proxy/api/w/kbve/jobs/run/p/{path}`
returns a job id; the service polls
`GET .../api/w/kbve/jobs_u/completed/get_result_maybe/{id}` until the job
resolves, then sets `lastStatus` / `lastResult`.

## Components

- `apps/kbve/axum-kbve/src/transport/proxy.rs` — add `init_windmill_proxy()` +
  `windmill_proxy_handler()`; register the route in the transport router
  alongside the other dashboard proxies.
- `apps/kbve/astro-kbve/src/components/dashboard/workflowsService.ts` — mirrors
  `edgeService.ts`: three invoke functions (edge reuses existing, firecracker
  and windmill new), plus registry fetchers and a `$workflows` nanostore for
  node run-state.
- `apps/kbve/astro-kbve/src/components/dashboard/ReactWorkflowsCanvas.tsx` —
  React Flow island mirroring the existing `BentoFlowIsland.tsx` xyflow pattern;
  renders the three node types and wires the ▶ invoke to `workflowsService`.
- `/dashboard/workflows/` route — standard dashboard MDX/Astro shell plus a
  `dashboardMenu.ts` entry.

### Registries

- Edge: existing manifest fetch in `edgeService.ts`.
- Windmill: `GET /dashboard/workflows/proxy/api/w/kbve/scripts/list`.
- Firecracker: existing listing surface from the firecracker dashboard
  component.

## Data flow

1. Island mounts → `workflowsService` fetches each backend registry → seeds
   selectable node refs.
2. User adds nodes (one backend + ref each), arranges them on the canvas.
3. User clicks ▶ on a node → `workflowsService.invoke(node)` → backend proxy →
   response updates `$workflows[nodeId]` → node badge + result panel re-render.

## Error handling

- Proxy hop failures surface as `lastStatus = 'err'` with the upstream status /
  message in `lastResult`.
- Windmill job that completes with an error sets `err` and shows the job error.
- axum `DASHBOARD_VIEW` rejection → 401/403 handled the same as the existing
  dashboard services (session bounce).

## Testing

- Unit-test `workflowsService` invoke + response parsing per backend (mirrors
  existing dashboard-service unit tests).
- Manual: each node type round-trips green in the live dashboard against a real
  edge fn, a firecracker job, and a Windmill script.

## Follow-ups (post-POC)

Run engine (edge execution ordering), node→node data passing, graph
persistence, scheduling/triggers — sequenced after the three links are proven.
