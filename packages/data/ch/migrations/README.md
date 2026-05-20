# `packages/data/ch/migrations` — ClickHouse schema migrations

One-shot DDL migrations against the production observability cluster. Files in
`packages/data/ch/schemas/` are the canonical desired state for **new**
installs; this directory holds the deltas required to bring the **existing**
prod cluster from a known historical state into alignment.

## Naming

```
YYYYMMDD_<short_slug>.sql
YYYYMMDD_<short_slug>_runbook.md   (optional, when the DDL needs out-of-band steps)
```

The date is the day the migration is authored, not the day it ships. Slugs are
short and descriptive (`logs_raw_to_replicated`, `alerts_raw_add_severity`).

## What goes here

- DDL whose effect cannot be expressed by re-running `schemas/*.sql` against an
  existing cluster (e.g. engine swaps, partition moves, distributed-table
  rebinds).
- DDL that requires per-shard or per-replica steps that `ON CLUSTER` cannot
  express (e.g. `ATTACH PARTITION FROM` between engines).

If the migration is just additive (`ALTER TABLE ... ADD COLUMN`), prefer
editing the canonical schema file in `schemas/` and applying it via
`CREATE TABLE IF NOT EXISTS ... ON CLUSTER` semantics; do not add a migration.

## Applying

Migrations are applied manually by an operator during a planned window. Each
migration's runbook (when present) lists prerequisites, the per-pod commands,
and verification queries. There is no auto-runner.

Track applied migrations on the cluster itself:

```sql
CREATE TABLE IF NOT EXISTS observability.schema_migrations ON CLUSTER 'cluster'
(
    name         String,
    applied_at   DateTime64(3, 'UTC') DEFAULT now64(3),
    applied_by   String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/observability/schema_migrations', '{replica}')
ORDER BY (name, applied_at);
```

After a successful migration:

```sql
INSERT INTO observability.schema_migrations (name, applied_by)
VALUES ('20260520_logs_raw_to_replicated', '<operator-handle>');
```
