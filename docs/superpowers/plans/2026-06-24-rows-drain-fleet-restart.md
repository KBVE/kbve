# ROWS Drain — Fleet-Restart Orchestration Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Depends on:** Phase 1 (`2026-06-24-rows-drain-core.md`, drain state + setter) and Phase 2 (`2026-06-24-rows-drain-admission.md`, the `accept_new_joins` lockout).
> **Config & docs index:** [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) — pin the drain request annotation schema there once Phase 3 emits it.

**Goal:** Give ROWS the orchestration to drive a coordinated fleet-wide restart — mark every active instance draining, run the new-join lockout, optionally stagger in batches, and emit an "all drained" signal a deploy orchestrator waits on before launching the new binary.

**Architecture:** A DB-backed `fleet_restart` control (env-less; operator/dashboard-written, like `admission_control`) that a background job reconciles: it fans `set_drain_state` across active instances (whole-fleet or in batches), flips the admission lockout near the end, and exposes a `/fleet-restart/status` (active-instance count → "all drained") signal. The actual `dbmate` run + new-image launch stay in the deploy/Argo layer (ROWS only signals). Ships inert: no control row ⇒ the job no-ops.

> **⚠️ Shipping posture — SIGNAL-ONLY until B-1/B4 land.** What this PR delivers is the drain
> orchestration **+ an advisory signal**, not a fleet restart. The `/fleet-restart/status` barrier
> does **not** block an Argo image roll — the chuck Fleet is `RollingUpdate, maxSurge:25%` under
> `automated.prune:true`, so a bare image bump surges new-version pods alongside draining old ones
> (the mixed-version coexistence this plan forbids). A real fleet restart requires the named
> orchestrator (B-1: scale-to-0 cutover with `maxSurge:0`, or Argo PreSync gated on `all_drained`).
> Until that ships, the goal is **"cooperative drain + signal + manual runbook,"** an improvement on
> the imperative `restart_fleet` but NOT an automated all-down barrier.

**Tech Stack:** Rust, axum, sqlx (runtime), Postgres, tokio.

## Global Constraints

(Same as Core/Admission — worktree/PR #13200, conventional commits no co-author, runtime sqlx, dbmate migration + schema mirror, degrade-on-missing-table, inert posture.)

## Decision-blocked holes up front (read first)

- 🕳️ **W1 — drain-complete ack.** Precise batch convergence ("this batch is fully drained, start the next") needs UE's per-instance drain-complete signal, which doesn't exist in the heartbeat yet. **Fill used here:** ROWS uses an _observable proxy_ — an instance counts as "drained" when its row reaches `status = 0` (the reaper/lifecycle sets it on teardown) or the GameServer is gone. Less precise than an ack (a slow saver looks not-yet-drained), but safe (it waits rather than races). Swap to the ack when W1 lands.
- 🕳️ **F2 → BLOCKER B4 — who launches the new binary.** ROWS emits "all old drained"; a _named orchestrator_ (Argo Workflows / a sync-wave gated on the signal / an operator) must consume it, run `dbmate` (migration type), and roll the image. ROWS does not self-launch. **Promoted to a blocker** per the lifecycle-spec audit: the chuck Fleet is `strategy: RollingUpdate, maxSurge: 25%`, which structurally surges new while old run — a vanilla GitOps roll _cannot_ honor the all-down barrier, so **no fleet-restart rung is implementable until the orchestrator is named/built.**
- 🕳️ **B5/B6 — ROWS is `replicas: 1` with a self-deadlocking PDB.** The reconcile job here (Task 3) is the orchestrator, running on a single non-HA pod; a reschedule mid-restart loses in-flight progress (B5), and `rows-pdb minAvailable: 1` on one replica hangs node drains (B6). Before this job is trusted: either run ROWS HA (≥2 + leader election) or prove the reconcile is fully resumable from `mapinstances` on cold-start (it is _designed_ to be — it re-derives the batch each tick from `drainstate IS NULL` — but this must be tested with a "kill ROWS mid-restart" case), and fix the PDB.
- 🕳️ **Version targeting.** "drain everything ≠ target_version" needs the running image/version surfaced to ROWS. **Fill used here:** MVP drains **all** active instances (`target_version` column reserved but unused); version-selective drain is deferred.

---

## ⚠️ Audit corrections (2026-06-24 Phase-3 audit — these OVERRIDE the tasks below)

Highest-blast-radius plan; apply all. **Dependency reality:** this hard-depends on Phase 1
(`drainstate`, `set_drain_state`) and Phase 2 (`admission_control`, `set_admission`) — **neither is
built yet**, so merge-readiness is gated on Core + Admission landing first. There is also an EXISTING
imperative `restart_fleet` (`apps/rows/src/rest/system.rs` — scale-to-0 → `delete_all_map_instances`
→ scale-up); this cooperative flow must **supersede** it, not silently duplicate it.

### B-1 / B-3 (BLOCKER) — enforce the barrier at the DEPLOY layer + name the orchestrator

`/fleet-restart/status` is advisory only; the chuck Fleet is `RollingUpdate, maxSurge:25%` under Argo
(`automated.prune:true`, `ignoreDifferences` only on `/spec/replicas`), so committing a new image
surges 25% new pods _immediately_, parallel with draining old ones — the mixed-version coexistence
this plan forbids. ROWS emitting a signal does **not** block the roll. **Required — pick one and
specify the manifest change:**

- (a) **Scale-to-0 cutover** (recommended; mirrors the existing `restart_fleet`): the orchestrator
  scales the Fleet to 0 _gated on `all_drained=true`_, THEN bumps the image, THEN scales up, with
  Fleet `maxSurge:0` during cutover so no new-version pod starts before old are gone.
- (b) **Argo Workflow / PreSync hook** that polls `/fleet-restart/status` and only proceeds to the
  image bump + `dbmate` Job after `all_drained`.

The orchestrator is a **REQUIRED deliverable (B4)**, not "out of scope." Until built, this PR is
**signal + manual runbook only** = the existing imperative `restart_fleet` with extra steps; the
plan framing must say "signal-only" if the orchestrator isn't shipped here.

### B-2 (BLOCKER) — migration rollback / enforce expand-contract

dbmate is up-only and runs at the barrier _before_ new-binary launch; a bad new binary rolled back
leaves the OLD binary on the NEW schema. Required: (1) **CI guard rejecting non-additive DDL** in a
migration shipping with a binary roll; (2) **pre-deploy compat test** (binary N-1 vs schema N);
(3) documented **forward-fix recovery** (no `dbmate down`).

### H-2 (HIGH) — the reconciler MUST own the lockout lifecycle

Task 3 sets `acceptnewjoins=false` while active but never lifts it. Fix: the reconcile loop sets the
lockout on `active=true` AND **clears it on `active=false`/absent row**. **Remove** the manual
`DELETE FROM admission_control` from the runbook — a two-statement manual teardown silently locks
players out after a "successful" restart.

### H-1 (HIGH) — ROWS `replicas:1` orchestrator SPOF

The reconcile loop runs on one pod (lifecycle B5/B6). Required: fully resume-safe — re-derives the
batch from `drainstate IS NULL` each tick (already so) AND idempotently re-applies/lifts the lockout
on resume (H-2). Document the manual unlock SQL as break-glass. Prod should run ROWS HA
(leader-elected) or at minimum fix the PDB (lifecycle B6).

### H-3 (HIGH) — stuck instances block convergence forever

"drained" = row leaves `status>0`, and `list_drainable_instances` skips already-draining, so a hung
instance pins `all_drained=false` forever (lockout stays on). Required: a per-restart **deadline**
after which the reconciler **force-deallocates** overdue instances (Agones) and/or `count_active`
excludes them. Define the "stuck" SLA. (Reuses the Core `drain_deadline` enforcement, C2.)

### MEDIUM / LOW

- **M-1:** set explicit `terminationGracePeriodSeconds` > save budget on the chuck Fleet (unset →
  30s; SIGKILL eats saves). Same as lifecycle B1.
- **M-2:** `/fleet-restart/status` MUST be service-authenticated / cluster-internal, not public.
- **M-3:** `batch_size` has no inter-batch completion gate (drains the next batch each tick
  regardless of the prior finishing) — don't promise wave-by-wave isolation; document real cadence.
- **M-4:** whole-fleet-only (`target_version` unused) = guaranteed full-tenant downtime — state it.
- **L-1:** `urgency smallint` (1=asap) is unintuitive; add `CHECK (urgency IN (0,1))` + document the
  scale. **L-2:** name the whole-fleet cap (the `4096` magic). **L-3:** the lifecycle spec the runbook
  edits does exist.

### Missed tests

F2-no-surge-while-draining; rollback drill (N-1 binary vs schema N); stuck-instance convergence;
lockout auto-lift on `active=false`; ROWS-crash-mid-drain resume; degrade-on-missing-table (42P01)
for `get_fleet_restart`/`set_admission`; TGPS vs save budget; **two-replica reconcile race (advisory
lock single-flights — verify only one replica fans set_drain_state per tick); spawn-during-drain
convergence (a new instance mid-drain must not pin `all_drained=false` forever); safe-default control
row (urgency=0/dropplayers=false never force-disconnects).**

### Confirmed against `dev` (2026-06-28 re-audit) — applied + still-open

**Applied in this revision (self-contained plan edits):**

- ✅ NEW-HIGH-1: Task 1 + runbook flipped to safe defaults (`urgency=0, dropplayers=false`) + `chk_urgency`.
- ✅ NEW-HIGH-2 / H-2: reconcile lifts the lockout via `set_admission(guid, None)` on absent/`active=false`; manual `DELETE FROM admission_control` removed from the runbook.
- ✅ NEW-HIGH-3 / H-1: reconcile wrapped in the reaper's `pg_try_advisory_lock` single-flight; HA scale-up no longer double-fans.
- ✅ Migration re-timestamped `20260629120000` (after Phase 1/2 deps on dev); `FLEET_DRAIN_CAP` const for the `4096` magic.
- ✅ Posture relabelled **signal-only** until B-1/B4.

**Verified facts (dev):** `set_drain_state` 8-arg signature matches the Task 3 call site; `validate_drain_request` accepts `urgency IN (0,1)` (so the `0` default is safe); `DrainState SMALLINT NULL CHECK (1,2)`; `AcceptNewJoins BOOLEAN NULL` (NULL ⇒ env baseline). Phase 1/2 are on `dev`, **not** `main`.

**Still open (require work beyond plan edits — do NOT mark done):**

- 🚧 **B-1/B4 orchestrator** — the actual deploy-layer barrier (scale-to-0 `maxSurge:0` / Argo PreSync). Signal alone does not block the roll.
- 🚧 **B-2 rollback** — CI non-additive-DDL guard + N-1-binary-vs-schema-N compat test + forward-fix runbook (no `dbmate down`).
- 🚧 **Supersede imperative `restart_fleet`** (`apps/rows/src/rest/system.rs`, still registered): guard it to refuse while a `fleet_restart` row is `active`, else an operator double-trigger deletes instances under an in-flight cooperative drain.
- 🚧 **Barrier terminal state** — `all_drained = active && draining==0` flips back to false once the operator clears `active`; add a terminal/`completed` state or have the orchestrator latch so a post-clear poll doesn't read "not drained."
- 🚧 **H-3 deadline + reaper dependency** — `draining` only reaches 0 via the reaper (only it writes `status=0`); require a per-restart deadline (Core C2) that force-deallocates overdue instances, and make reaper-enabled a precondition.

---

## Restart triggers, modes & version-parity gate (2026-06-24 design addition)

The MVP above models _how_ a fleet drains but not **who triggers it / how aggressively**, nor the
hard precondition that the **client build exists before a server restart-to-deploy is arranged**.

### V1 (BLOCKER-class hole 🕳️) — version-parity gate: never roll the server ahead of the client

A new server binary that drains the fleet and comes up speaking a protocol the _shipped client_
can't speak is a self-inflicted outage: every player is bounced and **none can reconnect**. So the
_arrangement_ of a restart-for-update is gated on client⟷server version parity.

- **Primary enforcement — the post-publish / dispatch layer, NOT ROWS. The post-publish "sync" is
  the existing `utils-post-publish.yml` auto-PR.** That workflow already opens an atomic GitOps PR
  per publish — e.g. **PR #13262** (axum-kbve v1.0.211): bumps `Cargo.toml` / `version.toml` /
  `Cargo.lock` **and the deployment `image:` tag** in one commit. (Per repo rule, the publish is
  driven by bumping the project's `*.mdx` `version:`; CI's post-publish PR owns `version.toml` + the
  deployment image tag — never hand-edited.) For **rows**, extend that same auto-PR with two things:
    1. **A required version-parity status check / merge gate** — the PR cannot merge until the matching
       **client** build for that version published. No client build ⇒ check stays red ⇒ the image bump
       waits. Merge is what triggers the roll (reviewable diff, same posture as the reaper switches; no
       out-of-band Argo drift).
    2. **Arrange the non-aggressive `fleet_restart` instead of a bare image-tag swap.** A plain tag bump
       under the chuck Fleet's `RollingUpdate, maxSurge:25%` surges new-version pods alongside draining
       old ones — the mixed-version coexistence **B-1** forbids. The rows post-publish PR must instead
       gate the roll on `all_drained` (scale-to-0 cutover / Argo PreSync per B-1), i.e. it **is** the
       F2/B4 orchestrator surface: post-merge **+** `all_drained` ⇒ run `dbmate` + roll the image.
- **Defense in depth — runtime.** The existing `ows.kbve.com/version` label + UE-contract obligation
  #12 (client-version gate): a connecting client below the required version gets an "update required"
  signal, not a raw disconnect.
- **Scope:** wire this in **beta first** (prod is not live yet); the automated sync fires only once
  **both** the server image and the client build for the version are published.

### Two restart modes — the trigger source decides aggression

The `fleet_restart` control already carries `urgency` + `drop_players`; pin their values to the
trigger:

| Mode                        | Trigger                                                               | `urgency`         | `drop_players` | Behavior                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------- | ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Non-aggressive (update)** | **post-publish GitOps PR** (beta/prod), merge-gated on version parity | `0` = `when_able` | `false`        | Drain-to-natural-empty: an instance restarts only once **all its players have left on their own** — no forced disconnects. Slow, zero player interruption. The default path for a routine version roll. |
| **Aggressive (expedite)**   | **dashboard** (operator), deadline-bounded                            | `1` = `asap`      | `true`         | Save-then-disconnect remaining players at the deadline; forces convergence (reuses H-3 stuck-instance deadline). For urgent / security rolls.                                                           |

### Correction to Task 1 defaults (apply with the migration)

Task 1's table defaults `Urgency=1 (asap)`, `DropPlayers=true` — the **aggressive** values. **Flip the
column defaults to the safe/non-aggressive values** so the automated path is safe-by-default and
aggression is an explicit dashboard opt-in:

```sql
    Urgency       SMALLINT NOT NULL DEFAULT 0,     -- 0 = when_able (non-aggressive); 1 = asap
    DropPlayers   BOOLEAN  NOT NULL DEFAULT false,  -- aggressive paths set true explicitly
    ...
    CONSTRAINT chk_urgency CHECK (Urgency IN (0,1))  -- (also L-1)
```

A stray or automated control row must **never** default to bouncing live players; the dashboard
writes `urgency=1, dropplayers=true` to opt into the aggressive path.

> 🕳️ **V1 open decision:** the exact signal the post-publish layer checks for "client build
> published" (launcher manifest? itch/Steam channel? a `client_versions` row?) is pinned when the
> dispatch step is built — tracked with the F2/B4 orchestrator (same component). This supersedes the
> "Version targeting" hole below for the _gate_; version-**selective** drain (drain only
> `≠ target_version`) remains separately deferred.

---

### Task 1: `fleet_restart` control table + model

**Files:**

- Create: `packages/data/sql/dbmate/migrations/20260629120000_ows_fleet_restart.sql`
- Create: `packages/data/sql/schema/ows/fleet_restart.sql`
- Modify: `apps/rows/src/config.rs` (control struct)

> ⚠️ **Migration ordering:** timestamp **must** be after the Phase 1/2 deps already on `dev`
> (`20260628212059_ows_mapinstance_drain.sql`, `20260629000000_ows_admission_control.sql`). The
> original `20260624160000` was _earlier_ than the tables this phase builds on — dbmate would apply
> it out-of-order. Use `20260629120000` (or later).

**Interfaces:**

- Produces: table `ows.fleet_restart(customerguid uuid pk, active boolean, reason text, urgency smallint, dropplayers boolean, stagger boolean, batchsize int, lockout boolean, targetversion text null, requestid uuid)`; `FleetRestart` (sqlx::FromRow) with snake_case fields via `#[sqlx(rename)]`.

- [ ] **Step 1: Migration** `20260629120000_ows_fleet_restart.sql` (up):

> **Safe-by-default (audit V1 / NEW-HIGH-1):** column defaults are the _non-aggressive_ values so a
> stray or automated control row never bounces live players. The aggressive path (`urgency=1,
dropplayers=true`) is an explicit dashboard opt-in. `chk_urgency` matches the runtime
> `validate_drain_request` domain (0|1, verified against `dev`).

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
    TargetVersion TEXT    NULL,                  -- reserved (version-selective drain; hole)
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

        // HA-safe (H-1/NEW-HIGH-3): single-flight per tenant, mirrors empty_server_reaper.
        // Without this, scaling ROWS to >1 (the SPOF remediation) double-fans set_drain_state.
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
            // No active restart (absent row OR active=false) — lift the lockout and go inert.
            // H-2/NEW-HIGH-2: the reconciler OWNS the lockout lifecycle. set_admission(None)
            // writes NULL → admission falls back to the env baseline (ROWS_ACCEPT_NEW_JOINS,
            // default true). Idempotent: safe to run every tick, safe on cold-start resume.
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

        // Lockout: stop NEW joins while the restart runs (travel still allowed — see Phase 2).
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
        // remaining == 0  ⇒ all-drained signal (exposed via REST in Task 5).
        // NOTE (H-3): `remaining` only reaches 0 once instances hit status=0, which ONLY the
        // empty_server_reaper writes (set_drain_state rejects state=0). The barrier is therefore
        // gated on reaper health + a per-restart deadline (C2) — see the deadline note below.

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

> **`FLEET_DRAIN_CAP`** (L-2): name the whole-fleet batch cap as a `const FLEET_DRAIN_CAP: i64 = 4096;`
> instead of the bare `4096` magic number.

> When `stagger`, each tick drains the next `batch_size` instances that aren't yet draining; as earlier batches finish (rows leave `status>0`), later ticks pick up the rest — the loop converges as instances drain (W1-proxy). When `!stagger`, one tick drains everything.
> 🕳️ **W1:** without an ack, a batch isn't gated on the _previous_ batch fully completing — it's gated on instances still being `drainstate IS NULL`. Good enough to avoid re-draining; precise wave-by-wave gating needs the ack.

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

-- Routine version roll (NON-AGGRESSIVE, safe-by-default): drain-to-natural-empty, no forced
-- disconnects. urgency=0, dropplayers=false. This is the default path.
INSERT INTO fleet_restart (customerguid, active, reason, urgency, dropplayers, stagger, batchsize, lockout, requestid)
VALUES ('<tenant-guid>', true, 'fleet-restart', 0, false, false, 1, true, gen_random_uuid())
ON CONFLICT (customerguid) DO UPDATE SET active = true, urgency = 0, dropplayers = false, requestid = gen_random_uuid();

-- Urgent / security roll (AGGRESSIVE, dashboard opt-in ONLY): save-then-disconnect at the deadline.
-- urgency=1, dropplayers=true. Never the automated default.
-- ... DO UPDATE SET active = true, urgency = 1, dropplayers = true, requestid = gen_random_uuid();

-- After all_drained + deploy: clear it. The reconcile loop lifts the admission lockout itself
-- (set_admission(None)) on the next tick — do NOT manually DELETE admission_control (H-2: a manual
-- two-statement teardown silently locks players out if the second statement is missed).
UPDATE fleet_restart SET active = false WHERE customerguid = '<tenant-guid>';
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

---

## Next up

**Phase 4 — Reaper v2 (valkey-backed occupancy) + UE drain contract** → tracked in the lifecycle spec `docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md` ("Out of scope" / "Reaper v2"). These are the cross-repo / decision-blocked items (W1 UE ack, B4 orchestrator, valkey occupancy) — no executable ROWS plan yet; each gets its own once its blocker clears.

**Cross-repo (chuck/UE):** the UE-side obligations are spec'd in `docs/superpowers/plans/2026-06-24-ue-chuck-drain-contract.md` (living doc — update it after each ROWS phase).

(Previous: Phase 2 Admission → `docs/superpowers/plans/2026-06-24-rows-drain-admission.md`. This is the last ROWS-side buildable phase.)
