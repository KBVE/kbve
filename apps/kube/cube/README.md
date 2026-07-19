# Cube Local Harness

Local development setup for Cube (semantic/metrics layer) with Cube Store, Postgres, and ClickHouse.

Database connectivity is handled by an in-network `kubefwd` sidecar container that runs
`kubectl port-forward` for both databases and exposes them only on the compose network
(Postgres at `kubefwd:5432`, ClickHouse at `kubefwd:8123`). Nothing is published to the
host, so no credentialed database ports are exposed to your LAN.

## Quick Start

1. **Copy and fill the environment file** (`cd local`):
   ```bash
   cp .env.example .env
   ```
   Fill `CUBEJS_DB_PASS` (Postgres) and `CUBEJS_DS_CLICKHOUSE_DB_PASS` (ClickHouse).
   To pull both from the cluster secrets into `.env`:
   ```bash
   kubectl get secret -n kilobase supabase-postgres -o jsonpath='{.data.password}' | base64 -d   # -> CUBEJS_DB_PASS
   kubectl get secret -n clickhouse clickhouse-admin-credentials -o jsonpath='{.data.password}' | base64 -d  # -> CUBEJS_DS_CLICKHOUSE_DB_PASS
   ```
   The sidecar mounts `~/.kube/config` read-only and uses your current kube context.

2. **Start the stack** (the sidecar's healthcheck gates Cube startup until both forwards are up):
   ```bash
   docker compose up -d
   ```

3. **Verify the API is healthy:**
   ```bash
   curl -sf http://localhost:4000/readyz && echo OK
   ```

4. **Open the Playground:** `http://localhost:4000`.

## Services

- **kubefwd** — sidecar running `kubectl port-forward` for Postgres + ClickHouse (compose network only; auto-reconnects on drop)
- **cube_api** — Cube API + Playground (port 4000)
- **cube_refresh_worker** — background worker that builds/refreshes pre-aggregations
- **cubestore** — Cube Store: standalone pre-aggregation engine (its own container; `platform: linux/amd64` for Apple Silicon)

## Configuration

- **Model dir:** mounted at `/cube/conf/model` (from `../model/`) — the durable artifact, portable to Phase B
- **Config:** `cube.js` at `/cube/conf/cube.js` (read-only)
- **Data sources:**
  - `default` — Postgres, database `supabase` (env-driven `CUBEJS_DB_*`)
  - `clickhouse` — ClickHouse (env-driven `CUBEJS_DS_CLICKHOUSE_*`)

## Discovered cluster endpoints

- Postgres RW service: `kilobase-rw` (namespace `kilobase`), app data in the `supabase` database
- ClickHouse HTTP service: `clickhouse-clickhouse-cluster` (namespace `clickhouse`), analytics DBs include `observability`, `telemetry`, `mc`, `gameops`

## Troubleshooting

- **Cube can't reach a database:** check `docker compose logs kubefwd` — the WAN port-forward to kilobase drops periodically and auto-reconnects (~1s gap). Cube's connection pool retries through these.
- **`no matching manifest for linux/arm64`:** Cube Store has no arm64 image; the compose file pins `platform: linux/amd64` (runs via Rosetta on OrbStack/Docker Desktop).
- **API not responding:** `docker compose logs cube_api`.

## Phase B (k8s) deltas

When promoting `apps/kube/cube/` to an ArgoCD service, the sidecar disappears — Cube talks to in-cluster services directly:

- Postgres host: `kubefwd:5432` (local) → `kilobase-rw.kilobase.svc:5432` (B). If/when the CNPG read-only pooler is reconciled, prefer it for this analytics workload (session mode → native prepared statements); it is not currently deployed.
- ClickHouse host: `kubefwd:8123` (local) → `clickhouse-clickhouse-cluster.clickhouse.svc:8123` (B).
- `CUBEJS_DEV_MODE=false`, pinned image tags, `CUBEJS_DB_MAX_POOL=3`.

## Notes

- `.env` and `.cubestore/` are git-ignored (see `local/.gitignore`).
- Cube runs with `CUBEJS_DEV_MODE=true` (Playground + live model reload).
