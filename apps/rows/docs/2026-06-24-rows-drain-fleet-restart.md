# ROWS Drain — Fleet-Restart Orchestration & End-to-End Rollout (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do the tasks in order; each ends in a build + commit.
>
> **Config & docs index:** [`2026-06-24-rows-config-and-docs-index.md`](./2026-06-24-rows-config-and-docs-index.md) — once Phase 3 emits the drain-request annotation schema (Task 1) and the rollout endpoints (Tasks 5/5b, R4/R5), register them there.

**Goal:** Give ROWS a DB-backed, coordinated fleet restart and a safe end-to-end version rollout: mark every active instance draining, lock out new joins, emit a hard "all old servers gone" barrier, and let a deploy orchestrator roll the new server build only once the fleet is empty — with the new build gated on the matching client build.

**Architecture:** A DB-backed `fleet_restart` control row (operator/dashboard-written, like `admission_control`) drives a background reconcile job: it fans `set_drain_state` across active instances (whole-fleet or in batches), holds the admission lockout while active and lifts it when done, and exposes `GET /fleet-restart/status` with a two-level `safe_to_roll` signal (no DB rows active **and** no Agones GameServer pods left). A named deploy orchestrator consumes that signal to run a scale-to-0 cutover. The server binary is delivered as a version-pinned path on a shared PVC, not a container image tag.

**Tech Stack:** Rust, axum, sqlx (runtime), Postgres, tokio, Agones, ArgoCD.

## Global Constraints

- Worktree workflow (PR #13200 lineage); conventional commits, **no co-author lines**.
- Runtime sqlx (no compile-time `query!`); every new table ships a `dbmate` migration **and** a mirrored `packages/data/sql/schema/ows/*.sql`.
- **Degrade-on-missing-table:** every read of a new table returns the inert/safe default on Postgres `42P01` (undefined_table), using the `is_undefined_table` helper (`apps/rows/src/repo/instances.rs:17`).
- **Inert posture:** no control row ⇒ the reconcile job no-ops; the feature ships dark.
- **Safe-by-default:** the automated path must never force-disconnect players. Aggressive behaviour (`urgency=1, drop_players=true`) is an explicit opt-in, never a default.
- **No mixed-version coexistence:** a new server build must never run alongside an old one. The roll waits until every old server is gone.
- **Version parity:** never roll a server ahead of its client. A server build only rolls once the matching client (Windows minimum) build is published.
- **Lockout ownership:** `admission_control` is Phase 2's **shared, general-purpose** lockout table (a single `customerguid`-keyed row, also written by maintenance/abuse-mitigation flows). The reconcile must therefore only lift a lockout **it itself applied** — never blindly write `NULL` every tick — or it silently clobbers another writer's lockout within 30s. Ownership is tracked on `fleet_restart.lockoutapplied` (set when the reconcile applies the lockout, cleared when it lifts it); when no restart is active the reconcile lifts the lockout **once** iff `lockoutapplied` was set, then leaves `admission_control` alone. Corollary: clear a restart with `active=false`, **never `DELETE`** the row (a deleted row is unreadable, so the one-shot lift can't run).
- **Convergence depends on the reaper:** an instance only leaves `status>0` when `empty_server_reaper` tears it down (`set_drain_state` rejects `state=0`). Fleet-restart **cannot converge unless the reaper is enabled and healthy.** Every restart therefore carries a stall backstop (Task 4 Step 3) — including the non-aggressive path — so a stuck/disabled reaper surfaces as a loud, observable stall instead of an indefinite hung lockout.
- **Restart modes** — the `fleet_restart` row carries `urgency` + `drop_players`; pin them to the trigger:

    | Mode                        | Trigger                                 | `urgency`       | `drop_players` | Behaviour                                                                                                                                    |
    | --------------------------- | --------------------------------------- | --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
    | **Non-aggressive (update)** | post-publish GitOps merge, parity-gated | `0` = when_able | `false`        | Drain-to-natural-empty: an instance restarts only once all its players leave on their own. No forced disconnects. Default for routine rolls. |
    | **Aggressive (expedite)**   | dashboard operator, deadline-bounded    | `1` = asap      | `true`         | Save-then-disconnect remaining players at the deadline. For urgent/security rolls.                                                           |

---

## Preconditions & ground truth (read before Task 1)

These are verified facts about the current codebase the tasks below depend on. They are not optional context — getting them wrong breaks the build.

- **Phase 1 + Phase 2 live on `dev`, not `main`.** Branch this work from `dev`. Already present there:
    - `mapinstances.DrainState SMALLINT NULL CHECK (DrainState IN (1,2))` and `set_drain_state` (`apps/rows/src/repo/instances.rs:583`). Signature (after `&self`): `(customer_guid: Uuid, map_instance_id: i32, state: i16, urgency: i16, drop_players: bool, reason: &str, request_id: Uuid, deadline: Option<chrono::NaiveDateTime>) -> Result<u64, RowsError>`.
    - `validate_drain_request(state, urgency)` accepts `state IN (1,2)` and `urgency IN (0,1)` — so an `urgency=0` default is valid.
    - `admission_control.AcceptNewJoins BOOLEAN NULL` (migration `20260629000000_ows_admission_control.sql`). `NULL` ⇒ fall back to the env baseline `ROWS_ACCEPT_NEW_JOINS` (default `true`) ⇒ joins allowed. So **writing `NULL` is how you lift the lockout.**
    - `count_active_instances(tenant) -> i64` already exists (counts `status > 0`).
- **The chuck UE server version is a PVC path, NOT a container image tag.** In `apps/kube/agones/rows-tenants/chuckrpg-*/manifests/fleet.yaml` the `ue5-server` container image is a fixed `ubuntu:24.04`; the cooked server is delivered via the `ows-server-build` PVC mounted at `/server`, and the pod runs `/server/latest/LinuxServer/chuckServer.sh`. Bumping a deployment `image:` tag does **not** roll the UE server — it only rolls the `ghcr.io/kbve/kubectl` sidecar. Because the path is the mutable `latest/`, any pod restart (crash, eviction, node drain, autoscale) silently loads whatever build currently sits in `latest/` — an accidental mixed-version fleet with no deploy action. **R0 fixes this and is a hard prerequisite for the barrier to mean anything.**
- **End-to-end (Agones barrier + soak) is untestable until chuck servers reach `Ready()`.** Today the beta fleet sits at `replicas:0` and servers hang at login (tracked: `project_chuckrpg_ready_hang` — UE hangs after SessionSubsystem init, never calls Agones `Ready()`). Tasks 1–5 (DB + signal) are testable now; R3 (the live cutover) is not until that game-side crash clears.
- **ROWS is scaled to `replicas: 0` today, not `1`** (`apps/kube/rows/manifest/rows-deployment.yaml:15`, `apps/kube/rows/tenants/base/deployment.yaml`). The `rows-pdb minAvailable: 1` **does** exist (`rows-deployment.yaml:162`, `tenants/base/deployment.yaml:204`). So the SPOF/PDB hazard (Task 4 Step 4 / K1) is **dormant while scaled to 0** but becomes live the instant ROWS scales up to serve — it is still a hard prerequisite, just not currently observable. Do not read "replicas: 1" anywhere in this plan as current truth.
- **The `ows-server-build` PVC is `ReadWriteMany` (RWX)** — verified at `apps/kube/github/runners/manifests/ows-server-build-pvc.yaml:14`. This **resolves the R0 Step 4 gate**: version-pinned coexistence (old and new pods each mounting their own `<version>/` dir concurrently) is possible. **Open item R0 Step 4 must still confirm** the PVC is reachable from the agones tenant namespaces — the PVC object is defined in the **runners** namespace, and PVCs are namespace-scoped, so either a same-named PVC exists per tenant namespace or the mount works via a mechanism this plan must name. Do not assume cross-namespace mount "just works."

---

### Task 1: `fleet_restart` control table + model

**Files:**

- Create: `packages/data/sql/dbmate/migrations/20260629120000_ows_fleet_restart.sql`
- Create: `packages/data/sql/schema/ows/fleet_restart.sql`
- Modify: `apps/rows/src/config.rs` (control struct)

The migration timestamp must be **after** the Phase 1/2 deps already on `dev` (`20260628212059_ows_mapinstance_drain.sql`, `20260629000000_ows_admission_control.sql`); an earlier timestamp applies out-of-order under dbmate. Column defaults are the non-aggressive values so a stray or automated row never bounces live players; `chk_urgency` matches the runtime `validate_drain_request` domain. `lockoutapplied` tracks lockout ownership (see Global Constraints → Lockout ownership) so the reconcile never clobbers another writer's `admission_control` row.

> **RLS note (K4):** the `USING (true) WITH CHECK (true)` policies below enable RLS but provide **no tenant isolation** — they are decorative. That is acceptable only because ROWS is **single-tenant-per-deployment** (`customer_guid` comes from config, one tenant per pod). Do not treat `fleet_restart`/`deploy_state` as multi-tenant-safe; if ROWS ever becomes multi-tenant per process, these policies must scope on `customerguid`.

**Interfaces:**

- Produces: table `ows.fleet_restart(customerguid uuid pk, active boolean, reason text, urgency smallint, dropplayers boolean, stagger boolean, batchsize int, lockout boolean, targetversion text null, requestid uuid)`; `FleetRestart` (sqlx::FromRow) with snake_case fields via `#[sqlx(rename)]`.

- [ ] **Step 1: Migration** `20260629120000_ows_fleet_restart.sql`:

```sql
-- migrate:up
SET search_path TO ows;
CREATE TABLE IF NOT EXISTS fleet_restart
(
    CustomerGUID  UUID    NOT NULL,
    Active        BOOLEAN NOT NULL DEFAULT false,
    Reason        TEXT    NOT NULL DEFAULT 'fleet-restart',
    Urgency       SMALLINT NOT NULL DEFAULT 0,    -- 0 = when_able (non-aggressive); 1 = asap
    DropPlayers   BOOLEAN NOT NULL DEFAULT false, -- aggressive paths set true explicitly
    Stagger       BOOLEAN NOT NULL DEFAULT false,
    BatchSize     INT     NOT NULL DEFAULT 1,
    Lockout       BOOLEAN NOT NULL DEFAULT true, -- block new joins while active
    LockoutApplied BOOLEAN NOT NULL DEFAULT false,-- ownership flag: true while THIS restart holds the admission lockout (so the reconcile only lifts what it set; see Global Constraints)
    StartedAt     TIMESTAMPTZ NOT NULL DEFAULT now(), -- when this restart went active; backs the stall backstop (F2)
    DrainDeadline TIMESTAMPTZ NULL,              -- aggressive only: force-deallocate overdue instances past this (R4); NULL on the non-aggressive path (never forces)
    TargetVersion TEXT    NULL,                  -- reserved (version-selective drain; deferred)
    RequestID     UUID    NOT NULL,
    CONSTRAINT PK_FleetRestart PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_urgency CHECK (Urgency IN (0,1)),
    -- Safe-by-default is a HARD invariant (Global Constraints). Column defaults alone don't stop a
    -- hand-written / partial-upsert row like (urgency=0, dropplayers=true) from force-disconnecting on
    -- the "non-aggressive" path. Make it structural: force-disconnect and a deadline require aggressive.
    CONSTRAINT chk_safe_default   CHECK (Urgency = 1 OR DropPlayers = false),
    CONSTRAINT chk_deadline_aggr  CHECK (DrainDeadline IS NULL OR Urgency = 1)
);
ALTER TABLE fleet_restart ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_restart FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fleet_restart FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_restart TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_restart TO ows;
CREATE POLICY ows_access ON fleet_restart FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON fleet_restart FOR ALL TO service_role USING (true) WITH CHECK (true);
-- migrate:down
SET search_path TO ows;
DROP TABLE IF EXISTS fleet_restart;
```

- [ ] **Step 2: Reference schema** `fleet_restart.sql` mirroring the above.
- [ ] **Step 3: Model** in `config.rs`:

```rust
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FleetRestart {
    pub active: bool,
    pub reason: String,
    pub urgency: i16,
    #[sqlx(rename = "dropplayers")]
    pub drop_players: bool,
    pub stagger: bool,
    #[sqlx(rename = "batchsize")]
    pub batch_size: i32,
    pub lockout: bool,
    #[sqlx(rename = "lockoutapplied")]
    pub lockout_applied: bool,
    #[sqlx(rename = "startedat")]
    pub started_at: chrono::DateTime<chrono::Utc>,
    #[sqlx(rename = "draindeadline")]
    pub drain_deadline: Option<chrono::DateTime<chrono::Utc>>,
    #[sqlx(rename = "targetversion")]
    pub target_version: Option<String>,
    #[sqlx(rename = "requestid")]
    pub request_id: uuid::Uuid,
}
```

- [ ] **Step 4: Add the stall-SLA config knob** (consumed by Task 4 Step 3 and Task 5 Step 1 — declare it here so those tasks compile). In the config struct that holds `customer_guid`, add:

```rust
    /// Non-aggressive stall SLA: seconds a restart may sit `active` with `draining > 0` before it is
    /// declared stalled (surfaced on /fleet-restart/status and, at 2× this, auto-lifts the lockout —
    /// Task 4 Step 3). Env: ROWS_FLEET_RESTART_STALL_SECS. Default 1800 (30 min).
    pub fleet_restart_stall_secs: i64,
```

and parse it in the same place other `ROWS_*` env knobs are read:

```rust
    fleet_restart_stall_secs: std::env::var("ROWS_FLEET_RESTART_STALL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1800),
```

- [ ] **Step 5: Build.** **Step 6: Commit** — `feat(rows): fleet_restart control table + model + stall-SLA config`.

---

### Task 2: Repo — read control, list drainable instances

**Files:** Modify `apps/rows/src/repo/instances.rs`

`list_drainable_instances` excludes instances already draining (`drainstate IS NULL`), so the reconcile job never re-drains. An instance counts as "drained" when its row leaves `status>0` (the reaper/lifecycle sets `status=0` on teardown); `count_active_instances == 0` is the DB-level all-drained signal.

**Interfaces:**

- Produces:
    - `get_fleet_restart(tenant) -> Result<Option<FleetRestart>, RowsError>` (`None` on row-absent OR 42P01).
    - `list_drainable_instances(tenant, limit: i64) -> Result<Vec<i32>, RowsError>` — `status>0` instances not already draining, oldest first, capped (the batch source).

- [ ] **Step 1: Implement `get_fleet_restart`** (degrade on 42P01 like `get_reaper_config_override`):

```rust
pub async fn get_fleet_restart(
    &self,
    customer_guid: Uuid,
) -> Result<Option<crate::config::FleetRestart>, RowsError> {
    let result = sqlx::query_as::<_, crate::config::FleetRestart>(
        "SELECT active, reason, urgency, dropplayers, stagger, batchsize, lockout,
                lockoutapplied, startedat, draindeadline, targetversion, requestid
         FROM fleet_restart WHERE customerguid = $1",
    )
    .bind(customer_guid)
    .fetch_optional(self.0)
    .await;
    match result {
        Ok(row) => Ok(row),
        Err(e) if is_undefined_table(&e) => Ok(None),
        Err(e) => Err(e.into()),
    }
}
```

- [ ] **Step 2: Implement `list_drainable_instances`**:

```rust
pub async fn list_drainable_instances(
    &self,
    customer_guid: Uuid,
    limit: i64,
) -> Result<Vec<i32>, RowsError> {
    let rows: Vec<(i32,)> = sqlx::query_as(
        "SELECT mapinstanceid FROM mapinstances
         WHERE customerguid = $1 AND status > 0 AND drainstate IS NULL
         ORDER BY mapinstanceid
         LIMIT $2",
    )
    .bind(customer_guid)
    .bind(limit)
    .fetch_all(self.0)
    .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}
```

- [ ] **Step 3:** Add an index to back the per-tick scan. `mapinstances` is a hot table (spin-up/teardown write it constantly), so a plain `CREATE INDEX` takes a write-blocking `SHARE` lock for the whole build and stalls instance writes. Use **`CONCURRENTLY`**, which **cannot run inside dbmate's implicit transaction** — ship it in its own migration with the transaction disabled (dbmate `-- migrate:up` with `transaction:false`, or a dedicated single-statement migration): `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapinstances_drainable ON mapinstances (customerguid, status, drainstate);`. A `CONCURRENTLY` build can fail and leave an `INVALID` index that Postgres silently refuses to use — the per-tick `list_drainable_instances` scan then degrades to a seq-scan on the hot `mapinstances` table under load, with no error. Runbook-only recovery is not enough. **Add automated detection:** ship a post-migration assertion (a CI/Argo post-sync check, or a startup log-and-metric in ROWS) that runs `SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_mapinstances_drainable'::regclass` and alerts/logs `warn!` on `false`. Runbook recovery stays `DROP INDEX idx_mapinstances_drainable; ` then re-create `CONCURRENTLY`.
- [ ] **Step 4: Build.** **Step 5: Commit** — `feat(rows): fleet-restart repo reads (control, drainable list)`.

---

### Task 3: Admission setter (lockout write)

**Files:** Modify `apps/rows/src/repo/instances.rs`

Reuses Phase 2's **shared** `admission_control` table. `Some(false)` sets the lockout; `None` writes SQL `NULL`, which makes admission fall back to the env baseline — i.e. `None` lifts the lockout. Because the table is shared (maintenance/abuse flows write it too), the reconcile must not lift unconditionally — it tracks ownership on `fleet_restart.lockoutapplied` via `set_fleet_lockout_applied` and only lifts a lockout it set (see Global Constraints → Lockout ownership, and Task 4).

**Interfaces:**

- Produces:
    - `set_admission(tenant, accept_new_joins: Option<bool>) -> Result<(), RowsError>`.
    - `set_fleet_lockout_applied(tenant, applied: bool) -> Result<(), RowsError>` — `UPDATE fleet_restart SET lockoutapplied = $2 WHERE customerguid = $1` (no-op if the row is absent; degrade on 42P01).
    - `set_fleet_lockout(tenant, lockout: bool) -> Result<(), RowsError>` — `UPDATE fleet_restart SET lockout = $2 WHERE customerguid = $1` (degrade on 42P01). Used by the stall-SLA auto-lift (Task 4 Step 3) to stop re-applying the lockout while the restart stays active.

- [ ] **Step 1: Implement**:

```rust
pub async fn set_admission(
    &self,
    customer_guid: Uuid,
    accept_new_joins: Option<bool>,
) -> Result<(), RowsError> {
    sqlx::query(
        "INSERT INTO admission_control (customerguid, acceptnewjoins)
         VALUES ($1, $2)
         ON CONFLICT (customerguid) DO UPDATE SET acceptnewjoins = EXCLUDED.acceptnewjoins",
    )
    .bind(customer_guid)
    .bind(accept_new_joins)
    .execute(self.0)
    .await?;
    Ok(())
}

pub async fn set_fleet_lockout_applied(
    &self,
    customer_guid: Uuid,
    applied: bool,
) -> Result<(), RowsError> {
    let result = sqlx::query(
        "UPDATE fleet_restart SET lockoutapplied = $2 WHERE customerguid = $1",
    )
    .bind(customer_guid)
    .bind(applied)
    .execute(self.0)
    .await;
    match result {
        Ok(_) => Ok(()),
        Err(e) if is_undefined_table(&e) => Ok(()), // feature dark — nothing to track
        Err(e) => Err(e.into()),
    }
}

pub async fn set_fleet_lockout(
    &self,
    customer_guid: Uuid,
    lockout: bool,
) -> Result<(), RowsError> {
    let result = sqlx::query(
        "UPDATE fleet_restart SET lockout = $2 WHERE customerguid = $1",
    )
    .bind(customer_guid)
    .bind(lockout)
    .execute(self.0)
    .await;
    match result {
        Ok(_) => Ok(()),
        Err(e) if is_undefined_table(&e) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
```

- [ ] **Step 2: Build.** **Step 3: Commit** — `feat(rows): set_admission + lockout-ownership/lockout setters (fleet-restart lockout)`.

---

### Task 4: Fleet-restart reconcile job

**Files:** Modify `apps/rows/src/jobs.rs`

The job runs single-flight per tenant via a Postgres advisory lock so running ROWS with >1 replica does not double-fan `set_drain_state`. It owns the lockout lifecycle: set it while active, and lift it (write `NULL`) when the row is absent or `active=false` **only if it previously applied it** (`lockoutapplied`, F3 — never clobber the shared `admission_control` row). The whole-fleet batch cap is a named constant, not a magic number.

> **⚠️ F1 (BLOCKER) — reuse `AdvisoryLockGuard`, do NOT re-derive the lock inline.** `fleet_restart_reconcile` lives in the **same file** (`apps/rows/src/jobs.rs`) as `empty_server_reaper` and its `AdvisoryLockGuard` (`jobs.rs:150`). `pg_try_advisory_lock` is a **session-level** lock: it must be acquired and released on the **same pinned connection**. Taking the lock on the pool (`fetch_one(&svc.state().db)`) and releasing it on the pool (a different pooled connection) is a no-op unlock — the lock leaks on the first connection, and **every subsequent tick's `pg_try_advisory_lock` returns `false`, silently wedging the reconcile for this tenant until ROWS restarts** (with the admission lockout possibly stuck on). The reaper already solved this exactly; mirror it: `acquire()` a dedicated `lock_conn`, run lock+unlock on `&mut *lock_conn`, arm `AdvisoryLockGuard`, run the cycle as a supervised `tokio::spawn(...).await` so a panic can't skip the unlock, and on unlock failure `detach().close()` the connection. The **POOLER CONSTRAINT** from `jobs.rs:253-261` applies verbatim: this must stay on the session-pinned direct RW endpoint, never the transaction-mode pooler.

**Interfaces:**

- Consumes: `get_fleet_restart`, `list_drainable_instances`, `set_admission` + `set_fleet_lockout_applied` (Task 3), `set_drain_state` (Phase 1), `count_active_instances`, plus the existing `AdvisoryLockGuard` (`jobs.rs:150`).
- Produces: a `fleet_restart_reconcile` task in `spawn_all`; a `const FLEET_DRAIN_CAP: i64 = 4096;`; a `run_fleet_restart_cycle(svc, guid)` body fn (the reconcile work, run under the lock — mirrors `run_reap_cycle`).

- [ ] **Step 1: Add the task to `spawn_all`** alongside the others:

```rust
    tokio::spawn(fleet_restart_reconcile(svc.clone()));
```

- [ ] **Step 2: Implement** (30s cadence, mirrors the reaper loop):

```rust
const FLEET_DRAIN_CAP: i64 = 4096; // whole-fleet (!stagger) batch cap

// Lock/unlock pattern mirrors empty_server_reaper EXACTLY (jobs.rs:250-325). The advisory lock is
// SESSION-level, so it MUST be taken and released on the same pinned connection (see the F1 note
// above and the POOLER CONSTRAINT at jobs.rs:253). Do not take it on the pool.
async fn fleet_restart_reconcile(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;
    loop {
        interval.tick().await;
        let guid = svc.state().config.customer_guid;

        // Pin a dedicated connection for the session-level advisory lock.
        let mut lock_conn = match svc.state().db.acquire().await {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "fleet-restart: failed to acquire lock connection — skipping tick");
                continue;
            }
        };
        let locked = match sqlx::query_scalar::<_, bool>(
            "SELECT pg_try_advisory_lock(hashtext('rows-fleet-restart'), hashtext($1))",
        )
        .bind(guid.to_string())
        .fetch_one(&mut *lock_conn)
        .await
        {
            Ok(v) => v,
            Err(e) => {
                warn!(error = %e, "fleet-restart: advisory-lock query failed — skipping tick");
                continue; // no lock held; lock_conn returns to the pool normally
            }
        };
        if !locked {
            continue; // another replica owns this tenant's reconcile this tick
        }

        // Arm the RAII guard so the session lock is dropped even if the cycle panics.
        let mut lock_guard = AdvisoryLockGuard::new(lock_conn);

        // Run the cycle as a supervised task so a panic is caught at the JoinError boundary and the
        // explicit unlock below ALWAYS runs (a leaked session lock would wedge this tenant forever).
        if let Err(e) = tokio::spawn(run_fleet_restart_cycle(svc.clone(), guid)).await {
            error!(error = %e, "fleet-restart: cycle panicked — releasing lock, loop continues");
        }

        // Release on the SAME pinned connection. On failure, detach+close so Postgres drops the
        // session lock when the backend session ends, rather than leaking it on a pooled connection.
        match sqlx::query("SELECT pg_advisory_unlock(hashtext('rows-fleet-restart'), hashtext($1))")
            .bind(guid.to_string())
            .execute(lock_guard.conn_mut())
            .await
        {
            Ok(_) => lock_guard.disarm(),
            Err(e) => {
                warn!(error = %e, "fleet-restart: failed to release advisory lock — closing connection");
                if let Err(e) = lock_guard.take().detach().close().await {
                    warn!(error = %e, "fleet-restart: error closing detached lock connection");
                }
            }
        }
    }
}

/// One reconcile pass, run under the advisory lock held by the caller (mirrors `run_reap_cycle`).
async fn run_fleet_restart_cycle(svc: Arc<OWSService>, guid: Uuid) {
    let repo = InstanceRepo(&svc.state().db);

    let fr = match repo.get_fleet_restart(guid).await {
        Ok(Some(fr)) if fr.active => fr,
        // No active restart (absent row OR active=false). Lift the lockout ONLY if THIS restart
        // applied it (lockoutapplied) — never blindly NULL the shared admission_control row, which
        // maintenance/abuse flows also write (F3). One-shot + idempotent on cold-start resume.
        Ok(Some(fr)) => {
            if fr.lockout_applied {
                if let Err(e) = repo.set_admission(guid, None).await {
                    warn!(error = %e, "fleet-restart: failed to lift lockout");
                    return; // leave lockoutapplied=true; retry next tick
                }
                if let Err(e) = repo.set_fleet_lockout_applied(guid, false).await {
                    warn!(error = %e, "fleet-restart: failed to clear lockout-applied flag");
                }
            }
            return;
        }
        Ok(None) => return, // inert: no row at all, nothing to do (and nothing we ever locked)
        Err(e) => {
            warn!(error = %e, "fleet-restart: read failed");
            return;
        }
    };

    // Hold the lockout while the restart runs (travel still allowed — see Phase 2). Record ownership
    // so the inactive branch above lifts only what we set.
    if fr.lockout {
        if let Err(e) = repo.set_admission(guid, Some(false)).await {
            warn!(error = %e, "fleet-restart: failed to set lockout");
        } else if !fr.lockout_applied {
            if let Err(e) = repo.set_fleet_lockout_applied(guid, true).await {
                warn!(error = %e, "fleet-restart: failed to record lockout ownership");
            }
        }
    }

    // Batch source: instances not yet draining. Whole-fleet if !stagger.
    let limit = if fr.stagger { fr.batch_size.max(1) as i64 } else { FLEET_DRAIN_CAP };
    let batch = match repo.list_drainable_instances(guid, limit).await {
        Ok(b) => b,
        Err(e) => {
            warn!(error = %e, "fleet-restart: list failed");
            return;
        }
    };

    for id in &batch {
        if let Err(e) = repo
            .set_drain_state(guid, *id, 1 /*draining*/, fr.urgency, fr.drop_players,
                             &fr.reason, fr.request_id, /*deadline*/ fr_deadline(&fr))
            .await
        {
            warn!(error = %e, instance_id = id, "fleet-restart: set_drain_state failed");
        }
    }

    // Stall backstop (Step 3): even the non-aggressive path force-deallocates instances overdue
    // past the restart deadline, so a stuck/disabled reaper surfaces as a bounded, observable stall
    // rather than an indefinitely-held lockout. See Step 3.
    enforce_drain_deadline(&svc, &repo, guid, &fr).await;

    let remaining = repo.count_active_instances(guid).await.unwrap_or(-1);
    info!(active = remaining, staggered = fr.stagger, batch = batch.len(),
          "fleet-restart: reconcile tick");
    // remaining == 0 is the DB all-drained signal (exposed via REST in Task 5). It only reaches
    // 0 once instances hit status=0, which ONLY empty_server_reaper writes (set_drain_state
    // rejects state=0) — so convergence depends on the reaper AND the deadline backstop above.
}
```

When `stagger`, each tick drains the next `batch_size` instances not yet draining; as earlier instances finish (rows leave `status>0`), later ticks pick up the rest. Without a UE drain-complete ack, a batch is gated on instances still being `drainstate IS NULL`, not on the previous batch fully completing — good enough to avoid re-draining, but it is not strict wave-by-wave isolation; do not document it as such.

- [ ] **Step 3: Deadline + stall backstop so a stuck instance — or a live population — can't pin the fleet forever (F2, HIGH-2) — without violating safe-by-default.** A hung instance (or any player who simply never leaves) keeps `status>0`, so `count_active` never reaches 0. Convergence is coupled to `empty_server_reaper` (only it writes `status=0`) **and** to players actually departing; on a populated tenant a non-aggressive drain-to-natural-empty can stay incomplete indefinitely. The join lockout is held the entire time, so an unbounded stall is a silent **fleet-wide "can't join" outage**, not merely a slow roll. Two paths, two behaviours — **the non-aggressive path must never force-disconnect** (safe-by-default), but it also must not hold the join lockout without bound:
    - `fr_deadline(&fr) -> Option<chrono::NaiveDateTime>` = `fr.drain_deadline.map(|d| d.naive_utc())` — stamped on each `set_drain_state`. Aggressive ⇒ `Some(deadline)`; non-aggressive ⇒ `None` (never auto-disconnects).
    - `enforce_drain_deadline(svc, repo, guid, &fr)`:
        - **Aggressive (`fr.drain_deadline` set and passed):** force-deallocate the overdue instances **per-GameServer** — do NOT reuse `restart_fleet`'s whole-Fleet scale-to-0 (that would also kill instances still draining cleanly, and it isn't per-instance). Map each overdue `mapinstanceid` to its Agones `GameServer` and mark that one for shutdown (Agones GameServer `Shutdown()` / patch its state), then let the reaper/lifecycle move the row to `status=0`. This is allowed — aggressive explicitly opts into save-then-disconnect at the deadline.
        - **Non-aggressive (no `drain_deadline`):** never disconnect anyone, but **bound the join outage in two escalating stages** off `started_at`:
            1. **Stall SLA breached** (`age(started_at) > fleet_restart_stall_secs`, default 1800s): emit a loud `warn!(stalled_secs, draining, "fleet-restart: drain stalled — check empty_server_reaper")` and set the `stalled` flag surfaced on `/fleet-restart/status` (Task 5). The stuck lockout is now observable and alertable. Drain continues; lockout still held.
            2. **Hard join-outage cap breached** (`age(started_at) > 2 * fleet_restart_stall_secs`): **auto-lift the join lockout while leaving the restart active** so new players stop being refused (they land on old-version instances, which is safe within a version line — no protocol break, the roll just takes longer). Do it idempotently and in an order that won't re-apply next tick: `set_admission(guid, None)` → `set_fleet_lockout_applied(guid, false)` → `set_fleet_lockout(guid, false)` (so the active branch's `if fr.lockout` no longer re-applies). Emit `error!(stalled_secs, "fleet-restart: join-outage cap hit — lockout auto-lifted, drain still pending; escalate to aggressive")`. The restart stays `active` and `stalled=true` (alerting/paging continues) until an operator clears it or escalates to aggressive with a deadline.
    - Log/assert the reaper's enabled state at job start so the reaper-coupling failure mode is diagnosable from ROWS logs.
- [ ] **Step 4 (PREREQUISITE, not a follow-up — K1): the SPOF/PDB hazard must be fixed before this job is enabled in prod.** This reconcile _is_ the orchestrator and runs on ROWS, which is currently `replicas: 0` but carries `rows-pdb minAvailable: 1` (`apps/kube/rows/manifest/rows-deployment.yaml:15,162`; see Preconditions). The moment ROWS scales up to serve, that PDB on a single replica hangs node drains, and a reschedule mid-restart drops in-flight progress — dormant today, live the instant it scales to 1. The advisory lock (Step 2) already makes >1 replica correct (one replica wins the per-tenant lock each tick), so before flipping the feature live: run ROWS HA (`replicas: ≥2`, leader-elected by the per-tenant lock) **and** change `rows-pdb` so it never blocks a node drain (`maxUnavailable: 1` instead of `minAvailable: 1`). `selfHeal: true` on the rows Argo app reverts manual `kubectl scale` — change the manifest in git, never by hand. The job is designed to be resume-safe (re-derives the batch from `drainstate IS NULL` each tick, re-applies/lifts the lockout idempotently via `lockoutapplied`); verify with the "kill ROWS mid-restart" test. **Do not ship a fleet-wide orchestrator onto a single self-deadlocking pod and call HA a later refinement.**
- [ ] **Step 5: Build + tests** — `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail`. **Step 6: Commit** — `feat(rows): fleet-restart reconcile job (pinned advisory lock + owned lockout + stall backstop)`.

---

### Task 5: Two-level all-drained status endpoint

**Files:** Modify `apps/rows/src/rest/system.rs`

`count_active_instances` is a DB-row count: an instance can be at `status=0` while its pod is still alive (flushing a save, mid-SIGTERM, grace period not elapsed). Rolling on that alone risks a mixed-version window. So the barrier is two-level — the DB count is the _necessary_ trigger to begin the cutover; the Agones GameServer count hitting 0 is the _sufficient_ "all old gone" gate.

**Interfaces:**

- Consumes: `get_fleet_restart`, `count_active_instances`, a new `count_gameservers(tenant)` (Agones list, label `app.kubernetes.io/instance=<tenant>`, reusing the in-cluster client behind `restart_fleet`'s scale calls).
- Produces: `GET /fleet-restart/status` → `{ active: bool, draining: i64, gameservers: i64, all_drained: bool, safe_to_roll: bool, stalled: bool }` where `all_drained = active && draining == 0`, `safe_to_roll = all_drained && gameservers == 0`, and `stalled` reflects the non-aggressive stall backstop (Task 4 Step 3: `active && draining > 0 && age(started_at) > fleet_restart_stall_secs`). `stalled=true` is the alertable "drain not converging — check the reaper" signal.

- [ ] **Step 1: Add the handler** (match the file's actual axum handler/registration style):

```rust
async fn fleet_restart_status(State(hs): State<HandlerState>) -> ApiResult<FleetRestartStatus> {
    let guid = hs.app.config.customer_guid;
    let repo = InstanceRepo(&hs.app.db);
    let fr = repo.get_fleet_restart(guid).await?;
    let active = matches!(&fr, Some(fr) if fr.active);
    let draining = repo.count_active_instances(guid).await?;
    let gameservers = hs.app.count_gameservers(guid).await?; // Agones GS list, label-filtered (cached, see Step 3)
    let all_drained = active && draining == 0;
    let safe_to_roll = all_drained && gameservers == 0;
    let stalled = fr.as_ref().is_some_and(|fr| {
        fr.active && draining > 0
            && (chrono::Utc::now() - fr.started_at).num_seconds() > hs.app.config.fleet_restart_stall_secs
    });
    Ok(axum::Json(FleetRestartStatus { active, draining, gameservers, all_drained, safe_to_roll, stalled }))
}
```

- [ ] **Step 2 (F5): bound the Agones LIST cost.** `count_gameservers` does an Agones GameServer LIST per call; an orchestrator polling this hot would add steady kube-apiserver/Agones-controller pressure (this cluster has a documented apiserver/etcd-starvation history — `project_etcd_io_starvation_argo_flapping`). Cache the GS count behind a short TTL (e.g. 3–5s, shared across callers) and **document the orchestrator poll cadence (≥5s)** in the R3 contract. The DB counts are cheap; only the Agones LIST needs the cache.
- [ ] **Step 3 (SECURITY — HIGH-1): a NetworkPolicy alone does NOT protect these routes.** `/fleet-restart/*` is served on the **same port (4322)** every GameServer already calls, and a NetworkPolicy filters by pod-selector + **port**, never by HTTP path. So "allow the fleet-restart paths only from the gateway, default-deny otherwise" is not expressible as a NetworkPolicy — any pod already permitted to reach `rows:4322` (i.e. **every chuck GameServer**) can also hit `/fleet-restart/status`. That is tolerable for the read-only `/status`, but **not** for the mutating routes (`POST /fleet-restart/trigger`, R4 — a fleet-wide save-then-disconnect). Required posture:
    - **Read (`GET /fleet-restart/status`, `GET /fleet-restart/pending`):** cluster-internal Service only, no Ingress/Gateway. NetworkPolicy default-deny in the `rows` namespace, allowing 4322 ingress from the existing GameServer/orchestrator/gateway selectors (this preserves today's GameServer→ROWS calls — do not break them).
    - **Mutate (`POST /fleet-restart/trigger`, R4):** must carry **app-level auth** — a shared secret / bearer token (from the `ows-*` sealed-secret set) or mTLS that the dashboard-gateway holds and GameServers do **not**. Reject unauthenticated callers with 401. A NetworkPolicy is defence-in-depth here, not the control. **Alternative that makes the NetworkPolicy sufficient:** bind the mutating routes to a **separate port** (e.g. a second axum listener on 4323) that only the gateway selector is allowed to reach; then the policy can isolate mutate from the GameServer-open 4322. Pick one (token-auth or split-port) and specify the manifest change. Do not ship the aggressive-restart trigger reachable by any GameServer.
- [ ] **Step 4: Build + tests.** **Step 5: Commit** — `feat(rows): /fleet-restart/status two-level (DB+Agones) safe-to-roll + stall signal`.

---

### Task 5b: Authoritative version + deploy health on `/health`

**Files:** Modify `apps/rows/src/rest/mod.rs` (`health` handler), `apps/rows/src/models.rs` (`HealthResponse`), `apps/rows/src/repo/instances.rs`, plus the `deploy_state` table (Task 8).

Today `HealthResponse.unreal_version` (`models.rs:382`) is populated in-memory only (`state.rs:35`, `RwLock<Option<String>>`, init `None`) from GameServers POSTing their loaded build version on boot (`system.rs:320,338`). So `https://api-beta.chuckrpg.com/health` currently returns `unreal_version: null` — the fleet is at `replicas:0`, nothing POSTs, and the value is lost on every ROWS restart. That is reactive and useless to a launcher, which needs the authoritative target before any server/client connects. Source the served version from the DB-backed `deploy_state` instead.

**Interfaces:**

- Consumes: `deploy_state(tenant, target_version, rolled, health text)` (Task 8).
- Produces: public `GET /health` (`HealthResponse`) — read-only, at `https://api-beta.chuckrpg.com/health`:
    - `unreal_version` = the served PVC version = `deploy_state.target_version` where `rolled=true`. **This is the launcher's download target.** Falls back to the in-memory value if `deploy_state` is absent (42P01).
    - `pending_version: Option<String>` = `deploy_state.target_version` where `rolled=false` (merged but not yet rolled), else null.
    - `deploy_healthy: bool` + `failing_version: Option<String>` — set from `deploy_state.health`.

- [ ] **Step 1:** Add repo reads `get_served_version(tenant) -> Option<String>` (`rolled=true`), `get_pending_version(tenant) -> Option<String>` (`rolled=false`), and an upsert `set_deploy_health(tenant, healthy: bool, failing_version: Option<&str>)`.
- [ ] **Step 2:** Extend `HealthResponse` with `pending_version`, `deploy_healthy`, `failing_version`; fill `unreal_version` from `get_served_version` (fallback to `hs.app.server_build_version` on 42P01/None). Degrade-on-42P01 ⇒ `deploy_healthy:true` (never fail the probe because the rollout table is missing).
- [ ] **Step 3 (launcher contract):** Document that the launcher polls `/health.unreal_version` as the required client version and downloads the matching build; `pending_version` is informational. This is the runtime half of the version-parity gate (the CI half is R1). **Null case (MEDIUM-3):** `unreal_version: null` means "no authoritative target" (seed missing or feature dark) — the launcher must surface a maintenance/hold state and NOT auto-download an arbitrary build. The `deploy_state` seed (Task 8 Step 3) is what keeps this non-null in normal operation.
- [ ] **Step 4:** Do **not** fail `/ready` on `deploy_healthy:false` — keep `/ready` purely DB/pod liveness so a bad game build doesn't deregister the ROWS API pod the dashboard, launcher, and orchestrator depend on. `deploy_healthy` is advisory on `/health` only.
- [ ] **Step 5: Commit** — `feat(rows): /health reports authoritative PVC version + deploy_healthy (launcher + rollback surface)`.

---

### Task 6: Supersede the legacy `restart_fleet` + give the barrier a terminal state

**Files:** Modify `apps/rows/src/rest/system.rs`

The imperative `POST /api/System/RestartFleet` (scale-to-0 → `delete_all_map_instances` → scale-up) still exists and force-drops every player. If an operator fires it during an in-flight cooperative drain, it deletes instances out from under the reconcile. The cooperative flow must supersede it.

Separately, `all_drained` flips back to `false` the moment the operator clears `active`, so an orchestrator that re-polls after clearing reads "not drained." `safe_to_roll` is now durable **while the row stays active** via the `drainedat` convergence latch (stamped at 0 instances + 0 gameservers; also stops the drain fan-out so the post-cutover new fleet is never drained); after `active` clears, the durable terminal record is `deploy_state.rolled=true`.

- [ ] **Step 1:** Guard `restart_fleet` to refuse (HTTP 409) while a `fleet_restart` row is `active`, directing the caller to the cooperative flow. Keep it as a break-glass for when ROWS itself is the problem.
- [ ] **Step 2:** Treat the completion of a roll as "operator/orchestrator sets `active=false` after a confirmed scale-up," not as a `safe_to_roll` reading (which flips back to `false` the instant `active` clears). Document that a post-clear `/fleet-restart/status` returning `all_drained=false` is expected. The durable terminal record is `deploy_state.rolled=true` (Task 8), which the orchestrator sets after the soak (R3). **Crash window (F4):** if the orchestrator dies between scale-up and `rolled=true`, R5 still reports the update pending and the dashboard re-offers an aggressive restart for an already-completed roll. Mitigate: the orchestrator sets `rolled=true` idempotently as its final committed step, and the runbook documents the break-glass "manually `UPDATE deploy_state SET rolled=true` if a confirmed-healthy roll wasn't recorded."
- [ ] **Step 3: Build.** **Step 4: Commit** — `feat(rows): guard legacy restart_fleet against cooperative drain`.

---

### Task 7: Runbook + spec cross-reference

**Files:** Modify `apps/rows/docs/2026-06-24-rows-server-lifecycle-and-shutdown.md`

- [ ] Document the operator flow: the SQL to trigger/clear a restart (clear with `active=false`, **never `DELETE`** — a deleted row can't run the one-shot lockout lift), the lockout behaviour (lifted automatically by the reconcile when it owns it — never delete `admission_control` by hand), the `safe_to_roll` polling contract, the **two-stage non-aggressive stall backstop**, the aggressive deadline behaviour, the stall SLA (`fleet_restart_stall_secs`), the `CREATE INDEX CONCURRENTLY` invalid-index recovery + the automated `indisvalid` check, and the named-orchestrator handoff. **Stall behaviour operators must expect (Task 4 Step 3):**
    - **Non-aggressive, stage 1** (`age > fleet_restart_stall_secs`): `/fleet-restart/status` shows `stalled=true`; a warn is logged. Meaning: drain isn't converging → **check `empty_server_reaper` is enabled and healthy first**. Lockout still held.
    - **Non-aggressive, stage 2** (`age > 2 × fleet_restart_stall_secs`): ROWS **auto-lifts the join lockout** (an `error!` is logged: "join-outage cap hit"). New players can join again (on old-version instances); the restart stays `active` + `stalled=true`. This is expected and intentional — it bounds the join outage. To actually complete the roll, **escalate to aggressive** (a deadline that force-deallocates) or clear the row.
    - **Aggressive:** the deadline force-deallocates overdue instances **per-GameServer** (not a whole-fleet scale). No stage-2 auto-lift is needed — the deadline drives convergence.

    Trigger SQL:

```sql
SET search_path TO ows;

-- Routine version roll (NON-AGGRESSIVE, safe-by-default): drain-to-natural-empty, no forced
-- disconnects. urgency=0, dropplayers=false, no draindeadline. The default path.
-- Re-activating MUST reset startedat (the stall clock), lockoutapplied (ownership), AND lockout=true.
-- lockout=true matters because a prior run's stage-2 auto-lift (Task 4 Step 3) may have set lockout=false;
-- without resetting it, a re-trigger inherits lockout=false and never re-locks new joins. Same for a
-- stale startedat (stall backstop misfires).
INSERT INTO fleet_restart (customerguid, active, reason, urgency, dropplayers, stagger, batchsize, lockout, requestid)
VALUES ('<tenant-guid>', true, 'fleet-restart', 0, false, false, 1, true, gen_random_uuid())
ON CONFLICT (customerguid) DO UPDATE SET active = true, urgency = 0, dropplayers = false,
    draindeadline = NULL, lockout = true, startedat = now(), lockoutapplied = false, requestid = gen_random_uuid();

-- Urgent / security roll (AGGRESSIVE, dashboard opt-in only): save-then-disconnect at the deadline.
-- urgency=1, dropplayers=true, draindeadline set (prefer the R4 endpoint, which computes it).
-- Never the automated default.
-- ... DO UPDATE SET active = true, urgency = 1, dropplayers = true, draindeadline = now() + interval '5 min',
--                   lockout = true, startedat = now(), lockoutapplied = false, requestid = gen_random_uuid();

-- After safe_to_roll + deploy: clear it. The reconcile loop lifts the admission lockout itself
-- (set_admission writes NULL) on the next tick. Do NOT manually DELETE admission_control — a manual
-- two-statement teardown silently locks players out if the second statement is missed.
UPDATE fleet_restart SET active = false WHERE customerguid = '<tenant-guid>';
```

API counterpart: `POST /fleet-restart/clear` (gateway bearer token) does the same `active=false`
flip, so an API-triggered restart can be completed/cancelled without a psql session.

**Convergence latch (`fleet_restart.drainedat`):** the reconcile stamps `drainedat` the first tick
it observes **0 DB instances AND 0 Agones GameServers**, and stops the drain fan-out from then on.
This is what makes R3 Step 5's ordering ("scale up, _then_ clear `active`") safe — without the
latch, the still-active row would drain-label the new-version fleet as it registers.
`/fleet-restart/status.safe_to_roll` is durable off the latch (it does not flip back to `false`
when the cutover's scale-up brings new GameServers up). The trigger upsert resets `drainedat` to
`NULL` on (re)activation.

**⚠️ ROWS image rollback mid-restart strands the lockout.** A pre-fleet-restart ROWS image honors
`admission_control.acceptnewjoins=false` (Phase 2) but has no reconcile to lift it. Before rolling
the ROWS image back while a restart is active:

```sql
-- 1. clear the restart; 2. lift the lockout it owned (the old image will never do either)
UPDATE fleet_restart SET active = false WHERE customerguid = '<tenant-guid>';
UPDATE admission_control SET acceptnewjoins = NULL
WHERE customerguid IN (SELECT customerguid FROM fleet_restart WHERE lockoutapplied);
UPDATE fleet_restart SET lockoutapplied = false WHERE customerguid = '<tenant-guid>';
```

**Aggressive stall (no auto-lift):** if force-deallocation cannot converge (Agones down,
unresolvable GameServer names), the reconcile logs an `error!` past the stall SLA and
`/fleet-restart/status` reports `stalled=true`, but the lockout is deliberately **not**
auto-lifted — lifted joins would land on instances the deadline backstop force-drops on the next
tick. Recovery is operator action: restore Agones, or clear the restart.

- [ ] Commit — `docs(rows): fleet-restart runbook + orchestrator contract`.

---

## Phase 4 — End-to-end version rollout

Phase 3 gives ROWS the drain mechanism and the `safe_to_roll` signal. Phase 4 turns "bump the beta version" into a safe ship with zero mixed-version coexistence. It supersedes the manual delete-the-pod flow. R0 is a hard prerequisite — until the server version is pinned, the barrier downstream cannot be trusted (see Preconditions).

### R0 (BLOCKER / prerequisite) — version-pinned binary delivery

Make the running server version an explicit, immutable selector so a pod restart never changes version and a rollout is a deliberate template change the orchestrator can gate. The publish never deletes the old version: it adds the new path and keeps at least N-1, so a rollback is a re-pin, not a re-cook.

**Files:**

- Modify: `apps/kube/agones/rows-tenants/chuckrpg-{beta,prod,dev}/manifests/fleet.yaml`
- Modify: the CI job that populates the `ows-server-build` PVC (trace from `ows-build-reporter` / the job that cooks `chuckServer.sh`; pin the exact job here).

- [ ] **Step 1: Stage builds into versioned, immutable paths.** Publish writes `/server/<version>/LinuxServer/chuckServer.sh` (e.g. `/server/0.3.46/...`) and stops overwriting `latest/` (keep `latest/` only as a human convenience symlink the Fleet never references).
- [ ] **Step 2: Pin the Fleet to an explicit version** via env so the template diff is the rollout trigger:

```yaml
# fleet.yaml — ue5-server container
env:
    - name: OWS_SERVER_VERSION
      value: '0.3.46' # bumped by the gated post-publish PR; the ONLY rollout trigger
    - name: OWS_SERVER_BIN
      value: /server/$(OWS_SERVER_VERSION)/LinuxServer/chuckServer.sh
template:
    metadata:
        labels:
            ows.kbve.com/server-version: '0.3.46' # so Agones treats a version change as a new template
```

- [ ] **Step 3: Remove the `find … | tail -1` "auto-detect newest" fallback** in the container command (fleet.yaml lines ~77–80) — auto-picking the newest dir re-introduces the silent-upgrade bug. Fail closed if the pinned version is absent.
- [ ] **Step 4 (GATING — verify before committing to the rest of R0/Phase 4):** Confirm the `ows-server-build` PVC access mode supports concurrent versioned dirs (shared **RWX or ROX**); old pods keep reading their `<old-version>/` dir while the new build lands in `<new-version>/`, with no mutation of in-use files. **If the PVC is `RWO`, the entire version-pinned-coexistence premise is impossible** (old and new pods can't both mount it across nodes) and the rollout design must change (per-version PVC, or an init-container that copies the pinned build into an `emptyDir`) — resolve this _first_, not mid-implementation. Record the verified access mode here.
- [ ] **Step 5: Set `terminationGracePeriodSeconds` on the Fleet pod spec to exceed the measured save budget** (unset ⇒ 30s ⇒ SIGKILL can eat saves mid-drain). Pin it to the **actual measured** worst-case save duration (+ margin), not a guessed round number; record the measurement. Same fleet.yaml edit.
- [ ] **Step 6: Retention GC, never delete at publish time.** Add a `prune-old-server-builds` job that deletes `<version>/` only when `deploy_state.rolled=true` for a newer version AND `<version>` is older than the retained window (keep current + N-1). It runs after R3's soak confirmation, never during a cutover.
- [ ] **Step 7: Commit** — `fix(chuck): pin UE server to versioned build path, drop mutable latest/, retain N-1, set TGPS`.

---

### R1 (BLOCKER) — version-parity gate: server roll waits for the Windows client build

A server speaking a new protocol with no client to speak it bounces every player and none can reconnect. Gate the roll on client⟷server parity at the post-publish / dispatch layer (not ROWS). For image-tagged services the existing `utils-post-publish.yml` auto-PR bumps `version.toml` + the deployment `image:` tag in one commit (e.g. PR #13262, axum-kbve v1.0.211); for chuck the same PR instead bumps `OWS_SERVER_VERSION` (R0) since the UE server version is a PVC path, not an image tag.

**Files:** Modify `.github/workflows/utils-post-publish.yml` (the auto-PR) and/or the rows publish workflow.

- [ ] **Step 1: Define AND pin the client-published signal BEFORE making the check required (C1).** A required status check whose data source is undefined or flaky blocks _every_ server post-publish PR. Recommended and pinned here: a `client_versions(version, platform, published_at)` row written by the client build job, so the check is a cheap DB/HTTP lookup with no third-party coupling. (Alternatives — launcher manifest entry, itch/Steam channel API — are explicitly NOT chosen; pick one source and commit before Step 2.) Define the **break-glass override** (a maintainer label or env that lets a human merge past a red parity check for a genuine emergency) at the same time, so a signal-writer outage can't hard-block all rolls.
- [ ] **Step 2: Add a required status check** `version-parity/windows` on the rows post-publish PR that is red until the matching Windows client build for that version is published (sourced from the Step 1 `client_versions` signal). The PR cannot merge while red, except via the Step 1 break-glass. Merge is the deliberate, reviewable roll trigger; it bumps `OWS_SERVER_VERSION`.
- [ ] **Step 3: Scope to beta first** (prod not live). The automated sync fires only once both the server build and the Windows client build for the version exist.
- [ ] **Step 4: Defense-in-depth at runtime (cross-repo, UE side).** The CI gate prevents the _bad ordering_; back it with a runtime check so a stale client that does connect is handled gracefully. The existing `ows.kbve.com/version` label + UE-contract obligation #12 (client-version gate): a connecting client below the required version gets an "update required" signal, not a raw disconnect. ROWS publishes the required version via `/health.unreal_version` (Task 5b); the UE server enforces the floor on connect. Spec'd in `apps/rows/docs/2026-06-24-ue-chuck-drain-contract.md`.
- [ ] **Step 5: Commit** — `feat(ci): version-parity gate (windows client) on rows server roll`.

---

### R2 (BLOCKER) — migration safety (expand-contract)

The `dbmate` migration runs at the barrier before the new binary launches. If the new binary is bad and you roll back, the old binary runs on the new schema — so every migration shipped with a binary roll must be additive, and rollback is forward-fix only (no `dbmate down`).

**Files:** Modify CI (a migration-lint step) + the runbook.

- [ ] **Step 1:** Add a CI guard that flags non-additive DDL (DROP COLUMN/TABLE, NOT NULL without default, type narrowing) in a migration shipping alongside a server-version bump. Treat this lint as **advisory/heuristic** — pattern-matching DDL leaks (a `NOT NULL` added in a later `ALTER`, a type change via `USING`, a rename), so it catches the obvious cases but is not the real guarantee.
- [ ] **Step 2 (the real guard — C2):** Add a pre-deploy compat test that runs the **N-1 binary against schema N** and asserts it boots + serves. This, not the Step 1 lint, is what actually proves a rollback is safe; the lint is the cheap fast-fail in front of it. Block the roll on this test, not just the lint.
- [ ] **Step 3:** Document forward-fix recovery in the runbook: rollback is a re-pin of `OWS_SERVER_VERSION` to the retained old build; never `dbmate down`.
- [ ] **Step 4: Commit** — `feat(ci): expand-contract migration guard + N-1 compat test`.

---

### R3 (BLOCKER) — the deploy orchestrator: drain → all-old-gone barrier → cutover

> **⚠️ BLOCKED — do not attempt to execute R3 live until the chuck login-crash clears.** The live cutover is untestable while the beta fleet sits at `replicas:0` and servers hang at login (`project_chuckrpg_ready_hang` — never reach Agones `Ready()`; see Preconditions). The orchestrator manifest (Step 9 deliverable) can be _authored_, but its drain→barrier→cutover→soak loop cannot be validated end-to-end until a server actually reaches `Ready()`. R4's endpoint and R5's gate are buildable now (API + DB), but the aggressive _cutover_ they drive is blocked on the same crash.

On merge of the gated PR, do a non-aggressive roll and only roll the new build once every old server is gone. ROWS only signals (`safe_to_roll`); this named orchestrator sequences the cutover. Because chuck's Fleet is `RollingUpdate, maxSurge:25%` under Argo `automated.prune:true`, a bare template apply would surge new pods alongside draining old ones — so the cutover must scale to 0 first.

**Files:**

- Create: an Argo Workflow (or Argo Rollouts / PreSync hook) under `apps/kube/.../chuckrpg-*/` — `rollout-orchestrator.yaml`.
- Modify: `fleet.yaml` strategy for the cutover window (`maxSurge: 0`).

- [ ] **Step 1:** On merge, open a non-aggressive `fleet_restart` (`urgency=0, dropplayers=false, lockout=true`). ROWS drains to natural-empty.
- [ ] **Step 2:** Poll `GET /fleet-restart/status` for `safe_to_roll == true` (DB `draining==0` and Agones `gameservers==0`). No timeout on the non-aggressive path; the aggressive path (R4) supplies the deadline.
- [ ] **Step 3:** Scale the Fleet to 0 and confirm 0 GameServers (pods reaped, grace period elapsed). Set `strategy.rollingUpdate.maxSurge: 0` for the cutover so no new-version pod co-exists with an old one.
- [ ] **Step 4:** Apply the version bump (`OWS_SERVER_VERSION`) and run the `dbmate` migration Job — now, at the barrier, with zero old binaries running (migration must be additive, R2).
- [ ] **Step 5:** Scale the Fleet back up (new version), restore `maxSurge:25%`, then clear the `fleet_restart` row (`active=false`, or `POST /fleet-restart/clear`); ROWS auto-lifts the lockout. This ordering is safe because the `drainedat` latch (stamped when the barrier opened in Step 3) has already stopped the reconcile's drain fan-out — the new fleet registering while the row is still active is NOT drained.
- [ ] **Step 6:** Confirm the new version is healthy before marking the roll done or deleting the old build: wait until `readyReplicas >= desired` with GameServers carrying the new `ows.kbve.com/server-version` label Ready for a soak window (≥5 min, no crash-loop — the live guard against the known login-crash class). On success, set `deploy_state.rolled=true`. The old `/server/<old-version>/` dir is not pruned here; the R0 GC removes it later, keeping N-1.
- [ ] **Step 7:** On a FAILED soak, no auto-rollback: set `deploy_state.health='unhealthy'` so `https://api-beta.chuckrpg.com/health` reports `deploy_healthy:false` + `failing_version` (Task 5b), externally visible and alertable. `deploy_state.rolled` stays `false` (update still pending). The orchestrator halts; a human decides.
- [ ] **Step 8:** Document manual rollback as a fast re-pin (operator-initiated): set `OWS_SERVER_VERSION` back to `<old-version>` and re-run the cutover (Steps 1–5), typically via the R4 trigger. No `dbmate down`.
- [ ] **Step 9: Commit** — `feat(kube): chuck rollout orchestrator (scale-to-0 cutover, confirm-then-mark, unhealthy-on-fail)`.

---

### R4 — aggressive "N minutes to restart" trigger endpoint (cluster-internal only)

A dashboard button triggers an aggressive roll — "5 minutes till restart," save-then-disconnect at the deadline — via an API route. The route is not public; a separate gateway service handles dashboard auth.

**Files:** Modify `apps/rows/src/rest/system.rs`, `apps/rows/src/repo/instances.rs`

**Interfaces:**

- Produces: `POST /fleet-restart/trigger` body `{ mode: "aggressive"|"non_aggressive", grace_secs?: i64 }` → upserts the `fleet_restart` row. Aggressive ⇒ `urgency=1, dropplayers=true`, `draindeadline = now() + grace_secs` (default 300s), `lockout=true`. Non-aggressive ⇒ `urgency=0, dropplayers=false, draindeadline=NULL`. Either mode resets `startedat=now()`, `lockoutapplied=false`, **and `lockout=true`** on (re)activation (so the stall clock and lockout ownership are correct, and a prior stage-2 auto-lift that set `lockout=false` doesn't leave the re-triggered restart unable to re-lock — see Task 4 Step 3 / Task 7). Returns `409 Conflict` if a restart is already `active`; returns `404 Not Found` for aggressive mode unless an update is pending (R5). Backed by a new `set_fleet_restart(tenant, mode, grace_secs, deadline)` repo upsert (mirrors `set_admission`).

- [ ] **Step 1: Implement the handler** — validate `mode`, compute the deadline, upsert. The deadline is written to the `fleet_restart` row; the reconcile passes it to `set_drain_state(... deadline ...)` and enforces it (Task 4 Step 3).
- [ ] **Step 2: Player countdown.** ROWS supplies `drain_deadline`; the "restarting in X" message is UE-rendered. Today `ShutdownNotifier` is logging-only — wiring the real broadcast is a UE-side obligation (cross-repo).
- [ ] **Step 3: NOT public AND authenticated (SECURITY — HIGH-1).** This is a **mutating** route that force-disconnects players, so the Task 5 Step 3 rule applies at full strength: a NetworkPolicy cannot keep GameServers (which share port 4322) off this path. Require app-level auth (gateway-held bearer token / mTLS) **or** move the mutating routes to a gateway-only port. The R5 `404-unless-pending` gate narrows _when_ it fires, not _who_ can call it — it is not an access control. Never rely on "cluster-internal" alone for the aggressive trigger.
- [ ] **Step 4: Commit** — `feat(rows): POST /fleet-restart/trigger (aggressive deadline, cluster-internal)`.

---

### R5 — gate the trigger on an actual pending update

The aggressive route (and the dashboard button) is only available when an update is actually pending — you can't restart-to-deploy with nothing to deploy.

**Files:** Modify `apps/rows/src/rest/system.rs`, `apps/rows/src/repo/instances.rs`. Depends on the `deploy_state` table (Task 8 — build it first).

**Interfaces:**

- Produces: `GET /fleet-restart/pending` → `{ pending: bool, target_version: string|null }`.

- [ ] **Step 1: Implement `get_pending_update(tenant)`** — reads `deploy_state(tenant, target_version, rolled, health)`: written `rolled=false, health='healthy'` by the R1 post-merge hook; `rolled` set `true` by the R3 orchestrator only after the soak confirms healthy (R3 Step 6); `health='unhealthy'` on failed soak (R3 Step 7). `pending = row exists && !rolled`. Degrade on 42P01 (inert).
- [ ] **Step 2:** `POST /fleet-restart/trigger` (aggressive) returns `404` when `!pending`; the dashboard greys out the button off the same `GET /fleet-restart/pending`. The non-aggressive auto-path doesn't need this gate (the merge is what creates the pending state).
- [ ] **Step 3: Commit** — `feat(rows): pending-update gate for fleet-restart trigger`.

---

### Task 8: `deploy_state` table (backs R5 + Task 5b)

**Files:** Create `packages/data/sql/dbmate/migrations/20260629130000_ows_deploy_state.sql` + `packages/data/sql/schema/ows/deploy_state.sql`.

- [ ] **Step 1: Migration** (timestamp after Task 1's `20260629120000`):

```sql
-- migrate:up
SET search_path TO ows;
CREATE TABLE IF NOT EXISTS deploy_state
(
    CustomerGUID  UUID    NOT NULL,
    TargetVersion TEXT    NOT NULL,
    Rolled        BOOLEAN NOT NULL DEFAULT false,
    Health        TEXT    NOT NULL DEFAULT 'healthy',
    UpdatedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT PK_DeployState PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_health CHECK (Health IN ('healthy','unhealthy'))
);
ALTER TABLE deploy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON deploy_state FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON deploy_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON deploy_state TO ows;
CREATE POLICY ows_access ON deploy_state FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON deploy_state FOR ALL TO service_role USING (true) WITH CHECK (true);
-- migrate:down
SET search_path TO ows;
DROP TABLE IF EXISTS deploy_state;
```

- [ ] **Step 2: Reference schema** mirroring the above.
- [ ] **Step 3 (MEDIUM-3 — seed the current version, or `/health.unreal_version` stays `null`).** An empty `deploy_state` means `get_served_version` returns `None` and `/health.unreal_version` is `null` until the **first** R3 orchestrated roll ever sets `rolled=true` — and R3 is BLOCKED on the chuck login-crash. That leaves Task 5b's whole purpose (an authoritative launcher target) unmet from migration day. Seed the currently-served build in the same migration so the row exists immediately:

```sql
-- migrate:up  (append, after the CREATE TABLE above)
INSERT INTO deploy_state (customerguid, targetversion, rolled, health)
SELECT '<tenant-guid>', '<current-served-version>', true, 'healthy'
ON CONFLICT (customerguid) DO NOTHING;
```

`<current-served-version>` = the version currently sitting in the PVC (`0.3.46` at time of writing — confirm against `latest/` before shipping). If the tenant guid isn't known at migration time, seed it from a one-shot ROWS startup upsert instead (guarded by `ON CONFLICT DO NOTHING` so it never overwrites a real roll). **Task 5b Step 2 must also define the null case:** if `deploy_state` is genuinely absent (42P01) AND the in-memory value is `None`, `/health.unreal_version` is `null` and the launcher treats that as "no authoritative target — do not auto-download; surface a maintenance state," never as "any version is fine."

- [ ] **Step 4: Commit** — `feat(rows): deploy_state table + current-version seed (rollout target + health)`.

---

### Requirement → task traceability

| #   | Requirement                                                | Task(s)                    | Notes                                                                          |
| --- | ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| 0   | Don't pull mutable `latest`; pin the version               | R0                         | Prereq for everything; kills accidental mixed-version                          |
| 1   | Bump beta builds game + server                             | R1 + existing build CI     | Build is the existing pipeline; the gate is new                                |
| 2   | Server waits for Windows client build                      | R1                         | Required merge status check; signal source = `client_versions` (open decision) |
| 3   | Merge → non-aggressive, roll only when all old gone        | R3 + Task 5 `safe_to_roll` | Two-level barrier (DB + Agones), scale-to-0 `maxSurge:0` cutover               |
| 4   | Aggressive "5-min restart" via dashboard API               | R4                         | `POST /fleet-restart/trigger`, deadline 300s, cluster-internal                 |
| 5   | Route only if update pending                               | R5                         | `GET /fleet-restart/pending`; 404 otherwise; button greyed                     |
| +   | Endpoints not public                                       | Task 5 Step 2 + R4 Step 3  | ClusterIP + NetworkPolicy; gateway service owns auth                           |
| +   | No roll until ALL old gone                                 | R3 Step 2–3                | `safe_to_roll = draining==0 && gameservers==0`                                 |
| +   | Delete old version only after new confirmed                | R0 Step 6 + R3 Step 6      | Retain N-1; prune is a post-soak GC                                            |
| +   | No auto-rollback; failed build ⇒ unhealthy + manual re-pin | R3 Step 7–8 + Task 5b      | Failed soak flips `/health` `deploy_healthy:false`                             |
| +   | `/health` reports authoritative PVC version                | Task 5b                    | `unreal_version` from `deploy_state`; launcher downloads matching client       |

---

## Tests to write

- Reconcile lifts the lockout on `active=false` **only when it owns it** (set active+`lockoutapplied=true`, then inactive, assert next tick writes `NULL` and clears `lockoutapplied`).
- **Lockout no-clobber (F3):** with no active fleet_restart but an `admission_control` lockout set by another writer (`lockoutapplied=false`), assert the reconcile leaves `admission_control` untouched across multiple ticks.
- **Advisory-lock survives >1 tick on a multi-connection pool (F1):** with pool size >1, run the reconcile for several ticks against an active restart and assert it keeps acquiring the lock and fanning `set_drain_state` (i.e. lock+unlock ran on the same pinned connection and did not wedge after tick 1). Regression test for the pool-based-unlock bug.
- **Non-aggressive stall surfaces, never disconnects (F2 stage 1):** with the reaper disabled and `startedat` older than `fleet_restart_stall_secs` (but < 2×), assert `/fleet-restart/status` reports `stalled=true`, a warn is emitted, the lockout is **still held**, and **no instance is force-deallocated**.
- **Non-aggressive join-outage cap auto-lifts (HIGH-2 stage 2):** with `startedat` older than `2 × fleet_restart_stall_secs`, assert the reconcile writes `admission_control` back to `NULL` (lockout lifted), clears `lockoutapplied`, sets `fleet_restart.lockout=false`, the restart stays `active` and `stalled=true`, an `error!` is logged, and **still no instance is force-deallocated**. A follow-up tick must NOT re-apply the lockout.
- **Safe-default DB constraints (MEDIUM-4):** assert the migration rejects `INSERT (urgency=0, dropplayers=true)` and `INSERT (urgency=0, draindeadline=now())` with a check-constraint violation; the aggressive `(urgency=1, dropplayers=true, draindeadline set)` row inserts cleanly.
- **Mutating routes reject unauthenticated callers (HIGH-1):** assert `POST /fleet-restart/trigger` without the gateway token (or from a GameServer-equivalent context) returns 401 / is unreachable on the gateway-only port; `GET /fleet-restart/status` from a GameServer context still succeeds.
- **Aggressive deadline is per-instance (MEDIUM-5):** with two active instances, one overdue past `draindeadline` and one not, assert only the overdue GameServer is marked for shutdown and the non-overdue one is untouched (no whole-fleet scale).
- **`/health.unreal_version` non-null after seed (MEDIUM-3):** with `deploy_state` seeded (`rolled=true`), assert `/health.unreal_version` returns the seeded version; with `deploy_state` absent (42P01) and no in-memory value, assert it returns `null` (and `deploy_healthy:true`).
- **Invalid concurrent index is detected (MEDIUM-7):** simulate an `INVALID` `idx_mapinstances_drainable` and assert the post-migration/startup check emits the `warn!`/alert rather than silently seq-scanning.
- Two-replica reconcile race: the advisory lock single-flights — only one replica fans `set_drain_state` per tick.
- Spawn-during-drain: a new instance appearing mid-drain must not pin `safe_to_roll=false` forever once the deadline fires (aggressive) or stall-surfaces (non-aggressive).
- Safe-default control row: a row with unspecified columns never force-disconnects (`urgency=0, dropplayers=false`).
- Degrade-on-missing-table (42P01) for `get_fleet_restart`, `get_pending_update`, `get_served_version`.
- ROWS-crash-mid-drain resume: kill ROWS mid-restart; on restart it re-derives the batch from `drainstate IS NULL` and re-applies/lifts the lockout idempotently.
- No-surge-while-draining: assert the orchestrator never applies the new version while `gameservers > 0`.
- Rollback drill: N-1 binary boots on schema N (R2 compat test).
- TGPS vs save budget: a drained pod completes its save before SIGKILL.

## Deferred / out of scope (tracked, not built here)

- **UE drain-complete ack (W1):** batch convergence + barrier precision use the `status=0` proxy until UE advertises a drain-complete signal. Swap when it lands.
- **Version-selective drain:** the MVP drains all active instances (`target_version` reserved but unused); draining only `≠ target_version` (true rolling) is deferred until the running version is surfaced per-instance. **State plainly in the runbook: whole-fleet-only means every routine roll is a guaranteed full-tenant downtime window** (the scale-to-0 cutover takes the whole fleet down), not a rolling upgrade.
- **Stagger by zone:** this plan staggers by instance (`batch_size`); zone-grouped waves (for per-zone messaging) are a later refinement.
- **Shared advisory-lock helper (follow-up):** `fleet_restart_reconcile` reuses `empty_server_reaper`'s `AdvisoryLockGuard` directly (same file). With two jobs now depending on the same subtle session-lock/pinned-connection pattern, extract `acquire → try-lock → guard → unlock-or-detach` into one shared helper (e.g. `with_tenant_advisory_lock(svc, key, guid, async-fn)`) so a third job can't re-derive the pool-based-unlock bug (F1). Not blocking; do it before the next lock-using job lands.
- **Client-published signal source:** R1 Step 1 recommends `client_versions`, but the final choice (manifest / Steam-itch / DB row) is pinned when the dispatch step is built.
- **UE player-countdown broadcast:** ROWS supplies the deadline; the in-game "restarting in X" render and the `ShutdownNotifier` wiring are UE-side (`apps/rows/docs/2026-06-24-ue-chuck-drain-contract.md`).

## Next up

**Reaper v2 (valkey-backed occupancy) + UE drain contract** — tracked in the lifecycle spec `apps/rows/docs/2026-06-24-rows-server-lifecycle-and-shutdown.md`. Cross-repo / decision-blocked (UE ack, valkey occupancy); each gets its own plan once its blocker clears.

(Previous: Phase 2 Admission → `apps/rows/docs/2026-06-24-rows-drain-admission.md`.)
