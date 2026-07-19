# Cube Local Harness

Local development setup for Cube (semantic/metrics layer) with Cube Store, Postgres, and ClickHouse.

## Quick Start

1. **Copy and configure the environment file:**
   ```bash
   cd local
   cp .env.example .env
   ```

2. **Fill in the database credentials** in `.env`:
   - `CUBEJS_DB_PASS` — Postgres password for supabase-cluster-rw
   - `CUBEJS_DS_CLICKHOUSE_DB_PASS` — ClickHouse password (if required)

3. **Start port-forwards** (Task 2):
   ```bash
   # Postgres (kilobase supabase-cluster-rw)
   kubectl port-forward -n kilobase svc/cnpg-cluster-rw 5432:5432 &
   
   # ClickHouse
   kubectl port-forward -n clickhouse svc/clickhouse-pod 8123:8123 &
   ```

4. **Start the Cube stack:**
   ```bash
   docker compose up -d
   ```

5. **Verify the API is healthy:**
   ```bash
   curl -sf http://localhost:4000/readyz && echo OK
   ```

6. **Open the Playground:**
   Navigate to `http://localhost:4000` in your browser.

## Services

- **cube_api** — Cube API + Playground (port 4000)
- **cube_refresh_worker** — Background job processor for pre-aggregations
- **cubestore** — In-process OLAP store (orchestrated by cube_api)

## Configuration

- **Model dir:** mounted at `/cube/conf/model` (resolved from `../model/`)
- **Config:** `cube.js` at `/cube/conf/cube.js` (read-only from `./cube.js`)
- **Data sources:**
  - `default` — Postgres (env-driven)
  - `clickhouse` — ClickHouse (env-driven via `CUBEJS_DS_CLICKHOUSE_*`)

## Troubleshooting

- **Playground shows 502:** Verify port-forwards and database credentials in `.env`.
- **Cubestore container restarts:** Check permissions on `.cubestore/` directory or disk space.
- **API not responding:** Run `docker compose logs cube_api` to inspect startup errors.

## Notes

- `.env` and `.cubestore/` are git-ignored (see `.gitignore`).
- Cube is in `CUBEJS_DEV_MODE=true` for live code reload.
- All services use Docker Compose DNS for inter-service communication (`cubestore` hostname).
