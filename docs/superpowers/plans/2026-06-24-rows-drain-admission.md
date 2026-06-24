# ROWS Drain — Admission Control Plane Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Depends on:** Phase 1 (`2026-06-24-rows-drain-core.md`) — drain state + routing must exist first.

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
            JOIN characters ch ON ch.charname = $2 AND ch.customerguid = com.customerguid
            JOIN mapinstances mi ON mi.mapinstanceid = com.mapinstanceid AND mi.customerguid = com.customerguid
            WHERE com.customerguid = $1 AND mi.status > 0)",
    )
    .bind(customer_guid)
    .bind(char_name)
    .fetch_one(self.0)
    .await?;
    Ok(seen)
}
```

> 🕳️ **Small hole:** the exact char identity column (`charname` vs a guid) — confirm against `characters.sql`/`char_on_map_instance.sql` when implementing and adjust the join. The *signal* (on-instance ⇒ travel) is the design; the column name is the only unknown.
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
    let is_travel = repo
        .is_character_on_active_instance(customer_guid, char_name)
        .await
        .unwrap_or(true); // fail-open to travel: never strand an in-flight player on a DB blip
    if !is_travel {
        let (tenant_ov, global_ov) = repo
            .get_admission_overrides(customer_guid)
            .await
            .unwrap_or_default();
        let open = crate::config::effective_accept_new_joins(
            self.state.config.accept_new_joins,
            &tenant_ov,
            &global_ov,
        );
        if !open {
            return Err(crate::error::RowsError::Conflict(
                "new joins are paused (maintenance/load); please retry shortly".into(),
            ));
        }
    }
```

> Fail-open choices are deliberate: travel detection failure → treat as travel (don't strand a moving player); admission read failure → `unwrap_or_default()` = both `None` = falls to env baseline (`true`). A closed gate requires a *successful* read of a `false` row.

- [ ] **Step 2: Build + tests** — `cd apps/rows && cargo build 2>&1 | tail -20 && cargo test 2>&1 | tail -15` → clean/pass.
- [ ] **Step 3: Manual verification** (dev): set `admission_control` tenant row `acceptnewjoins=false`; a fresh character (not on an instance) gets the paused error; a character already on an instance (travel) connects fine; clear the row → normal.
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
- 🕳️ **Travel-detection identity column** — confirm `characters` key (Task 4) at implementation.
- 🕳️ **Hot-path cost** — gate read is a DB hit per *new* join (not travel). Fine at low scale; valkey-cache it with the occupancy layer (reaper v2 / valkey ticket).
- 🕳️ **Dashboard write contract** — ROWS only reads the table; the dashboard UI that writes it is separate.
