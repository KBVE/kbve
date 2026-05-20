# Runbook — `20260520_logs_raw_to_replicated`

Convert `observability.logs_raw` from per-node `MergeTree` to cluster-wide
`ReplicatedMergeTree`. Run during a planned window; Vector ingest is paused
for the duration (~5–15 minutes depending on partition count).

## Pre-flight

Confirm the drift is still present:

```bash
for pod in chi-clickhouse-cluster-cluster-{0,1}-{0,1}-0; do
  echo "=== $pod ==="
  kubectl -n clickhouse exec "$pod" -c clickhouse -- clickhouse-client \
    --query "SELECT name, engine FROM system.tables
             WHERE database='observability' AND name='logs_raw'
             FORMAT TabSeparated"
done
```

Expected output: `logs_raw  MergeTree` on every node. If any node already
reports `ReplicatedMergeTree`, stop and re-plan — partial state is not handled
by this runbook.

Ensure the migrations ledger exists (one-time, idempotent):

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

## Step 1 — Pause Vector

Scale the daemonset to zero so no new writes land in the table being moved:

```bash
kubectl -n vector scale daemonset supabase-vector --replicas=0
kubectl -n vector wait --for=delete pod -l app.kubernetes.io/name=vector --timeout=120s || true
```

Confirm no insert traffic:

```sql
SELECT count() FROM system.query_log
 WHERE event_time > now() - INTERVAL 1 MINUTE
   AND query_kind = 'Insert'
   AND query LIKE '%observability.logs%';
-- expect 0
```

## Step 2 — Create the replicated shadow

Run from any pod:

```bash
kubectl -n clickhouse exec -i chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
  clickhouse-client --multiquery < packages/data/ch/migrations/20260520_logs_raw_to_replicated.sql
```

…but **stop at the EXCHANGE TABLES line** (the DDL file is intentionally
ordered to fail-stop here if you pipe the whole thing in, because step 3 has
not run yet). The safe form is to copy only the `CREATE TABLE IF NOT EXISTS
observability.logs_raw_new ...` block and execute that:

```bash
kubectl -n clickhouse exec chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
  clickhouse-client --query "$(sed -n '/^CREATE TABLE IF NOT EXISTS observability.logs_raw_new/,/^TTL toDateTime/p' \
    packages/data/ch/migrations/20260520_logs_raw_to_replicated.sql)"
```

Verify all four pods now show both tables:

```bash
for pod in chi-clickhouse-cluster-cluster-{0,1}-{0,1}-0; do
  kubectl -n clickhouse exec "$pod" -c clickhouse -- clickhouse-client \
    --query "SELECT name, engine FROM system.tables
             WHERE database='observability' AND name IN ('logs_raw','logs_raw_new')
             FORMAT TabSeparated"
done
```

## Step 3 — Per-node ATTACH PARTITION

For each pod, enumerate active partitions on the legacy MergeTree and attach
them into the replicated shadow:

```bash
for pod in chi-clickhouse-cluster-cluster-{0,1}-{0,1}-0; do
  echo "=== $pod ==="
  partitions=$(kubectl -n clickhouse exec "$pod" -c clickhouse -- clickhouse-client \
    --query "SELECT DISTINCT partition_id FROM system.parts
             WHERE database='observability' AND table='logs_raw' AND active
             ORDER BY partition_id FORMAT TabSeparated")
  for pid in $partitions; do
    kubectl -n clickhouse exec "$pod" -c clickhouse -- clickhouse-client \
      --query "ALTER TABLE observability.logs_raw_new
                 ATTACH PARTITION ID '$pid' FROM observability.logs_raw"
  done
done
```

`ATTACH PARTITION` is a metadata-only operation on the same node, then the
replicated engine registers the parts with Keeper, which fans them out to the
in-shard replica. Watch the queue drain:

```sql
SELECT hostName(), absolute_delay, queue_size
  FROM clusterAllReplicas('cluster', system.replicas)
 WHERE database = 'observability' AND table = 'logs_raw_new'
 ORDER BY hostName();
```

Wait until every row reports `queue_size = 0` and `absolute_delay` is
trending to 0 (or flatlined; merges may temporarily inflate it). Cross-check
that both replicas of each shard now hold the same row count:

```sql
SELECT hostName(), sum(rows)
  FROM clusterAllReplicas('cluster', system.parts)
 WHERE database = 'observability' AND table = 'logs_raw_new' AND active
 GROUP BY hostName()
 ORDER BY hostName();
```

Within a shard, both replicas should now report the same total.

## Step 4 — Atomic swap

```bash
kubectl -n clickhouse exec chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
  clickhouse-client --query "EXCHANGE TABLES observability.logs_raw AND
                              observability.logs_raw_new ON CLUSTER 'cluster'"
```

Confirm:

```bash
for pod in chi-clickhouse-cluster-cluster-{0,1}-{0,1}-0; do
  kubectl -n clickhouse exec "$pod" -c clickhouse -- clickhouse-client \
    --query "SELECT name, engine FROM system.tables
             WHERE database='observability' AND name IN ('logs_raw','logs_raw_new')
             FORMAT TabSeparated"
done
```

Expected: `logs_raw  ReplicatedMergeTree` and `logs_raw_new  MergeTree` on
every node.

## Step 5 — Drop the legacy MergeTree

```bash
kubectl -n clickhouse exec chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
  clickhouse-client --query "DROP TABLE IF EXISTS observability.logs_raw_new
                              ON CLUSTER 'cluster' SYNC"
```

## Step 6 — Resume Vector

```bash
kubectl -n vector scale daemonset supabase-vector --replicas=1
kubectl -n vector rollout status daemonset/supabase-vector --timeout=120s
```

Verify ingest:

```sql
SELECT now() AS now_utc,
       max(timestamp) AS max_ts,
       max(ingested_at) AS max_ingested,
       count() FILTER (WHERE ingested_at > now() - INTERVAL 1 MINUTE) AS rows_1m
  FROM observability.logs_distributed;
```

`max_ingested` should be within ~10 seconds of `now_utc`, and `rows_1m`
non-zero.

Run the freshness probe against each replica to confirm the fix:

```bash
for pod in chi-clickhouse-cluster-cluster-{0,1}-{0,1}-0; do
  echo "=== $pod ==="
  kubectl -n clickhouse exec "$pod" -c clickhouse -- clickhouse-client \
    --query "SELECT max(timestamp), max(ingested_at)
             FROM observability.logs_raw
             FORMAT TabSeparated"
done
```

All four pods should report the same recent `max(ingested_at)`.

## Step 7 — Record the migration

```sql
INSERT INTO observability.schema_migrations (name, applied_by)
VALUES ('20260520_logs_raw_to_replicated', '<operator-handle>');
```

## Rollback

Before step 4 (`EXCHANGE TABLES`):

```sql
DROP TABLE observability.logs_raw_new ON CLUSTER 'cluster' SYNC;
```

…and resume Vector. No data is lost; the legacy MergeTree is untouched.

After step 4 but before step 5: re-run `EXCHANGE TABLES` to swap back.

After step 5: the legacy MergeTree is gone. Restoring from backup (or
re-creating as MergeTree and waiting for new ingest) is the only option. Do
not attempt to roll back past this point without a fresh snapshot.

## Why per-node `ATTACH`?

`ON CLUSTER` distributes a DDL statement to every node, but
`ATTACH PARTITION FROM` only moves data files that already exist **locally**
on the node executing the DDL. Because the legacy table was plain
`MergeTree`, each replica holds a different (disjoint) slice of rows — the
slice the Distributed engine happened to write to that replica via `rand()`.
Running the ATTACH on every node ensures every disjoint slice is captured,
and the new ReplicatedMergeTree then fans the resulting parts out to the
in-shard replica via Keeper.
