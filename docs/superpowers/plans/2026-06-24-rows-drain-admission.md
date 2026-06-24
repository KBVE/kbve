# ROWS Drain — Admission Control Plane Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Depends on:** Phase 1 (`2026-06-24-rows-drain-core.md`) — drain state + routing must exist first.
> **Config & docs index:** [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md).
> **Hard build/deploy gate (L1):** Task 3 reuses `is_undefined_table` and the `reaper_config` control-plane pattern, both introduced by the reaper/Core work — **this plan does not compile until those have landed.** Also, a `migrate:down` (drop table) against running code that *lacks* the degrade path would 500 every new join, so the Core degrade must be present before this migration can ever be rolled back. Enforce Phase-1-first as a deploy gate, not just a note.

**Goal:** Add the admission gate hierarchy (global + tenant `accept_new_joins`) and the new-join-vs-travel distinction, so an operator can freeze new joins game-wide or per-tenant (incident/load) while letting existing players keep playing and traveling.

**Architecture:** Reuses the `reaper_config` control-plane pattern (env baseline + per-row DB override; dashboard writes, ROWS reads). New joins honor the gate; **travel bypasses it** (a player already on an instance per `charonmapinstance`). Ships inert: env default `accept_new_joins = true`, no DB rows.

**Tech Stack:** Rust, axum, sqlx (runtime), Postgres, tokio.

## Global Constraints

(Same as the Core plan — worktree/PR #13200, conventional commits no co-author, runtime sqlx, dbmate migration + schema mirror, `#[sqlx(default)]` tolerance for unmigrated reads, inert posture.)

## Gate model

| Scope | Key | Read by |
|---|---|---|
| **Global** (game-wide) | sentinel `customerguid = '00000000-0000-0000-0000-000000000000'` | every tenant's ROWS |
| **Tenant** | this deployment's `customerguid` | this ROWS |

New joins are blocked if **either** the global sentinel row **or** the tenant row has `acceptnewjoins = false`. Absent row / absent table → fall back to the env baseline (`ROWS_ACCEPT_NEW_JOINS`, default `true`). 🕳️ **HOLE (cluster/node scope):** "cluster full → no routing there" needs a capacity signal ROWS doesn't have today (Agones places pods, not ROWS). Deferred until a capacity controller exists; only global + tenant are enforceable now.

---

### Task 1: `admission_control` table — migration, schema, model

**Files:**
- Create: `packages/data/sql/dbmate/migrations/20260624150000_ows_admission_control.sql`
- Modify: `packages/data/sql/schema/ows/admission_control.sql` (create reference file)
- Modify: `apps/rows/src/config.rs` (override struct)

**Interfaces:**
- Produces: table `ows.admission_control(customerguid uuid pk, acceptnewjoins boolean null)`;
  `AdmissionOverride { accept_new_joins: Option<bool> }` (sqlx::FromRow).

- [ ] **Step 1: Migration** — `20260624150000_ows_admission_control.sql`:

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
SET search_path TO ows;
DROP TABLE IF EXISTS admission_control;
```

> Note: the global sentinel row uses the all-zeros GUID; reads do not rely on RLS for tenant scoping (app-level `WHERE customerguid IN (tenant, sentinel)`), matching the ows convention.
> 🕳️ **M2 — RLS is decorative here.** `USING (true) WITH CHECK (true)` provides **no row scoping**; isolation rests entirely on the app-level `WHERE customerguid`. `FORCE ROW LEVEL SECURITY` only blocks anon/authenticated/public (the ows convention) — it is *not* a tenant-isolation backstop, so a query bug = cross-tenant read with no DB-level guard.
> 🕳️ **L2 — nil-GUID collision.** The global sentinel is `Uuid::nil()`. If a tenant were ever configured with the nil GUID, `WHERE customerguid = $1 OR = $2` collapses (tenant == global). Add a cheap assert at config load that the tenant `customer_guid != Uuid::nil()`.

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

- [ ] **Step 4: Run → pass.** **Step 5: Commit** — `feat(rows): accept_new_joins env baseline + gate resolution`.

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
- Produces: `InstanceRepo::is_character_on_active_instance(tenant: Uuid, char_name: &str) -> Result<bool, RowsError>` — true if the character currently sits on a `status>0` instance (⇒ this join is a **travel**, not a new login).

- [ ] **Step 1: Implement**:

```rust
pub async fn is_character_on_active_instance(
    &self,
    customer_guid: Uuid,
    char_name: &str,
) -> Result<bool, RowsError> {
    let seen: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM charonmapinstance com
            JOIN characters ch
              ON ch.customerguid = com.customerguid AND ch.characterid = com.characterid
            JOIN mapinstances mi
              ON mi.customerguid = com.customerguid AND mi.mapinstanceid = com.mapinstanceid
            WHERE com.customerguid = $1 AND ch.charname = $2 AND mi.status > 0)",
    )
    .bind(customer_guid)
    .bind(char_name)
    .fetch_one(self.0)
    .await?;
    Ok(seen)
}
```

> **CORRECTNESS — load-bearing (was BLOCKER B1).** `charonmapinstance` has **no name column**; it keys on `CharacterID` (PK `CustomerGUID, CharacterID, MapInstanceID`). `CharName` lives only on `characters`. The correlation **`ch.characterid = com.characterid`** is mandatory: without it the EXISTS degenerates to "*any* char is on an instance AND a char named $2 exists in this tenant" → `true` on every populated tenant → the gate silently no-ops (an operator-flipped freeze does nothing). Verified against `char_on_map_instance.sql` + `characters.sql`.
> **Required query-level test (catches B1):** with character A on a `status>0` instance and a *fresh* character B on none, `is_character_on_active_instance(tenant, "B")` MUST return `false` and `(tenant, "A")` `true`. The pure-resolver test does **not** exercise this — add an sqlx integration test (or a documented manual step that explicitly requires another character online).
> 🕳️ **Edge:** a player who disconnected but whose `charonmapinstance` row hasn't been swept yet is briefly mis-read as "travel" — bounded by `stale_zone_cleanup`; acceptable for an admission gate (errs toward letting a player in).

- [ ] **Step 2: Build.** **Step 3: Commit** — `feat(rows): is_character_on_active_instance (travel detection)`.

---

### Task 5: Enforce the gate in the join path

**Files:** Modify `apps/rows/src/service/instances.rs` (`get_server_to_connect_to`)

**Interfaces:**
- Consumes: `effective_accept_new_joins`, `get_admission_overrides`, `is_character_on_active_instance`.
- Produces: a **new join** (character not on an active instance) is rejected with
  `RowsError::Conflict("new joins are paused")` when the effective gate is closed; **travel** is
  always allowed.

- [ ] **Step 1: Add the check** at the top of `get_server_to_connect_to`, after `resolve_zone`:

```rust
    let repo = InstanceRepo(&self.state.db);
    // Travel detection FAILS OPEN: a read error → treat as travel, never strand a moving player.
    let is_travel = repo
        .is_character_on_active_instance(customer_guid, char_name)
        .await
        .unwrap_or(true);
    if !is_travel {
        // Admission read FAILS CLOSED for a new join (H1): the gate exists to shed load, and load
        // is exactly when Postgres is stressed and this read may time out — fail-OPEN here would
        // make the control evaporate under its own use case. On error we reject the NEW join only
        // (travel/existing players are unaffected). Proper fix: serve the gate from valkey so it
        // doesn't depend on the stressed primary (deferred — see Holes).
        let open = match repo.get_admission_overrides(customer_guid).await {
            Ok((tenant_ov, global_ov)) => crate::config::effective_accept_new_joins(
                self.state.config.accept_new_joins,
                &tenant_ov,
                &global_ov,
            ),
            Err(e) => {
                tracing::warn!(error = %e, "admission read failed — failing CLOSED for this new join");
                false
            }
        };
        if !open {
            return Err(crate::error::RowsError::Conflict(
                "new joins are paused (maintenance/load); please retry shortly".into(),
            ));
        }
    }
```

> **Split fail-direction (H1):** travel-detection failure → fail-**OPEN** (treat as travel; don't strand a moving player). Admission-read failure on a new join → fail-**CLOSED** (reject), because a load-shed gate must not evaporate when the DB is stressed — the exact condition it's used in. Trade-off: a transient DB blip briefly rejects *new* logins even with no freeze set; that's the conservative choice for a safety control and is removed once the gate is valkey-cached (Holes). **Surface/sign-off this trade-off before shipping.**
>
> **On reusing `find_existing` (H2 — declined, with reason):** `join_map_by_char_name` is **zone-scoped, not character-scoped** — its `char_name` param is `_char_name` (*unused*, verified at `repo/instances.rs`); it returns *any* ready instance for the zone, not "is THIS character already on an instance." So `find_existing`'s `Found` can't be the travel signal — a brand-new player joining a zone that has a ready instance would read as `Found` and bypass the gate. The character-level `charonmapinstance` lookup is therefore required and distinct. Cost is one cheap `EXISTS` on the new-join path only (travel skips it); the TOCTOU window (a char either has a `charonmapinstance` row or not) is negligible.
>
> **Trust boundary (M1):** the gate's bypass-resistance assumes a caller can't claim an arbitrary on-instance `char_name`. For `AuthIdentity::Player`, `verify_character_owner` runs first (player-only), so it holds. `AuthIdentity::Service` callers skip ownership and are trusted server-to-server. Document this; if untrusted non-player callers ever reach this path, verify ownership for them too.

- [ ] **Step 2: Build + tests** — `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15` → clean/pass.
- [ ] **Step 3: Manual verification** (dev) — **must have at least one OTHER character online** (else B1's missing correlation can't surface and an empty tenant falsely passes): set `admission_control` tenant row `acceptnewjoins=false`; a **fresh** character (not on any instance, with another character A online) gets the paused error; character A (already on an instance = travel) connects fine; clear the row → normal. If the fresh character is *not* rejected while others are online, the travel query is mis-correlated (B1).
- [ ] **Step 4: Commit** — `feat(rows): enforce accept_new_joins gate on new joins, allow travel`.

---

### Task 6: Runbook

**Files:** Modify `docs/superpowers/plans/2026-06-24-rows-server-lifecycle-and-shutdown.md`

- [ ] Document: the global freeze (sentinel-GUID row), the tenant freeze, env baseline `ROWS_ACCEPT_NEW_JOINS`, the fail-open semantics, and the SQL to flip a gate:

```sql
SET search_path TO ows;
-- Game-wide freeze (all tenants):
INSERT INTO admission_control (customerguid, acceptnewjoins)
VALUES ('00000000-0000-0000-0000-000000000000', false)
ON CONFLICT (customerguid) DO UPDATE SET acceptnewjoins = EXCLUDED.acceptnewjoins;
-- Lift it:
DELETE FROM admission_control WHERE customerguid = '00000000-0000-0000-0000-000000000000';
```

- [ ] Commit — `docs(rows): admission-gate runbook`.

---

## Holes (revisit after Core + this land)

- 🕳️ **Cluster/node scope** — no ROWS-side capacity signal; needs a controller marking clusters/nodes routing-ineligible. Only global + tenant enforced now.
- 🕳️ **Hard pause (block travel too)** — current model blocks only new joins; a `pause_travel` flag for true emergencies is a one-column add later.
- ✅ **Travel-detection query** — corrected (B1): correlate `com.characterid = ch.characterid`, filter `ch.charname`. No longer a hole; needs the query-level test.
- 🕳️ **Valkey-cache the admission gate (H1 follow-up)** — once the gate is served from valkey, the admission read no longer depends on the stressed primary, so fail-CLOSED can relax (cache survives a DB blip). Until then, fail-closed-on-error is the signed-off conservative default.
- 🕳️ **Hot-path cost** — gate read is a DB hit per *new* join (not travel). Fine at low scale; valkey-cache it with the occupancy layer (reaper v2 / valkey ticket).
- 🕳️ **M1 trust boundary** — if untrusted non-player identities ever reach the join path, verify character ownership for them too (today only `Player` is checked; `Service` is trusted).
- 🕳️ **Dashboard write contract** — ROWS only reads the table; the dashboard UI that writes it is separate.

---

## Next up

**Phase 3 — Fleet-restart orchestration** → `docs/superpowers/plans/2026-06-24-rows-drain-fleet-restart.md`

(Phase 3 reuses this phase's `accept_new_joins` gate for the restart lockout, and is blocked on B4 — the named Argo orchestrator. Previous: Phase 1 Core → `docs/superpowers/plans/2026-06-24-rows-drain-core.md`.)
