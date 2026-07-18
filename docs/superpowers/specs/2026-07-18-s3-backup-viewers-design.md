# S3 Backup Viewers for `s3://kilobase` — Design

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan

## Goal

Provide two **isolated** tools to inspect the CNPG Postgres backup bucket
(`s3://kilobase`, prefix `barman/backup/`). Each tool independently offers:

1. **Whole-bucket listing** — every object (key, size, last-modified), prefix-filterable.
2. **Barman-aware summary** — base backups, WAL coverage, latest-backup age, total size, 7-day retention health.

The two tools are deliberately decoupled: if one is down or broken, the other
still answers "is my backup good?". This is DR-visibility tooling — the weekly
restore drill and the S3 healthcheck have silently failed for months (see the
Cilium apiserver-egress fix, PR #14223), so operators need a direct read on the
bucket that does not depend on those cronjobs.

## Non-goals

- No mutation of the bucket (read-only: `ListObjectsV2`, `HeadObject`, `GetBucketLocation` only).
- No restore/backup triggering — display only.
- No bespoke Astro page (the web surface comes from rn-dash via rn-web).

## Facts (verified)

- Backup path: `s3://kilobase/barman/backup` (CNPG barman ObjectStore `kilobase-backup-store`, ns `kilobase`).
- WAL compression gzip, retention 7d.
- Creds: secret `kilobase-s3-secret` (ns `kilobase`), keys `keyId` + `accessKey`.
- Backend: AWS S3, no custom `endpointURL` in the ObjectStore.
- axum-kbve runs in ns `kbve`; uses ExternalSecrets (pattern: `arpg-discord-externalsecret.yaml`).
- Windmill scripts live in `apps/windmill/f/<folder>/`, synced via `wmill.yaml` `includes: f/**`, default runtime bun/TS.
- rn dashboard = `packages/npm/rn` (`@kbve/rn`); panels in `src/dash/`, adapters in `src/dash/adapters/` (existing: `clickhouse`, `minecraft`).

## Components

### Component 1 — axum-kbve S3 endpoints (isolated: axum → S3 direct)

Location: `apps/kbve/axum-kbve/src/s3backup/`.

- Crate: `aws-sdk-s3` (+ `aws-config`). Read-only.
- Region: env `AWS_REGION` (default `us-east-1`); no hardcode. Optionally verified once via `GetBucketLocation` at startup.
- Bucket + prefix: env `KILOBASE_S3_BUCKET` (default `kilobase`), `KILOBASE_S3_PREFIX` (default `barman/backup/`).
- Creds: env `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from a `kbve`-ns secret (see infra).

Routes (registered like existing `/dashboard/*` routes, authed via kbve-gate):

- `GET /dashboard/kilobase/s3/summary`
  → `{ latest_base_backup: {id, time, size, age_seconds}, base_backup_count, wal_count, total_size_bytes, oldest_object_age_seconds, retention_days: 7, retention_ok: bool, generated_at }`.
  Computed from a full `ListObjectsV2` walk of the prefix, classifying keys into base backups vs WAL (barman layout: `base/<id>/…`, `wals/…`).
- `GET /dashboard/kilobase/s3/objects?prefix=&token=&limit=`
  → `{ objects: [{key, size, last_modified}], next_token }` — whole-bucket paginated (`prefix` defaults to empty = entire bucket; `token` = S3 continuation token).

Error handling: S3 errors → `502` with a structured `{error, detail}` body; never panic; timeouts bounded (e.g. 10s per S3 call).

Versioning: bump `apps/kbve/axum-kbve/Cargo.toml` via the MDX source of truth (`api.mdx`) per repo convention; CI publish + deployment_yaml image sync.

### Component 2 — rn-dash panel (native + web)

Location: `packages/npm/rn/src/dash/`.

- `adapters/kilobaseBackup.ts` — typed fetchers for the two axum endpoints, mirroring the `clickhouse`/`minecraft` adapter shape (auth header handling reused from the existing dash data layer).
- `S3BackupPanel.tsx` — summary cards via the existing `StatGrid` (latest-backup age, base/WAL counts, total size, retention OK/WARN badge) + an object table (prefix filter input, paginated via `next_token`).
- Renders on native and web (rn-web bridge); no platform-specific code beyond what the dash kit already abstracts.
- Unit tests mirror `adapters/__tests__/clickhouse.test.ts` (adapter parsing + a summary-classification test).

### Component 3 — Windmill script (isolated: Windmill → S3 direct)

Location: `apps/windmill/f/kilobase/`.

- `s3_backup_list.ts` — bun/TS script using an S3 client (`@aws-sdk/client-s3`).
- Inputs: a Windmill **S3 resource** (native Windmill concept) holding the `kilobase` creds/region; optional `prefix` arg.
- Output: structured object `{ summary: {...same shape as axum...}, objects: [...] }` → Windmill renders the summary + object table in its built-in app/table UI.
- Companion `s3_backup_list.script.yaml` (Windmill metadata), synced via `f/**`.
- **No axum dependency** — computes the same barman summary itself from a direct S3 walk.

## Isolation map

```
Windmill  ── ListObjectsV2 ──▶  S3 (kilobase)
axum-kbve ── ListObjectsV2 ──▶  S3 (kilobase)
rn-dash   ── HTTPS ──▶ axum-kbve
```

- axum down ⇒ Windmill unaffected.
- Windmill down ⇒ axum + rn-dash unaffected.
- Shared failure domain is only S3 itself (acceptable — it is the thing being observed).

## Infra / secrets

- **axum (`kbve` ns):** new `ExternalSecret` `kilobase-s3-readonly` (mirror `arpg-discord-externalsecret.yaml`) projecting the `kilobase` S3 creds into a `kbve`-ns secret; mount as `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env on the axum deployment. Do **not** cross-mount the `kilobase`-ns secret directly.
- **Windmill:** an S3 resource configured with the same creds (created in Windmill; creds sourced from the existing ESO backend, not committed).
- Creds are the existing backup keys; scope is already read/write on the bucket, but all three tools use read-only S3 calls.

## Shared summary contract

The barman-summary JSON shape is identical across axum and Windmill (documented
above) so a reader recognizes the same fields regardless of tool. Not a shared
code module (isolation) — a shared *contract*, duplicated intentionally.

## Testing

- axum: unit test the barman classification (base vs WAL vs other) + summary math against a fixture object list; an integration smoke behind a feature/env guard (skipped without creds).
- rn-dash: adapter parse tests + summary-badge logic test (mirrors existing dash tests).
- Windmill: the script's summary function unit-tested locally (pure function over a fixture list).

## Rollout order

1. axum endpoints + `kbve`-ns ExternalSecret (independent, shippable).
2. rn-dash panel (depends on axum being deployed).
3. Windmill script + S3 resource (independent of 1–2).

Each is its own PR to `dev`.
