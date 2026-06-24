# ROWS Drain — Core Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Config & docs index:** [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) — register `ROWS_ACCEPT_NEW_JOINS` and any new drain knob there when this lands.

**Goal:** Build the inert ROWS-side foundation of the cooperative drain lifecycle — drain state on `mapinstances`, reaper exemption for draining instances, and drain-aware join routing — so a server can be marked draining and ROWS stops sending it new players and stops reaping it as "empty," while UE owns the actual shutdown.

**Architecture:** Drain is represented as **dedicated `drain_*` columns** on `mapinstances`, orthogonal to `status` (an instance is `status=2 ready` AND `draining` at once). The reaper skips draining instances on the count-based paths (Empty/NeverReported) but still force-kills on lost liveness (Stale). `join_map` gains a preference order (healthy → `when_able`-draining fallback → never `asap`/`drop`). Ships **inert**: nothing sets drain state except a service-authenticated setter, so behavior is unchanged until an operator/UE drives it — same posture as the reaper.

**Tech Stack:** Rust, axum, sqlx (runtime queries, Postgres), tokio, Agones via kube; dbmate migrations under `packages/data/sql`.

## Global Constraints

- All work in this PR's worktree (`atom-06232212-rows-reaper-plan`, PR #13200). Conventional commits, no co-author lines. PR targets `dev`.
- sqlx queries are **runtime** (`sqlx::query`/`query_as`), not the `query!` macro — no `DATABASE_URL` to compile, no `.sqlx` cache.
- Build/test the crate with `cargo` inside `apps/rows` (`cargo test -p rows`).
- Migrations: new timestamped file under `packages/data/sql/dbmate/migrations/`; mirror the reference schema under `packages/data/sql/schema/ows/`. Never hand-edit generated artifacts.
- Time type is `chrono::NaiveDateTime` (DB `TIMESTAMP`). "Now" = `chrono::Utc::now().naive_utc()`.
- Migration applies via the manual `ci-dbmate-deploy` job, decoupled from the rows image roll — so all new-column reads must tolerate the column being absent (the `#[sqlx(... default)]` pattern already used for `gameservername`), and explicit-column SQL (e.g. `join_map`) requires migration-before-image ordering (document in the runbook).
- **Inert posture:** ships with no automatic drain trigger. The only setter is service-authenticated. No behavior change until driven.

## drain_* encoding (used across all tasks)

| Column | Type | Values |
|---|---|---|
| `draindrainstate` → `drain_state` | smallint NULL | NULL/0 = not draining, 1 = draining, 2 = saving |
| `drain_urgency` | smallint NULL | 0 = when_able, 1 = asap |
| `drain_drop_players` | boolean NULL | may UE disconnect-after-save |
| `drain_reason` | text NULL | label: empty/rebalance/maintenance/node-drain/fleet-restart/operator |
| `drain_request_id` | uuid NULL | correlation |
| `drain_deadline` | timestamp NULL | infra-imposed cutoff (node-drain) |

DDL identifiers fold to concatenated lowercase (Postgres): `drainstate`, `drainurgency`, `draindropplayers`, `drainreason`, `drainrequestid`, `draindeadline`. Rust fields are snake_case via `#[sqlx(rename = "...")]` (same as `ReaperConfigOverride`).

---

## ⚠️ Audit corrections (2026-06-24 core-plan audit — these OVERRIDE the task blocks below)

Apply these; where they conflict with the original task code, **these win**. Also note: the shipped
`reap_decision` gained a 12th arg **`empty_fresh_secs`** (the reaper freshness fix) *after* this plan
was written, so the base signature is 12-arg and `is_draining` makes it 13 (plus `drain_deadline`,
C2, → 14). Re-base Task 2 on the **shipped** `reaper.rs`, not the 11-arg listing below.

### C1 (HIGH) — update EVERY `reap_decision` call site, not "all existing calls"
There are 15 `reap_decision(` sites after the freshness fix (13 in `reaper.rs` tests + the
`run_reap_cycle` call + the new freshness tests). Adding `is_draining` breaks all of them. Task 2's
"update existing calls" step MUST **enumerate** them and insert the arg — no single literal
`replace_all` covers all (freshness tests end `…, 120, now)`, others `…, 0, now)`). Build after and
confirm zero `reap_decision` arity errors before moving on.

### C2 (HIGH) — a draining instance must STILL be reaped on lost-liveness / past-deadline
The blanket `if is_draining { return None }` leaks a crashed-while-empty draining server forever (it
drains to 0 = the goal, then crashes → `player_count == 0` skips the Stale block → exempted; GS +
`mapinstances` + `charonmapinstance` rows orphan). Thread `drain_deadline: Option<NaiveDateTime>`
into `reap_decision` and replace the exemption:

```rust
    if is_draining {
        // Deadline backstop: a drain not complete by its deadline is force-reaped (covers
        // crash-while-draining AND never-empties). Closes the "DrainDeadline never read" MEDIUM.
        if let Some(deadline) = drain_deadline {
            if now > deadline { return Some(ReapReason::Stale); }
        }
        // Lost-liveness: a draining server whose heartbeat went stale (or never arrived) has
        // crashed mid/post-drain — reap it. Uses the always-on freshness window (empty_fresh_secs,
        // default 180), NOT stale_secs (gated off by default).
        if empty_fresh_secs > 0 {
            match last_update_from_server {
                Some(last) if (now - last).num_seconds() <= empty_fresh_secs => {} // alive + draining -> exempt
                _ => return Some(ReapReason::Stale),
            }
        }
        return None;
    }
```

Task 3 passes `inst.drain_deadline` alongside `is_draining`. **Required tests:** draining + count==0 +
stale heartbeat → `Stale` (the leak case the audit flagged — the existing `draining_stale` test only
covers count=5, which already worked); draining + past `drain_deadline` → `Stale`; draining + fresh
heartbeat + count 0 → `None`.

### C3 (MEDIUM) — don't leak `Drain*` into the UE REST/OpenAPI contract
`ZoneInstance` serializes PascalCase and is returned by `GetZoneInstance`/`GetZoneInstancesForZone`.
Add `#[serde(skip_serializing_if = "Option::is_none")]` to all six `drain_*` fields in Task 1, so an
un-drained instance's responses + OpenAPI schema are unchanged.

### C4 (MEDIUM) — `set_drain_state`: monotonic guard + `rows_affected`; guarded clear
Replace the blind overwrite (Task 4) so a later `when_able` can't downgrade an in-flight `asap`, and
return `rows_affected` so callers distinguish no-op (instance gone) from success:

```rust
    let result = sqlx::query(
        "UPDATE mapinstances SET drainstate=$3, drainurgency=$4, draindropplayers=$5,
            drainreason=$6, drainrequestid=$7, draindeadline=$8
         WHERE customerguid=$1 AND mapinstanceid=$2
           AND (drainstate IS NULL OR drainurgency <= $4)",  // escalate only, never downgrade
    ) /* …binds… */ .execute(self.0).await?;
    Ok(result.rows_affected())
```
`clear_drain_state` should clear only its own drain (match `drainrequestid`) or be explicitly
operator-forced, and return `rows_affected` — so it can't wipe a stricter drain set by another
request.

### C5 (LOW) — TZ, migration CI gate, drainstate CHECK
- `draindeadline` is naive `TIMESTAMP` compared to `Utc::now().naive_utc()` — callers MUST pass UTC
  (assert at the write boundary) or switch the column to `TIMESTAMPTZ`.
- `join_map`'s explicit `drainstate`/`drainurgency` columns raise `ColumnNotFound` on the hot path if
  the migration lagged — make migration-before-image a **hard CI/deploy gate** (rows deploy waits on
  the dbmate job), not just the Task 6 runbook line.
- Add `CHECK (drainstate IN (1,2))` (NULL = not draining) to drop the dead `0` semantic.

---

## Phase 1 — Core drain plumbing (this plan)

### Task 1: `drain_*` columns — migration, schema ref, model

**Files:**
- Create: `packages/data/sql/dbmate/migrations/20260624140000_ows_mapinstance_drain.sql`
- Modify: `packages/data/sql/schema/ows/map_instances.sql`
- Modify: `apps/rows/src/models.rs` (`ZoneInstance`)

**Interfaces:**
- Produces: six nullable `drain*` columns on `mapinstances`; `ZoneInstance` gains
  `drain_state: Option<i16>`, `drain_urgency: Option<i16>`, `drain_drop_players: Option<bool>`,
  `drain_reason: Option<String>`, `drain_request_id: Option<Uuid>`, `drain_deadline: Option<NaiveDateTime>`.

- [ ] **Step 1: Write the migration**

Create `packages/data/sql/dbmate/migrations/20260624140000_ows_mapinstance_drain.sql`:

```sql
-- migrate:up
SET search_path TO ows;

ALTER TABLE MapInstances
    ADD COLUMN IF NOT EXISTS DrainState      SMALLINT  NULL,
    ADD COLUMN IF NOT EXISTS DrainUrgency    SMALLINT  NULL,
    ADD COLUMN IF NOT EXISTS DrainDropPlayers BOOLEAN  NULL,
    ADD COLUMN IF NOT EXISTS DrainReason     TEXT      NULL,
    ADD COLUMN IF NOT EXISTS DrainRequestID  UUID      NULL,
    ADD COLUMN IF NOT EXISTS DrainDeadline   TIMESTAMP NULL;

-- migrate:down
SET search_path TO ows;

ALTER TABLE MapInstances
    DROP COLUMN IF EXISTS DrainState,
    DROP COLUMN IF EXISTS DrainUrgency,
    DROP COLUMN IF EXISTS DrainDropPlayers,
    DROP COLUMN IF EXISTS DrainReason,
    DROP COLUMN IF EXISTS DrainRequestID,
    DROP COLUMN IF EXISTS DrainDeadline;
```

- [ ] **Step 2: Mirror in the reference schema**

In `packages/data/sql/schema/ows/map_instances.sql`, add inside the `CREATE TABLE MapInstances ( … )` block after `GameServerName`:

```sql
    DrainState              SMALLINT                NULL,
    DrainUrgency            SMALLINT                NULL,
    DrainDropPlayers        BOOLEAN                 NULL,
    DrainReason             TEXT                    NULL,
    DrainRequestID          UUID                    NULL,
    DrainDeadline           TIMESTAMP               NULL,
```

- [ ] **Step 3: Add the model fields**

In `apps/rows/src/models.rs`, in `pub struct ZoneInstance` after `game_server_name`:

```rust
    #[sqlx(rename = "drainstate", default)]
    pub drain_state: Option<i16>,
    #[sqlx(rename = "drainurgency", default)]
    pub drain_urgency: Option<i16>,
    #[sqlx(rename = "draindropplayers", default)]
    pub drain_drop_players: Option<bool>,
    #[sqlx(rename = "drainreason", default)]
    pub drain_reason: Option<String>,
    #[sqlx(rename = "drainrequestid", default)]
    pub drain_request_id: Option<uuid::Uuid>,
    #[sqlx(rename = "draindeadline", default)]
    pub drain_deadline: Option<chrono::NaiveDateTime>,
```

> `default` so a `SELECT mi.*` against a DB that hasn't run the migration deserializes absent columns to `None` instead of `ColumnNotFound` (mirrors `gameservername`). `get_active_reap_candidates`/`get_all_inactive_map_instances` use `SELECT mi.*`, so they map automatically.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add packages/data/sql/dbmate/migrations/20260624140000_ows_mapinstance_drain.sql \
        packages/data/sql/schema/ows/map_instances.sql apps/rows/src/models.rs
git commit -m "feat(rows): drain_* columns on mapinstances for the drain lifecycle"
```

---

### Task 2: Reaper exemption for draining instances (pure logic + tests)

**Files:**
- Modify: `apps/rows/src/agones/reaper.rs`

**Interfaces:**
- Consumes: existing `reap_decision(...)`.
- Produces: `reap_decision` gains a trailing `is_draining: bool` parameter (before `now`). When
  `is_draining`, the `Empty` and `NeverReported` reasons are suppressed (UE owns the drain shutdown);
  the `Stale` reason (crashed-while-populated) still fires so a server that crashes mid-drain is
  still reclaimed.

- [ ] **Step 1: Write the failing tests**

In `apps/rows/src/agones/reaper.rs`, inside `mod tests`, add (note all existing `reap_decision` calls will need the new arg in Step 3 — that is expected):

```rust
    // draining + empty-past-timeout -> NOT reaped (UE owns the shutdown)
    #[test]
    fn draining_empty_is_exempt() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // would be Empty if not draining
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, true, now);
        assert_eq!(d, None);
    }

    // draining + never-reported-past-grace -> NOT reaped (exempt)
    #[test]
    fn draining_never_reported_is_exempt() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00");
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, 0, 0, true, true, now);
        assert_eq!(d, None);
    }

    // draining + crashed-while-populated (stale heartbeat) -> STILL reaped (lost liveness)
    #[test]
    fn draining_stale_is_still_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago > stale_secs 120
        let d = reap_decision(5, Some(last), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 120, 0, false, true, now);
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // not draining + empty-past-timeout -> reaped (regression guard on the new arg)
    #[test]
    fn not_draining_empty_still_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, false, now);
        assert_eq!(d, Some(ReapReason::Empty));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/rows && cargo test reaper:: 2>&1 | tail -20`
Expected: FAIL — `reap_decision` takes 11 args, these calls pass 12 (compile error). That is the failing state.

- [ ] **Step 3: Add the parameter and gate**

In `reap_decision`, add `is_draining: bool` as the parameter immediately before `now`. Then gate the two count-based paths. The `Stale` branch (inside `player_count > 0`) is untouched.

Replace the `player_count == 0` handling. The full function becomes:

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
    is_draining: bool,
    now: NaiveDateTime,
) -> Option<ReapReason> {
    if player_count > 0 {
        // Stale (crashed-while-populated) still applies to draining instances: a server that
        // crashes mid-drain must still be reclaimed (lost liveness).
        if stale_secs > 0 {
            if let Some(last) = last_update_from_server {
                if (now - last).num_seconds() > stale_secs {
                    return Some(ReapReason::Stale);
                }
            }
        }
        return None;
    }

    // Draining instances are exempt from the count-based paths below: going empty is the GOAL of a
    // drain, and UE owns the SDK.Shutdown(). (Crashed-while-draining is caught by Stale above /
    // the v2 Agones-liveness cross-check; see the lifecycle spec residual.)
    if is_draining {
        return None;
    }

    if last_update_from_server.is_none() {
        if allow_never_reported {
            if let Some(created) = create_date {
                if (now - created).num_seconds() > boot_grace_secs {
                    return Some(ReapReason::NeverReported);
                }
            }
        }
        return None;
    }

    if let Some(empty_since) = last_server_empty_date {
        let limit = ((minutes_to_shutdown_after_empty.max(0) as i64) * 60 + empty_buffer_secs)
            .max(min_empty_secs);
        if (now - empty_since).num_seconds() > limit {
            return Some(ReapReason::Empty);
        }
    }
    None
}
```

- [ ] **Step 4: Update existing test call sites**

Every existing `reap_decision(...)` call in `mod tests` passes 11 args; add `false` (not draining) before the final `now` so they keep their meaning. There are 12 existing calls (the non-draining cases); insert `, false,` before `now` in each.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/rows && cargo test reaper:: 2>&1 | tail -20`
Expected: PASS — all reaper tests including the 4 new drain cases.

- [ ] **Step 6: Commit**

```bash
git add apps/rows/src/agones/reaper.rs
git commit -m "feat(rows): reaper exempts draining instances from count-based reap, keeps Stale"
```

---

### Task 3: Wire `is_draining` into the reaper cycle

**Files:**
- Modify: `apps/rows/src/jobs.rs` (`run_reap_cycle`)

**Interfaces:**
- Consumes: `ZoneInstance.drain_state` (Task 1), `reap_decision(..., is_draining, now)` (Task 2).

- [ ] **Step 1: Pass drain state into the decision**

In `apps/rows/src/jobs.rs`, in `run_reap_cycle`, the `reap_decision(...)` call currently ends with
`reaper.never_reported,` then `now,` — wait, it ends with `allow_never_reported, now`. Update the
call to pass `is_draining` computed from the candidate:

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
            inst.drain_state.unwrap_or(0) >= 1,
            now,
        ) else {
            continue;
        };
```

- [ ] **Step 2: Verify build + tests**

Run: `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15`
Expected: builds clean; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/rows/src/jobs.rs
git commit -m "feat(rows): reaper cycle passes drain_state into reap_decision"
```

---

### Task 4: Repo setter/clearer for drain state

**Files:**
- Modify: `apps/rows/src/repo/instances.rs`

**Interfaces:**
- Produces:
  - `InstanceRepo::set_drain_state(customer_guid, map_instance_id, state: i16, urgency: i16, drop_players: bool, reason: &str, request_id: Uuid, deadline: Option<NaiveDateTime>) -> Result<(), RowsError>`
  - `InstanceRepo::clear_drain_state(customer_guid, map_instance_id) -> Result<(), RowsError>`

- [ ] **Step 1: Add the methods**

In `apps/rows/src/repo/instances.rs` (in the `impl InstanceRepo`):

```rust
    /// Marks an instance draining. Orthogonal to `status` — a draining instance stays `status=2`
    /// (ready) so existing players keep playing; routing and the reaper consult `drainstate`.
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
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE mapinstances
             SET drainstate = $3, drainurgency = $4, draindropplayers = $5,
                 drainreason = $6, drainrequestid = $7, draindeadline = $8
             WHERE customerguid = $1 AND mapinstanceid = $2",
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
        Ok(())
    }

    /// Clears the drain marker (drain aborted / never happened). Restores the instance to a plain
    /// routable/reapable state.
    pub async fn clear_drain_state(
        &self,
        customer_guid: Uuid,
        map_instance_id: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE mapinstances
             SET drainstate = NULL, drainurgency = NULL, draindropplayers = NULL,
                 drainreason = NULL, drainrequestid = NULL, draindeadline = NULL
             WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(map_instance_id)
        .execute(self.0)
        .await?;
        Ok(())
    }
```

- [ ] **Step 2: Verify build**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add apps/rows/src/repo/instances.rs
git commit -m "feat(rows): set_drain_state / clear_drain_state repo methods"
```

---

### Task 5: Drain-aware `join_map` preference order

**Files:**
- Modify: `apps/rows/src/repo/instances.rs` (`join_map_by_char_name`)

**Interfaces:**
- Consumes: `drainstate`/`drainurgency` columns (Task 1).
- Produces: the "existing ready instance" selection in `join_map_by_char_name` excludes
  `asap`/`drop`-draining instances (`drainstate >= 1 AND drainurgency = 1`) and de-prioritizes
  `when_able`-draining (`drainstate >= 1 AND drainurgency = 0`) below healthy instances.

- [ ] **Step 1: Update the existing-instance query**

In `join_map_by_char_name`, the first query selects an existing `status = 2` instance ordered by
`numberofreportedplayers ASC`. Change its `WHERE` and `ORDER BY` so drain state is respected:

```rust
        let existing: Option<JoinMapResult> = sqlx::query_as(
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
                    '' AS error_message
             FROM maps m
             JOIN mapinstances mi ON mi.mapid = m.mapid AND mi.customerguid = m.customerguid
             JOIN worldservers ws ON ws.worldserverid = mi.worldserverid AND ws.customerguid = mi.customerguid
             JOIN customers c ON c.customerguid = m.customerguid
             WHERE m.customerguid = $1 AND m.zonename = $2 AND mi.status = 2
               AND NOT (COALESCE(mi.drainstate, 0) >= 1 AND COALESCE(mi.drainurgency, 0) = 1)
             ORDER BY (COALESCE(mi.drainstate, 0) >= 1) ASC,
                      mi.numberofreportedplayers ASC
             LIMIT 1",
        )
        .bind(customer_guid)
        .bind(zone_name)
        .fetch_optional(self.0)
        .await?;
```

> `NOT (drainstate>=1 AND drainurgency=1)` hard-excludes `asap`/`drop`-draining. `ORDER BY (drainstate>=1) ASC` puts healthy instances first and `when_able`-draining only as a fallback when no healthy instance exists. The `pending` placeholder query (spin-up path) is unchanged — a fresh instance is never draining.

- [ ] **Step 2: Verify build + tests**

Run: `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15`
Expected: builds clean; tests pass (no unit harness for this SQL — verified manually below).

- [ ] **Step 3: Manual verification (no DB test harness)**

Document in the PR (dev env): with two `status=2` instances for a zone, mark one `drainstate=1,
drainurgency=1` (asap) → new joins route only to the other. Mark it `drainurgency=0` (when_able)
with the other healthy → new joins still prefer the healthy one; remove the healthy one →
when_able-draining is used as fallback. `clear_drain_state` restores normal routing.

- [ ] **Step 4: Commit**

```bash
git add apps/rows/src/repo/instances.rs
git commit -m "feat(rows): drain-aware join_map preference (exclude asap/drop, when_able fallback)"
```

---

### Task 6: Runbook + migration-ordering note

**Files:**
- Modify: `docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Document the deploy ordering and the inert posture**

Add a short "Core drain plumbing (shipped)" note to the lifecycle spec: the `drain_*` columns +
reaper exemption + join_map preference are live but **inert** (no automatic setter); the
`20260624140000` migration must land before the rows image (the `join_map` SQL references
`drainstate`/`drainurgency` explicitly, so unlike `gameservername` it can't degrade on a missing
column — `SELECT mi.*` reads tolerate it via `#[sqlx(default)]`, but the `join_map` `WHERE`/`ORDER BY`
do not). Cross-reference this plan.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md
git commit -m "docs(rows): note core drain plumbing + migration ordering in lifecycle spec"
```

---

## Follow-on plans (separate — NOT in this plan)

These are real subsystems but are **blocked on open decisions**, so writing full TDD steps now would
be guesswork (violates the no-placeholders rule). Each becomes its own executable plan once its
blocker clears:

### Admission control plane (Phase 2)
- Global/tenant `accept_new_joins` gate + new-join-vs-travel (session-aware via `svc.state().sessions`).
- Storage follows the `reaper_config` pattern (env baseline + DB override, dashboard-written).
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

---

## Self-Review

**Spec coverage (Core slice of the lifecycle spec):**
- Drain state representation = dedicated `drain_*` columns → Task 1. ✅
- Reaper exempts draining from empty/never-reported, keeps lost-liveness (Stale) → Tasks 2–3. ✅
- Allocation preference order (healthy → when_able fallback → never asap/drop) → Task 5. ✅
- Setter/clearer so drain is drivable + testable, inert by default → Task 4. ✅
- Admission gates / new-vs-travel / fleet-restart → deferred to follow-on plans (with blockers). ✅ (explicitly out)

**Placeholder scan:** every code step shows code; manual-verification is used only for the DB-routing SQL (no harness, per the reaper plan precedent), not as a substitute for the pure-logic unit tests in Task 2.

**Type consistency:** `reap_decision` gains `is_draining: bool` before `now` in Task 2 (def + existing call updates) and Task 3 (cycle call) — consistent 12-arg signature. `ZoneInstance.drain_state: Option<i16>` (Task 1) is read in Task 3 (`inst.drain_state.unwrap_or(0) >= 1`). `set_drain_state`/`clear_drain_state` (Task 4) use the same column names as the migration (Task 1) and the `join_map` query (Task 5): `drainstate`, `drainurgency`, `draindropplayers`, `drainreason`, `drainrequestid`, `draindeadline`.

---

## Next up

**Phase 2 — Admission control plane** → `docs/superpowers/plans/2026-06-24-rows-drain-admission.md`

(Phase 2 hard-depends on this Core phase: it reuses `is_undefined_table` and the drain state landed here. Land Core first.)
