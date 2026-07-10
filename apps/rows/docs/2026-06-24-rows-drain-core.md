# ROWS Drain — Core Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Config & docs index:** [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) — register `ROWS_ACCEPT_NEW_JOINS` and any new drain knob there when this lands.

**Goal:** Build the inert ROWS-side foundation of the cooperative drain lifecycle — drain state on `mapinstances`, reaper exemption for draining instances, and drain-aware join routing — so a server can be marked draining and ROWS stops sending it new players and stops reaping it as "empty," while UE owns the actual shutdown.

**Architecture:** Drain is represented as **dedicated `drain_*` columns** on `mapinstances`, orthogonal to `status` (an instance is `status=2 ready` AND `draining` at once). The reaper skips draining instances on the count-based paths (Empty/NeverReported) but still force-kills on lost liveness (Stale heartbeat) and past `drain_deadline`. `join_map` gains a preference order (healthy → `when_able`-draining fallback → never `asap`/`drop`/`saving`). Ships **inert**: nothing sets drain state except a service-authenticated setter, so behavior is unchanged until an operator/UE drives it — same posture as the reaper.

**Tech Stack:** Rust, axum, sqlx (runtime queries, Postgres), tokio, Agones via kube; dbmate migrations under `packages/data/sql`.

## Global Constraints

- All work in this PR's worktree (`atom-06281646-rows-drain-core-phase1`). Conventional commits, no co-author lines. PR targets `dev`.
- **Delivery lane:** the _plan document_ itself may ship via the atomic auto-merge lane (it is a self-contained docs change). The **implementation** of this plan (DB migration + reaper logic + hot-path `join_map` SQL) **must NOT ride the atomic auto-merge fast-path** — it is multi-file, schema-altering, and player-path-affecting. Land the implementation through a reviewed **trunk** PR (`trunk/<task>-<MM-DD-YYYY>`) with a human approval gate, never an auto-squash-merged `atom-*`.
- sqlx queries are **runtime** (`sqlx::query`/`query_as`), not the `query!` macro — no `DATABASE_URL` to compile, no `.sqlx` cache.
- Build/test the crate with `cargo` inside `apps/rows` (`cargo test -p rows`).
- Migrations: new timestamped file under `packages/data/sql/dbmate/migrations/`; mirror the reference schema under `packages/data/sql/schema/ows/`. Never hand-edit generated artifacts.
- Time type is `chrono::NaiveDateTime` (DB `TIMESTAMP`). "Now" = `chrono::Utc::now().naive_utc()`. **All `drain_deadline` writes MUST be UTC-naive** (assert at the write boundary — Task 4) so the naive comparison in `reap_decision` is correct. The column stays `TIMESTAMP` (not `TIMESTAMPTZ`) to match every other time column in `ows`; the UTC invariant is enforced in code, not the type.
- **Migration-before-merge is the operator procedure (see Task 6).** `join_map`'s `WHERE`/`ORDER BY` reference `drainstate`/`drainurgency`/`draindropplayers` **explicitly**; on a DB that hasn't run `20260628212059` those raise `ColumnNotFound` on the join hot path → **player-join outage, all tenants**. `SELECT mi.*` reads (reaper) degrade gracefully via `#[sqlx(default)]`, but the explicit-column join does not. The rows image is ArgoCD auto-synced, so the safe order is enforced **by the operator applying the migration (`ci-dbmate-deploy`) in each environment BEFORE merging** the implementation PR into that environment's branch. Because the columns then exist before the new image ever rolls, there is no window where new code meets an old schema. **Caveat — apply per environment** (dev, then prod) before that env's image rolls; **never run the down-migration in prod** while the drain-aware image is live (it re-opens the `ColumnNotFound` outage — roll the _image_ back first, the migration never).
- **Inert posture:** ships with no automatic drain trigger. The only setter is service-authenticated and has **no caller in this phase** — the feature is deliberately dormant (same posture as the reaper). This means Phase 1 carries the schema/deploy risk for value that only lands in Phase 2; that tradeoff is accepted to de-risk the schema change ahead of the admission plane.

## drain\_\* encoding (used across all tasks)

| Column                                    | Type           | Values                                                                                                                                                   |
| ----------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drain_state` (DDL `drainstate`)          | smallint NULL  | **NULL = not draining**, 1 = draining, 2 = saving. (`0` is **not** a legal stored value — a `CHECK` enforces `IN (1,2)`; "not draining" is always NULL.) |
| `drain_urgency` (`drainurgency`)          | smallint NULL  | 0 = when_able, 1 = asap                                                                                                                                  |
| `drain_drop_players` (`draindropplayers`) | boolean NULL   | true = UE will disconnect players after save (excluded from new joins)                                                                                   |
| `drain_reason` (`drainreason`)            | text NULL      | label: empty/rebalance/maintenance/node-drain/fleet-restart/operator                                                                                     |
| `drain_request_id` (`drainrequestid`)     | uuid NULL      | correlation; scopes `clear_drain_state`                                                                                                                  |
| `drain_deadline` (`draindeadline`)        | timestamp NULL | infra-imposed cutoff (node-drain); **UTC-naive**, past-deadline → force-reap                                                                             |

DDL identifiers fold to concatenated lowercase (Postgres): `drainstate`, `drainurgency`, `draindropplayers`, `drainreason`, `drainrequestid`, `draindeadline`. Rust fields are snake_case via `#[sqlx(rename = "...")]` (same as `ReaperConfigOverride`). Reads use `unwrap_or`-style defaults; `drainstate.is_some()` (or `>= 1`) means "draining" since NULL is the only not-draining value.

---

> ### ✅ Audit resolution (2026-06-24 core-plan audit — folded into the tasks below)
>
> The prior revision kept the audit findings as a separate "corrections OVERRIDE the tasks" block.
> That is itself a failure mode: a task-by-task executor applies the task body and skips the prose.
> **All corrections are now merged into the task bodies**; this changelog is for traceability only.
>
> - **C1 (HIGH)** — Task 2 is re-based on the **shipped 12-arg** `reap_decision` (with `empty_fresh_secs`).
>   The new signature is **14-arg** (`…, empty_fresh_secs, is_draining, drain_deadline, now`). Task 2 Step 4
>   enumerates all existing call sites and inserts `false, None,` before `now`.
> - **C2 (HIGH)** — a draining instance is STILL reaped on lost liveness (stale/absent heartbeat under an
>   active freshness gate) and past `drain_deadline`. Folded into the Task 2 function body + tests.
> - **C3 (MEDIUM)** — `#[serde(skip_serializing_if = "Option::is_none")]` on all six model fields (Task 1 Step 3),
>   so the UE REST/OpenAPI contract is byte-identical for un-drained instances.
> - **C4 (MEDIUM)** — `set_drain_state` is monotonic (escalate-only) and returns `rows_affected`; `clear_drain_state`
>   is request-scoped (or operator-forced) and returns `rows_affected` (Task 4).
> - **C5 (LOW→raised)** — UTC write-boundary assertion (Task 4); idempotent `CHECK (drainstate IN (1,2))` (Task 1);
>   migration-before-merge is the operator procedure — apply `20260628212059` per env before merging, so the
>   columns exist before the auto-synced image rolls (Global Constraints + Task 6).
> - **Routing (MEDIUM, new)** — `join_map` excludes `asap` **and** `drop_players` **and** `saving`, not just
>   `urgency=1`; the decision is lifted into a pure, CI-unit-tested `join_candidate_key` (the `reap_decision`
>   pattern) so the player-path logic has real coverage, not manual verification (Task 5).

---

## Phase 1 — Core drain plumbing (this plan)

### Task 1: `drain_*` columns — migration, schema ref, model

**Files:**

- Create: `packages/data/sql/dbmate/migrations/20260628212059_ows_mapinstance_drain.sql`
- Modify: `packages/data/sql/schema/ows/map_instances.sql`
- Modify: `apps/rows/src/models.rs` (`ZoneInstance`)

**Interfaces:**

- Produces: six nullable `drain*` columns on `mapinstances` + a `drainstate IN (1,2)` CHECK; `ZoneInstance` gains
  `drain_state: Option<i16>`, `drain_urgency: Option<i16>`, `drain_drop_players: Option<bool>`,
  `drain_reason: Option<String>`, `drain_request_id: Option<Uuid>`, `drain_deadline: Option<NaiveDateTime>`,
  each `#[serde(skip_serializing_if = "Option::is_none")]`.

- [ ] **Step 1: Write the migration**

Create `packages/data/sql/dbmate/migrations/20260628212059_ows_mapinstance_drain.sql`. Column adds are
idempotent (`IF NOT EXISTS`); the CHECK is wrapped in a guard because Postgres `ADD CONSTRAINT` has no
`IF NOT EXISTS` (a re-run would otherwise error):

```sql
-- migrate:up
SET search_path TO ows;

ALTER TABLE MapInstances
    ADD COLUMN IF NOT EXISTS DrainState       SMALLINT  NULL,
    ADD COLUMN IF NOT EXISTS DrainUrgency     SMALLINT  NULL,
    ADD COLUMN IF NOT EXISTS DrainDropPlayers BOOLEAN   NULL,
    ADD COLUMN IF NOT EXISTS DrainReason      TEXT      NULL,
    ADD COLUMN IF NOT EXISTS DrainRequestID   UUID      NULL,
    ADD COLUMN IF NOT EXISTS DrainDeadline    TIMESTAMP NULL;

-- NULL = not draining; 1 = draining; 2 = saving. 0 is rejected (dead semantic).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mapinstances_drainstate_check'
    ) THEN
        ALTER TABLE MapInstances
            ADD CONSTRAINT mapinstances_drainstate_check CHECK (DrainState IN (1, 2));
    END IF;
END $$;

-- migrate:down
SET search_path TO ows;

ALTER TABLE MapInstances DROP CONSTRAINT IF EXISTS mapinstances_drainstate_check;

ALTER TABLE MapInstances
    DROP COLUMN IF EXISTS DrainState,
    DROP COLUMN IF EXISTS DrainUrgency,
    DROP COLUMN IF EXISTS DrainDropPlayers,
    DROP COLUMN IF EXISTS DrainReason,
    DROP COLUMN IF EXISTS DrainRequestID,
    DROP COLUMN IF EXISTS DrainDeadline;
```

> **Rollback hazard (document, do not automate a down-migration in prod):** `migrate:down` drops the columns,
> but the drain-aware rows image references them explicitly in `join_map`. Running `down` while that image is
> still live re-creates the `ColumnNotFound` join outage. The down path is for local/dev reset only; a prod
> rollback rolls the **image** back first (old image ignores the columns), never the migration.

- [ ] **Step 2: Mirror in the reference schema**

In `packages/data/sql/schema/ows/map_instances.sql`, add inside the `CREATE TABLE MapInstances ( … )` block after `GameServerName`:

```sql
    DrainState              SMALLINT                NULL,
    DrainUrgency            SMALLINT                NULL,
    DrainDropPlayers        BOOLEAN                 NULL,
    DrainReason             TEXT                    NULL,
    DrainRequestID          UUID                    NULL,
    DrainDeadline           TIMESTAMP               NULL,
    CONSTRAINT mapinstances_drainstate_check CHECK (DrainState IN (1, 2)),
```

- [ ] **Step 3: Add the model fields**

In `apps/rows/src/models.rs`, in `pub struct ZoneInstance` after `game_server_name`. The `skip_serializing_if`
keeps the UE REST/OpenAPI contract byte-identical for un-drained instances (all-None):

```rust
    #[sqlx(rename = "drainstate", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_state: Option<i16>,
    #[sqlx(rename = "drainurgency", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_urgency: Option<i16>,
    #[sqlx(rename = "draindropplayers", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_drop_players: Option<bool>,
    #[sqlx(rename = "drainreason", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_reason: Option<String>,
    #[sqlx(rename = "drainrequestid", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_request_id: Option<uuid::Uuid>,
    #[sqlx(rename = "draindeadline", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_deadline: Option<chrono::NaiveDateTime>,
```

> `default` so a `SELECT mi.*` against a DB that hasn't run the migration deserializes absent columns to `None` instead of `ColumnNotFound` (mirrors `gameservername`). `get_active_reap_candidates`/`get_all_inactive_map_instances` use `SELECT mi.*`, so they map automatically. The explicit-column `join_map` query (Task 5) does **not** get this tolerance — hence the migration-before-merge procedure (Task 6).

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add packages/data/sql/dbmate/migrations/20260628212059_ows_mapinstance_drain.sql \
        packages/data/sql/schema/ows/map_instances.sql apps/rows/src/models.rs
git commit -m "feat(rows): drain_* columns on mapinstances for the drain lifecycle"
```

---

### Task 2: Reaper exemption for draining instances (pure logic + tests)

**Files:**

- Modify: `apps/rows/src/agones/reaper.rs`

**Interfaces:**

- Consumes: the **shipped 12-arg** `reap_decision(...)` (ends `…, allow_never_reported, empty_fresh_secs, now`).
- Produces: `reap_decision` gains **two** trailing parameters before `now`: `is_draining: bool` and
  `drain_deadline: Option<NaiveDateTime>` → **14-arg** signature. When `is_draining`, the `Empty` and
  `NeverReported` count-based reasons are suppressed (UE owns the drain shutdown), BUT the instance is still
  reaped (`Stale`) when (a) it is past `drain_deadline`, or (b) the freshness gate is active (`empty_fresh_secs > 0`)
  and its heartbeat is stale or absent — i.e. it crashed mid/post-drain. The crashed-while-populated `Stale`
  path (count > 0, `stale_secs`) is unchanged.

> **Why `drain_deadline` is threaded in, not just `is_draining`:** a blanket `if is_draining { return None }`
> leaks a crashed-while-empty draining server forever — it drains to 0 (the goal), then crashes; `player_count==0`
> skips the populated-Stale block, so it would be permanently exempt and orphan its GameServer + `mapinstances`
>
> - `charonmapinstance` rows. The deadline + freshness backstop closes that leak.

- [ ] **Step 1: Write the failing tests**

In `apps/rows/src/agones/reaper.rs`, inside `mod tests`, add. Arg order is
`(player_count, last_update, last_empty, create, mtsae, boot, buffer, stale_secs, min_empty, allow_never, empty_fresh, is_draining, drain_deadline, now)`:

```rust
    // draining + empty + FRESH heartbeat (liveness gate on) -> NOT reaped (UE owns the shutdown)
    #[test]
    fn draining_empty_fresh_is_exempt() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:00"); // 60s ago, fresh (< 180)
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(0, Some(last), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, 180, true, None, now);
        assert_eq!(d, None);
    }

    // draining + count==0 + STALE heartbeat (leak case the audit flagged) -> STILL reaped (lost liveness)
    #[test]
    fn draining_empty_stale_heartbeat_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:55:00"); // 300s ago > empty_fresh 180
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(0, Some(last), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, 180, true, None, now);
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // draining + past drain_deadline -> reaped regardless of freshness
    #[test]
    fn draining_past_deadline_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // fresh
        let deadline = ts("2026-06-23 11:59:00"); // already passed
        let d = reap_decision(0, Some(last), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, 180, true, Some(deadline), now);
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // draining + liveness gate OFF (empty_fresh=0) + count 0 -> exempt (no liveness signal to act on)
    #[test]
    fn draining_exempt_when_liveness_gate_off() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, 0, true, None, now);
        assert_eq!(d, None);
    }

    // draining + crashed-while-POPULATED (count>0, stale heartbeat) -> STILL reaped via stale_secs
    #[test]
    fn draining_populated_stale_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago > stale_secs 120
        let d = reap_decision(5, Some(last), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 120, 0, false, 0, true, None, now);
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // regression: NOT draining + empty-past-timeout (fresh) -> still reaped (guards the new args)
    #[test]
    fn not_draining_empty_still_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // fresh, so the empty path isn't freshness-gated
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(0, Some(last), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, 180, false, None, now);
        assert_eq!(d, Some(ReapReason::Empty));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/rows && cargo test reaper:: 2>&1 | tail -20`
Expected: FAIL — the shipped `reap_decision` takes 12 args, these calls pass 14 (compile error). That is the failing state.

- [ ] **Step 3: Add the parameters and gate**

In `reap_decision`, add `is_draining: bool` and `drain_deadline: Option<NaiveDateTime>` as the two parameters
immediately before `now` (keeping `empty_fresh_secs` where it is). Then insert the draining branch **at the top
of the `player_count == 0` path** — i.e. immediately after the existing `if player_count > 0 { … return None; }`
block and before the "Layer 4 / never-reported" block. Do **not** rewrite the rest of the function (the shipped
freshness-gated Empty logic is unchanged for non-draining instances):

```rust
    // Draining: going empty is the GOAL and UE owns SDK.Shutdown(), so the count-based Empty /
    // NeverReported paths are suppressed. BUT a draining server can still die mid/post-drain, so we
    // keep two backstops here (closes the orphan-leak the blanket exemption would create):
    if is_draining {
        // (a) Deadline backstop: a drain not complete by its infra deadline is force-reaped.
        if let Some(deadline) = drain_deadline {
            if now > deadline {
                return Some(ReapReason::Stale);
            }
        }
        // (b) Lost-liveness: when the freshness gate is active, a draining server whose heartbeat is
        // stale OR never arrived has crashed — reap it. When the gate is off (empty_fresh_secs == 0)
        // we have no trusted liveness signal, so we exempt and let the deadline / v2 cross-check act.
        if empty_fresh_secs > 0 {
            match last_update_from_server {
                Some(last) if (now - last).num_seconds() <= empty_fresh_secs => {} // alive + draining -> exempt
                _ => return Some(ReapReason::Stale),
            }
        }
        return None;
    }
```

The function header becomes (note the two new params before `now`):

```rust
#[allow(clippy::too_many_arguments)]
pub fn reap_decision(
    player_count: i32,
    last_update_from_server: Option<NaiveDateTime>,
    last_server_empty_date: Option<NaiveDateTime>,
    create_date: Option<NaiveDateTime>,
    minutes_to_shutdown_after_empty: i32,
    boot_grace_secs: i64,
    empty_buffer_secs: i64,
    stale_secs: i64,
    min_empty_secs: i64,
    allow_never_reported: bool,
    empty_fresh_secs: i64,
    is_draining: bool,
    drain_deadline: Option<NaiveDateTime>,
    now: NaiveDateTime,
) -> Option<ReapReason> {
```

- [ ] **Step 4: Update EVERY existing call site (enumerate — no blanket replace)**

The shipped `reaper.rs` has multiple existing `reap_decision(...)` calls (the `mod tests` cases). Each currently
ends `…, <empty_fresh_secs>, now)`. For each, insert `false, None,` between the `empty_fresh_secs` argument and
`now` (not draining, no deadline → identical behavior). A single literal `replace_all` will NOT work because the
`empty_fresh_secs` value varies (`0`, `120`, `180`, …); enumerate and edit each call. After editing, run
`cargo build` and confirm **zero `reap_decision` arity errors** before continuing. (`run_reap_cycle`'s call is
updated in Task 3, not here.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/rows && cargo test reaper:: 2>&1 | tail -20`
Expected: PASS — all reaper tests including the 6 new drain cases.

- [ ] **Step 6: Commit**

```bash
git add apps/rows/src/agones/reaper.rs
git commit -m "feat(rows): reaper exempts draining instances from count-based reap, keeps liveness+deadline backstop"
```

---

### Task 3: Wire `is_draining` + `drain_deadline` into the reaper cycle

**Files:**

- Modify: `apps/rows/src/jobs.rs` (`run_reap_cycle`)

**Interfaces:**

- Consumes: `ZoneInstance.drain_state` + `ZoneInstance.drain_deadline` (Task 1), `reap_decision(..., is_draining, drain_deadline, now)` (Task 2).

- [ ] **Step 1: Pass drain state into the decision**

In `apps/rows/src/jobs.rs`, in `run_reap_cycle`, the `reap_decision(...)` call currently ends with
`allow_never_reported,` then `empty_fresh_secs,` then `now,`. Insert the two new args between `empty_fresh_secs`
and `now`:

```rust
        let Some(reason) = reap_decision(
            inst.number_of_reported_players,
            inst.last_update_from_server,
            inst.last_server_empty_date,
            inst.create_date,
            inst.minutes_to_shutdown_after_empty,
            reaper.boot_grace_secs,
            reaper.buffer_secs,
            reaper.stale_secs,
            reaper.min_empty_secs,
            allow_never_reported,
            reaper.empty_fresh_secs, // existing shipped arg — keep whatever the current call passes here
            inst.drain_state.is_some(), // NULL = not draining; any stored value (1|2) = draining
            inst.drain_deadline,
            now,
        ) else {
            continue;
        };
```

> Use `inst.drain_state.is_some()` (NULL is the only not-draining value per the CHECK), not `unwrap_or(0) >= 1`.
> If the current shipped call passes `empty_fresh_secs` via a different expression, keep that expression — only
> the two new lines are added.

- [ ] **Step 2: Verify build + tests**

Run: `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15`
Expected: builds clean; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/rows/src/jobs.rs
git commit -m "feat(rows): reaper cycle passes drain_state + drain_deadline into reap_decision"
```

---

### Task 4: Repo setter/clearer for drain state

**Files:**

- Modify: `apps/rows/src/repo/instances.rs`

**Interfaces:**

- Produces:
    - `InstanceRepo::set_drain_state(customer_guid, map_instance_id, state: i16, urgency: i16, drop_players: bool, reason: &str, request_id: Uuid, deadline: Option<NaiveDateTime>) -> Result<u64, RowsError>` — returns `rows_affected` (0 = instance gone OR guard rejected a downgrade).
    - `InstanceRepo::clear_drain_state(customer_guid, map_instance_id, request_id: Option<Uuid>) -> Result<u64, RowsError>` — `Some(id)` clears only that request's drain; `None` is an operator force-clear. Returns `rows_affected`.

- [ ] **Step 1: Add the methods**

In `apps/rows/src/repo/instances.rs` (in the `impl InstanceRepo`):

```rust
    /// Marks an instance draining. Orthogonal to `status` — a draining instance stays `status=2`
    /// (ready) so existing players keep playing; routing and the reaper consult `drainstate`.
    ///
    /// **Monotonic (escalate-only):** the WHERE guard refuses to *downgrade* an in-flight drain
    /// (e.g. a late `when_able` can't relax an active `asap`). `rows_affected == 0` means either the
    /// instance is gone OR the guard rejected a downgrade — the caller distinguishes via a prior read.
    #[allow(clippy::too_many_arguments)]
    pub async fn set_drain_state(
        &self,
        customer_guid: Uuid,
        map_instance_id: i32,
        state: i16,
        urgency: i16,
        drop_players: bool,
        reason: &str,
        request_id: Uuid,
        deadline: Option<chrono::NaiveDateTime>,
    ) -> Result<u64, RowsError> {
        // UTC invariant: `draindeadline` is naive TIMESTAMP compared against Utc::now().naive_utc()
        // in reap_decision. A non-UTC deadline would mis-fire the backstop (premature force-reap of a
        // live drain, or never). Callers MUST pass UTC-naive; assert it in debug builds.
        debug_assert!(
            deadline.is_none()
                || deadline
                    == deadline.map(|d| chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(d, chrono::Utc).naive_utc()),
            "drain_deadline must be UTC-naive"
        );
        let result = sqlx::query(
            "UPDATE mapinstances
             SET drainstate = $3, drainurgency = $4, draindropplayers = $5,
                 drainreason = $6, drainrequestid = $7, draindeadline = $8
             WHERE customerguid = $1 AND mapinstanceid = $2
               AND (drainstate IS NULL OR COALESCE(drainurgency, -1) <= $4)",
        )
        .bind(customer_guid)
        .bind(map_instance_id)
        .bind(state)
        .bind(urgency)
        .bind(drop_players)
        .bind(reason)
        .bind(request_id)
        .bind(deadline)
        .execute(self.0)
        .await?;
        Ok(result.rows_affected())
    }

    /// Clears the drain marker (drain aborted / never happened). Restores the instance to a plain
    /// routable/reapable state. `request_id = Some(id)` clears ONLY that request's drain (so one
    /// request can't wipe a stricter drain set by another); `None` is an explicit operator force-clear.
    pub async fn clear_drain_state(
        &self,
        customer_guid: Uuid,
        map_instance_id: i32,
        request_id: Option<Uuid>,
    ) -> Result<u64, RowsError> {
        let result = sqlx::query(
            "UPDATE mapinstances
             SET drainstate = NULL, drainurgency = NULL, draindropplayers = NULL,
                 drainreason = NULL, drainrequestid = NULL, draindeadline = NULL
             WHERE customerguid = $1 AND mapinstanceid = $2
               AND ($3::uuid IS NULL OR drainrequestid = $3)",
        )
        .bind(customer_guid)
        .bind(map_instance_id)
        .bind(request_id)
        .execute(self.0)
        .await?;
        Ok(result.rows_affected())
    }
```

> The monotonic guard uses `COALESCE(drainurgency, -1)` so a row with `drainstate` set but `drainurgency` NULL
> (partial state) is still escalatable rather than wedged forever. `drainstate IS NULL` covers the first-drain case.

- [ ] **Step 2: Verify build**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add apps/rows/src/repo/instances.rs
git commit -m "feat(rows): monotonic set_drain_state / request-scoped clear_drain_state repo methods"
```

---

### Task 5: Drain-aware `join_map` preference — pure policy + selection

**Why this shape:** routing new players is the **player-facing** path, and the crate has **no DB test harness**
(no `tests/` dir, no `sqlx::test`, no `[dev-dependencies]`; every test today is pure-logic, like `reap_decision`).
Burying the eligibility/ranking rules in SQL `WHERE`/`ORDER BY` would leave the most important logic in the plan
**untested in CI** and reachable only by manual verification — not acceptable for a player path. So we lift the
decision into a **pure function** that production actually calls (fetch the small per-zone `status=2` candidate set,
rank in Rust), exactly the `reap_decision` pattern. The pure function gets exhaustive CI unit tests; the SQL is
demoted to "fetch candidates," which can't silently mis-rank.

**Files:**

- Modify: `apps/rows/src/repo/instances.rs` (`join_map_by_char_name` + new pure `join_candidate_key`)

**Interfaces:**

- Produces: `pub fn join_candidate_key(drain_state, drain_urgency, drain_drop_players, player_count) -> Option<(u8, i32)>`
  — `None` = ineligible as a new-join target (`asap` / `drop_players` / `saving`); `Some((tier, players))` where
  `tier=0` healthy, `tier=1` acceptable `when_able` drain; lower key wins (healthy first, then fewest players).
  `join_map_by_char_name` fetches all `status=2` candidates for the zone and picks `min_by_key`.

- [ ] **Step 1: Add the pure selection policy + failing unit tests**

In `apps/rows/src/repo/instances.rs`, add the pure function and a `mod tests` (no DB — pure, runs in normal
`cargo test`). Write the tests first; they fail to compile until the function exists (TDD):

```rust
/// Pure new-join selection policy. Returns the ordering key for an existing `status=2` instance, or
/// `None` if it must never receive a new join. Lower key is preferred:
///   tier 0 = healthy (not draining); tier 1 = acceptable `when_able` drain (state=1, not asap, not drop).
/// Excluded (`None`): `asap` (urgency=1), `draindropplayers=true` (will disconnect after save), or
/// `saving` (state=2, shutting down). Within a tier, fewer players wins (same as the old ORDER BY).
/// NULL `drainstate` is the only "not draining" value (the migration CHECK forbids 0).
pub fn join_candidate_key(
    drain_state: Option<i16>,
    drain_urgency: Option<i16>,
    drain_drop_players: Option<bool>,
    player_count: i32,
) -> Option<(u8, i32)> {
    match drain_state {
        None => Some((0, player_count)), // healthy -> preferred tier
        Some(2) => None,                 // saving -> excluded
        Some(_) => {
            let asap = drain_urgency.unwrap_or(0) == 1;
            let will_drop = drain_drop_players.unwrap_or(false);
            if asap || will_drop {
                None // asap / drop -> excluded
            } else {
                Some((1, player_count)) // when_able, non-drop -> eligible but below healthy
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::join_candidate_key;

    #[test]
    fn healthy_is_preferred_and_orders_by_players() {
        assert_eq!(join_candidate_key(None, None, None, 5), Some((0, 5)));
        // healthy always outranks any draining (tier 0 < tier 1) regardless of player count
        assert!(join_candidate_key(None, None, None, 99) < join_candidate_key(Some(1), Some(0), Some(false), 0));
    }

    #[test]
    fn when_able_nondrop_is_eligible_fallback() {
        assert_eq!(join_candidate_key(Some(1), Some(0), Some(false), 3), Some((1, 3)));
        // among two when_able drains, fewer players wins
        assert!(join_candidate_key(Some(1), Some(0), Some(false), 2) < join_candidate_key(Some(1), Some(0), Some(false), 8));
    }

    #[test]
    fn asap_drop_saving_are_excluded() {
        assert_eq!(join_candidate_key(Some(1), Some(1), Some(false), 0), None); // asap
        assert_eq!(join_candidate_key(Some(1), Some(0), Some(true), 0), None);  // drop_players
        assert_eq!(join_candidate_key(Some(2), Some(0), Some(false), 0), None); // saving
        assert_eq!(join_candidate_key(Some(2), Some(1), Some(true), 0), None);  // saving + asap + drop
    }

    #[test]
    fn null_urgency_and_drop_default_to_eligible_when_able() {
        // a state=1 drain with NULL urgency/drop is treated as when_able, non-drop -> eligible fallback
        assert_eq!(join_candidate_key(Some(1), None, None, 4), Some((1, 4)));
    }
}
```

- [ ] **Step 2: Run the unit tests — verify they pass**

Run: `cd apps/rows && cargo test join_candidate 2>&1 | tail -20`
Expected: PASS — the 4 policy tests. This is the **coverage of record** for the routing decision (replaces manual verification as the final word).

- [ ] **Step 3: Wire the pure policy into `join_map_by_char_name`**

Replace the first (`existing`) query so it (a) selects the full `JoinMapResult` columns **plus** the three drain
columns and the player count, for **all** `status=2` candidates (per-zone count is small — a handful), and (b) picks
the winner with `join_candidate_key`. Define a small `#[derive(sqlx::FromRow)]` row that flattens `JoinMapResult`'s
fields plus `drain_state: Option<i16>`, `drain_urgency: Option<i16>`, `drain_drop_players: Option<bool>`,
`player_count: i32`, and a `fn into_result(self) -> JoinMapResult`. Then:

```rust
        let candidates: Vec<JoinCandidateRow> = sqlx::query_as(
            "SELECT ws.serverip AS server_ip,
                    ws.internalserverip AS world_server_ip,
                    ws.port AS world_server_port,
                    mi.port,
                    mi.mapinstanceid AS map_instance_id,
                    m.mapname AS map_name_to_start,
                    ws.worldserverid AS world_server_id,
                    mi.status AS map_instance_status,
                    false AS need_to_startup_map,
                    false AS enable_auto_loopback,
                    c.noportforwarding AS no_port_forwarding,
                    true AS success,
                    '' AS error_message,
                    mi.drainstate        AS drain_state,
                    mi.drainurgency      AS drain_urgency,
                    mi.draindropplayers  AS drain_drop_players,
                    mi.numberofreportedplayers AS player_count
             FROM maps m
             JOIN mapinstances mi ON mi.mapid = m.mapid AND mi.customerguid = m.customerguid
             JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
             JOIN customers c ON c.customerguid = m.customerguid
             WHERE m.customerguid = $1 AND m.zonename = $2 AND mi.status = 2",
        )
        .bind(customer_guid)
        .bind(zone_name)
        .fetch_all(self.0)
        .await?;

        let existing = candidates
            .into_iter()
            .filter_map(|c| {
                join_candidate_key(c.drain_state, c.drain_urgency, c.drain_drop_players, c.player_count)
                    .map(|key| (key, c))
            })
            .min_by_key(|(key, _)| *key)
            .map(|(_, c)| c.into_result());

        if let Some(result) = existing {
            return Ok(result);
        }
```

> The `pending`/spin-up fallback below is unchanged. The SELECT still names `drainstate`/`drainurgency`/`draindropplayers`
> explicitly, so the **migration-before-merge** constraint (Task 6) still applies. Ranking now lives in
> `join_candidate_key` (CI-tested), not in SQL — the query can't silently mis-rank.

- [ ] **Step 4: Verify build + full test run**

Run: `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15`
Expected: builds clean; all tests pass (including the new policy tests).

- [ ] **Step 5: Optional end-to-end smoke (not the coverage of record)**

If a dev Postgres is handy, smoke the wired path: seed two `status=2` instances, drain one `asap` → joins go to the
other; flip it to `when_able` → healthy still preferred; remove the healthy one → `when_able` used; `clear_drain_state`
restores. This is a confidence check on the SQL→struct mapping only; the routing **logic** is already proven by Step 2.

- [ ] **Step 6: Commit**

```bash
git add apps/rows/src/repo/instances.rs
git commit -m "feat(rows): drain-aware join_map via pure join_candidate_key policy (asap/drop/saving excluded)"
```

---

### Task 6: Migration-before-merge procedure + runbook

**Files:**

- Modify: `apps/rows/docs/2026-06-24-rows-server-lifecycle-and-shutdown.md` (runbook)

**Interfaces:** deploy-ordering procedure + docs.

- [ ] **Step 1: Apply the migration before merging (operator procedure)**

The `join_map` change makes a missing migration a **total join outage** (all tenants), and the rows image is
ArgoCD auto-synced — so the new code rolls automatically on merge. **The chosen control is operator ordering: apply
`20260628212059` via `ci-dbmate-deploy` in the target environment BEFORE merging the implementation PR into that
environment's branch.** Because the columns then already exist when the image rolls, there is no window where new
code meets an old schema. This is a deliberate manual procedure (not an Argo/CI gate); the discipline is "migration
first, then merge," verified by the executor, not automated.

Required, every time:

1. Apply `20260628212059` to **dev**'s Postgres (`ci-dbmate-deploy`), confirm `mapinstances.drainstate` exists.
2. Only then merge the implementation PR to `dev`.
3. Repeat for **prod**: apply the migration to prod's Postgres **before** the change reaches prod's branch/image.
4. **Never** run the down-migration in an environment whose `rows` image is already drain-aware — roll the image
   back first; the migration is forward-only in prod.

- [ ] **Step 2: Document the deploy ordering and inert posture in the runbook**

Add a "Core drain plumbing (shipped, inert)" note to the lifecycle spec: the `drain_*` columns + reaper exemption
(with deadline/liveness backstop) + `join_map` preference are live but **inert** (no automatic setter, no caller);
the `20260628212059` migration must be applied (per env) **before** the implementation PR merges into that env, per
the Step 1 procedure; prod rollback rolls the **image** back, never the migration (down-migration under a live
drain-aware image re-creates the `ColumnNotFound` outage). Cross-reference this plan.

- [ ] **Step 3: Commit**

```bash
git add apps/rows/docs/2026-06-24-rows-server-lifecycle-and-shutdown.md
git commit -m "docs(rows): migration-before-merge procedure + core drain plumbing note in lifecycle spec"
```

---

## Follow-on plans (separate — NOT in this plan)

These are real subsystems but are **blocked on open decisions**, so writing full TDD steps now would
be guesswork (violates the no-placeholders rule). Each becomes its own executable plan once its
blocker clears:

### Admission control plane (Phase 2)

- Global/tenant `accept_new_joins` gate + new-join-vs-travel (session-aware via `svc.state().sessions`).
- Storage follows the `reaper_config` pattern (env baseline + DB override, dashboard-written).
- **The Phase-2 setter endpoint that finally calls `set_drain_state` MUST be tenant-scoped on `customerguid`**
  (and the service identity authz'd) — otherwise one tenant could mark another tenant's instances `asap`-draining
  and deny/force-reap their servers (cross-tenant DoS). The repo method binds `customerguid`, but the _endpoint_
  must prove the caller owns that GUID.
- **Blocked on:** the control-plane table shape + the dashboard contract. The new-join-vs-travel seam
  also needs the join entrypoint (`get_server_to_connect_to`) to distinguish caller-has-session.

### Fleet-restart orchestration (Phase 3)

- All-down barrier signal, `restart`/`migration` types, `stagger`/`batch_size`, lockout phases.
- **Blocked on:** W1 (the UE heartbeat wire contract — `request_id`/`state`/`players_remaining`/
  `reject_reason`/`last_progress_at` don't exist yet; needs a capability handshake) and F2 (the named
  Argo barrier orchestrator — a GitOps image roll can't both launch and respect a runtime barrier).
- **Also gated by** B1 (chuck Fleet TGPS) for the save budget.

### Reaper v2 (valkey-backed occupancy)

- Move count/empty/liveness reads to valkey + Agones `Ready`/health cross-check before force-delete
  (closes the "silence ≠ dead" residual). Separate from this plan.

### Reaper advisory-lock cancellation safety (drain interaction, G3)

- The empty-server reaper guards each cycle with a **session-level** `pg_try_advisory_lock` on a
  pooled connection, releasing it with an explicit `pg_advisory_unlock` after the cycle. That release
  is panic-safe but **not cancellation-safe**: if this drain/shutdown work aborts the
  `empty_server_reaper` task between lock and unlock, the lock leaks on the pooled connection and
  wedges that tenant's reaping until the connection is recycled.
- **When this plan starts aborting background jobs**, drain the reaper via a cancellation token that
  lets the in-flight cycle finish (or scope the lock to a transaction) — do **not** hard-abort it.
  See the cancellation caveat in `2026-06-23-rows-empty-server-reaper.md` Runbook §3.

---

## Self-Review

**Spec coverage (Core slice of the lifecycle spec):**

- Drain state representation = dedicated `drain_*` columns + `CHECK (drainstate IN (1,2))` → Task 1. ✅
- Reaper exempts draining from empty/never-reported, keeps lost-liveness (Stale) AND adds a `drain_deadline` backstop → Tasks 2–3. ✅
- Allocation preference order (healthy → when_able fallback → never asap/drop/saving) → Task 5. ✅
- Setter/clearer so drain is drivable + testable, inert by default; monotonic + request-scoped → Task 4. ✅
- Migration-before-merge as an explicit operator procedure (apply per env before merging the impl PR) → Task 6. ✅
- Admission gates / new-vs-travel / fleet-restart → deferred to follow-on plans (with blockers + the Phase-2 authz requirement called out). ✅ (explicitly out)

**Placeholder scan:** every code step shows code; routing (Task 5) is covered by exhaustive **pure-function unit
tests** on `join_candidate_key` that run in normal CI (the `reap_decision` pattern) — manual/DB smoke is an optional
confidence check on the SQL→struct mapping, no longer the coverage of record for the player-path decision.

**Type consistency:** `reap_decision` gains `is_draining: bool` and `drain_deadline: Option<NaiveDateTime>` before
`now` → **14-arg** signature, applied in Task 2 (def + enumerated existing-call updates) and Task 3 (cycle call,
`inst.drain_state.is_some()` + `inst.drain_deadline`). `ZoneInstance` (Task 1) carries `drain_state: Option<i16>`
and `drain_deadline: Option<NaiveDateTime>`, read in Task 3. `set_drain_state`/`clear_drain_state` (Task 4) return
`u64` and use the same column names as the migration (Task 1) and the `join_map` query (Task 5): `drainstate`,
`drainurgency`, `draindropplayers`, `drainreason`, `drainrequestid`, `draindeadline`.

---

## Next up

**Phase 2 — Admission control plane** → `apps/rows/docs/2026-06-24-rows-drain-admission.md`

(Phase 2 hard-depends on this Core phase: it reuses `is_undefined_table` and the drain state landed here. Land Core first.)
