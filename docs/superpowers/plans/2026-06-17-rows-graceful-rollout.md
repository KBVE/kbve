# ROWS Graceful Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `rows` pod boot without eagerly opening DB connections and never crash on a saturated DB, drain gracefully through a transport-agnostic player-notify seam, so a `maxUnavailable=0` rolling update can never deadlock.

**Architecture:** Replace the eager `db::connect().await?` with a lazy, non-fatal pool (`connect_lazy_with`, `min_connections=0`). Add a `draining` flag that flips `/ready` to 503 before shutdown, a `ShutdownNotifier` trait seam (logging no-op today), and an ordered SIGTERM drain sequence that notifies, waits a grace period, drains in-flight HTTP, then closes pools to release connections promptly. Keep the deployment on `RollingUpdate maxUnavailable=0` and add `terminationGracePeriodSeconds`.

**Tech Stack:** Rust, tokio, axum 0.8, sqlx 0.8 (Postgres), dashmap, tracing; Kubernetes (kustomize), Argo CD.

## Global Constraints

- Branch/worktree: `trunk/rows-graceful-rollout-06-17-2026` at `../kbve-rows-graceful-rollout` (already created from `origin/dev`). All work here.
- Crate path on `dev`: `apps/rows` (NOT `apps/ows/rows`).
- Conventional commits; **no co-authoring lines**. PRs target `dev`, never `main`.
- **Do NOT edit `apps/rows/version.toml`** — the release/publish CI bumps it post-merge (it went 0.1.23→0.1.26 automatically). Manual bumps conflict.
- Argo-tracked deploy file is `apps/kube/rows/tenants/base/deployment.yaml` (the `apps/kube/rows/manifest/*` file is deployed by nothing — see #12668).
- Build/test from the worktree root with `cargo` (rows is a **binary** crate: use `cargo test -p rows --bins`, NOT `--lib`).
- sqlx pool is `Arc`-internal and `Send+Sync`; share by clone, never wrap in a `Mutex`.

---

### Task 1: Lazy, non-fatal DB pool

**Files:**
- Modify: `apps/rows/src/db.rs`
- Test: `apps/rows/src/db.rs` (inline `#[cfg(test)]`)

**Interfaces:**
- Produces: `pub fn connect_lazy(database_url: &str) -> anyhow::Result<DbPool>` (no `async`, never dials at construction; `Err` only on a malformed URL). Private `fn build_opts(database_url: &str) -> anyhow::Result<PgConnectOptions>`.
- Removes: the old `pub async fn connect(...)`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/rows/src/db.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connect_lazy_does_not_dial_at_construction() {
        // Unreachable host: a lazy pool must still build without error,
        // because no connection is opened until first acquire.
        let pool = connect_lazy("postgres://u:p@10.255.255.1:5432/none");
        assert!(pool.is_ok(), "lazy pool construction must not fail on an unreachable host");
    }

    #[test]
    fn build_opts_rejects_garbage() {
        assert!(build_opts("not-a-valid-url").is_err());
    }

    #[test]
    fn build_opts_accepts_postgres_url() {
        assert!(build_opts("postgres://u:p@db:5432/app").is_ok());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p rows --bins db:: 2>&1 | tail -20`
Expected: FAIL — `cannot find function 'connect_lazy'` / `build_opts` not found.

- [ ] **Step 3: Refactor `connect` into `build_opts` + `connect_lazy`**

In `apps/rows/src/db.rs`, replace the entire `pub async fn connect(...) -> anyhow::Result<DbPool> { ... }` block with:

```rust
/// Build connection options from either a `postgres://` URL or an Npgsql/ADO.NET string.
/// Parsing only — no network I/O. `Err` means the URL itself is malformed.
fn build_opts(database_url: &str) -> anyhow::Result<PgConnectOptions> {
    let opts =
        if database_url.starts_with("postgres://") || database_url.starts_with("postgresql://") {
            info!("Parsing DATABASE_URL as postgres:// URL");
            PgConnectOptions::from_str(database_url)?
        } else if database_url.contains('=') && database_url.contains(';') {
            info!("Parsing DATABASE_URL as Npgsql/ADO.NET connection string");
            parse_npgsql(database_url)?
        } else {
            anyhow::bail!(
                "DATABASE_URL must be a postgres:// URL or Npgsql connection string. Got: {}...",
                &database_url[..database_url.len().min(40)]
            );
        };

    info!("Database search_path set to: ows,extensions,public");
    Ok(opts.options([("search_path", "ows,extensions,public")]))
}

/// Build a **lazy** pool: connections open on first use, never at construction, so a saturated
/// or unreachable DB cannot crash startup. `min_connections(0)` means no eager/idle connections.
pub fn connect_lazy(database_url: &str) -> anyhow::Result<DbPool> {
    let opts = build_opts(database_url)?;

    let max_conns: u32 = std::env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(50);

    let pool = PgPoolOptions::new()
        .max_connections(max_conns)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(300))
        .connect_lazy_with(opts);
    Ok(pool)
}
```

(Leave `parse_npgsql` unchanged below it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p rows --bins db:: 2>&1 | tail -20`
Expected: PASS (3 tests). The crate will not fully build yet because `main.rs` still calls `db::connect` — that is fixed in Task 5. To check just this module compiles in the test harness, the test run above is sufficient once Task 5 lands; if it errors on the `main.rs` call site, proceed to Task 5 and re-run. **Do not commit until the crate builds (end of Task 5).**

---

### Task 2: Player-notify seam (`drain` module)

**Files:**
- Create: `apps/rows/src/drain.rs`
- Test: `apps/rows/src/drain.rs` (inline `#[cfg(test)]`)

**Interfaces:**
- Produces: `ShutdownReason` (`Rollout`|`Shutdown`, `.as_str()`), `ShutdownNotice { reason, message, grace_secs }`, `trait ShutdownNotifier: Send + Sync { fn notify_players_shutdown(&self, &ShutdownNotice); }`, `struct LoggingNotifier`, `fn default_notifier() -> Arc<dyn ShutdownNotifier>`, and dead-coded `PlayerRegistry<C>` + `type PlayerId`.

- [ ] **Step 1: Write the failing tests**

Create `apps/rows/src/drain.rs` with ONLY the test module first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logging_notifier_is_callable_and_infallible() {
        let n = LoggingNotifier;
        n.notify_players_shutdown(&ShutdownNotice {
            reason: ShutdownReason::Rollout,
            message: "server restarting".into(),
            grace_secs: 8,
        });
    }

    #[test]
    fn reason_as_str_is_stable() {
        assert_eq!(ShutdownReason::Rollout.as_str(), "rollout");
        assert_eq!(ShutdownReason::Shutdown.as_str(), "shutdown");
    }

    #[test]
    fn default_notifier_returns_usable_seam() {
        let n = default_notifier();
        n.notify_players_shutdown(&ShutdownNotice {
            reason: ShutdownReason::Shutdown,
            message: "bye".into(),
            grace_secs: 0,
        });
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p rows --bins drain:: 2>&1 | tail -20`
Expected: FAIL — `ShutdownReason`, `ShutdownNotice`, etc. not found (and `drain` not yet a module; it is added to `main.rs` in Task 3 — until then this fails to compile, which counts as failing).

- [ ] **Step 3: Implement the seam**

Prepend to `apps/rows/src/drain.rs` (above the test module):

```rust
//! Transport-agnostic shutdown/player-notification seam.
//!
//! Today `LoggingNotifier` just logs. The `PlayerRegistry<C>` scaffold below is the future
//! per-player connection map (DashMap + mpsc fan-out), generic over the connection/IO handle
//! `C` so WS sockets, Agones channels, or MQ senders all slot in behind one type — wired later
//! without touching the drain sequence.

use std::sync::Arc;
use tracing::warn;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShutdownReason {
    Rollout,
    Shutdown,
}

impl ShutdownReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            ShutdownReason::Rollout => "rollout",
            ShutdownReason::Shutdown => "shutdown",
        }
    }
}

/// Stable message envelope. `message` is human-facing text, filled in by a real notifier later.
#[derive(Debug, Clone)]
pub struct ShutdownNotice {
    pub reason: ShutdownReason,
    pub message: String,
    pub grace_secs: u64,
}

/// The seam. A real implementation fans the notice out to connected players best-effort and
/// must never block shutdown.
pub trait ShutdownNotifier: Send + Sync {
    fn notify_players_shutdown(&self, notice: &ShutdownNotice);
}

/// The only implementation today: log the notice. No-op for players.
pub struct LoggingNotifier;

impl ShutdownNotifier for LoggingNotifier {
    fn notify_players_shutdown(&self, notice: &ShutdownNotice) {
        warn!(
            reason = notice.reason.as_str(),
            grace_secs = notice.grace_secs,
            message = %notice.message,
            "Notifying players of impending shutdown (stub)"
        );
    }
}

pub fn default_notifier() -> Arc<dyn ShutdownNotifier> {
    Arc::new(LoggingNotifier)
}

// ---------------------------------------------------------------------------
// FUTURE: per-player connection registry + mpsc fan-out. Compiled but unused.
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub type PlayerId = uuid::Uuid;

/// Future registry of live player connections, generic over the connection handle `C`.
#[allow(dead_code)]
pub struct PlayerRegistry<C> {
    conns: dashmap::DashMap<PlayerId, C>,
}

#[allow(dead_code)]
impl<C> PlayerRegistry<C> {
    #[allow(clippy::new_without_default)] // dead-coded scaffold; Default deferred with the impl
    pub fn new() -> Self {
        Self { conns: dashmap::DashMap::new() }
    }
    pub fn insert(&self, id: PlayerId, conn: C) {
        self.conns.insert(id, conn);
    }
    pub fn remove(&self, id: &PlayerId) -> Option<(PlayerId, C)> {
        self.conns.remove(id)
    }
    pub fn len(&self) -> usize {
        self.conns.len()
    }
    pub fn is_empty(&self) -> bool {
        self.conns.is_empty()
    }
}
```

- [ ] **Step 4: Verify (deferred to Task 3)**

The module is not yet registered in `main.rs`, so it cannot compile alone. Task 3 adds `mod drain;`. Re-run `cargo test -p rows --bins drain::` at the end of Task 3. **Do not commit yet.**

---

### Task 3: Wire `draining`, `db_ro`, and `notifier` into `AppState`

**Files:**
- Modify: `apps/rows/src/state.rs`
- Modify: `apps/rows/src/main.rs` (add `mod drain;` only)

**Interfaces:**
- Consumes: `crate::drain::{ShutdownNotifier, default_notifier}` (Task 2), `DbPool` (Task 1).
- Produces: `AppState.db_ro: DbPool`, `AppState.draining: AtomicBool`, `AppState.notifier: Arc<dyn ShutdownNotifier>`; builder methods `.db_ro(DbPool)` and `.notifier(Arc<dyn ShutdownNotifier>)`.

- [ ] **Step 1: Register the module**

In `apps/rows/src/main.rs`, add `mod drain;` to the module list near the top (alphabetical, after `mod db;`):

```rust
mod db;
mod drain;
mod error;
```

- [ ] **Step 2: Add imports to `state.rs`**

At the top of `apps/rows/src/state.rs`, add:

```rust
use crate::drain::{ShutdownNotifier, default_notifier};
use std::sync::atomic::AtomicBool;
```

- [ ] **Step 3: Add fields to `AppState`**

In the `pub struct AppState { ... }` block, add these fields (after `pub db: DbPool,`):

```rust
    /// Read-only pool seam. Defaults to a clone of `db` unless `DATABASE_URL_RO` is set.
    /// Nothing routes to it yet — future read/write split (cnpg -ro).
    pub db_ro: DbPool,
    /// Flipped true on SIGTERM so `/ready` reports NotReady before shutdown.
    pub draining: AtomicBool,
    /// Transport-agnostic player-notify seam (logging no-op today).
    pub notifier: Arc<dyn ShutdownNotifier>,
```

- [ ] **Step 4: Add builder fields + methods**

In `pub struct AppStateBuilder { ... }`, add:

```rust
    db_ro: Option<DbPool>,
    notifier: Option<Arc<dyn ShutdownNotifier>>,
```

In `impl AppStateBuilder`, add two methods (next to the existing `db` method):

```rust
    pub fn db_ro(mut self, pool: DbPool) -> Self {
        self.db_ro = Some(pool);
        self
    }

    pub fn notifier(mut self, notifier: Arc<dyn ShutdownNotifier>) -> Self {
        self.notifier = Some(notifier);
        self
    }
```

- [ ] **Step 5: Populate fields in `build()`**

In `build()`, replace the `Ok(Arc::new(AppState { db: self.db.ok_or_else(...)?, ... }))` construction so `db` is bound first and the new fields are set. Change the start of the struct literal from:

```rust
        Ok(Arc::new(AppState {
            db: self.db.ok_or_else(|| anyhow::anyhow!("db pool required"))?,
            sessions: DashMap::new(),
```

to:

```rust
        let db = self.db.ok_or_else(|| anyhow::anyhow!("db pool required"))?;
        Ok(Arc::new(AppState {
            db_ro: self.db_ro.unwrap_or_else(|| db.clone()),
            draining: AtomicBool::new(false),
            notifier: self.notifier.unwrap_or_else(default_notifier),
            db,
            sessions: DashMap::new(),
```

(The rest of the struct literal — `zone_servers`, `config`, etc. — is unchanged.)

- [ ] **Step 6: Verify Tasks 1–3 compile and their tests pass**

The crate still will not build because `main.rs` calls `db::connect` (Task 5). That is expected. Confirm the new modules at least typecheck by running the targeted tests after Task 5. For now run:

Run: `cargo build -p rows 2>&1 | tail -20`
Expected: the ONLY remaining error is in `main.rs` about `db::connect` — proceed to Task 5.

---

### Task 4: Drain gate on `/ready`

**Files:**
- Modify: `apps/rows/src/rest/mod.rs`
- Test: `apps/rows/src/rest/mod.rs` (inline `#[cfg(test)]`)

**Interfaces:**
- Consumes: `AppState.draining` (Task 3).
- Produces: `fn drain_gate(draining: &AtomicBool) -> Option<Response>`; `readiness` returns 503 early when draining.

- [ ] **Step 1: Write the failing tests**

Append to `apps/rows/src/rest/mod.rs`:

```rust
#[cfg(test)]
mod drain_tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn drain_gate_blocks_when_draining() {
        let draining = AtomicBool::new(true);
        let resp = drain_gate(&draining);
        assert!(resp.is_some());
        assert_eq!(resp.unwrap().status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn drain_gate_passes_when_not_draining() {
        let draining = AtomicBool::new(false);
        assert!(drain_gate(&draining).is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p rows --bins drain_gate 2>&1 | tail -20`
Expected: FAIL — `cannot find function 'drain_gate'`.

- [ ] **Step 3: Implement `drain_gate` and call it from `readiness`**

In `apps/rows/src/rest/mod.rs`, add the helper (place it directly above the `async fn readiness` definition):

```rust
/// When the pod is draining, report NotReady immediately so the Service deregisters it
/// before shutdown — no new traffic to a dying pod. Returns `None` when not draining.
fn drain_gate(draining: &std::sync::atomic::AtomicBool) -> Option<Response> {
    if draining.load(std::sync::atomic::Ordering::SeqCst) {
        let body = serde_json::json!({ "status": "draining", "service": "rows" });
        Some((StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response())
    } else {
        None
    }
}
```

Then, as the FIRST lines inside `async fn readiness(State(hs): State<HandlerState>) -> axum::response::Response {`, add:

```rust
    if let Some(resp) = drain_gate(&hs.app.draining) {
        return resp;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p rows --bins drain_gate 2>&1 | tail -20`
Expected: PASS (2 tests). (Full crate build still pending Task 5.)

---

### Task 5: Lazy pool wiring + ordered drain sequence in `main.rs`

**Files:**
- Modify: `apps/rows/src/main.rs`

**Interfaces:**
- Consumes: `db::connect_lazy` (Task 1), `AppState.{db,db_ro,draining,notifier}` + builder `.db_ro` (Task 3), `drain::{ShutdownNotice, ShutdownReason}` (Task 2).

- [ ] **Step 1: Replace eager connect with lazy + RO seam**

In `apps/rows/src/main.rs`, replace:

```rust
    let pool = db::connect(&cfg.database_url).await?;
    info!("Database connected");
```

with:

```rust
    let pool = db::connect_lazy(&cfg.database_url)?;
    info!("Database pool initialized (lazy; connections open on first use)");

    let pool_ro = match std::env::var("DATABASE_URL_RO").ok().filter(|s| !s.is_empty()) {
        Some(ro_url) => {
            info!("Read-only DB pool configured from DATABASE_URL_RO");
            db::connect_lazy(&ro_url)?
        }
        None => pool.clone(),
    };
```

- [ ] **Step 2: Pass the RO pool to the builder**

Find `.db(pool)` in the `AppState::builder()` chain and change it to:

```rust
        .db(pool)
        .db_ro(pool_ro)
```

- [ ] **Step 3: Capture an Arc handle for shutdown before the router moves `app_state`**

Immediately BEFORE the line `let rest_router = rest::router(app_state, svc.clone());`, add:

```rust
    let drain_grace_secs: u64 = std::env::var("ROWS_DRAIN_GRACE_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8);
    let shutdown_state = app_state.clone();
```

- [ ] **Step 4: Thread the drain into graceful shutdown + close pools after**

Replace:

```rust
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("ROWS shutdown complete");
    Ok(())
```

with:

```rust
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_state.clone(), drain_grace_secs))
        .await?;

    // In-flight requests have drained; release DB connections promptly so the incoming pod
    // gets its connection headroom without waiting for TCP/idle timeouts.
    shutdown_state.db.close().await;
    shutdown_state.db_ro.close().await;
    info!("ROWS shutdown complete");
    Ok(())
```

- [ ] **Step 5: Rewrite `shutdown_signal` to run the ordered drain**

Replace the whole `async fn shutdown_signal() { ... }` with:

```rust
async fn shutdown_signal(state: std::sync::Arc<state::AppState>, grace_secs: u64) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("Received Ctrl+C, shutting down..."),
        _ = terminate => info!("Received SIGTERM, shutting down..."),
    }

    // 1. Flip readiness to NotReady so k8s deregisters this pod from the Service endpoints.
    state
        .draining
        .store(true, std::sync::atomic::Ordering::SeqCst);
    info!("Draining: /ready now reports NotReady");

    // 2. Fire the (stub) player notification.
    state.notifier.notify_players_shutdown(&drain::ShutdownNotice {
        reason: drain::ShutdownReason::Rollout,
        message: "ROWS is restarting for an update.".into(),
        grace_secs,
    });

    // 3. Wait out the grace period so endpoint removal propagates and in-flight work settles.
    info!(grace_secs, "Draining: waiting grace period before graceful shutdown");
    tokio::time::sleep(std::time::Duration::from_secs(grace_secs)).await;
}
```

- [ ] **Step 6: Build the whole crate and run all new tests**

Run: `cargo build -p rows 2>&1 | tail -20`
Expected: `0 errors`.

Run: `cargo test -p rows --bins 2>&1 | tail -25`
Expected: all tests PASS, including `db::`, `drain::`, `drain_gate`, and the existing `supabase` tests.

- [ ] **Step 7: Commit Tasks 1–5**

```bash
git add apps/rows/src/db.rs apps/rows/src/drain.rs apps/rows/src/state.rs apps/rows/src/rest/mod.rs apps/rows/src/main.rs
git commit -m "feat(rows): lazy non-fatal DB pool + graceful drain with player-notify stub"
```

---

### Task 6: Deployment manifest — termination grace

**Files:**
- Modify: `apps/kube/rows/tenants/base/deployment.yaml`

**Interfaces:**
- Consumes: `ROWS_DRAIN_GRACE_SECS` default 8 (Task 5). Grace period must exceed it plus in-flight drain + pool close.

- [ ] **Step 1: Add `terminationGracePeriodSeconds`**

In `apps/kube/rows/tenants/base/deployment.yaml`, under `spec.template.spec`, add `terminationGracePeriodSeconds: 30` as a sibling of `serviceAccountName`. Change:

```yaml
        spec:
            serviceAccountName: rows-instancelauncher
            containers:
```

to:

```yaml
        spec:
            serviceAccountName: rows-instancelauncher
            terminationGracePeriodSeconds: 30
            containers:
```

Leave `strategy` (`RollingUpdate`, `maxSurge: 1`, `maxUnavailable: 0`), the probes, the PDB, and the image line unchanged. (The image tag is bumped by the release/publish flow post-merge — do not bump it here, and do not touch `version.toml`.)

- [ ] **Step 2: Verify the overlay still renders**

Run: `kubectl kustomize apps/kube/rows/tenants/overlays/chuckrpg-dev 2>&1 | grep -E "terminationGracePeriodSeconds|strategy|maxUnavailable" | head`
Expected: shows `terminationGracePeriodSeconds: 30` and the unchanged strategy. If `kubectl kustomize` is unavailable, run `python3 -c "import yaml,sys; list(yaml.safe_load_all(open('apps/kube/rows/tenants/base/deployment.yaml')))" && echo OK` to confirm valid YAML.

- [ ] **Step 3: Commit**

```bash
git add apps/kube/rows/tenants/base/deployment.yaml
git commit -m "chore(rows): add terminationGracePeriodSeconds for graceful drain"
```

---

### Task 7: Open PR to `dev`

- [ ] **Step 1: Push and PR**

```bash
git push -u origin trunk/rows-graceful-rollout-06-17-2026
gh pr create --base dev \
  --title "feat(rows): graceful rollout — lazy DB pool + drain + player-notify stub" \
  --body "Closes #12668. Lazy non-fatal DB pool (no eager connections, boot never crashes on a saturated DB), drain flag on /ready, ordered SIGTERM drain with a transport-agnostic ShutdownNotifier stub, and terminationGracePeriodSeconds. Keeps RollingUpdate maxUnavailable=0 so a failed deploy never drops the old pod. Spec: docs/superpowers/specs/2026-06-17-rows-graceful-rollout-design.md"
```

- [ ] **Step 2: Confirm CI is green** (lint + test on the PR). Address any failures before requesting review.

---

## Post-merge verification (not a code task)

After the release flow builds the new image and bumps the tenant base, confirm in `rows-chuckrpg-dev`:
- new pod boots immediately, flips `Ready` on first DB connection, `0` restarts;
- old pod logs the drain line (`Notifying players of impending shutdown (stub)`) and exits cleanly;
- rollout completes with no CrashLoop — the #12668 deadlock is gone.
