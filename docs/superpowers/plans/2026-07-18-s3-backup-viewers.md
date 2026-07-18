# S3 Backup Viewers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two isolated read-only viewers (axum-kbve endpoints + Windmill script) plus an rn-dash panel that surface the `s3://kilobase` CNPG backup bucket — whole-bucket listing and a barman-aware backup summary.

**Architecture:** A pure barman-classification function is duplicated (by contract, not shared code) in axum (Rust) and Windmill (TS). axum exposes two authed `/dashboard/kilobase/s3/*` JSON endpoints backed by `aws-sdk-s3`; the rn-dash panel consumes them; the Windmill script hits S3 directly. Each tool fails independently.

**Tech Stack:** Rust (axum 0.8, aws-sdk-s3), TypeScript (@aws-sdk/client-s3 for Windmill bun, React Native for rn-dash), External Secrets Operator, ArgoCD.

## Global Constraints

- Read-only S3 only: `ListObjectsV2`, `HeadObject`, `GetBucketLocation`. No writes.
- Bucket `kilobase`, prefix `barman/backup/`; barman layout `base/<id>/…` and `wals/…`.
- Version bumps via MDX source of truth only (`api.mdx` for axum); never hand-edit `version.toml` (CI-managed).
- No inline code comments in shipped source (repo convention).
- Commits: no Claude co-author/link line.
- axum runs in ns `kbve`; creds reach it only via a `kbve`-ns ExternalSecret — never cross-mount the `kilobase`-ns secret.
- Summary JSON contract (identical across axum + Windmill):
  `{ latest_base_backup: {id, time, size_bytes, age_seconds} | null, base_backup_count, wal_count, total_size_bytes, oldest_object_age_seconds, retention_days, retention_ok, generated_at }`

---

## Component A — axum-kbve S3 endpoints

### Task A1: barman classification + summary (pure function, TDD)

**Files:**
- Create: `apps/kbve/axum-kbve/src/s3backup/summary.rs`
- Create: `apps/kbve/axum-kbve/src/s3backup/mod.rs` (module glue; `pub mod summary;`)
- Test: inline `#[cfg(test)]` in `summary.rs`

**Interfaces:**
- Produces:
  - `struct S3Object { key: String, size: i64, last_modified: i64 }` (last_modified = unix secs)
  - `struct BackupSummary { latest_base_backup: Option<BaseBackup>, base_backup_count: u64, wal_count: u64, total_size_bytes: i64, oldest_object_age_seconds: i64, retention_days: u32, retention_ok: bool, generated_at: i64 }` (Serialize)
  - `struct BaseBackup { id: String, time: i64, size_bytes: i64, age_seconds: i64 }` (Serialize)
  - `fn summarize(objects: &[S3Object], prefix: &str, now: i64, retention_days: u32) -> BackupSummary`
  - classification: key contains `/base/` → base backup (group by the `base/<id>` segment, sum sizes, newest wins); key contains `/wals/` → WAL; else ignored for counts but counted in total_size.

- [ ] **Step 1: Write failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn obj(key: &str, size: i64, ts: i64) -> S3Object {
        S3Object { key: key.to_string(), size, last_modified: ts }
    }

    #[test]
    fn classifies_base_and_wal_and_reports_latest() {
        let objs = vec![
            obj("barman/backup/base/20260718T040000/data.tar.gz", 1000, 1_000_000),
            obj("barman/backup/base/20260718T040000/pgdata.tar.gz", 200, 1_000_050),
            obj("barman/backup/base/20260711T040000/data.tar.gz", 800, 400_000),
            obj("barman/backup/wals/000000010000000000000001", 16, 1_000_100),
            obj("barman/backup/wals/000000010000000000000002", 16, 1_000_200),
        ];
        let now = 1_000_300;
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert_eq!(s.base_backup_count, 2);
        assert_eq!(s.wal_count, 2);
        assert_eq!(s.total_size_bytes, 1000 + 200 + 800 + 16 + 16);
        let latest = s.latest_base_backup.unwrap();
        assert_eq!(latest.id, "20260718T040000");
        assert_eq!(latest.size_bytes, 1200);
        assert_eq!(latest.time, 1_000_050);
        assert_eq!(latest.age_seconds, 250);
    }

    #[test]
    fn retention_ok_true_when_oldest_within_window() {
        let now = 10 * 86400;
        let objs = vec![obj("barman/backup/wals/x", 1, 4 * 86400)];
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert!(s.retention_ok);
    }

    #[test]
    fn retention_ok_false_when_no_recent_base_backup() {
        let now = 10 * 86400;
        let objs = vec![obj("barman/backup/base/old/data.tar.gz", 1, 1 * 86400)];
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert!(!s.retention_ok);
    }

    #[test]
    fn empty_yields_null_latest_and_not_ok() {
        let s = summarize(&[], "barman/backup/", 100, 7);
        assert!(s.latest_base_backup.is_none());
        assert_eq!(s.base_backup_count, 0);
        assert!(!s.retention_ok);
    }
}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/kbve/axum-kbve && cargo test s3backup::summary 2>&1 | tail -20`
Expected: FAIL (unresolved `summarize`, structs).

- [ ] **Step 3: Implement**

```rust
use serde::Serialize;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct BaseBackup {
    pub id: String,
    pub time: i64,
    pub size_bytes: i64,
    pub age_seconds: i64,
}

#[derive(Serialize, Debug)]
pub struct BackupSummary {
    pub latest_base_backup: Option<BaseBackup>,
    pub base_backup_count: u64,
    pub wal_count: u64,
    pub total_size_bytes: i64,
    pub oldest_object_age_seconds: i64,
    pub retention_days: u32,
    pub retention_ok: bool,
    pub generated_at: i64,
}

fn base_id(key: &str) -> Option<String> {
    let idx = key.find("/base/")?;
    let rest = &key[idx + "/base/".len()..];
    let id = rest.split('/').next()?;
    if id.is_empty() { None } else { Some(id.to_string()) }
}

pub fn summarize(objects: &[S3Object], _prefix: &str, now: i64, retention_days: u32) -> BackupSummary {
    let mut bases: HashMap<String, (i64, i64)> = HashMap::new();
    let mut wal_count: u64 = 0;
    let mut total: i64 = 0;
    let mut oldest_ts = i64::MAX;

    for o in objects {
        total += o.size;
        if o.last_modified < oldest_ts {
            oldest_ts = o.last_modified;
        }
        if let Some(id) = base_id(&o.key) {
            let e = bases.entry(id).or_insert((0, 0));
            e.0 += o.size;
            if o.last_modified > e.1 {
                e.1 = o.last_modified;
            }
        } else if o.key.contains("/wals/") {
            wal_count += 1;
        }
    }

    let latest = bases
        .iter()
        .max_by_key(|(_, (_, t))| *t)
        .map(|(id, (size, t))| BaseBackup {
            id: id.clone(),
            time: *t,
            size_bytes: *size,
            age_seconds: now - *t,
        });

    let retention_window = retention_days as i64 * 86400;
    let retention_ok = latest
        .as_ref()
        .map(|b| b.age_seconds <= retention_window)
        .unwrap_or(false);

    BackupSummary {
        latest_base_backup: latest,
        base_backup_count: bases.len() as u64,
        wal_count,
        total_size_bytes: total,
        oldest_object_age_seconds: if oldest_ts == i64::MAX { 0 } else { now - oldest_ts },
        retention_days,
        retention_ok,
        generated_at: now,
    }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/kbve/axum-kbve && cargo test s3backup::summary 2>&1 | tail -20`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/axum-kbve/src/s3backup/
git commit -m "feat(axum): barman backup summary classifier"
```

### Task A2: S3 client + list walk

**Files:**
- Create: `apps/kbve/axum-kbve/src/s3backup/client.rs`
- Modify: `apps/kbve/axum-kbve/Cargo.toml` (add deps)
- Modify: `apps/kbve/axum-kbve/src/s3backup/mod.rs` (`pub mod client;`)

**Interfaces:**
- Consumes: `S3Object` from A1.
- Produces:
  - `struct S3Config { bucket: String, prefix: String, region: String }` with `S3Config::from_env()` (env `KILOBASE_S3_BUCKET` default `kilobase`, `KILOBASE_S3_PREFIX` default `barman/backup/`, `AWS_REGION` default `us-east-1`).
  - `async fn make_client(cfg: &S3Config) -> aws_sdk_s3::Client` (uses default cred chain = env `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`).
  - `async fn list_all(client: &Client, bucket: &str, prefix: &str) -> Result<Vec<S3Object>, String>` (paginates ListObjectsV2 to completion).
  - `async fn list_page(client: &Client, bucket: &str, prefix: &str, token: Option<String>, limit: i32) -> Result<(Vec<S3Object>, Option<String>), String>`.

- [ ] **Step 1: Add deps**

In `apps/kbve/axum-kbve/Cargo.toml` under `[dependencies]`:

```toml
aws-config = { version = "1", features = ["behavior-version-latest"] }
aws-sdk-s3 = "1"
```

- [ ] **Step 2: Implement client**

```rust
use crate::s3backup::summary::S3Object;
use aws_sdk_s3::Client;

pub struct S3Config {
    pub bucket: String,
    pub prefix: String,
    pub region: String,
}

impl S3Config {
    pub fn from_env() -> Self {
        Self {
            bucket: std::env::var("KILOBASE_S3_BUCKET").unwrap_or_else(|_| "kilobase".into()),
            prefix: std::env::var("KILOBASE_S3_PREFIX").unwrap_or_else(|_| "barman/backup/".into()),
            region: std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into()),
        }
    }
}

pub async fn make_client(cfg: &S3Config) -> Client {
    let region = aws_config::Region::new(cfg.region.clone());
    let conf = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region)
        .load()
        .await;
    Client::new(&conf)
}

fn to_obj(o: &aws_sdk_s3::types::Object) -> S3Object {
    S3Object {
        key: o.key().unwrap_or_default().to_string(),
        size: o.size().unwrap_or(0),
        last_modified: o
            .last_modified()
            .and_then(|t| t.to_millis().ok())
            .map(|ms| ms / 1000)
            .unwrap_or(0),
    }
}

pub async fn list_page(
    client: &Client,
    bucket: &str,
    prefix: &str,
    token: Option<String>,
    limit: i32,
) -> Result<(Vec<S3Object>, Option<String>), String> {
    let mut req = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(prefix)
        .max_keys(limit);
    if let Some(t) = token {
        req = req.continuation_token(t);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let objs = resp.contents().iter().map(to_obj).collect();
    let next = resp.next_continuation_token().map(|s| s.to_string());
    Ok((objs, next))
}

pub async fn list_all(client: &Client, bucket: &str, prefix: &str) -> Result<Vec<S3Object>, String> {
    let mut out = Vec::new();
    let mut token = None;
    loop {
        let (mut page, next) = list_page(client, bucket, prefix, token, 1000).await?;
        out.append(&mut page);
        match next {
            Some(t) => token = Some(t),
            None => break,
        }
    }
    Ok(out)
}
```

- [ ] **Step 3: Compile check**

Run: `cd apps/kbve/axum-kbve && cargo check 2>&1 | tail -20`
Expected: compiles (deps resolve).

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/axum-kbve/Cargo.toml apps/kbve/axum-kbve/src/s3backup/client.rs apps/kbve/axum-kbve/src/s3backup/mod.rs
git commit -m "feat(axum): kilobase S3 list client"
```

### Task A3: axum handlers + route wiring

**Files:**
- Create: `apps/kbve/axum-kbve/src/s3backup/routes.rs`
- Modify: `apps/kbve/axum-kbve/src/main.rs` (register `mod s3backup;` + merge router near other `/dashboard/*` inits, ~line 219)

**Interfaces:**
- Consumes: `summarize` (A1), `S3Config`/`make_client`/`list_all`/`list_page` (A2).
- Produces: `pub fn router() -> axum::Router` with:
  - `GET /dashboard/kilobase/s3/summary`
  - `GET /dashboard/kilobase/s3/objects`

- [ ] **Step 1: Implement handlers**

```rust
use crate::s3backup::client::{list_all, list_page, make_client, S3Config};
use crate::s3backup::summary::summarize;
use axum::{extract::Query, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::json;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

async fn summary_handler() -> impl IntoResponse {
    let cfg = S3Config::from_env();
    let client = make_client(&cfg).await;
    match list_all(&client, &cfg.bucket, &cfg.prefix).await {
        Ok(objs) => {
            let s = summarize(&objs, &cfg.prefix, now_secs(), 7);
            Json(json!(s)).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, Json(json!({"error": "s3_list_failed", "detail": e}))).into_response(),
    }
}

#[derive(Deserialize)]
struct ObjectsQuery {
    prefix: Option<String>,
    token: Option<String>,
    limit: Option<i32>,
}

async fn objects_handler(Query(q): Query<ObjectsQuery>) -> impl IntoResponse {
    let cfg = S3Config::from_env();
    let client = make_client(&cfg).await;
    let prefix = q.prefix.unwrap_or_default();
    let limit = q.limit.unwrap_or(1000).clamp(1, 1000);
    match list_page(&client, &cfg.bucket, &prefix, q.token, limit).await {
        Ok((objs, next)) => {
            let items: Vec<_> = objs
                .into_iter()
                .map(|o| json!({"key": o.key, "size": o.size, "last_modified": o.last_modified}))
                .collect();
            Json(json!({"objects": items, "next_token": next})).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, Json(json!({"error": "s3_list_failed", "detail": e}))).into_response(),
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/dashboard/kilobase/s3/summary", get(summary_handler))
        .route("/dashboard/kilobase/s3/objects", get(objects_handler))
}
```

- [ ] **Step 2: Wire into main.rs**

Add `mod s3backup;` with the other module declarations. Near the `/dashboard/*` init block (~line 219), merge the router onto the app the same way sibling dashboard routers are merged (follow the exact `.merge(...)`/`.nest(...)` pattern already used there — read lines 150-230 first and match it, including any auth layer the other `/dashboard` routes carry).

- [ ] **Step 3: Compile**

Run: `cd apps/kbve/axum-kbve && cargo check 2>&1 | tail -20`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/axum-kbve/src/s3backup/routes.rs apps/kbve/axum-kbve/src/main.rs
git commit -m "feat(axum): /dashboard/kilobase/s3 summary+objects routes"
```

### Task A4: version bump + docs

**Files:**
- Modify: `apps/kbve/astro-kbve/src/content/docs/project/api.mdx` (bump `version:` one patch; document the two endpoints)
- (CI regenerates `.github/ci-dispatch-manifest.json`; do not hand-edit `version.toml`.)

- [ ] **Step 1:** Bump the `version:` field in `api.mdx` by one patch and add a short section describing `/dashboard/kilobase/s3/summary` and `/objects`.
- [ ] **Step 2:** Regenerate manifest: `npx tsx apps/kbve/astro-kbve/scripts/gen-ci-manifest.mts` (from repo root; walks up to node_modules).
- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/project/api.mdx .github/ci-dispatch-manifest.json
git commit -m "chore(axum): bump version for kilobase S3 endpoints"
```

### Task A5: kbve-ns ExternalSecret for S3 creds

**Files:**
- Create: `apps/kube/kbve/manifest/kilobase-s3-externalsecret.yaml`
- Create/Modify: kilobase-side ESO RBAC allowing the `kbve-external-secrets` SA to read `kilobase-s3-secret` (mirror `apps/kube/agones/arpg/manifests/discord-eso-rbac.yaml`)
- Modify: axum-kbve deployment manifest — add `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env from the new secret.

**Interfaces:**
- Produces: `kbve`-ns secret (e.g. `kilobase-s3`) with keys `AWS_ACCESS_KEY_ID` (from `keyId`) and `AWS_SECRET_ACCESS_KEY` (from `accessKey`).

- [ ] **Step 1: SecretStore + ExternalSecret** (mirror `arpg-discord-externalsecret.yaml`): `remoteNamespace: kilobase`, read `kilobase-s3-secret` keys `keyId`→`AWS_ACCESS_KEY_ID`, `accessKey`→`AWS_SECRET_ACCESS_KEY`, target secret `kilobase-s3`.
- [ ] **Step 2: RBAC** in kilobase ns: Role `get/list` on secret `kilobase-s3-secret`, RoleBinding to `kbve-external-secrets` SA (ns kbve). Mirror the arpg discord-eso-rbac.yaml file.
- [ ] **Step 3:** Add env to axum deployment from secret `kilobase-s3`.
- [ ] **Step 4: Validate**: `kubectl kustomize apps/kube/kbve/manifest/ >/dev/null` (or the relevant dir) builds.
- [ ] **Step 5: Commit**

```bash
git add apps/kube/kbve/manifest/kilobase-s3-externalsecret.yaml apps/kube/agones/arpg/manifests/ apps/kube/kbve/manifest/*deployment*
git commit -m "feat(kbve): kilobase S3 read creds via ExternalSecret"
```

**PR 1 boundary:** Tasks A1–A5 → one PR to `dev`.

---

## Component B — rn-dash panel

### Task B1: adapter (TDD)

**Files:**
- Create: `packages/npm/rn/src/dash/adapters/kilobaseBackup.ts`
- Test: `packages/npm/rn/src/dash/adapters/__tests__/kilobaseBackup.test.ts`

**Interfaces:**
- Produces: `type BackupSummary` (mirrors the contract), `type S3ObjectRow`, `fetchSummary(baseUrl, auth): Promise<BackupSummary>`, `fetchObjects(baseUrl, auth, {prefix?, token?}): Promise<{objects: S3ObjectRow[], nextToken: string|null}>`, and a pure `retentionBadge(s: BackupSummary): 'ok'|'warn'`.

- [ ] **Step 1: Failing test** (mirror `adapters/__tests__/clickhouse.test.ts` structure): assert `retentionBadge` returns `'warn'` when `retention_ok` false / `latest_base_backup` null, `'ok'` otherwise; assert `fetchObjects` maps `next_token`→`nextToken`. Use a stubbed fetch.
- [ ] **Step 2:** Run `npx nx test rn --testFile kilobaseBackup` → FAIL.
- [ ] **Step 3:** Implement adapter (typed fetch + `retentionBadge`).
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5: Commit** `feat(rn): kilobase backup dash adapter`.

### Task B2: panel

**Files:**
- Create: `packages/npm/rn/src/dash/S3BackupPanel.tsx`
- Modify: the dash screen registry/index that lists panels (follow how `ClusterChartsPanel`/`NamespacePanel` are registered).

- [ ] **Step 1:** Build panel using existing `StatGrid` for summary cards (latest-backup age, base/WAL counts, total size, retention badge) + a paginated object table (prefix filter, `nextToken`).
- [ ] **Step 2:** Register the panel in the dash index.
- [ ] **Step 3:** `npx nx build rn` (or typecheck) → passes.
- [ ] **Step 4: Commit** `feat(rn): S3 backup panel`.

**PR 2 boundary:** B1–B2 → one PR to `dev` (after A deployed).

---

## Component C — Windmill script

### Task C1: summary function (TDD, mirrors A1 contract)

**Files:**
- Create: `apps/windmill/f/kilobase/s3_summary.ts` (pure `summarize(objects, now, retentionDays)` → same contract)
- Test: `apps/windmill/f/kilobase/s3_summary.test.ts`

- [ ] **Step 1:** Port the A1 test cases to TS (base/WAL classification, retention, empty).
- [ ] **Step 2:** Run `bun test apps/windmill/f/kilobase/s3_summary.test.ts` → FAIL.
- [ ] **Step 3:** Implement `summarize` (same logic as A1).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(windmill): kilobase S3 summary fn`.

### Task C2: Windmill script + metadata

**Files:**
- Create: `apps/windmill/f/kilobase/s3_backup_list.ts` (main; takes an S3 resource arg, lists bucket via `@aws-sdk/client-s3`, returns `{summary, objects}`)
- Create: `apps/windmill/f/kilobase/s3_backup_list.script.yaml` (Windmill metadata; `summary`, `schema` for the S3 resource + optional prefix)

- [ ] **Step 1:** Implement main calling `s3_summary.ts` + a paginated ListObjectsV2 walk.
- [ ] **Step 2:** Add the `.script.yaml` metadata (synced via `f/**`).
- [ ] **Step 3:** `bun check` / lint clean.
- [ ] **Step 4: Commit** `feat(windmill): S3 backup list script`.

**Manual (post-merge, not code):** create the Windmill S3 resource holding the kilobase creds/region in the Windmill UI (creds from ESO backend; never committed).

**PR 3 boundary:** C1–C2 → one PR to `dev` (independent of A/B).

---

## Self-Review Notes

- **Spec coverage:** whole-bucket listing (A3 objects, C2, B2 table) ✓; barman summary (A1, C1, A3 summary) ✓; isolation (A→S3, C→S3, B→A) ✓; cross-ns creds (A5) ✓; region env (A2) ✓; shared contract duplicated (A1/C1) ✓; rn-dash native+web (B2) ✓.
- **Contract consistency:** `BackupSummary` fields identical in A1 (Rust) and C1 (TS); adapter B1 mirrors them.
- **No hardcoded region/bucket:** all env with defaults (A2).
- **Open manual step flagged:** Windmill S3 resource creation is UI/creds, not code.
