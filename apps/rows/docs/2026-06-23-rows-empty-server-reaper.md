# ROWS Empty-Server Reaper Implementation Plan

> **⚠️ IMPLEMENTED — code listings below are the v1 PROPOSAL; the shipped code supersedes them.**
> This reaper is built on PR #13200 (`apps/rows/src/agones/reaper.rs`, `jobs.rs`, `repo/instances.rs`,
> `config.rs`). The shipped code has folded in three rounds of audit fixes that are **not** reflected
> in the listings below — when auditing, read the source, not these snippets. Deltas vs the listings:
>
> - `ReapReason` has a third variant **`Stale`** (crashed-while-populated) + `stale_secs` knob.
> - `update_number_of_players` uses **`GREATEST($3,0)`** + a `WHEN $3 < 0` CASE (negative-count guard).
> - **`ows.reaper_config`** per-tenant override table ships (migration `20260627021802` + `merged_with`).
> - **gameservername degrade** on SQLSTATE 42703 (`is_undefined_column`); reaper-config degrade on 42P01.
> - **`pg_try_advisory_lock`** guards each reap cycle (multi-replica safe); 60s tick.
> - **`require_heartbeat`** auto-gate (never-reported suppressed until a heartbeat is ever seen).
> - **Empty freshness gate `empty_fresh_secs`** (default 180s): the empty marker is only honored when
>   `last_update_from_server` is recent — closes the "wedged heartbeat freezes 0 → reap a populated
>   server" blocker (the 2026-06-24 audit). Stays gated-off-by-default regardless.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Config & docs index:** all knobs in this plan are catalogued in
> [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) (the living registry) —
> add new knobs there in the same PR.

**Goal:** Make ROWS automatically tear down empty/abandoned Agones zone servers, so allocated GameServers stop piling up for days.

**Architecture:** ROWS gains a background reaper that decides — via a pure, unit-tested function — whether each active `mapinstances` row should be torn down, using player count + timestamps already in the DB. The reap _action_ deallocates the GameServer (failure leaves the row reap-eligible so the next cycle retries). The heartbeat handler is extended to maintain the `LastServerEmptyDate` marker, and the allocation request gains an `empty-shutdown-minutes` annotation so the UE side (separate repo) can self-shutdown first.

**⚠️ Safety / sequencing (do not skip):** ROWS has **no real occupancy signal until heartbeats are live** — without them `numberofreportedplayers` is permanently `0` and `lastupdatefromserver` permanently `NULL` for every instance, so a full server is indistinguishable from a dead one (and `join_map` routes players onto the oldest, lowest-count instance — the first to cross any age threshold). Therefore: **the reaper ships gated OFF by default. The count-based (`Empty`) path is only meaningful once the heartbeat is live; the time-based (`NeverReported`) path is independently gated and must stay off until the heartbeat is confirmed live in the target env, or it will deallocate populated servers ~`boot_grace` after spawn.** Until then, stuck servers are cleared manually (`kubectl delete gs`). Phase 1 builds the machinery inert; Phase 2 + the UE heartbeat make it safe to enable.

**Tech Stack:** Rust, axum, sqlx (runtime queries, Postgres), tokio, Agones via kube; dbmate migrations under `packages/data/sql`.

## Global Constraints

- All work in an isolated git worktree off `dev` (per `AGENTS.md`): `./kbve.sh -worktree rows-reaper`. Never commit to `dev`/`main`.
- Run Nx via `./kbve.sh -nx` in the worktree (sources `.env.local`), never bare `pnpm nx`.
- Build/test the crate with `cargo` inside `apps/rows` (e.g. `cargo test -p rows`), or `./kbve.sh -nx run rows:test` if a target exists.
- Conventional commits, no co-author lines. PR targets `dev`.
- sqlx queries are **runtime** (`sqlx::query`/`query_as`), not the `query!` macro — no `DATABASE_URL` needed to compile, no `.sqlx` cache to update.
- Migrations: add a new timestamped file under `packages/data/sql/dbmate/migrations/`; also update the reference schema file under `packages/data/sql/schema/ows/` to match. Never hand-edit generated artifacts.
- Time type is `chrono::NaiveDateTime` (DB `TIMESTAMP`). Compute "now" with `chrono::Utc::now().naive_utc()`.

---

## File Structure

- **Create** `apps/rows/src/agones/reaper.rs` — pure reap-decision logic + unit tests. One responsibility: "given a row's counts/timestamps and config, should it be reaped and why?" No IO.
- **Modify** `apps/rows/src/agones/mod.rs` — declare `pub mod reaper;` and re-export.
- **Modify** `apps/rows/src/config.rs` — two new env-driven knobs on the config struct.
- **Modify** `apps/rows/src/repo/instances.rs` — `get_active_reap_candidates`; resolve `gameservername` for deallocation; persist `gameservername` in `spin_up_server_instance_ready`.
- **Modify** `apps/rows/src/agones/pipeline.rs` — pass `gameservername` through `create_instance`.
- **Modify** `apps/rows/src/jobs.rs` — new `empty_server_reaper` task; teach `stale_zone_cleanup` to fall back to the DB `gameservername`.
- **Modify** `apps/rows/src/repo/instances.rs` (heartbeat) + `apps/rows/src/service/instances.rs` — maintain `LastServerEmptyDate` on player-count update.
- **Modify** `apps/rows/src/agones/allocate.rs` + callers — stamp `empty-shutdown-minutes` annotation in the allocation request.
- **Create** `packages/data/sql/dbmate/migrations/<ts>_ows_mapinstance_gameservername.sql` + **Modify** `packages/data/sql/schema/ows/map_instances.sql` — add `GameServerName` column + index.

---

## Phase 1 — Reaper machinery (ships gated OFF; safe to enable only after the heartbeat is live)

### Task 1: Pure reap-decision function

**Files:**

- Create: `apps/rows/src/agones/reaper.rs`
- Modify: `apps/rows/src/agones/mod.rs`
- Test: inline `#[cfg(test)]` in `apps/rows/src/agones/reaper.rs`

**Interfaces:**

- Produces: `pub enum ReapReason { NeverReported, Empty }` and
  `pub fn reap_decision(player_count: i32, last_update_from_server: Option<NaiveDateTime>, last_server_empty_date: Option<NaiveDateTime>, create_date: Option<NaiveDateTime>, minutes_to_shutdown_after_empty: i32, boot_grace_secs: i64, empty_buffer_secs: i64, allow_never_reported: bool, now: NaiveDateTime) -> Option<ReapReason>`
- `allow_never_reported` independently gates the time-based path (see safety note); pass `false` until the heartbeat is confirmed live.

- [ ] **Step 1: Write the failing tests**

```rust
// apps/rows/src/agones/reaper.rs
use chrono::NaiveDateTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReapReason {
    /// Allocated but never sent a heartbeat within the boot grace window (crash/legacy/id-bug).
    NeverReported,
    /// Reported 0 players for longer than its per-map empty timeout (+ buffer).
    Empty,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    // never-reported allowed: NULL last_update, created longer ago than boot grace -> reap
    #[test]
    fn never_reported_past_grace_is_reaped_when_allowed() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, true, now);
        assert_eq!(d, Some(ReapReason::NeverReported));
    }

    // never-reported but gating OFF -> keep (the dangerous default; protects populated servers)
    #[test]
    fn never_reported_is_kept_when_gated_off() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago, well past grace
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, false, now);
        assert_eq!(d, None);
    }

    // never-reported but still inside boot grace -> keep
    #[test]
    fn never_reported_within_grace_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:55:00"); // 5 min ago, grace 10 min
        let d = reap_decision(0, None, Some(ts("2026-06-23 11:55:00")), Some(created), 1, 600, 30, true, now);
        assert_eq!(d, None);
    }

    // empty long enough past minutes+buffer -> reap (count-based, independent of never-reported gate)
    #[test]
    fn empty_past_timeout_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s; 1 min(60s)+30s buffer = 90s
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, false, now);
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // empty but not yet past minutes+buffer -> keep (server gets first crack)
    #[test]
    fn empty_within_timeout_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:59:30"); // empty 30s < 90s
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, false, now);
        assert_eq!(d, None);
    }

    // has players -> never reaped, even if empty marker is stale
    #[test]
    fn populated_is_never_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(5, Some(now), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, true, now);
        assert_eq!(d, None);
    }

    // reported (last_update set), empty marker NULL, has 0 players but no empty-since yet -> keep
    #[test]
    fn zero_players_without_empty_marker_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(0, Some(now), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, true, now);
        assert_eq!(d, None);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/rows && cargo test reaper:: 2>&1 | tail -20`
Expected: FAIL — `cannot find function reap_decision in this scope`.

- [ ] **Step 3: Write the minimal implementation**

```rust
// apps/rows/src/agones/reaper.rs  (above the #[cfg(test)] mod)

/// Pure policy: should this instance be torn down, and why?
/// `None` = keep. The server's own `SDK.Shutdown()` is the primary path; this is the backstop.
pub fn reap_decision(
    player_count: i32,
    last_update_from_server: Option<NaiveDateTime>,
    last_server_empty_date: Option<NaiveDateTime>,
    create_date: Option<NaiveDateTime>,
    minutes_to_shutdown_after_empty: i32,
    boot_grace_secs: i64,
    empty_buffer_secs: i64,
    allow_never_reported: bool,
    now: NaiveDateTime,
) -> Option<ReapReason> {
    // A populated server is never reaped here.
    if player_count > 0 {
        return None;
    }

    // Layer 4: never heard from it, and it's older than the boot grace window.
    // GATED: without a live heartbeat, *every* instance looks never-reported (including full
    // ones), so this stays off until heartbeats are confirmed live in the target env.
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

    // Layer 3: empty for longer than its per-map timeout (+ buffer so the server self-shuts first).
    if let Some(empty_since) = last_server_empty_date {
        let limit = (minutes_to_shutdown_after_empty.max(0) as i64) * 60 + empty_buffer_secs;
        if (now - empty_since).num_seconds() > limit {
            return Some(ReapReason::Empty);
        }
    }
    None
}
```

And register the module:

```rust
// apps/rows/src/agones/mod.rs  — add alongside the other `pub mod` lines
pub mod reaper;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/rows && cargo test reaper:: 2>&1 | tail -20`
Expected: PASS — 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/rows/src/agones/reaper.rs apps/rows/src/agones/mod.rs
git commit -m "feat(rows): pure reap-decision policy for empty/abandoned zone servers"
```

---

### Task 2: Reaper config knobs

**Files:**

- Modify: `apps/rows/src/config.rs`

**Interfaces:**

- Produces four fields on the app config:
    - `empty_reaper_enabled: bool` (default **`false`** — master kill switch; the whole reaper loop no-ops when off)
    - `reap_never_reported: bool` (default **`false`** — independently gates the time-based path; keep off until the heartbeat is confirmed live)
    - `empty_reap_boot_grace_secs: i64` (default **`14400`** = 4h, not 10 min)
    - `empty_reap_buffer_secs: i64` (default `30`)
- Env: `ROWS_EMPTY_REAPER_ENABLED`, `ROWS_REAP_NEVER_REPORTED`, `ROWS_EMPTY_REAP_BOOT_GRACE_SECS`, `ROWS_EMPTY_REAP_BUFFER_SECS`.

- [ ] **Step 1: Read the existing config struct and its env-parse site**

Run: `cd apps/rows && sed -n '50,130p' src/config.rs`
Expected: see the config struct fields and the `from_env`/builder that uses `std::env::var(...).unwrap_or_else(...)`. Note the exact struct name and where ports are parsed — mirror that pattern.

- [ ] **Step 2: Add the two fields and their env parsing**

Add to the config struct (next to the existing numeric fields):

```rust
    pub empty_reaper_enabled: bool,
    pub reap_never_reported: bool,
    pub empty_reap_boot_grace_secs: i64,
    pub empty_reap_buffer_secs: i64,
```

Populate them where the struct is built from env (next to the port parsing), using the established `std::env::var(...).ok().and_then(|v| v.parse().ok()).unwrap_or(default)` idiom. Booleans default **off**:

```rust
    let empty_reaper_enabled = std::env::var("ROWS_EMPTY_REAPER_ENABLED")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(false);
    let reap_never_reported = std::env::var("ROWS_REAP_NEVER_REPORTED")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(false);
    let empty_reap_boot_grace_secs = std::env::var("ROWS_EMPTY_REAP_BOOT_GRACE_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(14400);
    let empty_reap_buffer_secs = std::env::var("ROWS_EMPTY_REAP_BUFFER_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
```

…and pass all four into the struct literal that the builder returns.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean (no "missing field" error on the config literal).

- [ ] **Step 4: Commit**

```bash
git add apps/rows/src/config.rs
git commit -m "feat(rows): add empty-reaper boot-grace and buffer config knobs"
```

---

### Task 3: Persist `gameservername` on `mapinstances` (label-independent teardown fallback)

> Rationale: `main.rs:138` already rehydrates `zone_servers` on startup via `reconcile_allocations()` (`sdk.rs:266`), but that maps GameServers back to instances using the `ows.kbve.com/zone-instance` **label** — which is written `0` at allocation and only patched by the best-effort `tag_gameserver` (the #13192 hardening gap). When that label is `0`/missing, reconcile can't recover the instance and the reaper's in-memory lookup misses. The persisted `gameservername` is the label-independent fallback the reaper consults (Task 5). It is **not** "the only restart-recovery" — it's the backstop for unreliable labels.

**Files:**

- Create: `packages/data/sql/dbmate/migrations/<ts>_ows_mapinstance_gameservername.sql`
- Modify: `packages/data/sql/schema/ows/map_instances.sql`
- Modify: `apps/rows/src/models.rs` (ZoneInstance) and `apps/rows/src/repo/instances.rs` (`spin_up_server_instance_ready`)
- Modify: `apps/rows/src/agones/pipeline.rs` (`create_instance`)

**Interfaces:**

- Produces: `mapinstances.GameServerName VARCHAR(253) NULL`; `spin_up_server_instance_ready` gains a `game_server_name: &str` parameter and writes it; `ZoneInstance` gains `pub game_server_name: Option<String>`.

- [ ] **Step 1: Write the migration**

Use a timestamp after the latest existing migration (e.g. `20260627021758`). Create `packages/data/sql/dbmate/migrations/20260627021758_ows_mapinstance_gameservername.sql`:

```sql
-- migrate:up
SET search_path TO ows;

ALTER TABLE MapInstances ADD COLUMN IF NOT EXISTS GameServerName VARCHAR(253) NULL;

-- migrate:down
SET search_path TO ows;

ALTER TABLE MapInstances DROP COLUMN IF EXISTS GameServerName;
```

> No index: the only reader (`get_gameserver_name`) queries by the PK `(CustomerGUID, MapInstanceID)`. A `(CustomerGUID, GameServerName)` index would only be justified by a gs-name→instance lookup, which nothing does — don't add it speculatively (YAGNI).

- [ ] **Step 2: Mirror it in the reference schema file**

Edit `packages/data/sql/schema/ows/map_instances.sql` — add the column inside the `CREATE TABLE MapInstances ( … )` block, after `LastServerEmptyDate`:

```sql
    GameServerName          VARCHAR(253)            NULL,
```

- [ ] **Step 3: Add the model field**

In `apps/rows/src/models.rs`, inside `pub struct ZoneInstance`, after the `last_server_empty_date` field:

```rust
    #[sqlx(rename = "gameservername")]
    pub game_server_name: Option<String>,
```

> Note: `get_all_inactive_map_instances` / `get_active_reap_candidates` use `SELECT mi.*`, so the new column maps automatically. Any `SELECT`-list that names columns explicitly for `ZoneInstance` must add `mi.gameservername`.

- [ ] **Step 4: Write `gameservername` on instance creation**

In `apps/rows/src/repo/instances.rs`, change `spin_up_server_instance_ready` to accept and store the name:

```rust
    pub async fn spin_up_server_instance_ready(
        &self,
        customer_guid: Uuid,
        world_server_id: i32,
        zone_name: &str,
        port: i32,
        game_server_name: &str,
    ) -> Result<i32, RowsError> {
        let row: Option<(i32,)> = sqlx::query_as(
            "INSERT INTO mapinstances (customerguid, worldserverid, mapid, port, status, gameservername)
             SELECT $1, $2, m.mapid, $4, 2, $5
             FROM maps m WHERE m.customerguid = $1 AND m.zonename = $3
             ON CONFLICT DO NOTHING
             RETURNING mapinstanceid",
        )
        .bind(customer_guid)
        .bind(world_server_id)
        .bind(zone_name)
        .bind(port)
        .bind(game_server_name)
        .fetch_optional(self.0)
        .await?;

        Ok(row.map(|r| r.0).unwrap_or(0))
    }
```

- [ ] **Step 5: Pass the name through the pipeline**

In `apps/rows/src/agones/pipeline.rs`, `create_instance` already holds `alloc.game_server_name`. Update its call:

```rust
        self.instance_id = repo
            .spin_up_server_instance_ready(
                self.customer_guid,
                self.world_server_id,
                self.zone,
                alloc.port,
                &alloc.game_server_name,
            )
            .await?;
```

- [ ] **Step 6: Verify it compiles**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add packages/data/sql/dbmate/migrations/20260627021758_ows_mapinstance_gameservername.sql \
        packages/data/sql/schema/ows/map_instances.sql \
        apps/rows/src/models.rs apps/rows/src/repo/instances.rs apps/rows/src/agones/pipeline.rs
git commit -m "feat(rows): persist gameservername on mapinstances for restart-safe teardown"
```

---

### Task 4: Reap-candidate query + gs-name deallocation fallback

**Files:**

- Modify: `apps/rows/src/repo/instances.rs`

**Interfaces:**

- Produces:
    - `InstanceRepo::get_active_reap_candidates(&self, customer_guid: Uuid) -> Result<Vec<ZoneInstance>, RowsError>` — active (`status > 0`) instances with the `maps` join, capped at 500.
    - `InstanceRepo::get_gameserver_name(&self, customer_guid: Uuid, map_instance_id: i32) -> Result<Option<String>, RowsError>` — DB fallback when the in-memory `zone_servers` map is missing the instance (e.g. `reconcile_allocations` couldn't rehydrate it because the `zone-instance` label was `0`/missing).

- [ ] **Step 1: Add the candidate query**

In `apps/rows/src/repo/instances.rs`, mirror `get_all_inactive_map_instances` but for active rows:

```rust
    pub async fn get_active_reap_candidates(
        &self,
        customer_guid: Uuid,
    ) -> Result<Vec<ZoneInstance>, RowsError> {
        let zones = sqlx::query_as::<_, ZoneInstance>(
            "SELECT mi.*, m.mapname AS map_name, m.mapmode AS map_mode,
                    m.softplayercap AS soft_player_cap,
                    m.hardplayercap AS hard_player_cap,
                    m.minutestoshutdownafterempty AS minutes_to_shutdown_after_empty
             FROM mapinstances mi
             JOIN maps m ON m.mapid = mi.mapid AND m.customerguid = mi.customerguid
             WHERE mi.customerguid = $1 AND mi.status > 0
             ORDER BY mi.mapinstanceid
             LIMIT 500",
        )
        .bind(customer_guid)
        .fetch_all(self.0)
        .await?;
        Ok(zones)
    }
```

- [ ] **Step 2: Add the gs-name fallback lookup**

```rust
    pub async fn get_gameserver_name(
        &self,
        customer_guid: Uuid,
        map_instance_id: i32,
    ) -> Result<Option<String>, RowsError> {
        let row: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT gameservername FROM mapinstances
             WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(map_instance_id)
        .fetch_optional(self.0)
        .await?;
        Ok(row.and_then(|r| r.0))
    }
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add apps/rows/src/repo/instances.rs
git commit -m "feat(rows): reap-candidate query and gs-name deallocation fallback"
```

---

### Task 5: Wire the reaper job

**Files:**

- Modify: `apps/rows/src/jobs.rs`

**Interfaces:**

- Consumes: `reaper::reap_decision`, `InstanceRepo::get_active_reap_candidates`, `InstanceRepo::get_gameserver_name`, `InstanceRepo::shut_down_server_instance`, `AgonesClient::deallocate`, config `empty_reap_boot_grace_secs` / `empty_reap_buffer_secs`.

- [ ] **Step 1: Add the reaper to `spawn_all`**

In `apps/rows/src/jobs.rs`, register the new task:

```rust
pub fn spawn_all(svc: Arc<OWSService>) {
    tokio::spawn(zone_health_monitor(svc.clone()));
    tokio::spawn(stale_zone_cleanup(svc.clone()));
    tokio::spawn(empty_server_reaper(svc.clone()));
    tokio::spawn(spinup_lock_expiry(svc.clone()));
    tokio::spawn(session_cache_sweep(svc));
}
```

- [ ] **Step 2: Implement the reaper task**

Add to `apps/rows/src/jobs.rs` (import `crate::agones::reaper`):

```rust
/// Backstop for the server's own `SDK.Shutdown()`. Gated OFF by default (see safety note):
/// the whole loop no-ops unless `empty_reaper_enabled`, and the time-based `NeverReported`
/// path is independently gated by `reap_never_reported`.
///
/// Teardown ordering is deallocate-FIRST: only on a successful `deallocate` do we drop the
/// in-memory tracking and flip `status=0`. On a deallocate *failure* we leave the row at
/// `status>0` and tracked, so the next 60s cycle re-evaluates and retries — a transient Agones
/// error can never strand a GameServer. The one exception is an instance with no resolvable
/// GameServer name (legacy/reconcile-miss): there's nothing to deallocate, so it's flipped
/// `status=0` (terminal) with a one-time warn rather than re-warned forever.
async fn empty_server_reaper(svc: Arc<OWSService>) {
    use crate::agones::reaper::reap_decision;

    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.tick().await;

    loop {
        interval.tick().await;

        if !svc.state().config.empty_reaper_enabled {
            continue; // master kill switch — ships OFF
        }

        let guid = svc.state().config.customer_guid;
        let boot_grace = svc.state().config.empty_reap_boot_grace_secs;
        let buffer = svc.state().config.empty_reap_buffer_secs;
        let allow_never_reported = svc.state().config.reap_never_reported;
        let now = chrono::Utc::now().naive_utc();
        let repo = InstanceRepo(&svc.state().db);

        let candidates = match repo.get_active_reap_candidates(guid).await {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "Reaper: failed to load active instances");
                continue;
            }
        };
        if candidates.len() >= 500 {
            warn!(count = candidates.len(), "Reaper: candidate query hit the 500-row cap — possible under-reaping");
        }

        let Some(ref agones) = svc.state().agones else { continue };

        for inst in &candidates {
            let Some(reason) = reap_decision(
                inst.number_of_reported_players,
                inst.last_update_from_server,
                inst.last_server_empty_date,
                inst.create_date,
                inst.minutes_to_shutdown_after_empty,
                boot_grace,
                buffer,
                allow_never_reported,
                now,
            ) else {
                continue;
            };

            // Resolve the GameServer: in-memory tracking first, DB column as label-independent fallback.
            let gs_name = match svc.state().zone_servers.get(&inst.map_instance_id) {
                Some(v) => Some(v.value().clone()),
                None => repo
                    .get_gameserver_name(guid, inst.map_instance_id)
                    .await
                    .ok()
                    .flatten(),
            };
            let Some(gs) = gs_name else {
                // Terminal state for the no-name case (legacy rows from before the `gameservername`
                // column, or a `reconcile_allocations` miss). We can't deallocate a GameServer we
                // can't name, so flip status=0 to drop it from routing AND the candidate set, and
                // surface it ONCE for manual/infra check — instead of re-warning every 60s forever.
                // Deliberate, narrow exception to deallocate-first: in practice these are legacy
                // rows whose pod is already gone; a still-live one is flagged for `kubectl` cleanup.
                match repo.shut_down_server_instance(guid, inst.map_instance_id).await {
                    Ok(()) => warn!(instance_id = inst.map_instance_id, ?reason, "Reaper: no resolvable GameServer name — marked status=0; verify no orphaned pod (manual cleanup)"),
                    Err(e) => warn!(error = %e, instance_id = inst.map_instance_id, "Reaper: failed to set status=0 for unresolvable instance"),
                }
                continue;
            };

            info!(instance_id = inst.map_instance_id, ?reason, gs = %gs, "Reaping empty/abandoned zone server");

            // Deallocate FIRST. Only on success do we drop tracking + flip status=0.
            match agones.deallocate(&gs).await {
                Ok(()) => {
                    svc.state().zone_servers.remove(&inst.map_instance_id);
                    if let Err(e) = repo.shut_down_server_instance(guid, inst.map_instance_id).await {
                        warn!(error = %e, instance_id = inst.map_instance_id, "Reaper: deallocated but failed to set status=0");
                    }
                }
                Err(e) => {
                    // Leave status>0 + tracking intact; next cycle re-evaluates and retries.
                    warn!(error = %e, gs = %gs, instance_id = inst.map_instance_id, "Reaper: deallocate failed — will retry next cycle");
                }
            }
        }
    }
}
```

- [ ] **Step 3: Verify it compiles and unit tests still pass**

Run: `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15`
Expected: builds clean; existing + reaper unit tests pass.

- [ ] **Step 4: Lint**

Run: `cd apps/rows && cargo clippy 2>&1 | tail -20`
Expected: no new warnings in `jobs.rs`/`reaper.rs`.

- [ ] **Step 5: Manual verification (no DB test harness)**

Document in the PR, in a throwaway dev env only:

1. **Default-off:** with no env set, the reaper loop no-ops — confirm no "Reaping…" logs even with an eligible row present.
2. **Count-based (safe path):** set `ROWS_EMPTY_REAPER_ENABLED=true`; with a row at `numberofreportedplayers=0` and `lastserveremptydate` older than `minutes*60 + buffer`, after ≤60s the GameServer is deallocated, then the row goes `status=0`. A row with `numberofreportedplayers > 0` is untouched.
3. **Deallocate-failure retry:** simulate a deallocate error (e.g. delete the GameServer out-of-band first) → the row stays `status>0` and is retried next cycle (no permanent orphan).
4. **Never-reported stays off:** with `ROWS_REAP_NEVER_REPORTED` unset, a `lastupdatefromserver IS NULL` row past grace is **not** reaped (guards populated servers pre-heartbeat).

- [ ] **Step 6: Commit**

```bash
git add apps/rows/src/jobs.rs
git commit -m "feat(rows): empty-server reaper job (count-based + never-reported backstop)"
```

---

## Phase 2 — Precision once UE heartbeats land

### Task 6: Maintain `LastServerEmptyDate` on player-count update

**Files:**

- Modify: `apps/rows/src/repo/instances.rs` (`update_number_of_players`)

**Interfaces:**

- Consumes: existing `update_number_of_players(customer_guid, zone_instance_id, number_of_players)` call sites (REST/gRPC `health_stream`) — signature unchanged.
- Produces: side effect — `LastServerEmptyDate` stamped `NOW()` on the 0→still-0 transition (first time it's seen empty) and cleared when players > 0.

- [ ] **Step 1: Update the query to maintain the empty marker**

Replace the body of `update_number_of_players` in `apps/rows/src/repo/instances.rs`:

```rust
    pub async fn update_number_of_players(
        &self,
        customer_guid: Uuid,
        zone_instance_id: i32,
        number_of_players: i32,
    ) -> Result<(), RowsError> {
        sqlx::query(
            "UPDATE mapinstances
             SET numberofreportedplayers = $3,
                 lastupdatefromserver = NOW(),
                 lastserveremptydate = CASE
                     WHEN $3 > 0 THEN NULL
                     WHEN lastserveremptydate IS NULL THEN NOW()
                     ELSE lastserveremptydate
                 END
             WHERE customerguid = $1 AND mapinstanceid = $2",
        )
        .bind(customer_guid)
        .bind(zone_instance_id)
        .bind(number_of_players)
        .execute(self.0)
        .await?;
        Ok(())
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/rows && cargo build 2>&1 | tail -20`
Expected: builds clean.

- [ ] **Step 3: Manual verification**

Document in the PR: POST `/api/Instance/UpdateNumberOfPlayers` with count 0 sets `lastserveremptydate` once; a follow-up with count 0 leaves it unchanged; a POST with count > 0 clears it to NULL. Combined with Task 5, an instance reported empty for `minutes*60 + buffer` is then reaped.

- [ ] **Step 4: Commit**

```bash
git add apps/rows/src/repo/instances.rs
git commit -m "feat(rows): maintain LastServerEmptyDate on player-count heartbeat"
```

---

### Task 7: Stamp `empty-shutdown-minutes` annotation in the allocation request

**Files:**

- Modify: `apps/rows/src/agones/allocate.rs` (`allocate` / `try_allocate` signatures + request body)
- Modify: `apps/rows/src/agones/pipeline.rs` (`allocate_via_agones` passes the value)
- Modify: `apps/rows/src/service/instances.rs` (look up the per-map value and thread it in)

**Interfaces:**

- Consumes: per-map `minutes_to_shutdown_after_empty` (already on `ZoneInstance` from `get_zone_instances_for_zone`).
- Produces: `allocate(map_name, zone_instance_id, empty_shutdown_minutes)`; the GameServerAllocation request includes `spec.metadata.annotations["ows.kbve.com/empty-shutdown-minutes"]`.

- [ ] **Step 1: Add the annotation to the allocation request**

In `apps/rows/src/agones/allocate.rs`, extend `try_allocate` (and the public `allocate`) with an `empty_shutdown_minutes: i32` parameter, and add annotations to the allocation `metadata`:

```rust
        let allocation = json!({
            "apiVersion": "allocation.agones.dev/v1",
            "kind": "GameServerAllocation",
            "metadata": { "namespace": &self.namespace },
            "spec": {
                "required": { "matchLabels": { "agones.dev/fleet": &self.fleet } },
                "metadata": {
                    "labels": {
                        "ows.kbve.com/map": map_name,
                        "ows.kbve.com/zone-instance": zone_instance_id.to_string()
                    },
                    "annotations": {
                        "ows.kbve.com/empty-shutdown-minutes": empty_shutdown_minutes.to_string()
                    }
                }
            }
        });
```

- [ ] **Step 2: Thread the value from the pipeline**

In `apps/rows/src/agones/pipeline.rs`, `allocate_via_agones` calls `agones.allocate(self.zone, 0)`. Add a field to the pipeline (e.g. `empty_shutdown_minutes: i32`, set in `new`) or pass it through, and call:

```rust
        let alloc = agones
            .allocate(self.zone, 0, self.empty_shutdown_minutes)
            .await
            .map_err(|e| RowsError::Internal(format!("Agones allocation failed: {e}")))?;
```

- [ ] **Step 3: Source the per-map value in the service**

In `apps/rows/src/service/instances.rs::get_server_to_connect_to`, after `resolve_zone`, look up the per-map timeout and pass it into `AllocationPipeline::new`:

```rust
        let minutes = InstanceRepo(&self.state.db)
            .get_zone_instances_for_zone(customer_guid, &resolved_zone)
            .await
            .ok()
            .and_then(|v| v.first().map(|z| z.minutes_to_shutdown_after_empty))
            .unwrap_or(1);

        let pipeline = AllocationPipeline::new(customer_guid, &resolved_zone, &self.state.db, minutes);
```

> Update `AllocationPipeline::new` to accept and store `empty_shutdown_minutes`. Any other `AllocationPipeline::new` call site (e.g. the lock-contention re-poll path in `allocate_and_track`) passes the same value; for the re-poll path `0` is acceptable since it does not allocate.

- [ ] **Step 4: Verify it compiles and tests pass**

Run: `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15`
Expected: builds clean; all tests pass.

- [ ] **Step 5: Manual verification**

Document in the PR: after an allocation, `kubectl get gs <name> -o jsonpath='{.metadata.annotations.ows\.kbve\.com/empty-shutdown-minutes}'` returns the map's configured value.

- [ ] **Step 6: Commit**

```bash
git add apps/rows/src/agones/allocate.rs apps/rows/src/agones/pipeline.rs apps/rows/src/service/instances.rs
git commit -m "feat(rows): stamp empty-shutdown-minutes annotation on allocation for UE self-shutdown"
```

---

## Out of scope (other repo / other tickets)

- **UE (chuck repo):** `SDK.Shutdown()` on empty timer (reads the annotation), heartbeat `{ zoneInstanceId, playerCount }`, drop server-side `RegisterLauncher`. Tracked in #13194's "Unreal side" contract.
- **Hardening the `zone-instance` label** onto the allocation critical path — shared with #13192; not required for the Phase-1 backstop (which keys on `createdate`, not the label).
- **Multi-zone travel-on-allocate** — #13192.

---

## Self-Review

**Spec coverage (#13194 ROWS side):**

- Heartbeat ingest maintains `LastServerEmptyDate` → Task 6. ✅
- Count-based reap (layer 3) → Tasks 1 + 5, behind `empty_reaper_enabled`. ✅
- Time-based net (layer 4) → Tasks 1 + 5, behind `reap_never_reported` (off until heartbeat live). ✅
- Reap action via `deallocate` → Task 5, **deallocate-first** (failure leaves the row reap-eligible for retry; no orphan). ✅
- Persist `gameservername` (label-independent teardown fallback) → Task 3, used in Task 5. ✅
- `empty-shutdown-minutes` annotation → Task 7. ✅
- Drop server-side `RegisterLauncher` → out of scope here (UE contract + #13192 removal). Noted.

**Review fixes (PR #13200 audit) folded in:**

- ⚠️ Mass-reap of populated servers pre-heartbeat → reaper gated OFF by default; `NeverReported` independently gated; `boot_grace` default 4h. (Tasks 1, 2, 5)
- 🐛 Orphan on failed deallocate → deallocate-first ordering, retry on failure. (Task 5)
- 🧹 Dead index dropped; restart rationale corrected (`reconcile_allocations`); 500-row truncation now logged. (Tasks 3, 4, 5)

**Type consistency:** `reap_decision` signature is identical in Task 1 (def), Task 5 (call). `spin_up_server_instance_ready` gains `game_server_name: &str` in Task 3 and is called with `&alloc.game_server_name` same task. `ZoneInstance.game_server_name: Option<String>` (Task 3) is only read for SELECT mapping. `allocate(map, zone_instance_id, empty_shutdown_minutes)` consistent across Task 7 def + call.

**Placeholder scan:** no TBD/"handle errors"/"similar to" — every code step shows the code. Manual-verification steps are used only where there is genuinely no DB test harness (documented as a Global Constraint), not as a substitute for unit tests on the pure logic.

---

## Operational Runbook (production-audit follow-up)

Folds in the merge-condition items from the PR #13200 production audit. The reaper ships **inert**
(`ROWS_EMPTY_REAPER_ENABLED=false`); the only live behavior on merge is the harmless
`lastserveremptydate` marker writes in the heartbeat handler.

> **⚠️ This PR does NOT auto-clean the servers currently piled up — in any safe configuration.**
> Existing stuck instances have `last_update_from_server = NULL` and `player_count = 0` (no live
> heartbeat), so the only path that could reap them is `NeverReported`, gated by
> `ROWS_REAP_NEVER_REPORTED` — and turning that on **pre-heartbeat also deallocates _populated_
> servers** (a full server is indistinguishable from a dead one without heartbeats). Additionally,
> pre-existing rows have `gameservername = NULL` (it's only written on INSERT, never backfilled —
> `ON CONFLICT DO NOTHING`), so even if the reaper selected them it would take the no-name terminal
> path: flip `status=0` and log "verify no orphaned pod" **while the real GameServer keeps
> running**. **Until UE heartbeats are live, clear the current backlog manually** with
> `kubectl delete gs <name> -n <agones-ns>`. The reaper is a forward-looking backstop, not a
> backfill for today's mess.

### 1. Migration / image ordering (`gameservername` column)

The `gameservername` migration (`20260627021758`) is applied by the **manually-triggered**
`ci-dbmate-deploy` workflow (`workflow_dispatch`, SHA-confirmed, gated by the `kilobase-prod`
GitHub Environment), **not** automatically on merge or on the rows image rollout — the two are
independent steps.

- **Degrade-safe by code:** `spin_up_server_instance_ready` catches SQLSTATE 42703
  (undefined_column) and falls back to a column-less INSERT, so a rows image that ships **before**
  the migration no longer causes a scale-from-0 allocation outage — allocation succeeds, only
  `gameservername` persistence is deferred (the reaper's DB-name fallback is gated off anyway).
- **Recommended order anyway:** run `ci-dbmate-deploy` for the target SHA **before** rolling the
  rows image, so restart-safe teardown is fully functional from the first allocation.
- **Verify after dbmate runs:**
    ```sql
    SET search_path TO ows;
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='ows' AND table_name='mapinstances' AND column_name='gameservername';
    ```
    Expect one row. If empty, the migration has not applied — rows is running in degrade mode.

### 2. Per-env enablement — HARD GATE (do this per environment, never globally at once)

The reaper knobs live in `apps/kube/rows/tenants/base/deployment.yaml`: the tuning values
(`BOOT_GRACE`/`BUFFER`/`MIN_EMPTY`) are present at safe defaults, and the three dangerous switches
(`ROWS_EMPTY_REAPER_ENABLED`, `ROWS_REAP_NEVER_REPORTED`, `ROWS_EMPTY_REAP_STALE_SECS`) ship
**commented out** so enabling is a deliberate, reviewable GitOps diff — never an out-of-band env
edit that drifts from Argo.

> **GATE — `ROWS_REAP_NEVER_REPORTED` MUST NOT be uncommented in any env until step 1 below is
> signed off for that env.** It deallocates _populated_ servers ~`boot_grace` (default 4h) after
> spawn when heartbeats aren't live, because a full server is then indistinguishable from a dead
> one. This is the single most dangerous flag in the PR.
>
> **Defence in depth — the `require_heartbeat` auto-gate (default ON).** Even if `never_reported`
> is enabled prematurely, the reaper suppresses the never-reported path until it has observed _at
> least one_ heartbeat for the tenant (`lastupdatefromserver IS NOT NULL` on any instance). With no
> UE heartbeat configured, none is ever seen, so populated servers are never reaped. This makes the
> gate above a defense-in-depth process control rather than the only thing standing between you and
> an outage — but **do not** disable `require_heartbeat` to "force" cleanup of the current backlog
> (those rows also have `gameservername = NULL`, so they'd take the no-name terminal path anyway —
> use `kubectl delete gs`). Note the auto-gate latches once satisfied: a _later_ global heartbeat
> outage is still a (narrow) risk for servers spawned during it.

Enable strictly in this order, per env (dev → beta → release):

1. **Confirm heartbeats are live in THIS env first.** With the env carrying real player traffic,
   check that `lastupdatefromserver` advances and `numberofreportedplayers` reflects reality:
    ```sql
    SET search_path TO ows;
    SELECT mapinstanceid, numberofreportedplayers, lastupdatefromserver, lastserveremptydate
      FROM mapinstances WHERE customerguid = '<tenant-guid>' AND status > 0
      ORDER BY lastupdatefromserver DESC NULLS LAST LIMIT 20;
    ```
    If `lastupdatefromserver` is NULL/stale for live servers, **stop** — heartbeats are not live;
    enabling the never-reported path here would evict players.
2. **Enable the count-based path only:** set `ROWS_EMPTY_REAPER_ENABLED=true`, leave
   `ROWS_REAP_NEVER_REPORTED` unset/false. Watch logs for `Reaping empty/abandoned zone server`
   and confirm only genuinely-empty instances are torn down.
3. **Enable `ROWS_REAP_NEVER_REPORTED=true` only after** step 1 holds for that env. Startup emits a
   `warn!` for each dangerous knob — confirm the logged config matches intent.
4. **`ROWS_EMPTY_REAP_STALE_SECS > 0`** (crashed-while-populated) only once heartbeat delivery is
   trusted; a _global_ heartbeat outage would otherwise make every live server look stale.

Env flags drift between dev/beta/release values files — treat enablement as a per-env change, not a
single global toggle.

### 3. Multiple rows replicas

The reaper now guards each cycle with a tenant-scoped Postgres advisory lock
(`pg_try_advisory_lock`), so scaling rows past `replicas: 1` no longer risks two reapers
double-deallocating the same GameServer — only the lock holder reaps per cycle. No manual step
required before scaling; the spin-up path remains protected by its existing per-zone lock.

> **Cancellation caveat (post-merge audit, G3).** The cycle is _panic_-safe — `run_reap_cycle`
> runs as a supervised `tokio::spawn(...).await`, so the explicit `pg_advisory_unlock` below it
> always runs after a panic. It is **not** _cancellation_-safe: if the `empty_server_reaper` task is
> aborted between `pg_try_advisory_lock` and `pg_advisory_unlock`, the session-level lock is skipped
> and leaks on the pooled `lock_conn` (the lock outlives the connection's return to the pool), wedging
> this tenant's reaping until that connection is recycled. Harmless today (nothing aborts the jobs
> selectively; at process exit the connection closes and Postgres releases the lock). **Becomes real
> when the drain/shutdown work starts aborting background tasks** — see the interaction note in
> `2026-06-24-rows-drain-core.md`. Mitigation when drain lands: drain the reaper via a cancellation
> token that lets the in-flight cycle finish, or scope the lock to a transaction.

### 4. Reaper index (`idx_mapinstances_active`) stranded INVALID

A `CREATE INDEX CONCURRENTLY` interrupted mid-build leaves an INVALID index; `IF NOT EXISTS` makes a
re-run skip it, so reaper scans silently fall back to seq scans. Recovery (also noted in the
migration file):

```sql
SET search_path TO ows;
SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE NOT i.indisvalid AND c.relname = 'idx_mapinstances_active';   -- confirm invalid
DROP INDEX CONCURRENTLY IF EXISTS idx_mapinstances_active;            -- then re-run dbmate up
```

### 5. Per-tenant reaper config (`ows.reaper_config`)

All seven reaper knobs are configurable two ways, with the env providing the baseline and the DB
overriding per field:

- **Env baseline (per deployment):** the `ROWS_EMPTY_REAP*` / `ROWS_REAP_*` env vars in
  `tenants/base/deployment.yaml` (overridable per tenant via overlay env patch). Changing these is a
  redeploy.
- **DB override (per tenant, no redeploy):** a row in `ows.reaper_config` keyed on `customerguid`.
  The reaper reads it **every cycle** and merges it over the env baseline — any non-NULL column wins,
  NULL means "use the env value". So enable/disable/tune a single tenant live, without a rollout.

Columns (all NULLable): `enabled`, `neverreported`, `requireheartbeat`, `bootgracesecs`,
`buffersecs`, `stalesecs`, `minemptysecs`.

```sql
SET search_path TO ows;
-- Enable the count-based reaper for one tenant, leave never-reported off, keep the heartbeat gate:
INSERT INTO reaper_config (customerguid, enabled, neverreported, requireheartbeat)
VALUES ('<tenant-guid>', true, false, true)
ON CONFLICT (customerguid) DO UPDATE
   SET enabled = EXCLUDED.enabled,
       neverreported = EXCLUDED.neverreported,
       requireheartbeat = EXCLUDED.requireheartbeat;

-- Revert a tenant to pure env behavior: delete its row.
DELETE FROM reaper_config WHERE customerguid = '<tenant-guid>';
```

Notes:

- The master `enabled` is itself overridable, so a tenant can be turned on via DB even when the env
  ships it off — apply the same step-1 heartbeat sign-off before doing so. The `require_heartbeat`
  auto-gate (section 2) still applies regardless of how `never_reported` was enabled.
- The table is created by migration `20260627021802`. Until that migration runs, the reaper detects
  the missing table (SQLSTATE 42P01) and cleanly falls back to env config — no per-cycle errors.

### 6. Connection-pool budget (post-merge audit, G1 — FIXED in code)

The reaper is the single largest concurrent consumer of the DB pool. `rows` connects **directly to
the CNPG RW primary** (`supabase-cluster-rw.kilobase…:5432`) with a `DB_MAX_CONNECTIONS`-sized sqlx
pool (deployment: **10**; `acquire_timeout` 5s, `db.rs`). The pool's 10 slots are real primary
backends, and the reaper's draw is:

- `lock_conn` held **out of the pool for the entire cycle** (advisory lock → run cycle → unlock),
  plus `run_reap_cycle` fanning out up to `MAX_CONCURRENT_REAPS` `reap_one` tasks, **each acquiring a
  pool connection** for the `status=0` flip → peak ≈ `1 + MAX_CONCURRENT_REAPS`.
- Meanwhile the **player hot path** needs the same pool: `update_number_of_players` on every UE
  heartbeat, and `join_map`/allocation. A reap batch saturating the pool blocks these on `acquire()`
  (fails after 5s); a heartbeat gap can then make _other_ servers look reap-eligible — a feedback loop.

**Fix shipped (PR #13200):** `MAX_CONCURRENT_REAPS` lowered **8 → 4** (`jobs.rs`), so the reaper draws
≤ `1 + 4 = 5` of 10, leaving ≥5 for the hot path. The invariant the constant must keep:

```
1 (lock) + MAX_CONCURRENT_REAPS + (hot-path headroom) ≤ DB_MAX_CONNECTIONS
```

`DB_MAX_CONNECTIONS` is **deliberately NOT raised** here: it lives in `tenants/base`, so a bump
multiplies across every tenant against the primary's `max_connections`. Scaling teardown throughput
by enlarging the pool belongs to the **pooler migration (KBVE #7593)** — and even then the reaper's
_lock_ connection must stay session-pinned (see §3): the transaction-mode RW pooler would void the
advisory lock. This whole concern is **inert while the reaper ships off** (lock + teardown
connections are acquired only _after_ the `enabled` check), but the capped constant is the standing
guard for whenever it's enabled.

### 7. Known residuals (post-merge audit, PR #13200)

Status after the audit-action pass: **G1, G4, Q1 fixed in code** (PR #13200); **G2, G3 remain
tracked follow-ups** (G2 is RabbitMQ infra; G3 only bites once the drain feature lands). None blocked
the inert merge.

- **G2 — spin-up MQ failures are silently dropped (no DLX).** `apps/rows/src/mq.rs` rejects a
  twice-failed spin-up `requeue:false`, but **no `x-dead-letter-exchange` is configured on the
  queue**, so the message is _dropped_, not dead-lettered (the code comment says so). A zone whose
  allocation fails through the retry window is lost with only a `warn!`; the requesting player is
  stuck. **Follow-up PR:** add a DLX to the spin-up queue + alert on DLQ depth. (Not reaper-specific;
  rode in on this PR via the `redelivered` retry fix. Also noted under Out-of-scope in
  `2026-06-24-rows-server-lifecycle-and-shutdown.md`.)
- **G3 — advisory-lock unlock is panic-safe but not cancellation-safe.** See the cancellation caveat
  in §3 above and the interaction note in `2026-06-24-rows-drain-core.md`.
- **G4 — never-reported rows starved past the 500-row cap (FIXED in code).** The candidate scan
  ordered `lastserveremptydate ASC NULLS LAST`, burying every never-reported row
  (`lastserveremptydate IS NULL`) _after_ all empty rows, so in a backlog > 500 they never entered
  the candidate set. **Fix shipped (PR #13200):** order by `COALESCE(lastserveremptydate, createdate)
ASC` — each row sorts by its _own_ reap clock (empty rows by empty-date, never-reported by
  createdate/boot-grace), interleaving both by reap-worthiness. The partial index still serves the
  `status > 0` predicate; the ≤500-row sort is in-memory. The cap-hit is still logged.
- **Q1 — `worldservers` row leak on reap (RESOLVED + FIXED in code: Low, pre-existing — not a routing hazard).**
  Fix shipped (PR #13200): `reap_one` now calls `deactivate_world_server_if_last_instance` after the
  `status=0` flip — a single `UPDATE … WHERE NOT EXISTS (other active instance on that worldserver)`,
  best-effort, so it bounds the leak without breaking the 1:N launcher case. Original analysis:
  `reap_one` deletes the GameServer and sets `mapinstances.status=0`, but leaves the `worldservers`
  row at `serverstatus=1`. Cardinality _is_ effectively 1:1 — `register_world_server`
  (`pipeline.rs`) mints a fresh `Uuid::new_v4()` per allocation, so the `register_launcher`
  `ON CONFLICT (customerguid, zoneserverguid)` never fires and every allocation inserts a new
  `worldservers` row. **But there is no mis-routing hazard:** the Agones spin-up path never reuses an
  existing `serverstatus=1` worldserver — `find_existing` only short-circuits a player to a _ready_
  instance (`map_instance_status == 2`); a "pending" row falls through to `allocate_via_agones` →
  `register_world_server`, which creates a _new_ worldserver and ignores the stale one. So a reaped
  GameServer's dangling row can never be handed to a player as a connect target. The real consequence
  is **`worldservers` table growth** — each reaped GS orphans a `serverstatus=1` row that's never set
  to 0. This is **pre-existing**, not reaper-introduced: `stale_zone_cleanup` and
  `deallocate_on_failure` don't clean `worldservers` either; the reaper just adds volume.
  **Optional hygiene fix (not required to prevent an incident):** call
  `deactivate_world_server_by_instance` in `reap_one` (and ideally in the other deallocate paths)
  before the `mapinstances` row's `status` is flipped, while the instance→worldserver subquery still
  resolves — bounds the table growth.

### 8. Independent re-audit (PR #13200, post-prior-audit pass)

A fresh production-grade audit over the merged-tip state. The prior passes (H1/M1/M2/M3/L1/L2/G1–G4/Q1)
held up; nothing new rises to blocker. Triage below — two code fixes landed, the rest documented with
the technical reason they are _not_ code-changed (the suggested fix would conflict with intended design
or the risk of touching audited code exceeds the benefit).

**Fixed in code (this pass):**

- **3.1 — hot-path cost for the empty-shutdown annotation (Medium → made opt-out).** Every allocation
  (join hot path + MQ spin-up) does an extra synchronous `get_map_minutes_to_shutdown_after_empty` DB
  read to stamp `ows.kbve.com/empty-shutdown-minutes`. Added a dedicated
  `ROWS_STAMP_EMPTY_SHUTDOWN_ANNOTATION` knob (`ReaperKnobs`, env-only) so that cost is now
  opt-out: set `false` and the call sites pass `0` (no DB read) while `try_allocate` omits the
  annotation for any `<= 0` value. **Default ON** by maintainer decision — the annotation is stamped
  even before a UE consumer exists, so it's already present when one lands; the perf escape hatch is
  there if the per-allocation read ever matters. Independent of `enabled`. Documented in
  `deployment.yaml` and the config index.
- **5.2 — `empty_shutdown_minutes_floor` overflow on absurd config (Low → FIXED).** `(min_empty_secs +
59)` on an i64 could overflow for a pathological operator value; switched to `saturating_add(59)`.

**Documented, not code-changed (with rationale):**

- **2.1 — negative player-count is clamped to 0 but doesn't start the empty timer (Low, WONTFIX).** A
  server persistently reporting a negative count stores `0` (via `GREATEST($3,0)`) without stamping
  `lastserveremptydate`, so the Empty path never fires for it. This is the _author's explicit_ choice
  ("a negative is treated as a glitch and leaves it untouched") and re-touching the heartbeat write — on
  the all-servers hot path — for a pathological UE bug is higher-risk than the edge it closes. Accept.
- **3.2 — reaper reads `reaperconfig` every 60s even while shipped disabled (Low, by design).** The DB
  override read happens before the `enabled` check _on purpose_: it's the no-redeploy enable path (a
  tenant flips `enabled=true` in the DB). Short-circuiting on the env baseline would kill that feature.
  The read is a single PK lookup per tenant per cycle; cost is negligible. Keep.
- **4.1 — `hashtext` advisory-lock key can collide across tenants (Low, benign).** Two tenant GUIDs can
  `hashtext` to the same int4, serializing their reap cycles. No safety impact (all queries are
  `WHERE customerguid`; no cross-tenant deallocation) — a collided tenant just skips a cycle and retries
  next tick. Changing the lock-key derivation is riskier than the benign throughput nit. Keep.
- **4.2 — background jobs are detached with no supervision/restart (Low, pre-existing).** `spawn_all`
  fires five un-tracked `tokio::spawn`s; a panic in a loop's _scaffolding_ (outside the per-cycle
  isolation) kills that job silently. Pre-existing pattern the reaper merely joins. Follow-up: a
  supervising wrapper (log + restart) across all five jobs — out of scope for this PR's diff.
- **10.1 — spin-up retry-once has no backoff (Low, acceptable).** First failure `requeue:true` is
  redelivered immediately, so a deterministic failure burns both attempts back-to-back before
  dead-lettering. Bounded (→ DLQ), no infinite loop. A delayed-retry queue is the real fix if transient
  recovery matters; not warranted now.
- **Index/ORDER BY mismatch (Low, already acknowledged in-code).** `idx_mapinstances_active` orders by
  `LastServerEmptyDate` but the candidate query sorts by `COALESCE(lastserveremptydate, createdate)`; the
  ≤500-row sort is in-memory. Fine at current scale (noted in `get_active_reap_candidates`).

**Most-likely-incident (30d):** the reaper ships OFF, so the realistic risk is _not_ mass deallocation
(triple-gated: `enabled` + `never_reported` + `require_heartbeat` auto-gate). It's **silent
under-reaping on first enable** if `heartbeat_interval ≥ ROWS_EMPTY_REAP_FRESH_SECS` — the Empty path
no-ops even with `ENABLED=true`. Detectable via the per-cycle "empty servers retained: heartbeat stale
vs empty_fresh_secs" log, _if_ someone watches it. Make verifying `heartbeat_interval < FRESH_SECS` a
hard precondition in the §2 enablement runbook.
