# Cube Semantic Layer — Design

**Date:** 2026-07-18
**Status:** Approved design, pre-implementation
**Scope:** Stand up Cube as the semantic/metrics layer over Postgres (kilobase/CNPG) + ClickHouse. Local-first to nail data models, then deploy as an ArgoCD service under `apps/kube/cube`. Metabase (a downstream consumer) is **out of scope** for this spec — added later.

## Goal

One semantic layer that:
- Defines metrics/dimensions once, over both Postgres and ClickHouse.
- Federates across the two sources (Postgres users ⋈ ClickHouse events).
- Pre-aggregates heavy ClickHouse queries for speed/cost (Cube Store).
- Becomes a cluster-native service (ArgoCD app), and a first real consumer of the existing CNPG read-only pooler.

Non-goals: Metabase deployment, dashboard design, RBAC/tenancy hardening, public ingress. Those follow once Cube is operational.

## Two-phase plan

### Phase A — Local (nail the schemas)

Run Cube locally via docker-compose. Point it at live cluster DBs through `kubectl port-forward`. Iterate on data models at seconds-latency instead of ArgoCD sync cycles.

**Components (docker-compose):**
- `cube` (API + refresh worker, single dev instance).
- `cubestore` (pre-aggregation engine, local single-node).
- Volume-mounted `model/` dir for `.yml`/`.js` data models (the artifact we actually care about producing).

**Connectivity (A):**
- Postgres: `kubectl port-forward svc/supabase-cluster-rw -n kilobase 5432` → Cube connects direct to the cluster RW service. (Pooler not used locally — single instance, no fan-in benefit.)
- ClickHouse: `kubectl port-forward` the CH service in the `clickhouse` namespace (HTTP 8123 / native 9000 per driver).
- Cube Postgres pool: `CUBEJS_DB_MAX_POOL` ~5 (small, single instance).

**Data-model strategy:**
- Use Cube's data-model **generation** to scaffold cubes from DB introspection (broad).
- **Curate down** to the cubes we actually surface — do not ship hundreds of auto-cubes nobody queries.
- Target for A "operational": at least one Postgres cube + one ClickHouse cube + one federated query joining them (proves both drivers + cross-source join + a pre-aggregation).

**Exit criteria for A:** committed `model/` data models that query real PG + CH data, a working pre-aggregation on a ClickHouse cube, and a validated federated query. These models carry forward unchanged to B.

### Phase B — Kubernetes (ArgoCD service)

Promote to `apps/kube/cube` as an ArgoCD Application, matching repo conventions (see `apps/kube/cnpg/application.yaml`): `kbve.com/*` annotations, `sources` (chart + `$values` repo ref), `syncPolicy` automated/selfHeal/prune, `CreateNamespace=true`, `ServerSideApply=true`.

**Components (B):**
- Cube API deployment (stateless, replicas ≥2 for HA).
- Cube refresh-worker deployment (owns pre-aggregation refresh; single logical owner).
- Cube Store (router + workers) as StatefulSet(s) with persistent storage for pre-aggregations.
- Data models from A shipped into the image or mounted (decide at plan time: baked image vs configmap/git-sync).

**Connectivity (B):**
- **Postgres → `supabase-cluster-pooler-ro` (session mode) in `kilobase`.** Rationale: Cube is read-only analytics — matches the RO pooler's stated purpose. **Session mode makes Cube's prepared statements work natively** — no `max_prepared_statements`, no transaction-mode workaround, no PgBouncer version-chasing.
  - Precondition: the RO pooler (`pooler.yaml`, currently "Phase 1: deploy only") must be reconciled + healthy. If not yet live, fall back to `supabase-cluster-rw` direct and cut over to the pooler once validated.
- **ClickHouse → CH service in `clickhouse` ns** (in-cluster DNS). Same as A minus port-forward.
- **Cube Postgres pool: small (3–5).** PgBouncer does the real fan-in across Cube pods; don't let each pod hoard backend connections.

**Pooling model (settled):**
```
A:  Cube (pool ~5) ─► port-forward supabase-cluster-rw           (direct)
B:  Cube pods (pool 3-5) ─► supabase-cluster-pooler-ro:5432       (session mode → prepared stmts native)
CH: Cube CH-driver pool ─► CH svc                                 (A + B; no PgBouncer layer)
```

## Architecture & data flow

```
        ┌──────────── Cube ────────────┐
consumers ──► Cube API (SQL/REST/GraphQL)
(later:        │        │
 Metabase)     │        └─► Cube Store (pre-aggregations) ◄── refresh-worker
               │
               ├─► Postgres  (A: port-forward RW · B: pooler-ro session)
               └─► ClickHouse (CH svc; heavy queries served via pre-aggs)
```

- Read queries hit Cube API → served from Cube Store pre-aggregations where defined, else pushed down to PG/CH.
- Refresh-worker keeps pre-aggregations fresh (the ClickHouse cost/speed lever).
- Federation (PG ⋈ CH) resolved in Cube's query layer.

## Units / boundaries

- **Data models (`model/`)** — the durable artifact. Portable A→B unchanged. One file per cube; clear measures/dimensions/joins.
- **Cube API** — stateless query surface. Understandable/replaceable without touching models.
- **Cube Store** — pre-aggregation storage. Isolated stateful concern.
- **Connectivity config** — the *only* thing that changes A→B (host swap + pool size). Kept in env, not baked into models.

## Error handling / risks

- **RO pooler not yet live** → fall back to `-rw` direct at B; cut over after validation. Explicit precondition check.
- **Port-forward flakiness (A)** → known (kilobase PF unstable); acceptable for dev, discarded at B.
- **Auto-cube sprawl** → curate; don't ship generated cubes wholesale.
- **CH pre-agg storage sizing** → size Cube Store PVCs from real rollup volume at B.
- **CNPG-pinned PgBouncer version** → RO pooler is **session mode**, so prepared-statement support is version-independent; no dependency on PgBouncer ≥1.21.

## Testing / validation

- **A:** federated query returns correct joined PG+CH result; a ClickHouse cube served from a pre-aggregation (verify via Cube's query plan / pre-agg hit); models committed.
- **B:** ArgoCD app syncs healthy; Cube API reachable in-cluster; PG connection via `pooler-ro` confirmed (or documented fallback); pre-aggregation refresh runs; same federated query passes against in-cluster endpoints.

## Deferred (explicitly not now)

- Metabase deployment + Metabase→Cube SQL-API wiring.
- Access control / row-level security / multi-tenancy.
- Public ingress / auth proxy (kbve-gate) fronting Cube.
- Cutover of the RO pooler header from "Phase 1 deploy-only" to GA (tracked separately, issue #7593).
