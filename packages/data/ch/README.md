# `packages/data/ch` — ClickHouse Schemas

ClickHouse DDL for the KBVE observability stack. Two flavors live side by side:

1. **Logflare-compatible templates** (`logs.sql`, `metrics.sql`, `traces.sql`) — extracted from Logflare's `QueryTemplates.ex`, used as reference when Logflare provisions per-source tables (`otel_logs_<token>`, etc.).
2. **First-party direct-write tables** (`observability.sql`, `firecracker.sql`) — populated by Vector → ClickHouse without Logflare in the path. Production deploys use `ReplicatedMergeTree` + `Distributed` across a 2 shard × 2 replica cluster.

## Files

| File                     | Purpose                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `database.sql`           | Creates the `logflare` database. Run before any `logflare.*` template.                                                            |
| `logs.sql`               | Logflare OTEL log templates (JSON attribute columns + map-typed variants).                                                        |
| `metrics.sql`            | Logflare OTEL metric templates.                                                                                                   |
| `traces.sql`             | Logflare OTEL trace templates.                                                                                                    |
| `observability.sql`      | `observability.logs_raw` (replicated) + `logs_distributed` — direct Vector → ClickHouse log pipeline. Day-partitioned, 8-day TTL. |
| `firecracker.sql`        | `firecracker.vm_events` — microVM lifecycle telemetry from `firecracker-ctl`. 90-day TTL for capacity planning.                   |
| `migrations/`            | One-shot deltas to align an existing cluster with `schemas/*.sql`. See `migrations/README.md` for the naming + apply convention.  |
| `dev-docker-compose.yml` | Single-node ClickHouse for local DDL validation (no Logflare, no Postgres). Mounted on `tmpfs` for cheap teardown.                |

## Engines and retention

| Table                            | Engine                | Partition      | TTL     |
| -------------------------------- | --------------------- | -------------- | ------- |
| `logflare.otel_logs_template`    | MergeTree (templated) | daily          | 45 days |
| `logflare.otel_metrics_template` | MergeTree (templated) | daily          | 45 days |
| `logflare.otel_traces_template`  | MergeTree (templated) | daily          | 45 days |
| `observability.logs_raw`         | ReplicatedMergeTree   | `toYYYYMMDD`   | 8 days  |
| `observability.logs_distributed` | Distributed           | (fan-out only) | n/a     |
| `firecracker.vm_events`          | MergeTree             | `toYYYYMMDD`   | 90 days |

Production overrides Logflare's default engine via:

```elixir
config :logflare, :clickhouse_backend_adaptor, engine: "ReplicatedMergeTree"
```

## Local DDL validation

```bash
cd packages/data/ch
cp dev-docker-compose.yml docker-compose.yml
docker compose up -d

# Apply schemas (skip the ON CLUSTER clauses — single node has no cluster).
docker compose exec -T clickhouse clickhouse-client \
  --user logflare --password logflare \
  --multiquery < schemas/database.sql
for f in schemas/logs.sql schemas/metrics.sql schemas/traces.sql; do
  docker compose exec -T clickhouse clickhouse-client \
    --user logflare --password logflare -d logflare \
    --multiquery < "$f"
done

# Inspect:
docker compose exec clickhouse clickhouse-client \
  --user logflare --password logflare -d logflare -q "SHOW TABLES"

docker compose down -v
```

`observability.sql` and `firecracker.sql` use `ON CLUSTER 'cluster'` and `ReplicatedMergeTree('/clickhouse/tables/{shard}/...', '{replica}')` — they only apply cleanly against a real clustered cluster. For local validation, strip the `ON CLUSTER` clauses and switch the engine to plain `MergeTree`.

## Pipeline

```
service stdout / OTEL exporter
       │
       ▼
   Vector agent ───┐
                   │
      writes to    ▼
        observability.logs_raw  (per-shard local table)
                   │
  reads through    ▼
        observability.logs_distributed  (cluster-wide view)
                   │
                   ▼
              dashboards / queries
```

For Logflare-managed sources the same shape applies, but Logflare provisions one `otel_logs_<token>` table per source instead of a single `logs_raw`.

## Future work

OpenTelemetry trace ingestion (Vector 0.54 experimental) is queued behind the log pipeline stabilisation — see [`project_otel_tracing.md`](../../../../.claude/projects/-Users-alappatel-Documents-GitHub-kbve/memory/project_otel_tracing.md) in the auto-memory.

## Related

- Vector pipelines: `apps/kube/observability/manifests/`
- Postgres-side audit log: [`../sql/`](../sql/)
- KBVE log routing service: `apps/kbve/axum-kbve/src/observability/`
