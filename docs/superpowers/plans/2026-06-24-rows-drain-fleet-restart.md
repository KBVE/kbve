# ROWS Drain — Fleet-Restart Orchestration Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Depends on:** Phase 1 (`2026-06-24-rows-drain-core.md`, drain state + setter) and Phase 2 (`2026-06-24-rows-drain-admission.md`, the `accept_new_joins` lockout).

**Goal:** Give ROWS the orchestration to drive a coordinated fleet-wide restart — mark every active instance draining, run the new-join lockout, optionally stagger in batches, and emit an "all drained" signal a deploy orchestrator waits on before launching the new binary.

**Architecture:** A DB-backed `fleet_restart` control (env-less; operator/dashboard-written, like `admission_control`) that a background job reconciles: it fans `set_drain_state` across active instances (whole-fleet or in batches), flips the admission lockout near the end, and exposes a `/fleet-restart/status` (active-instance count → "all drained") signal. The actual `dbmate` run + new-image launch stay in the deploy/Argo layer (ROWS only signals). Ships inert: no control row ⇒ the job no-ops.

**Tech Stack:** Rust, axum, sqlx (runtime), Postgres, tokio.

## Global Constraints

(Same as Core/Admission — worktree/PR #13200, conventional commits no co-author, runtime sqlx, dbmate migration + schema mirror, degrade-on-missing-table, inert posture.)

## Decision-blocked holes up front (read first)

- 🕳️ **W1 — drain-complete ack.** Precise batch convergence ("this batch is fully drained, start the next") needs UE's per-instance drain-complete signal, which doesn't exist in the heartbeat yet. **Fill used here:** ROWS uses an *observable proxy* — an instance counts as "drained" when its row reaches `status = 0` (the reaper/lifecycle sets it on teardown) or the GameServer is gone. Less precise than an ack (a slow saver looks not-yet-drained), but safe (it waits rather than races). Swap to the ack when W1 lands.
- 🕳️ **F2 — who launches the new binary.** ROWS emits "all old drained"; a *named orchestrator* (Argo Workflows / a sync-wave gated on the signal / an operator) must consume it, run `dbmate` (migration type), and roll the image. ROWS does not self-launch. The orchestrator is out of this plan.
- 🕳️ **Version targeting.** "drain everything ≠ target_version" needs the running image/version surfaced to ROWS. **Fill used here:** MVP drains **all** active instances (`target_version` column reserved but unused); version-selective drain is deferred.

---

### Task 1: `fleet_restart` control table + model

**Files:**
- Create: `packages/data/sql/dbmate/migrations/20260624160000_ows_fleet_restart.sql`
- Create: `packages/data/sql/schema/ows/fleet_restart.sql`
- Modify: `apps/rows/src/config.rs` (control struct)

**Interfaces:**
- Produces: table `ows.fleet_restart(customerguid uuid pk, active boolean, reason text, urgency smallint, dropplayers boolean, stagger boolean, batchsize int, lockout boolean, targetversion text null, requestid uuid)`; `FleetRestart` (sqlx::FromRow) with snake_case fields via `#[sqlx(rename)]`.

- [ ] **Step 1: Migration** `20260624160000_ows_fleet_restart.sql` (up):

```sql
-- migrate:up
SET search_path TO ows;
CREATE TABLE IF NOT EXISTS fleet_restart
(
    CustomerGUID  UUID    NOT NULL,
    Active        BOOLEAN NOT NULL DEFAULT false,
    Reason        TEXT    NOT NULL DEFAULT 'fleet-restart',
    Urgency       SMALLINT NOT NULL DEFAULT 1,   -- 1 = asap
    DropPlayers   BOOLEAN NOT NULL DEFAULT true,
    Stagger       BOOLEAN NOT NULL DEFAULT false,
    BatchSize     INT     NOT NULL DEFAULT 1,
    Lockout       BOOLEAN NOT NULL DEFAULT true, -- block new joins while active
    TargetVersion TEXT    NULL,                  -- reserved (version-selective drain; hole)
    RequestID     UUID    NOT NULL,
    CONSTRAINT PK_FleetRestart PRIMARY KEY (CustomerGUID)
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

### Task 2: Repo — read control, list/drain active instances, all-drained signal

**Files:** Modify `apps/rows/src/repo/instances.rs`

**Interfaces:**
- Produces:
  - `get_fleet_restart(tenant) -> Result<Option<FleetRestart>, RowsError>` (None on row-absent OR 42P01).
  - `list_drainable_instances(tenant, limit: i64) -> Result<Vec<i32>, RowsError>` — `status>0` instances **not already draining** (`drainstate IS NULL`), oldest first, capped (the batch source).
  - `count_active_instances(tenant)` already exists (the all-drained signal = `== 0`).

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

> 🕳️ **W1 proxy:** "drainable" excludes already-draining (`drainstate IS NULL`); "drained" is observed as `status>0 → status=0` over time. Without a UE ack, a batch's completion is approximated by those rows leaving `status>0`. `count_active_instances == 0` is the all-drained signal.

- [ ] **Step 3: Build.** **Step 4: Commit** — `feat(rows): fleet-restart repo reads (control, drainable list)`.

---

### Task 3: Fleet-restart reconcile job

**Files:** Modify `apps/rows/src/jobs.rs`

**Interfaces:**
- Consumes: `get_fleet_restart`, `list_drainable_instances`, `set_drain_state` (Core Task 4),
  `count_active_instances`, the admission lockout write (Task 4 below).
- Produces: a `fleet_restart_reconcile` task in `spawn_all` that, while a control row is `active`,
  marks instances draining (whole-fleet or `batch_size` at a time when `stagger`) and applies the
  lockout.

- [ ] **Step 1: Add the task to `spawn_all`** alongside the others:

```rust
    tokio::spawn(fleet_restart_reconcile(svc.clone()));
```

- [ ] **Step 2: Implement** (30s cadence, mirrors the reaper loop's structure):

```rust
async fn fleet_restart_reconcile(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;
    loop {
        interval.tick().await;
        let guid = svc.state().config.customer_guid;
        let repo = InstanceRepo(&svc.state().db);

        let fr = match repo.get_fleet_restart(guid).await {
            Ok(Some(fr)) if fr.active => fr,
            Ok(_) => continue,                 // no active restart — inert
            Err(e) => { warn!(error = %e, "fleet-restart: read failed"); continue; }
        };

        // Lockout: stop NEW joins while the restart runs (travel still allowed — see Phase 2).
        if fr.lockout {
            if let Err(e) = repo.set_admission(guid, Some(false)).await {
                warn!(error = %e, "fleet-restart: failed to set lockout");
            }
        }

        // Batch source: instances not yet draining. Whole-fleet if !stagger.
        let limit = if fr.stagger { fr.batch_size.max(1) as i64 } else { 4096 };
        let batch = match repo.list_drainable_instances(guid, limit).await {
            Ok(b) => b,
            Err(e) => { warn!(error = %e, "fleet-restart: list failed"); continue; }
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
        // remaining == 0  ⇒ all-drained signal (exposed via REST in Task 5).
    }
}
```

> When `stagger`, each tick drains the next `batch_size` instances that aren't yet draining; as earlier batches finish (rows leave `status>0`), later ticks pick up the rest — the loop converges as instances drain (W1-proxy). When `!stagger`, one tick drains everything.
> 🕳️ **W1:** without an ack, a batch isn't gated on the *previous* batch fully completing — it's gated on instances still being `drainstate IS NULL`. Good enough to avoid re-draining; precise wave-by-wave gating needs the ack.

- [ ] **Step 3: Build + tests** — `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail`. **Step 4: Commit** — `feat(rows): fleet-restart reconcile job (drain fan-out + lockout)`.

---

### Task 4: Admission setter (lockout write)

**Files:** Modify `apps/rows/src/repo/instances.rs`

**Interfaces:**
- Produces: `set_admission(tenant, accept_new_joins: Option<bool>) -> Result<(), RowsError>` —
  upserts the tenant `admission_control` row (used by the lockout; reuses Phase 2's table).

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

### Task 5: All-drained status endpoint (the F2 handoff signal)

**Files:** Modify `apps/rows/src/rest/system.rs`

**Interfaces:**
- Produces: `GET /fleet-restart/status` → JSON `{ active: bool, draining: i64, all_drained: bool }`
  where `draining` = `count_active_instances`, `all_drained = active && draining == 0`. The deploy
  orchestrator polls this before running `dbmate` / launching the new image.

- [ ] **Step 1: Add the handler** (follow the existing `system.rs` route patterns; reads
  `get_fleet_restart` + `count_active_instances`):

```rust
// pseudo-shape; match the file's actual axum handler/registration style
async fn fleet_restart_status(State(svc): State<Arc<OWSService>>) -> ApiResult<FleetRestartStatus> {
    let guid = svc.state().config.customer_guid;
    let repo = InstanceRepo(&svc.state().db);
    let active = matches!(repo.get_fleet_restart(guid).await?, Some(fr) if fr.active);
    let draining = repo.count_active_instances(guid).await?;
    Ok(axum::Json(FleetRestartStatus { active, draining, all_drained: active && draining == 0 }))
}
```

> 🕳️ **F2:** this endpoint is the contract surface; the orchestrator that consumes it (Argo Workflow / gated sync-wave / operator) is out of scope. Document the expected consumer in the runbook.
> 🕳️ Confirm `system.rs`'s router registration + auth posture (this should be service-authenticated or cluster-internal only, not public).

- [ ] **Step 2: Build + tests.** **Step 3: Commit** — `feat(rows): /fleet-restart/status all-drained signal`.

---

### Task 6: Runbook + spec cross-reference

**Files:** Modify `docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md`

- [ ] Document the operator flow + the SQL to trigger/clear a restart, the lockout behavior, the
  all-drained polling contract, and the named-orchestrator requirement (F2). Trigger SQL:

```sql
SET search_path TO ows;
INSERT INTO fleet_restart (customerguid, active, reason, urgency, dropplayers, stagger, batchsize, lockout, requestid)
VALUES ('<tenant-guid>', true, 'fleet-restart', 1, true, false, 1, true, gen_random_uuid())
ON CONFLICT (customerguid) DO UPDATE SET active = true, requestid = gen_random_uuid();
-- after all_drained + deploy: clear it
UPDATE fleet_restart SET active = false WHERE customerguid = '<tenant-guid>';
-- and lift the lockout
DELETE FROM admission_control WHERE customerguid = '<tenant-guid>';
```

- [ ] Commit — `docs(rows): fleet-restart runbook + orchestrator contract`.

---

## Holes (revisit)

- 🕳️ **W1 drain-complete ack** — batch convergence + barrier precision use the `status=0` proxy until UE advertises a drain-complete signal (capability handshake).
- 🕳️ **F2 orchestrator** — ROWS emits `/fleet-restart/status`; a named component must run `dbmate` (migration type) + roll the image after `all_drained`. Not ROWS.
- 🕳️ **Version targeting** — MVP drains all active; `target_version`-selective drain (rolling) deferred until the running version is surfaced to ROWS.
- 🕳️ **B1 save budget** — the chuck Fleet `terminationGracePeriodSeconds` must exceed the save budget, else SIGKILL eats saves mid-restart (chuck/agones repo, not ROWS).
- 🕳️ **Player broadcast / countdown** — "restarting in X" messaging is UE-rendered; ROWS supplies `drain_deadline`. The notify seam (`ShutdownNotifier`) is logging-only today.
- 🕳️ **Stagger by zone vs by server** — this plan staggers by instance (`batch_size`); zone-grouped waves (for per-zone messaging) are a later refinement.
