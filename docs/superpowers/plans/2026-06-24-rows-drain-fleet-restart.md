# ROWS Drain — Fleet-Restart Orchestration & End-to-End Rollout (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do the tasks in order; each ends in a build + commit.

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
- **End-to-end (Agones barrier + soak) is untestable until chuck servers reach `Ready()`.** Today the beta fleet sits at `replicas:0` and servers hang at login. Tasks 1–5 (DB + signal) are testable now; R3 (the live cutover) is not until the game-side crash clears.

---

### Task 1: `fleet_restart` control table + model

**Files:**

- Create: `packages/data/sql/dbmate/migrations/20260629120000_ows_fleet_restart.sql`
- Create: `packages/data/sql/schema/ows/fleet_restart.sql`
- Modify: `apps/rows/src/config.rs` (control struct)

The migration timestamp must be **after** the Phase 1/2 deps already on `dev` (`20260628212059_ows_mapinstance_drain.sql`, `20260629000000_ows_admission_control.sql`); an earlier timestamp applies out-of-order under dbmate. Column defaults are the non-aggressive values so a stray or automated row never bounces live players; `chk_urgency` matches the runtime `validate_drain_request` domain.

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
    TargetVersion TEXT    NULL,                  -- reserved (version-selective drain; deferred)
    RequestID     UUID    NOT NULL,
    CONSTRAINT PK_FleetRestart PRIMARY KEY (CustomerGUID),
    CONSTRAINT chk_urgency CHECK (Urgency IN (0,1))
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
    #[sqlx(rename = "targetversion")]
    pub target_version: Option<String>,
    #[sqlx(rename = "requestid")]
    pub request_id: uuid::Uuid,
}
```

- [ ] **Step 4: Build.** **Step 5: Commit** — `feat(rows): fleet_restart control table + model`.

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
                targetversion, requestid
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

- [ ] **Step 3:** Add an index to back the per-tick scan (in the Task 1 migration or a follow-up migration): `CREATE INDEX IF NOT EXISTS idx_mapinstances_drainable ON mapinstances (customerguid, status, drainstate);`
- [ ] **Step 4: Build.** **Step 5: Commit** — `feat(rows): fleet-restart repo reads (control, drainable list)`.

---

### Task 3: Admission setter (lockout write)

**Files:** Modify `apps/rows/src/repo/instances.rs`

Reuses Phase 2's `admission_control` table. `Some(false)` sets the lockout; `None` writes SQL `NULL`, which makes admission fall back to the env baseline — i.e. `None` lifts the lockout.

**Interfaces:**

- Produces: `set_admission(tenant, accept_new_joins: Option<bool>) -> Result<(), RowsError>`.

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
```

- [ ] **Step 2: Build.** **Step 3: Commit** — `feat(rows): set_admission upsert (fleet-restart lockout)`.

---

### Task 4: Fleet-restart reconcile job

**Files:** Modify `apps/rows/src/jobs.rs`

The job runs single-flight per tenant via a Postgres advisory lock (mirrors `empty_server_reaper`) so running ROWS with >1 replica does not double-fan `set_drain_state`. It owns the full lockout lifecycle: set it while active, lift it (write `NULL`) when the row is absent or `active=false`. The whole-fleet batch cap is a named constant, not a magic number.

**Interfaces:**

- Consumes: `get_fleet_restart`, `list_drainable_instances`, `set_admission` (Task 3), `set_drain_state` (Phase 1), `count_active_instances`.
- Produces: a `fleet_restart_reconcile` task in `spawn_all`; a `const FLEET_DRAIN_CAP: i64 = 4096;`; an `unlock_fleet_restart` helper.

- [ ] **Step 1: Add the task to `spawn_all`** alongside the others:

```rust
    tokio::spawn(fleet_restart_reconcile(svc.clone()));
```

- [ ] **Step 2: Implement** (30s cadence, mirrors the reaper loop):

```rust
const FLEET_DRAIN_CAP: i64 = 4096; // whole-fleet (!stagger) batch cap

async fn fleet_restart_reconcile(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;
    loop {
        interval.tick().await;
        let guid = svc.state().config.customer_guid;
        let repo = InstanceRepo(&svc.state().db);

        // Single-flight per tenant so a multi-replica ROWS does not double-fan set_drain_state.
        let locked = sqlx::query_scalar::<_, bool>(
            "SELECT pg_try_advisory_lock(hashtext('rows-fleet-restart'), hashtext($1))",
        )
        .bind(guid.to_string())
        .fetch_one(&svc.state().db)
        .await
        .unwrap_or(false);
        if !locked {
            continue; // another replica owns this tenant's reconcile this tick
        }
        // From here, every path MUST release the advisory lock before `continue`/loop.

        let fr = match repo.get_fleet_restart(guid).await {
            Ok(Some(fr)) if fr.active => fr,
            // No active restart (absent row OR active=false): the reconciler owns the lockout
            // lifecycle, so lift it. set_admission(None) writes NULL -> admission falls back to the
            // env baseline (joins allowed). Idempotent: safe every tick and on cold-start resume.
            Ok(_) => {
                if let Err(e) = repo.set_admission(guid, None).await {
                    warn!(error = %e, "fleet-restart: failed to lift lockout");
                }
                unlock_fleet_restart(&svc, guid).await;
                continue;
            }
            Err(e) => {
                warn!(error = %e, "fleet-restart: read failed");
                unlock_fleet_restart(&svc, guid).await;
                continue;
            }
        };

        // Hold the lockout while the restart runs (travel still allowed — see Phase 2).
        if fr.lockout {
            if let Err(e) = repo.set_admission(guid, Some(false)).await {
                warn!(error = %e, "fleet-restart: failed to set lockout");
            }
        }

        // Batch source: instances not yet draining. Whole-fleet if !stagger.
        let limit = if fr.stagger { fr.batch_size.max(1) as i64 } else { FLEET_DRAIN_CAP };
        let batch = match repo.list_drainable_instances(guid, limit).await {
            Ok(b) => b,
            Err(e) => {
                warn!(error = %e, "fleet-restart: list failed");
                unlock_fleet_restart(&svc, guid).await;
                continue;
            }
        };

        for id in &batch {
            if let Err(e) = repo
                .set_drain_state(guid, *id, 1 /*draining*/, fr.urgency, fr.drop_players,
                                 &fr.reason, fr.request_id, None)
                .await
            {
                warn!(error = %e, instance_id = id, "fleet-restart: set_drain_state failed");
            }
        }

        let remaining = repo.count_active_instances(guid).await.unwrap_or(-1);
        info!(active = remaining, staggered = fr.stagger, batch = batch.len(),
              "fleet-restart: reconcile tick");
        // remaining == 0 is the DB all-drained signal (exposed via REST in Task 5). It only reaches
        // 0 once instances hit status=0, which ONLY empty_server_reaper writes (set_drain_state
        // rejects state=0). So convergence depends on the reaper running and on the deadline below.

        unlock_fleet_restart(&svc, guid).await;
    }
}

/// Best-effort release of the per-tenant reconcile advisory lock.
async fn unlock_fleet_restart(svc: &Arc<OWSService>, guid: Uuid) {
    let _ = sqlx::query("SELECT pg_advisory_unlock(hashtext('rows-fleet-restart'), hashtext($1))")
        .bind(guid.to_string())
        .execute(&svc.state().db)
        .await;
}
```

When `stagger`, each tick drains the next `batch_size` instances not yet draining; as earlier instances finish (rows leave `status>0`), later ticks pick up the rest. Without a UE drain-complete ack, a batch is gated on instances still being `drainstate IS NULL`, not on the previous batch fully completing — good enough to avoid re-draining, but it is not strict wave-by-wave isolation; do not document it as such.

- [ ] **Step 3: Enforce a per-restart deadline so a stuck instance can't pin the fleet forever.** A hung instance never leaves `status>0`, so `count_active` never reaches 0 and the lockout would stay on indefinitely. When `fr` carries a deadline (aggressive path, R4) and it has passed, force-deallocate overdue instances via Agones (reuse the deallocate path behind `restart_fleet`'s scale logic) and/or exclude them from the active count. Define the "stuck" SLA in the runbook (Task 6).
- [ ] **Step 4: Build + tests** — `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail`. **Step 5: Commit** — `feat(rows): fleet-restart reconcile job (drain fan-out + lockout lifecycle + deadline)`.

---

### Task 5: Two-level all-drained status endpoint

**Files:** Modify `apps/rows/src/rest/system.rs`

`count_active_instances` is a DB-row count: an instance can be at `status=0` while its pod is still alive (flushing a save, mid-SIGTERM, grace period not elapsed). Rolling on that alone risks a mixed-version window. So the barrier is two-level — the DB count is the _necessary_ trigger to begin the cutover; the Agones GameServer count hitting 0 is the _sufficient_ "all old gone" gate.

**Interfaces:**

- Consumes: `get_fleet_restart`, `count_active_instances`, a new `count_gameservers(tenant)` (Agones list, label `app.kubernetes.io/instance=<tenant>`, reusing the in-cluster client behind `restart_fleet`'s scale calls).
- Produces: `GET /fleet-restart/status` → `{ active: bool, draining: i64, gameservers: i64, all_drained: bool, safe_to_roll: bool }` where `all_drained = active && draining == 0` and `safe_to_roll = all_drained && gameservers == 0`.

- [ ] **Step 1: Add the handler** (match the file's actual axum handler/registration style):

```rust
async fn fleet_restart_status(State(hs): State<HandlerState>) -> ApiResult<FleetRestartStatus> {
    let guid = hs.app.config.customer_guid;
    let repo = InstanceRepo(&hs.app.db);
    let active = matches!(repo.get_fleet_restart(guid).await?, Some(fr) if fr.active);
    let draining = repo.count_active_instances(guid).await?;
    let gameservers = hs.app.count_gameservers(guid).await?; // Agones GS list, label-filtered
    let all_drained = active && draining == 0;
    let safe_to_roll = all_drained && gameservers == 0;
    Ok(axum::Json(FleetRestartStatus { active, draining, gameservers, all_drained, safe_to_roll }))
}
```

- [ ] **Step 2: Keep this route NOT public.** Expose it only on the cluster-internal Service (`rows.<ns>.svc.cluster.local:4322`, the same one GameServers already call) — no Ingress/Gateway route. Add a NetworkPolicy in the `rows` namespace allowing ingress to the fleet-restart paths only from the orchestrator/dashboard-gateway pod(s), default-deny otherwise. ROWS does not implement user auth on these routes; it trusts the in-cluster caller, and the dashboard gateway enforces RBAC upstream (same trust model as GameServer→ROWS calls today).
- [ ] **Step 3: Build + tests.** **Step 4: Commit** — `feat(rows): /fleet-restart/status two-level (DB+Agones) safe-to-roll signal`.

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
- [ ] **Step 3 (launcher contract):** Document that the launcher polls `/health.unreal_version` as the required client version and downloads the matching build; `pending_version` is informational. This is the runtime half of the version-parity gate (the CI half is R1).
- [ ] **Step 4:** Do **not** fail `/ready` on `deploy_healthy:false` — keep `/ready` purely DB/pod liveness so a bad game build doesn't deregister the ROWS API pod the dashboard, launcher, and orchestrator depend on. `deploy_healthy` is advisory on `/health` only.
- [ ] **Step 5: Commit** — `feat(rows): /health reports authoritative PVC version + deploy_healthy (launcher + rollback surface)`.

---

### Task 6: Supersede the legacy `restart_fleet` + give the barrier a terminal state

**Files:** Modify `apps/rows/src/rest/system.rs`

The imperative `POST /api/System/RestartFleet` (scale-to-0 → `delete_all_map_instances` → scale-up) still exists and force-drops every player. If an operator fires it during an in-flight cooperative drain, it deletes instances out from under the reconcile. The cooperative flow must supersede it.

Separately, `all_drained`/`safe_to_roll` flip back to `false` the moment the operator clears `active`, so an orchestrator that re-polls after clearing reads "not drained." Give the rollout a terminal state so completion is unambiguous.

- [ ] **Step 1:** Guard `restart_fleet` to refuse (HTTP 409) while a `fleet_restart` row is `active`, directing the caller to the cooperative flow. Keep it as a break-glass for when ROWS itself is the problem.
- [ ] **Step 2:** Treat the completion of a roll as "operator/orchestrator sets `active=false` after a confirmed scale-up," not as a `safe_to_roll` reading. Document that a post-clear `/fleet-restart/status` returning `all_drained=false` is expected. The durable terminal record is `deploy_state.rolled=true` (Task 8), which the orchestrator sets after the soak (R3).
- [ ] **Step 3: Build.** **Step 4: Commit** — `feat(rows): guard legacy restart_fleet against cooperative drain`.

---

### Task 7: Runbook + spec cross-reference

**Files:** Modify `docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md`

- [ ] Document the operator flow: the SQL to trigger/clear a restart, the lockout behaviour (lifted automatically by the reconcile — never delete `admission_control` by hand), the `safe_to_roll` polling contract, the stuck-instance deadline, and the named-orchestrator handoff. Trigger SQL:

```sql
SET search_path TO ows;

-- Routine version roll (NON-AGGRESSIVE, safe-by-default): drain-to-natural-empty, no forced
-- disconnects. urgency=0, dropplayers=false. The default path.
INSERT INTO fleet_restart (customerguid, active, reason, urgency, dropplayers, stagger, batchsize, lockout, requestid)
VALUES ('<tenant-guid>', true, 'fleet-restart', 0, false, false, 1, true, gen_random_uuid())
ON CONFLICT (customerguid) DO UPDATE SET active = true, urgency = 0, dropplayers = false, requestid = gen_random_uuid();

-- Urgent / security roll (AGGRESSIVE, dashboard opt-in only): save-then-disconnect at the deadline.
-- urgency=1, dropplayers=true. Never the automated default.
-- ... DO UPDATE SET active = true, urgency = 1, dropplayers = true, requestid = gen_random_uuid();

-- After safe_to_roll + deploy: clear it. The reconcile loop lifts the admission lockout itself
-- (set_admission writes NULL) on the next tick. Do NOT manually DELETE admission_control — a manual
-- two-statement teardown silently locks players out if the second statement is missed.
UPDATE fleet_restart SET active = false WHERE customerguid = '<tenant-guid>';
```

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
- [ ] **Step 4:** Confirm the `ows-server-build` PVC access mode supports concurrent versioned dirs (shared RWX/ROX); old pods keep reading their `<old-version>/` dir while the new build lands in `<new-version>/`, with no mutation of in-use files.
- [ ] **Step 5: Set `terminationGracePeriodSeconds` on the Fleet pod spec to exceed the save budget** (unset ⇒ 30s ⇒ SIGKILL can eat saves mid-drain). Same fleet.yaml edit.
- [ ] **Step 6: Retention GC, never delete at publish time.** Add a `prune-old-server-builds` job that deletes `<version>/` only when `deploy_state.rolled=true` for a newer version AND `<version>` is older than the retained window (keep current + N-1). It runs after R3's soak confirmation, never during a cutover.
- [ ] **Step 7: Commit** — `fix(chuck): pin UE server to versioned build path, drop mutable latest/, retain N-1, set TGPS`.

---

### R1 (BLOCKER) — version-parity gate: server roll waits for the Windows client build

A server speaking a new protocol with no client to speak it bounces every player and none can reconnect. Gate the roll on client⟷server parity at the post-publish / dispatch layer (not ROWS). For image-tagged services the existing `utils-post-publish.yml` auto-PR bumps `version.toml` + the deployment `image:` tag; for chuck the same PR instead bumps `OWS_SERVER_VERSION` (R0).

**Files:** Modify `.github/workflows/utils-post-publish.yml` (the auto-PR) and/or the rows publish workflow.

- [ ] **Step 1: Define the client-published signal.** Recommended: a `client_versions(version, platform, published_at)` row written by the client build job, so the check is a cheap DB/HTTP lookup with no third-party coupling. (Alternatives: launcher manifest entry, itch/Steam channel API.)
- [ ] **Step 2: Add a required status check** `version-parity/windows` on the rows post-publish PR that is red until the matching Windows client build for that version is published. The PR cannot merge while red. Merge is the deliberate, reviewable roll trigger; it bumps `OWS_SERVER_VERSION`.
- [ ] **Step 3: Scope to beta first** (prod not live). The automated sync fires only once both the server build and the Windows client build for the version exist.
- [ ] **Step 4: Commit** — `feat(ci): version-parity gate (windows client) on rows server roll`.

---

### R2 (BLOCKER) — migration safety (expand-contract)

The `dbmate` migration runs at the barrier before the new binary launches. If the new binary is bad and you roll back, the old binary runs on the new schema — so every migration shipped with a binary roll must be additive, and rollback is forward-fix only (no `dbmate down`).

**Files:** Modify CI (a migration-lint step) + the runbook.

- [ ] **Step 1:** Add a CI guard that rejects non-additive DDL (DROP COLUMN/TABLE, NOT NULL without default, type narrowing) in a migration shipping alongside a server-version bump.
- [ ] **Step 2:** Add a pre-deploy compat test: run the N-1 binary against schema N and assert it boots + serves.
- [ ] **Step 3:** Document forward-fix recovery in the runbook: rollback is a re-pin of `OWS_SERVER_VERSION` to the retained old build; never `dbmate down`.
- [ ] **Step 4: Commit** — `feat(ci): expand-contract migration guard + N-1 compat test`.

---

### R3 (BLOCKER) — the deploy orchestrator: drain → all-old-gone barrier → cutover

On merge of the gated PR, do a non-aggressive roll and only roll the new build once every old server is gone. ROWS only signals (`safe_to_roll`); this named orchestrator sequences the cutover. Because chuck's Fleet is `RollingUpdate, maxSurge:25%` under Argo `automated.prune:true`, a bare template apply would surge new pods alongside draining old ones — so the cutover must scale to 0 first.

**Files:**

- Create: an Argo Workflow (or Argo Rollouts / PreSync hook) under `apps/kube/.../chuckrpg-*/` — `rollout-orchestrator.yaml`.
- Modify: `fleet.yaml` strategy for the cutover window (`maxSurge: 0`).

- [ ] **Step 1:** On merge, open a non-aggressive `fleet_restart` (`urgency=0, dropplayers=false, lockout=true`). ROWS drains to natural-empty.
- [ ] **Step 2:** Poll `GET /fleet-restart/status` for `safe_to_roll == true` (DB `draining==0` and Agones `gameservers==0`). No timeout on the non-aggressive path; the aggressive path (R4) supplies the deadline.
- [ ] **Step 3:** Scale the Fleet to 0 and confirm 0 GameServers (pods reaped, grace period elapsed). Set `strategy.rollingUpdate.maxSurge: 0` for the cutover so no new-version pod co-exists with an old one.
- [ ] **Step 4:** Apply the version bump (`OWS_SERVER_VERSION`) and run the `dbmate` migration Job — now, at the barrier, with zero old binaries running (migration must be additive, R2).
- [ ] **Step 5:** Scale the Fleet back up (new version), restore `maxSurge:25%`, then clear the `fleet_restart` row (`active=false`); ROWS auto-lifts the lockout.
- [ ] **Step 6:** Confirm the new version is healthy before marking the roll done or deleting the old build: wait until `readyReplicas >= desired` with GameServers carrying the new `ows.kbve.com/server-version` label Ready for a soak window (≥5 min, no crash-loop — the live guard against the known login-crash class). On success, set `deploy_state.rolled=true`. The old `/server/<old-version>/` dir is not pruned here; the R0 GC removes it later, keeping N-1.
- [ ] **Step 7:** On a FAILED soak, no auto-rollback: set `deploy_state.health='unhealthy'` so `https://api-beta.chuckrpg.com/health` reports `deploy_healthy:false` + `failing_version` (Task 5b), externally visible and alertable. `deploy_state.rolled` stays `false` (update still pending). The orchestrator halts; a human decides.
- [ ] **Step 8:** Document manual rollback as a fast re-pin (operator-initiated): set `OWS_SERVER_VERSION` back to `<old-version>` and re-run the cutover (Steps 1–5), typically via the R4 trigger. No `dbmate down`.
- [ ] **Step 9: Commit** — `feat(kube): chuck rollout orchestrator (scale-to-0 cutover, confirm-then-mark, unhealthy-on-fail)`.

---

### R4 — aggressive "N minutes to restart" trigger endpoint (cluster-internal only)

A dashboard button triggers an aggressive roll — "5 minutes till restart," save-then-disconnect at the deadline — via an API route. The route is not public; a separate gateway service handles dashboard auth.

**Files:** Modify `apps/rows/src/rest/system.rs`, `apps/rows/src/repo/instances.rs`

**Interfaces:**

- Produces: `POST /fleet-restart/trigger` body `{ mode: "aggressive"|"non_aggressive", grace_secs?: i64 }` → upserts the `fleet_restart` row. Aggressive ⇒ `urgency=1, dropplayers=true`, `drain_deadline = now() + grace_secs` (default 300s), `lockout=true`. Returns `409 Conflict` if a restart is already `active`; returns `404 Not Found` for aggressive mode unless an update is pending (R5). Backed by a new `set_fleet_restart(tenant, mode, grace_secs, deadline)` repo upsert (mirrors `set_admission`).

- [ ] **Step 1: Implement the handler** — validate `mode`, compute the deadline, upsert. The deadline is written to the `fleet_restart` row; the reconcile passes it to `set_drain_state(... deadline ...)` and enforces it (Task 4 Step 3).
- [ ] **Step 2: Player countdown.** ROWS supplies `drain_deadline`; the "restarting in X" message is UE-rendered. Today `ShutdownNotifier` is logging-only — wiring the real broadcast is a UE-side obligation (cross-repo).
- [ ] **Step 3: Keep it NOT public** — same posture as Task 5 Step 2: cluster-internal Service only, NetworkPolicy allows the dashboard-gateway pod(s), no user auth in ROWS.
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

- [ ] **Step 2: Reference schema** mirroring the above. **Step 3: Commit** — `feat(rows): deploy_state table (rollout target + health)`.

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

- Reconcile lifts the lockout on `active=false` (write `Some(false)`, set inactive, assert next tick writes `NULL`).
- Two-replica reconcile race: the advisory lock single-flights — only one replica fans `set_drain_state` per tick.
- Spawn-during-drain: a new instance appearing mid-drain must not pin `safe_to_roll=false` forever once the deadline fires.
- Safe-default control row: a row with unspecified columns never force-disconnects (`urgency=0, dropplayers=false`).
- Degrade-on-missing-table (42P01) for `get_fleet_restart`, `get_pending_update`, `get_served_version`.
- ROWS-crash-mid-drain resume: kill ROWS mid-restart; on restart it re-derives the batch from `drainstate IS NULL` and re-applies/lifts the lockout idempotently.
- No-surge-while-draining: assert the orchestrator never applies the new version while `gameservers > 0`.
- Rollback drill: N-1 binary boots on schema N (R2 compat test).
- TGPS vs save budget: a drained pod completes its save before SIGKILL.

## Deferred / out of scope (tracked, not built here)

- **UE drain-complete ack (W1):** batch convergence + barrier precision use the `status=0` proxy until UE advertises a drain-complete signal. Swap when it lands.
- **Version-selective drain:** the MVP drains all active instances (`target_version` reserved but unused); draining only `≠ target_version` (true rolling) is deferred until the running version is surfaced per-instance.
- **Stagger by zone:** this plan staggers by instance (`batch_size`); zone-grouped waves (for per-zone messaging) are a later refinement.
- **Client-published signal source:** R1 Step 1 recommends `client_versions`, but the final choice (manifest / Steam-itch / DB row) is pinned when the dispatch step is built.
- **UE player-countdown broadcast:** ROWS supplies the deadline; the in-game "restarting in X" render and the `ShutdownNotifier` wiring are UE-side (`docs/superpowers/plans/2026-06-24-ue-chuck-drain-contract.md`).

## Next up

**Reaper v2 (valkey-backed occupancy) + UE drain contract** — tracked in the lifecycle spec `docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md`. Cross-repo / decision-blocked (UE ack, valkey occupancy); each gets its own plan once its blocker clears.

(Previous: Phase 2 Admission → `docs/superpowers/plans/2026-06-24-rows-drain-admission.md`.)
