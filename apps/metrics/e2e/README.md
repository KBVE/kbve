# metrics e2e

Black-box end-to-end test for the telemetry ingest: a real ClickHouse plus the
metrics binary built from source, driven through the public ingest endpoint.

## What it checks

- missing ingest token → `401`
- valid batch → `202` with `accepted:1`
- the row lands in ClickHouse, **sanitized**:
    - `platform` clamped to the allow-list (`HACKER` → `web`)
    - control characters stripped from `message`
    - query string stripped from `url`

This exercises the whole path — HTTP → auth → rate limit → sanitize →
queue → flush → `INSERT ... FORMAT JSONEachRow` — against a real database.

## Run locally

```bash
apps/metrics/e2e/run.sh
```

Requires `docker compose` and `curl`. The script builds the image, boots CH,
waits for `/readiness`, runs the assertions, and tears everything down.

## Schema note

`init/01-telemetry.sql` is a **single-node** schema (plain `MergeTree`).
Production (`packages/data/ch/schemas/telemetry.sql`) uses
`ReplicatedMergeTree` + `Distributed` `ON CLUSTER 'cluster'`, which a one-node CH
can't run — the ingest writes to `errors_distributed` either way.

## CI

`.github/workflows/ci-metrics-e2e.yml`:

- **per-PR**: `cargo build -p met --locked` (fast gate; catches lockfile/dep
  resolution breaks before the Docker publish does)
- **nightly + manual dispatch**: the full docker-compose e2e above
