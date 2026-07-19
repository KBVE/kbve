# Cube Local (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Cube locally via docker-compose against live cluster Postgres + ClickHouse (port-forwarded), and produce validated, committed data models — one Postgres cube, one ClickHouse cube, a ClickHouse pre-aggregation, and a federated PG⋈CH query — that carry forward unchanged to the Phase B k8s deployment.

**Architecture:** Local docker-compose runs Cube (dev mode, API+playground on :4000), a Cube refresh worker, and a single-node Cube Store for pre-aggregations. Postgres is the **default** data source (`CUBEJS_DB_*`); ClickHouse is a **named** source `clickhouse` (`CUBEJS_DS_CLICKHOUSE_*`). Both DBs reached via `kubectl port-forward`. Data models live in `apps/kube/cube/model/` — the durable artifact shared with Phase B; the local harness lives in `apps/kube/cube/local/`.

**Tech Stack:** Cube Core (`cubejs/cube`), Cube Store (`cubejs/cubestore`), docker-compose, `kubectl port-forward`, Postgres (CNPG/kilobase), ClickHouse.

## Global Constraints

- Data models MUST live in `apps/kube/cube/model/` and be source-portable to Phase B unchanged — no local-only host/creds baked into model files. Connectivity lives only in env.
- Postgres = **default** data source. ClickHouse = named source **`clickhouse`**. `CUBEJS_DATASOURCES=default,clickhouse`.
- Local Postgres connection targets `supabase-cluster-rw` (kilobase) direct via port-forward — NOT a pooler (single instance, no fan-in benefit locally).
- Cube Postgres pool small: `CUBEJS_DB_MAX_POOL=5`.
- Secrets (`CUBEJS_DB_PASS`, CH creds, `CUBEJS_API_SECRET`) live in `apps/kube/cube/local/.env`, which is git-ignored. Never commit real credentials.
- Local dev only: `CUBEJS_DEV_MODE=true` (enables Playground at :4000). This is throwaway — Phase B pins versions and disables dev mode.
- Curate, don't dump: expose only the cubes exercised here. Auto-generated cubes for unused tables are not committed.

---

### Task 1: Local Cube harness (compose + Cube Store) boots

**Files:**
- Create: `apps/kube/cube/local/docker-compose.yml`
- Create: `apps/kube/cube/local/.env.example`
- Create: `apps/kube/cube/local/.gitignore`
- Create: `apps/kube/cube/model/.gitkeep`
- Create: `apps/kube/cube/README.md`

**Interfaces:**
- Produces: a running Cube API + Playground at `http://localhost:4000`, Cube Store reachable by Cube at host `cubestore`. Config/model dir mounted at `/cube/conf`; models resolve from `/cube/conf/model`.

- [ ] **Step 1: Write the compose file**

`apps/kube/cube/local/docker-compose.yml`:

```yaml
services:
  cube_api:
    image: cubejs/cube:latest
    restart: always
    ports:
      - "4000:4000"
    env_file: .env
    environment:
      - CUBEJS_DEV_MODE=true
      - CUBEJS_CUBESTORE_HOST=cubestore
      - CUBEJS_DB_MAX_POOL=5
      - CUBEJS_DATASOURCES=default,clickhouse
    volumes:
      - ../model:/cube/conf/model
      - ./cube.js:/cube/conf/cube.js:ro
    depends_on:
      - cube_refresh_worker
      - cubestore

  cube_refresh_worker:
    image: cubejs/cube:latest
    restart: always
    env_file: .env
    environment:
      - CUBEJS_REFRESH_WORKER=true
      - CUBEJS_DEV_MODE=true
      - CUBEJS_CUBESTORE_HOST=cubestore
      - CUBEJS_DB_MAX_POOL=5
      - CUBEJS_DATASOURCES=default,clickhouse
    volumes:
      - ../model:/cube/conf/model
      - ./cube.js:/cube/conf/cube.js:ro

  cubestore:
    image: cubejs/cubestore:latest
    restart: always
    environment:
      - CUBESTORE_SERVER_NAME=cubestore:9999
      - CUBESTORE_META_PORT=9999
      - CUBESTORE_REMOTE_DIR=/cube/data
    volumes:
      - ./.cubestore:/cube/data
```

- [ ] **Step 2: Write an empty cube.js config**

`apps/kube/cube/local/cube.js` (env-driven; no custom driverFactory needed since named-source env vars handle routing):

```javascript
module.exports = {};
```

- [ ] **Step 3: Write `.env.example` (committed) and `.gitignore`**

`apps/kube/cube/local/.env.example`:

```dotenv
CUBEJS_API_SECRET=local-dev-secret-change-me

# Default data source: Postgres (kilobase supabase-cluster-rw via port-forward)
CUBEJS_DB_TYPE=postgres
CUBEJS_DB_HOST=host.docker.internal
CUBEJS_DB_PORT=5432
CUBEJS_DB_NAME=postgres
CUBEJS_DB_USER=postgres
CUBEJS_DB_PASS=

# Named data source: ClickHouse (via port-forward)
CUBEJS_DS_CLICKHOUSE_DB_TYPE=clickhouse
CUBEJS_DS_CLICKHOUSE_DB_HOST=host.docker.internal
CUBEJS_DS_CLICKHOUSE_DB_PORT=8123
CUBEJS_DS_CLICKHOUSE_DB_NAME=default
CUBEJS_DS_CLICKHOUSE_DB_USER=default
CUBEJS_DS_CLICKHOUSE_DB_PASS=
```

`apps/kube/cube/local/.gitignore`:

```gitignore
.env
.cubestore/
```

- [ ] **Step 4: Write README with run instructions**

`apps/kube/cube/README.md` documents: copy `.env.example`→`.env`, fill creds, start port-forwards (Task 2), `docker compose up`, open Playground.

- [ ] **Step 5: Boot and verify Playground**

Run:
```bash
cd apps/kube/cube/local && cp .env.example .env && docker compose up -d
curl -sf http://localhost:4000/readyz && echo OK
```
Expected: `OK` (Cube API up). Playground loads at `http://localhost:4000`. (Data sources will error until Task 2 port-forwards exist — that is expected here; we only assert the API process is healthy.)

- [ ] **Step 6: Commit**

```bash
git add apps/kube/cube/local/docker-compose.yml apps/kube/cube/local/cube.js apps/kube/cube/local/.env.example apps/kube/cube/local/.gitignore apps/kube/cube/model/.gitkeep apps/kube/cube/README.md
git commit -m "feat(cube): local docker harness with cube store"
```

---

### Task 2: Live DB connectivity via port-forward

**Files:**
- Create: `apps/kube/cube/local/port-forward.sh`

**Interfaces:**
- Consumes: running compose from Task 1.
- Produces: `localhost:5432` → `supabase-cluster-rw` (kilobase), `localhost:8123` → ClickHouse HTTP svc. Cube (in-container) reaches them via `host.docker.internal`.

- [ ] **Step 1: Confirm the ClickHouse service name/namespace**

Run:
```bash
kubectl get svc -n clickhouse -o name | grep -i clickhouse
kubectl get svc -n kilobase supabase-cluster-rw -o name
```
Expected: a ClickHouse service (note its exact name for the script) and `service/supabase-cluster-rw`.

- [ ] **Step 2: Write the port-forward helper**

`apps/kube/cube/local/port-forward.sh` (replace `CH_SVC` with the name found in Step 1):

```bash
#!/usr/bin/env bash
set -euo pipefail
CH_SVC="${CH_SVC:-clickhouse}"   # override: CH_SVC=<name> ./port-forward.sh
kubectl port-forward -n kilobase svc/supabase-cluster-rw 5432:5432 &
kubectl port-forward -n clickhouse "svc/${CH_SVC}" 8123:8123 &
wait
```

- [ ] **Step 3: Make executable and start**

Run:
```bash
chmod +x apps/kube/cube/local/port-forward.sh
CH_SVC=<name-from-step-1> apps/kube/cube/local/port-forward.sh &
```
Expected: two `Forwarding from 127.0.0.1:...` lines.

- [ ] **Step 4: Fill `.env` creds and restart Cube**

Populate `CUBEJS_DB_PASS` (kilobase postgres password) and ClickHouse creds in `.env`, then:
```bash
cd apps/kube/cube/local && docker compose up -d --force-recreate
```

- [ ] **Step 5: Verify both sources introspect**

Run:
```bash
curl -sf "http://localhost:4000/cubejs-api/v1/meta" | head -c 200 && echo
```
Expected: HTTP 200 JSON (a `{"cubes":[...]}` envelope — empty cubes list is fine; a 500 means a source failed to connect). Cross-check in Playground that both `default` (Postgres) and `clickhouse` schemas list tables under "Data model" → generate.

- [ ] **Step 6: Commit**

```bash
git add apps/kube/cube/local/port-forward.sh
git commit -m "feat(cube): db port-forward helper for local dev"
```

---

### Task 3: First Postgres cube

**Files:**
- Create: `apps/kube/cube/model/<pg_table>.yml`

**Interfaces:**
- Consumes: `default` data source (Postgres) from Task 2.
- Produces: a queryable cube named after the chosen Postgres table, with at least one `count` measure and one time `dimension`.

- [ ] **Step 1: Pick a real Postgres table + generate a draft**

In Playground → Data model → select a concrete `default`-source table (e.g. a `users`/signups-style table in kilobase), generate its cube. This gives a starting `.yml`.

- [ ] **Step 2: Write the curated cube**

Save as `apps/kube/cube/model/<pg_table>.yml`. Curate to only real columns. Example shape (adapt names to the actual table — do NOT invent columns):

```yaml
cubes:
  - name: pg_users
    sql_table: public.users
    # data_source omitted → uses default (Postgres)
    measures:
      - name: count
        type: count
    dimensions:
      - name: id
        sql: id
        type: string
        primary_key: true
      - name: created_at
        sql: created_at
        type: time
```

- [ ] **Step 3: Query it and verify real rows**

Run (adjust cube/measure names to what you defined):
```bash
curl -sf "http://localhost:4000/cubejs-api/v1/load" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"measures":["pg_users.count"]}}' | head -c 300 && echo
```
Expected: JSON with a numeric `pg_users.count` matching real table size (sanity-check against `SELECT count(*)`).

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/model/<pg_table>.yml
git commit -m "feat(cube): postgres users cube"
```

---

### Task 4: First ClickHouse cube

**Files:**
- Create: `apps/kube/cube/model/<ch_table>.yml`

**Interfaces:**
- Consumes: `clickhouse` named data source from Task 2.
- Produces: a queryable cube backed by ClickHouse, declaring `data_source: clickhouse`, with a `count` measure and a time dimension usable for pre-aggregation in Task 5.

- [ ] **Step 1: Pick a real ClickHouse table + generate a draft**

In Playground, generate a cube from a `clickhouse`-source table (e.g. a logs/events table — heavy-ingest table per the CH deployment).

- [ ] **Step 2: Write the curated cube**

`apps/kube/cube/model/<ch_table>.yml` (adapt to real columns):

```yaml
cubes:
  - name: ch_events
    sql_table: default.events
    data_source: clickhouse
    measures:
      - name: count
        type: count
    dimensions:
      - name: event_time
        sql: event_time
        type: time
      - name: user_id
        sql: user_id
        type: string
```

- [ ] **Step 3: Query it and verify real rows**

Run:
```bash
curl -sf "http://localhost:4000/cubejs-api/v1/load" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"measures":["ch_events.count"],"timeDimensions":[{"dimension":"ch_events.event_time","granularity":"day"}]}}' | head -c 400 && echo
```
Expected: JSON with daily buckets of real event counts.

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/model/<ch_table>.yml
git commit -m "feat(cube): clickhouse events cube"
```

---

### Task 5: ClickHouse pre-aggregation (the speed/cost lever)

**Files:**
- Modify: `apps/kube/cube/model/<ch_table>.yml`

**Interfaces:**
- Consumes: `ch_events` cube (Task 4), Cube Store (Task 1).
- Produces: a `pre_aggregations` rollup on `ch_events` built into Cube Store, so the Task 4 daily query is served from the rollup rather than raw ClickHouse.

- [ ] **Step 1: Add a rollup pre-aggregation**

Append to the `ch_events` cube in `apps/kube/cube/model/<ch_table>.yml`:

```yaml
    pre_aggregations:
      - name: events_by_day
        measures:
          - ch_events.count
        time_dimension: ch_events.event_time
        granularity: day
        refresh_key:
          every: 1 hour
```

- [ ] **Step 2: Trigger a build**

Re-run the Task 4 daily query once to trigger the rollup build; give the refresh worker a moment, then re-run it.

- [ ] **Step 3: Verify the query is served from the pre-aggregation**

Run (note the `annotation`/`usedPreAggregations` in the SQL API, or use the load endpoint with dev-mode diagnostics):
```bash
curl -sf "http://localhost:4000/cubejs-api/v1/load" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"measures":["ch_events.count"],"timeDimensions":[{"dimension":"ch_events.event_time","granularity":"day"}]}}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("results",[{}])[0].get("usedPreAggregations",{}))'
```
Expected: a non-empty `usedPreAggregations` map naming `events_by_day` (query served from Cube Store, not raw CH).

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/model/<ch_table>.yml
git commit -m "feat(cube): daily rollup pre-aggregation on clickhouse events"
```

---

### Task 6: Federated Postgres ⋈ ClickHouse query

**Files:**
- Modify: `apps/kube/cube/model/<pg_table>.yml` and/or `apps/kube/cube/model/<ch_table>.yml`

**Interfaces:**
- Consumes: `pg_users` (Task 3) + `ch_events` (Task 4/5).
- Produces: a cross-source result joining Postgres users to their ClickHouse events, proving federation. Uses a `rollup_join` pre-aggregation (the supported way to join across data sources in Cube).

- [ ] **Step 1: Add a matching rollup on `pg_users` for the join key**

Append to `pg_users`:

```yaml
    pre_aggregations:
      - name: users_rollup
        dimensions:
          - pg_users.id
```

- [ ] **Step 2: Add a `rollup_join` pre-aggregation on `ch_events`**

Add a join + rollup_join. In `ch_events`, add a `joins` block and a rollup_join pre-agg (adapt keys to real columns):

```yaml
    joins:
      - name: pg_users
        relationship: many_to_one
        sql: "{CUBE}.user_id = {pg_users}.id"
    pre_aggregations:
      - name: events_with_users
        type: rollup_join
        measures:
          - ch_events.count
        dimensions:
          - pg_users.id
        rollups:
          - pg_users.users_rollup
          - ch_events.events_by_day
```

- [ ] **Step 3: Run the federated query**

Run:
```bash
curl -sf "http://localhost:4000/cubejs-api/v1/load" \
  -H 'Content-Type: application/json' \
  -d '{"query":{"measures":["ch_events.count"],"dimensions":["pg_users.id"]}}' | head -c 500 && echo
```
Expected: JSON rows pairing `pg_users.id` (from Postgres) with `ch_events.count` (from ClickHouse) — a single result crossing both sources.

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/model/<pg_table>.yml apps/kube/cube/model/<ch_table>.yml
git commit -m "feat(cube): federated postgres-clickhouse rollup_join"
```

---

### Task 7: Capture schema findings for Phase B

**Files:**
- Modify: `apps/kube/cube/README.md`
- Modify: `docs/superpowers/specs/2026-07-18-cube-semantic-layer-design.md` (Phase B connectivity notes)

**Interfaces:**
- Consumes: all validated models from Tasks 3–6.
- Produces: a documented handoff — exact table names, join keys, pre-agg definitions, and the CH service DNS discovered in Task 2 — so Phase B is a mechanical host swap.

- [ ] **Step 1: Record the Phase B connectivity deltas**

In `apps/kube/cube/README.md`, add a "Phase B (k8s) deltas" section listing:
- Postgres host: `host.docker.internal:5432` (A) → `supabase-cluster-pooler-ro.kilobase.svc:5432` session mode (B). Fallback: `supabase-cluster-rw.kilobase.svc` if pooler not reconciled.
- ClickHouse host: `host.docker.internal:8123` (A) → `<CH_SVC>.clickhouse.svc:8123` (B, exact name from Task 2 Step 1).
- `CUBEJS_DEV_MODE=false`, pinned image tags, `CUBEJS_DB_MAX_POOL=3`.

- [ ] **Step 2: Verify the full model set loads clean**

Run:
```bash
curl -sf "http://localhost:4000/cubejs-api/v1/meta" | python3 -c 'import sys,json;print("cubes:",[c["name"] for c in json.load(sys.stdin)["cubes"]])'
```
Expected: lists `pg_users` and `ch_events` (names as defined) with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/kube/cube/README.md docs/superpowers/specs/2026-07-18-cube-semantic-layer-design.md
git commit -m "docs(cube): phase A schema handoff for k8s deployment"
```

---

## Self-Review

- **Spec coverage:** local docker-compose ✓ (T1), port-forward PG+CH ✓ (T2), Cube Store included ✓ (T1), small PG pool ✓ (constraints/T1), one PG cube + one CH cube ✓ (T3/T4), pre-aggregation ✓ (T5), federated query ✓ (T6), scaffold-broad/curate-down ✓ (constraints + T3/T4 steps), models portable A→B ✓ (T7). Metabase correctly absent (deferred). Phase B deployment is a separate plan (noted in spec) — not covered here by design.
- **Placeholder scan:** `<pg_table>`/`<ch_table>`/`<name>`/`<CH_SVC>` are intentional per-environment values the implementer fills from real introspection (Task steps instruct discovery first), not lazy TBDs. Example cube YAML is marked "adapt to real columns — do not invent."
- **Type consistency:** cube names `pg_users`/`ch_events`, pre-aggs `users_rollup`/`events_by_day`/`events_with_users`, source names `default`/`clickhouse`, and `CUBEJS_DATASOURCES=default,clickhouse` are used consistently across T3–T7.
