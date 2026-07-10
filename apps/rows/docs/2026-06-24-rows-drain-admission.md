# ROWS Drain — Admission Control Plane Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Depends on:** Phase 1 (`2026-06-24-rows-drain-core.md`) — drain state + routing must exist first.
> **Config & docs index:** [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md).
> **Hard build/deploy gate (L1):** Task 3 reuses `is_undefined_table` and the `reaper_config` control-plane pattern, both introduced by the reaper/Core work — **this plan does not compile until those have landed.** Verified absent on `dev` at audit time (`grep is_undefined_table apps/rows/src` → 0 hits). Enforce Phase-1-first as a CI precondition, not just a note.
> **F4 — rollback is code-only; never `migrate:down`.** The `admission_control` table is **inert when unused** (no reader → no effect), so a rollback never needs to drop it. Two hazards make `migrate:down` actively dangerous: (1) dropping the table against running code that _lacks_ the Phase-1 degrade path 500s every new join (the L1 case); (2) `DROP TABLE` **silently destroys any active operator freeze** — if an operator set a game-wide freeze during an incident and someone then runs `migrate:down`, the safety control evaporates with no log mid-incident. **Canonical rollback = revert the ROWS image via Argo (code-only); leave the table in place.** Document this in the runbook (Task 6) and treat `migrate:down` as incident-only-with-sign-off.

**Goal:** Add the admission gate hierarchy (global + tenant `accept_new_joins`) and the new-join-vs-travel distinction, so an operator can freeze new joins game-wide or per-tenant (incident/load) while letting existing players keep playing and traveling.

**Architecture:** Reuses the `reaper_config` control-plane pattern (env baseline + per-row DB override; dashboard writes, ROWS reads). New joins honor the gate; **travel bypasses it** (a player already on an instance per `charonmapinstance`). Ships inert: env default `accept_new_joins = true`, no DB rows.

**Tech Stack:** Rust, axum, sqlx (runtime), Postgres, tokio.

> **Audit revision — 2026-06-28 (production audit, findings folded in):**
>
> - **F6 (fail direction):** admission-read error on a new join now fails **OPEN**, not closed. Fail-closed against the stressed primary would turn a routine DB blip into a game-wide new-login outage even with no freeze set. A freeze is now best-effort under DB stress until the gate is valkey-cached. _(Operator-signed-off posture for the no-valkey phase.)_
> - **F1 (travel query):** keys on the already-resolved `CharacterID` and drops the `characters`/`CharName` join — kills the unindexed scan, the name-ambiguity, and the B1 no-op risk in one move.
> - **F2 (status code):** paused joins return `503 / gRPC unavailable` (retryable), not `409 / already_exists`.
> - **F3 (migration stamp):** re-stamp ahead of HEAD (`20260628120000`+), not a back-dated `20260624…`.
> - **F4 (rollback):** code-only via Argo; `migrate:down` destroys active freeze state — incident-only.
> - **F5 (hot-path cost):** documented — every join pays travel detection, new joins pay a 2nd read.
> - **L2 (nil-GUID guard):** now a **mandatory** startup assert, not optional.
> - **Task-4 query test:** now **mandatory** (was "test or manual step").

## Global Constraints

(Same as the Core plan — worktree/PR #13200, conventional commits no co-author, runtime sqlx, dbmate migration + schema mirror, `#[sqlx(default)]` tolerance for unmigrated reads, inert posture.)

## Gate model

| Scope                  | Key                                                              | Read by             |
| ---------------------- | ---------------------------------------------------------------- | ------------------- |
| **Global** (game-wide) | sentinel `customerguid = '00000000-0000-0000-0000-000000000000'` | every tenant's ROWS |
| **Tenant**             | this deployment's `customerguid`                                 | this ROWS           |

New joins are blocked if **either** the global sentinel row **or** the tenant row has `acceptnewjoins = false`. Absent row / absent table → fall back to the env baseline (`ROWS_ACCEPT_NEW_JOINS`, default `true`). 🕳️ **HOLE (cluster/node scope):** "cluster full → no routing there" needs a capacity signal ROWS doesn't have today (Agones places pods, not ROWS). Deferred until a capacity controller exists; only global + tenant are enforceable now.

---

### Task 1: `admission_control` table — migration, schema, model

**Files:**

- Create: `packages/data/sql/dbmate/migrations/20260628120000_ows_admission_control.sql`
- Modify: `packages/data/sql/schema/ows/admission_control.sql` (create reference file)
- Modify: `apps/rows/src/config.rs` (override struct)

> **F3 — migration must out-stamp HEAD.** dbmate applies any not-yet-recorded version regardless of timestamp, but an _out-of-order_ stamp (older than already-applied migrations) yields a non-monotonic `schema.sql` mirror diff and breaks any CI that asserts ordering. At time of writing, the newest in-tree migration is `20260626120000`. **Re-stamp this file (and the Phase-1 reaper/Core migrations) to a timestamp newer than the newest migration on `dev` at merge time** — do not ship a back-dated `20260624…` stamp. Filename below uses `20260628120000` as a placeholder; bump it again if `dev` advances before merge.

**Interfaces:**

- Produces: table `ows.admission_control(customerguid uuid pk, acceptnewjoins boolean null)`;
  `AdmissionOverride { accept_new_joins: Option<bool> }` (sqlx::FromRow).

- [ ] **Step 1: Migration** — `20260628120000_ows_admission_control.sql` (re-stamp per F3 above):

```sql
-- migrate:up
SET search_path TO ows;

CREATE TABLE IF NOT EXISTS admission_control
(
    CustomerGUID    UUID    NOT NULL,
    AcceptNewJoins  BOOLEAN NULL,
    CONSTRAINT PK_AdmissionControl PRIMARY KEY (CustomerGUID)
);

ALTER TABLE admission_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_control FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admission_control FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON admission_control TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admission_control TO ows;
CREATE POLICY ows_access ON admission_control FOR ALL TO ows USING (true) WITH CHECK (true);
CREATE POLICY service_role_access ON admission_control FOR ALL TO service_role USING (true) WITH CHECK (true);

-- migrate:down
-- WARNING (F4): this DROP destroys any active operator freeze (incl. the global sentinel row).
-- Rollbacks are code-only (revert the ROWS image); run this down-migration only deliberately,
-- never as part of an incident rollback, and never against pre-Phase-1 code (would 500 every join).
SET search_path TO ows;
DROP TABLE IF EXISTS admission_control;
```

> Note: the global sentinel row uses the all-zeros GUID; reads do not rely on RLS for tenant scoping (app-level `WHERE customerguid IN (tenant, sentinel)`), matching the ows convention.
> 🕳️ **M2 — RLS is decorative here.** `USING (true) WITH CHECK (true)` provides **no row scoping**; isolation rests entirely on the app-level `WHERE customerguid`. `FORCE ROW LEVEL SECURITY` only blocks anon/authenticated/public (the ows convention) — it is _not_ a tenant-isolation backstop, so a query bug = cross-tenant read with no DB-level guard.
> ⚠️ **L2 — nil-GUID collision (assert is MANDATORY, not optional).** The global sentinel is `Uuid::nil()`. If a tenant were ever configured with the nil GUID, `WHERE customerguid = $1 OR = $2` collapses (tenant == global) and a tenant freeze silently becomes a global freeze (or vice-versa). This is the **only** guard preventing one tenant from poisoning the global sentinel. Implemented as a hard fail at config load — see Task 2, Step 5.

- [ ] **Step 2: Reference schema** — create `packages/data/sql/schema/ows/admission_control.sql` mirroring the table + RLS block (same shape as `reaper_config.sql`).

- [ ] **Step 3: Override struct** — in `apps/rows/src/config.rs`:

```rust
#[derive(Debug, Clone, Default, sqlx::FromRow)]
pub struct AdmissionOverride {
    #[sqlx(rename = "acceptnewjoins")]
    pub accept_new_joins: Option<bool>,
}
```

- [ ] **Step 4: Build** — `cd apps/rows && cargo build 2>&1 | tail -20` → clean.
- [ ] **Step 5: Commit** — `feat(rows): admission_control table + AdmissionOverride`.

---

### Task 2: Env baseline + effective-gate resolution

**Files:**

- Modify: `apps/rows/src/config.rs`

**Interfaces:**

- Produces: `AppConfig`/`RowsConfig` gains `accept_new_joins: bool` (env `ROWS_ACCEPT_NEW_JOINS`, default `true`); a pure `fn effective_accept_new_joins(env: bool, tenant: &AdmissionOverride, global: &AdmissionOverride) -> bool` returning `false` if either override is `Some(false)`, else `env`.

- [ ] **Step 1: Failing test** (pure resolution) in `config.rs` `mod tests`:

```rust
#[test]
fn admission_gate_closed_if_either_scope_false() {
    let off = AdmissionOverride { accept_new_joins: Some(false) };
    let on = AdmissionOverride { accept_new_joins: Some(true) };
    let none = AdmissionOverride::default();
    assert!(!effective_accept_new_joins(true, &off, &none));   // tenant closed
    assert!(!effective_accept_new_joins(true, &none, &off));    // global closed
    assert!(effective_accept_new_joins(true, &on, &none));      // open
    assert!(effective_accept_new_joins(true, &none, &none));    // env baseline
    assert!(!effective_accept_new_joins(false, &none, &none));  // env off
}
```

- [ ] **Step 2: Run → fail** (`effective_accept_new_joins` undefined). `cd apps/rows && cargo test admission_gate 2>&1 | tail`.
- [ ] **Step 3: Implement**:

```rust
pub fn effective_accept_new_joins(
    env: bool,
    tenant: &AdmissionOverride,
    global: &AdmissionOverride,
) -> bool {
    if tenant.accept_new_joins == Some(false) || global.accept_new_joins == Some(false) {
        return false;
    }
    tenant.accept_new_joins.or(global.accept_new_joins).unwrap_or(env)
}
```

Add the env parse (`env_bool("ROWS_ACCEPT_NEW_JOINS", true)`) and thread `accept_new_joins` onto the config struct + `AppConfig` (mirror how `reaper` is threaded).

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5 (L2 — mandatory): nil-GUID guard at config load.** Where the tenant `customer_guid` is parsed/loaded, hard-fail if it equals `Uuid::nil()`:

```rust
assert!(
    customer_guid != Uuid::nil(),
    "ROWS customer_guid must not be the all-zeros GUID (collides with the global admission sentinel)"
);
// or, preferred for a config loader: return a RowsError/anyhow Err instead of panicking,
// so a misconfigured deployment fails fast at startup with a clear message rather than mid-request.
```

This is the only thing preventing a tenant from aliasing the global sentinel (see L2). It must run at startup, not per-request.

- [ ] **Step 6: Commit** — `feat(rows): accept_new_joins env baseline + gate resolution + nil-guid guard`.

---

### Task 3: Repo read of admission overrides (degrade on missing table)

**Files:** Modify `apps/rows/src/repo/instances.rs`

**Interfaces:**

- Produces: `InstanceRepo::get_admission_overrides(tenant: Uuid) -> Result<(AdmissionOverride /*tenant*/, AdmissionOverride /*global*/), RowsError>` — one query for both rows; `(default, default)` on SQLSTATE 42P01 (table absent).

- [ ] **Step 1: Implement** (reuses `is_undefined_table` from the reaper work):

```rust
pub async fn get_admission_overrides(
    &self,
    tenant: Uuid,
) -> Result<(crate::config::AdmissionOverride, crate::config::AdmissionOverride), RowsError> {
    const GLOBAL: Uuid = Uuid::nil();
    let result = sqlx::query_as::<_, (Uuid, Option<bool>)>(
        "SELECT customerguid, acceptnewjoins FROM admission_control
         WHERE customerguid = $1 OR customerguid = $2",
    )
    .bind(tenant)
    .bind(GLOBAL)
    .fetch_all(self.0)
    .await;

    match result {
        Ok(rows) => {
            let mut t = crate::config::AdmissionOverride::default();
            let mut g = crate::config::AdmissionOverride::default();
            for (guid, accept) in rows {
                if guid == GLOBAL { g.accept_new_joins = accept; }
                else { t.accept_new_joins = accept; }
            }
            Ok((t, g))
        }
        Err(e) if is_undefined_table(&e) => Ok((Default::default(), Default::default())),
        Err(e) => Err(e.into()),
    }
}
```

- [ ] **Step 2: Build.** **Step 3: Commit** — `feat(rows): read tenant+global admission overrides`.

---

### Task 4: Travel detection (`charonmapinstance` presence)

**Files:** Modify `apps/rows/src/repo/instances.rs`

**Interfaces:**

- Produces: `InstanceRepo::is_character_on_active_instance(tenant: Uuid, character_id: i32) -> Result<bool, RowsError>` — true if the character currently sits on a `status>0` instance (⇒ this join is a **travel**, not a new login).

> **F1 — key on the already-known `CharacterID`, not `CharName`.** The join path has already resolved the full `Character` (via `get_by_name`, `service/instances.rs:24`) _before_ this check runs, so `character.characterid` is in scope at the call site. Pass it directly and query `charonmapinstance` by `characterid` — its PK is `(CustomerGUID, CharacterID, MapInstanceID)`, so `(customerguid, characterid)` is an index-seekable PK prefix. This **drops the `characters` join entirely**, which buys three things:
>
> 1. **No unindexed scan.** `CharName` has no index (verified — `characters.sql`); a `WHERE ch.charname = $2` join would scan per login on the hot path.
> 2. **No name ambiguity.** `CharName` is _not_ unique (PK is `(CustomerGUID, CharacterID)`); keying on `CharacterID` removes the wrong-row risk.
> 3. **B1 is structurally gone.** The old `charname`-based query needed a `ch.characterid = com.characterid` correlation; omitting it made the EXISTS a tenant-wide no-op. Keying on `CharacterID` directly removes the correlation — and thus the failure mode — entirely.

- [ ] **Step 1: Implement**:

```rust
pub async fn is_character_on_active_instance(
    &self,
    customer_guid: Uuid,
    character_id: i32,
) -> Result<bool, RowsError> {
    let seen: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM charonmapinstance com
            JOIN mapinstances mi
              ON mi.customerguid = com.customerguid AND mi.mapinstanceid = com.mapinstanceid
            WHERE com.customerguid = $1 AND com.characterid = $2 AND mi.status > 0)",
    )
    .bind(customer_guid)
    .bind(character_id)
    .fetch_one(self.0)
    .await?;
    Ok(seen)
}
```

> **Required query-level test (MANDATORY — not a manual-step substitute).** Add an sqlx integration test: character A on a `status>0` instance and a _fresh_ character B on none ⇒ `is_character_on_active_instance(tenant, B.characterid)` MUST return `false` and `(tenant, A.characterid)` `true`. This proves the gate actually distinguishes a new join from a travel. The pure-resolver test (Task 2) does **not** exercise it. A manual dev check is _additional_, not a replacement — an automated regression guard is required because a future edit to this query is otherwise undetectable.
> 🕳️ **Edge:** a player who disconnected but whose `charonmapinstance` row hasn't been swept yet is briefly mis-read as "travel" — bounded by `stale_zone_cleanup`; acceptable for an admission gate (errs toward letting a player in).

- [ ] **Step 2: Build.** **Step 3: Commit** — `feat(rows): is_character_on_active_instance (travel detection)`.

---

### Task 5: Enforce the gate in the join path

**Files:** Modify `apps/rows/src/service/instances.rs` (`get_server_to_connect_to`)

**Interfaces:**

- Consumes: `effective_accept_new_joins`, `get_admission_overrides`, `is_character_on_active_instance`.
- Produces: a **new join** (character not on an active instance) is rejected with
  `RowsError::Unavailable("new joins are paused")` (HTTP 503 + `Retry-After`, gRPC `unavailable` —
  a **retryable** code, see F2) when the effective gate is closed; **travel** is always allowed.
- Requires (F2): add a `RowsError::Unavailable(String)` variant in `apps/rows/src/error.rs`,
  mapping to `StatusCode::SERVICE_UNAVAILABLE` (with a `Retry-After` header) and
  `tonic::Status::unavailable(m)`. Do **not** reuse `Conflict` (→ HTTP 409 / gRPC `already_exists`,
  which clients treat as permanent/non-retryable — see F2).

- [ ] **Step 0 (F2): add the retryable error variant** in `error.rs` — `Unavailable(String)` →
      `503` (+ `Retry-After: 5`) and `tonic::Status::unavailable`. This is what makes the UE client
      back off and retry rather than surfacing a hard error.

- [ ] **Step 1: Add the check** at the top of `get_server_to_connect_to`, after `resolve_zone`
      (the `Character` is already resolved here, so its `characterid` is in scope — F1):

```rust
    let repo = InstanceRepo(&self.state.db);
    // Travel detection FAILS OPEN: a read error (or no resolved character) → treat as travel,
    // never strand a moving player. Key on the already-resolved CharacterID (F1).
    let is_travel = match character.as_ref() {
        Some(ch) => repo
            .is_character_on_active_instance(customer_guid, ch.characterid)
            .await
            .unwrap_or(true),
        None => false, // no character row → cannot be a travel → treat as a new join
    };
    if !is_travel {
        // Admission read FAILS OPEN for a new join (F6 — operator sign-off: fail-open).
        // Rationale: this read hits the PRIMARY, and the gate's whole purpose is to run under load
        // — exactly when the primary is stressed and this read may time out. Fail-CLOSED here would
        // make a transient DB blip reject *every* new login game-wide even with NO freeze set, while
        // the gate's own extra query piles load onto the stressed primary — i.e. the control would
        // manufacture the outage it exists to prevent. So on a read error we fail OPEN (allow the new
        // join) and log. Accepted trade-off: during a *real* freeze, a read failure lets a new join
        // slip through — acceptable because this is a soft load-shed, not a hard security gate. A
        // hard-pause variant (block travel too) and a valkey-cached read that could safely fail
        // CLOSED are both deferred (see Holes).
        let open = match repo.get_admission_overrides(customer_guid).await {
            Ok((tenant_ov, global_ov)) => crate::config::effective_accept_new_joins(
                self.state.config.accept_new_joins,
                &tenant_ov,
                &global_ov,
            ),
            Err(e) => {
                tracing::warn!(error = %e, "admission read failed — failing OPEN for this new join (F6)");
                true
            }
        };
        if !open {
            return Err(crate::error::RowsError::Unavailable(
                "new joins are paused (maintenance/load); please retry shortly".into(),
            ));
        }
    }
```

> **Split fail-direction (H1 / F6):** travel-detection failure → fail-**OPEN** (treat as travel; don't strand a moving player). Admission-read failure on a new join → **also fail-OPEN** (allow the join), per operator sign-off (F6). A load-shed gate that fails _closed_ against the stressed primary it reads from would convert a partial DB degradation into a total game-wide new-login outage — even with no freeze configured — and add load while doing it. The freeze therefore only takes effect when the read **succeeds** and returns `false`. Revisit once the gate is valkey-cached: a cache that survives a primary blip _can_ safely fail-closed (Holes). **This fail-open default is the signed-off posture for the no-valkey phase.**
>
> **On reusing `find_existing` (H2 — declined, with reason):** `join_map_by_char_name` is **zone-scoped, not character-scoped** — its `char_name` param is `_char_name` (_unused_, verified at `repo/instances.rs`); it returns _any_ ready instance for the zone, not "is THIS character already on an instance." So `find_existing`'s `Found` can't be the travel signal — a brand-new player joining a zone that has a ready instance would read as `Found` and bypass the gate. The character-level `charonmapinstance` lookup is therefore required and distinct. **Cost accounting (F5):** the travel-detection `EXISTS` runs on **every** join (you must classify the join before you can skip the gate) — a cheap PK-prefix lookup after F1. The admission read (`get_admission_overrides`) runs **only** on new joins (travel short-circuits before it). So: +1 query per travel, +2 per new join. The TOCTOU window (a char either has a `charonmapinstance` row or not) is negligible.
>
> **Trust boundary (M1):** the gate's bypass-resistance assumes a caller can't claim an arbitrary on-instance `char_name`. For `AuthIdentity::Player`, `verify_character_owner` runs first (player-only), so it holds. `AuthIdentity::Service` callers skip ownership and are trusted server-to-server. Document this; if untrusted non-player callers ever reach this path, verify ownership for them too.

- [ ] **Step 2: Build + tests** — `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15` → clean/pass. The mandatory Task-4 query-level test must be green here.
- [ ] **Step 3: Manual verification** (dev): set `admission_control` tenant row `acceptnewjoins=false`; a **fresh** character (not on any instance) gets the `503 / unavailable` paused error; a character already on a `status>0` instance (= travel) connects fine; clear the row → both normal. (Verifies the new-join-vs-travel split end-to-end; the automated Task-4 test is the actual regression guard.)
- [ ] **Step 4: Commit** — `feat(rows): enforce accept_new_joins gate on new joins (fail-open), allow travel`.

---

### Task 6: Runbook

**Files:** Modify `apps/rows/docs/2026-06-24-rows-server-lifecycle-and-shutdown.md`

- [x] Document, at minimum:
    - The global freeze (sentinel-GUID row) and the tenant freeze, plus the SQL below to flip each.
    - Env baseline `ROWS_ACCEPT_NEW_JOINS` (default `true`).
    - **Fail-open semantics (F6):** both travel detection and the admission read fail OPEN on DB error — a set freeze is **best-effort during DB stress** and may let a new join through if the read fails. Operators must not treat the freeze as a hard guarantee; it is a load-shed/maintenance control.
    - **Client behavior (F2):** a blocked new join returns `503 Service Unavailable` (HTTP) / `unavailable` (gRPC) with `Retry-After` — a retryable signal, not a hard error.
    - **Rollback (F4): code-only — revert the ROWS image via Argo; never run `migrate:down`.** Dropping the table destroys any active freeze and (against pre-Phase-1 code) 500s every join. The table is inert when unused, so there is never a reason to drop it during a rollback.
    - SQL to flip a gate:

```sql
SET search_path TO ows;
-- Game-wide freeze (all tenants):
INSERT INTO admission_control (customerguid, acceptnewjoins)
VALUES ('00000000-0000-0000-0000-000000000000', false)
ON CONFLICT (customerguid) DO UPDATE SET acceptnewjoins = EXCLUDED.acceptnewjoins;
-- Lift it:
DELETE FROM admission_control WHERE customerguid = '00000000-0000-0000-0000-000000000000';
```

- [x] Commit — folded into this PR's admission-audit branch (not a standalone `docs(rows)` commit).

---

## Holes (revisit after Core + this land)

- 🕳️ **Cluster/node scope** — no ROWS-side capacity signal; needs a controller marking clusters/nodes routing-ineligible. Only global + tenant enforced now.
- 🕳️ **Hard pause (block travel too)** — current model blocks only new joins; a `pause_travel` flag for true emergencies is a one-column add later.
- ✅ **Travel-detection query** — corrected and simplified (F1): key directly on the already-resolved `CharacterID`, drop the `characters`/`CharName` join entirely. B1 (the missing-correlation no-op) is now structurally impossible. Still needs the mandatory query-level test (Task 4).
- 🕳️ **Valkey-cache the admission gate (F6 follow-up)** — the current phase fails **OPEN** on admission-read error (signed off) precisely because the read hits the stressed primary; a DB blip must not reject all new logins. Once the gate is served from valkey (survives a primary blip), the fail direction _can_ be revisited (a cache-backed read could safely fail-closed for a real freeze). Until then, **fail-open is the deliberate posture**, and a set freeze is best-effort during DB stress.
    - ⚠️ **Guardrail for the valkey ticket:** the cache must be a **degradable optimization, not a hard dependency** — valkey miss/error MUST fall through to the Postgres read (or to fail-open), never block the login path. ROWS already models this elsewhere (RabbitMQ `try_connect` is non-fatal, `mq.rs`; sessions are an in-process `DashMap` with DB write-through). If the gate is ever made to read _only_ from valkey, a valkey outage reintroduces F6 on a different box — a hard cache dependency on the critical join path turns "valkey down" into "no new logins game-wide." Keep valkey optional on this path.
- 🕳️ **Hard pause that survives DB stress** — because the gate fails open, a freeze is not guaranteed to hold while the primary is degraded. If a _hard_ guarantee is ever needed (true emergency), pair the valkey-cached read with the `pause_travel` flag below.
- 🕳️ **Hot-path cost (F5)** — every join pays one travel-detection `EXISTS`; new joins pay a second query (admission read). Both hit the primary. Cheap at low scale (PK-prefix lookups after F1); valkey-cache both with the occupancy layer (reaper v2 / valkey ticket) before high login concurrency (patch-day reconnect storms).
- 🕳️ **Client retry contract (F2)** — paused joins now return `503 / gRPC unavailable` (retryable). Confirm the UE client actually backs off and retries on this code rather than surfacing a hard error to the player; if it does not, the runbook's "retry shortly" promise is hollow.
- 🕳️ **M1 trust boundary** — if untrusted non-player identities ever reach the join path, verify character ownership for them too (today only `Player` is checked; `Service` is trusted).
- 🕳️ **Dashboard write contract** — ROWS only reads the table; the dashboard UI that writes it is separate.

---

## Next up

**Phase 3 — Fleet-restart orchestration** → `apps/rows/docs/2026-06-24-rows-drain-fleet-restart.md`

(Phase 3 reuses this phase's `accept_new_joins` gate for the restart lockout, and is blocked on B4 — the named Argo orchestrator. Previous: Phase 1 Core → `apps/rows/docs/2026-06-24-rows-drain-core.md`.)
