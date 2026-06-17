# ROWS graceful rollout + lazy DB pool + player-notify stub

**Date:** 2026-06-17
**Status:** Design (approved direction, pending written-spec review)
**Scope:** `apps/rows` (Rust service) + `apps/kube/rows/tenants/base/deployment.yaml` (shared tenant base)
**Related:** #12660 (JWT panic, fixed in `rows:0.1.26`), #12668 (rollout deadlock — this design closes it)

## Problem

Rolling out `rows:0.1.26` to `rows-chuckrpg-dev` deadlocked. Root cause, confirmed in
code:

- `db.rs` builds the pool with `min_connections(5)` and an **eager** `.connect_with().await?`.
  At boot, sqlx tries to open 5 connections immediately; if it can't within the 5s
  `acquire_timeout`, `main` returns `Err` → process **exits 1 → CrashLoopBackOff**.
- The Deployment uses `RollingUpdate` with `maxUnavailable=0` / `maxSurge=1`. During the
  rollout the old pod holds its DB connections, the cnpg/pooler connection budget is
  saturated, and the new pod cannot open its 5 connections → it crashes instead of waiting.
- Because `maxUnavailable=0` keeps the old pod until the new one is `Ready`, and the new one
  can never become `Ready` (it keeps crashing), the rollout is wedged indefinitely.

The strategy is **not** the bug. `maxUnavailable=0` is exactly the safety we want — the old
pod must keep serving until the new one proves itself, so a failed deploy never causes an
outage. The bug is that the new pod **crashes** instead of sitting politely `NotReady`.

## Goals

1. A new pod that cannot yet reach the DB stays `NotReady` and retries — it never crashes the
   process. A failed/stalled deploy leaves the old pod serving indefinitely (no outage).
2. No eager / "useless" pool connections at boot. The new pod needs only **one** connection to
   pass `/ready` and flip traffic.
3. Clean shutdown of the departing pod: stop taking new traffic, fire a (stub) player
   notification, drain in-flight work, and **promptly release DB connections** so the incoming
   pod has headroom.
4. Lay foundational, transport-agnostic "pipes" for a future player-notification system and a
   future read/write DB split — stubbed now, decoupled later, without redesign.

## Non-goals (YAGNI — explicitly deferred)

- Real player messaging (WS/Agones/MQ fan-out) and the `DashMap<PlayerId, Conn>` + mpsc
  connection registry. We add the **seam** and dead-coded scaffold only.
- Actual read/write query routing to cnpg `-ro`. We add an optional second lazy pool that
  **defaults to the primary** and is not yet routed.
- Multi-replica / zero-downtime-during-deploy for any tenant. The shared base stays
  single-replica; a future overlay can patch `replicas`/strategy per tenant.

## Design

### 1. Lazy, non-fatal DB pool — `apps/rows/src/db.rs`

- Switch from eager `connect_with().await?` to **`connect_lazy_with(opts)`**, which returns a
  `PgPool` synchronously and never fails at construction. Connections are opened on first
  `acquire`.
- `min_connections(0)` (was 5), keep `max_connections = DB_MAX_CONNECTIONS` (10). The pool is
  elastic: 0 at boot, grows on demand to max under load, reaps back toward 0 after
  `idle_timeout`. No fixed/static connection set.
- `sqlx::PgPool` is already `Arc<PoolInner>` internally — `Clone`, `Send + Sync`, async-aware.
  It is shared by value/clone through the existing `Arc<AppState>` + axum `State`. **No external
  `Mutex`** (a mutex would serialize all DB access).
- **Read-only seam (stubbed), additive to minimize churn:** keep `AppState.db: PgPool` as the
  primary (read-write) pool so **every existing `&hs.app.db` call site is unchanged**, and add
  a sibling `AppState.db_ro: PgPool` for the seam. `db_ro` is built from `DATABASE_URL_RO` if
  present, else it is a clone of `db`. Nothing routes to `db_ro` yet. This lets a later change
  point reads at cnpg `-ro` without reshaping call sites now. Endpoint-agnostic: works whether
  `DATABASE_URL` is direct-to-`-rw` or via a pooler. `db.rs` exposes a single
  `connect_lazy(url) -> PgPool` helper used for both.

### 2. Drain state + readiness gate — `apps/rows/src/state.rs`, `apps/rows/src/rest/mod.rs`

- Add `draining: AtomicBool` to `AppState` (default `false`). It is already shared via the
  existing `Arc<AppState>`, so no inner `Arc` is needed; the shutdown handler reads/writes it
  through its `Arc<AppState>` clone.
- `/ready` returns `503` **immediately** when `draining == true`, before touching the DB. This
  removes the pod from the Service endpoints as soon as it begins shutting down, so no new
  traffic is routed to a dying pod. When not draining, behavior is unchanged (`SELECT 1` gate —
  this is what makes the new lazy pod flip `Ready` once it gets its first connection).
- `/health` (liveness) stays a static `200` — we are not unhealthy while draining, just leaving.

### 3. Player-notify stub — new `apps/rows/src/drain.rs`

Transport-agnostic seam, generic over a future connection type, no-op/logging today:

```rust
pub enum ShutdownReason { Rollout, Shutdown }

pub struct ShutdownNotice {           // the message envelope, stable now
    pub reason: ShutdownReason,
    pub message: String,              // human-facing text, filled in later
    pub grace_secs: u64,
}

pub trait ShutdownNotifier: Send + Sync {
    fn notify_players_shutdown(&self, notice: &ShutdownNotice);
}

pub struct LoggingNotifier;           // logs the notice; the only impl today
impl ShutdownNotifier for LoggingNotifier { /* tracing::warn! the envelope */ }
```

Dead-coded foundational scaffold for the future registry (compiled, `#[allow(dead_code)]`,
clearly marked future work), capturing my friend's suggested shape so the pipes are laid:

```rust
// FUTURE: per-player connection registry + mpsc fan-out. Generic over the connection/IO
// handle `C` so WS sockets, Agones channels, or MQ senders all slot in behind one type.
#[allow(dead_code)]
pub struct PlayerRegistry<C> {
    conns: dashmap::DashMap<PlayerId, C>,   // DashMap<&[player], &[conn]> in spirit
}
```

`AppState` holds `notifier: Arc<dyn ShutdownNotifier>` (trait object = clean seam; swapping in
a real notifier later is a one-line wiring change). Built as `Arc::new(LoggingNotifier)` today.

### 4. Graceful drain sequence — `apps/rows/src/main.rs`

On `SIGTERM` / `Ctrl-C`, before/around the existing axum graceful shutdown:

1. `draining.store(true)` → `/ready` starts returning `503`; k8s removes the pod from Service
   endpoints.
2. `notifier.notify_players_shutdown(&ShutdownNotice { reason: Rollout, .. })` — the stub.
3. Sleep `ROWS_DRAIN_GRACE_SECS` (default `8`) so endpoint removal propagates and in-flight
   requests finish.
4. `axum::serve(...).with_graceful_shutdown(...)` completes (stops accepting, drains in-flight).
5. `db.rw.close().await` (and `db.ro` if distinct) to **promptly release DB connections**, so
   the incoming pod gets its connection headroom without waiting for TCP/idle timeouts.

### 5. Deployment manifest — `apps/kube/rows/tenants/base/deployment.yaml`

- **Keep** `strategy: RollingUpdate`, `maxSurge: 1`, `maxUnavailable: 0` (the belt-and-suspenders
  safety: old stays until new is `Ready`).
- Add `terminationGracePeriodSeconds: 30` (must exceed `ROWS_DRAIN_GRACE_SECS` + in-flight
  drain + pool close).
- Keep `livenessProbe` `/health`, `readinessProbe` `/ready`, `imagePullPolicy: Always`,
  `PodDisruptionBudget minAvailable: 1`.
- Image bumped via the normal release flow (the tenant **base** is the Argo-tracked file —
  see #12668 follow-up; the manifest under `apps/kube/rows/manifest/` is deployed by nothing).
- Door left open for per-tenant zero-downtime later: an overlay may patch `replicas` /
  strategy for a specific high-traffic tenant without changing the safe default.

## Component boundaries

| Unit | Purpose | Depends on |
|------|---------|-----------|
| `db::connect_lazy` + `AppState.{db,db_ro}` | rw pool (+ stubbed ro sibling); never block/crash boot | sqlx |
| `AppState.draining` | One source of truth for "am I leaving" | atomics |
| `/ready` | Gate traffic on drain flag, then DB reachability | `AppState` |
| `drain::ShutdownNotifier` | Transport-agnostic player-notify seam | — (trait) |
| `main::shutdown_signal` | Order the drain steps deterministically | all above |

## Error handling

- Pool construction cannot fail (lazy) → boot is decoupled from DB availability.
- DB unreachable at runtime → `/ready` 503 (pod `NotReady`, kept out of rotation, old pod
  retained); individual requests return their existing error types. No process exit.
- Notifier is infallible (logs); a future real notifier must swallow/iterate-best-effort so a
  notify failure never blocks shutdown.
- Drain sleep + `terminationGracePeriodSeconds` are bounded; if the app overruns the grace
  period k8s `SIGKILL`s as a backstop.

## Testing

- `db`: `connect_lazy` builds a pool against an unreachable URL **without error** (proves boot
  is non-fatal). `db_ro` defaults to a clone of `db` when `DATABASE_URL_RO` is unset.
- `drain`: `ShutdownNotice` envelope + `LoggingNotifier::notify_players_shutdown` is callable
  and infallible; `ShutdownReason` round-trips.
- `readiness`: with `draining=true` the handler returns `503` without hitting the DB; with
  `draining=false` behavior is unchanged. (Handler-level unit test with a minimal state.)
- Manifest: `kustomize build` of the chuckrpg-dev overlay still renders; strategy unchanged,
  `terminationGracePeriodSeconds` present.

## Rollout / verification

1. Land changes → release flow builds a new `rows` image and bumps the **tenant base**.
2. Argo syncs; the new pod boots instantly (lazy pool), flips `Ready` on first DB connection,
   old pod drains (notify stub fires, connections released), rollout completes — no deadlock.
3. Confirm in `rows-chuckrpg-dev`: one pod on the new image, `Ready`, `0` restarts; drain log
   line present on the old pod's termination.
