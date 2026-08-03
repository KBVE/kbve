# professiondb → SkillRegistry load-time assertion (B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Catch professiondb↔skill drift at server startup — a fail-loud runtime assertion that every professiondb gather `skill_ref` resolves in the `SkillRegistry`.

**Architecture:** A pure, dependency-free `ProfessionDb::validate_skill_refs(is_known)` method in `bevy_items` (takes a resolver closure so `bevy_items` gains NO `bevy_skills` dependency), plus a Bevy `Startup` system in axum-kbve ordered `.after(register_server_skills)` that calls it with `|r| registry.id_for_ref(r).is_some()` and panics on any miss. Today's gather skill_refs {foraging, mining, woodcutting} all resolve (3/3 registered), so this passes now and only trips on future drift.

**Tech Stack:** Rust, prost/serde (`bevy_items`), Bevy ECS `Startup` system + `Res<SkillRegistry>` (axum-kbve), `tracing`.

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-b2`, branch `trunk/professiondb-skill-assertion`. Never the main tree. Absolute paths.
- DROP ALL code comments in newly authored Rust.
- `bevy_items` must NOT gain a `bevy_skills` dependency — the validate method takes a resolver closure/predicate, not a `SkillRegistry`.
- Failure mode = fail-loud: the axum system `panic!`s with an actionable message listing the missing refs (a startup data-integrity contract; a silent log would be missed).
- Scope = gather skill_refs only (`CompressInfo` has no `skill_ref` field). Do not invent compress validation.
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.
- Prefer `nx` for Rust build/test (`nx run bevy_items:test` / `:check-desktop`); fall back to `cargo test -p bevy_items` / `cargo check -p axum-kbve` from the workspace root only if no nx target fits.

## Verified facts (VERIFIED read-only)

- `packages/rust/bevy/bevy_items/src/profession.rs`: `GatherInfo{ skill_ref: String, required_level, xp_reward, resource_node_ref }` (L75-76); `ProfessionDb{ professions, gather: HashMap<String,GatherInfo>, compress }` (gather is private — the method must live on `ProfessionDb`). `from_json(&str) -> Result<Self, ProfessionLoadError>` exists; `get_profession_db() -> Option<&'static ProfessionDb>` (OnceLock) exists.
- `packages/rust/bevy/bevy_skills/src/registry.rs`: `SkillRegistry::id_for_ref(&self, r: &str) -> Option<SkillId>` (L106), `get_by_ref` (L100).
- axum: `apps/kbve/axum-kbve/src/gameserver/mod.rs` — `register_server_skills(mut registry: ResMut<SkillRegistry>)` registers exactly woodcutting/mining/foraging (~L226-253); wired `app.add_systems(Startup, register_server_skills)` (~L861); `load_server_professiondb()` runs earlier during app construction and calls `init_profession_db`. `SkillRegistry` + `get_profession_db`/`ProfessionDb` are already in scope there (imports exist).
- professiondb gather skill_refs today = {foraging, mining, woodcutting} — all 3 registered → assertion passes now. compress skill_refs {cooking, smithing, woodcutting} are NOT validated (no `skill_ref` on `CompressInfo`).
- `bevy_items` has NO `bevy_skills` dep and must keep it that way.

---

## Task 1: `validate_skill_refs` + axum startup assertion

**Files:**
- Modify: `packages/rust/bevy/bevy_items/src/profession.rs` (add the method + unit tests).
- Modify: `apps/kbve/axum-kbve/src/gameserver/mod.rs` (add the system + wire it).

**Interfaces:**
- Produces: `impl ProfessionDb { pub fn validate_skill_refs<F: Fn(&str) -> bool>(&self, is_known: F) -> Result<(), Vec<String>> }` — returns `Err(sorted_unique_missing)` if any gather `skill_ref` fails `is_known`, else `Ok(())`.

- [ ] **Step 1: Write failing tests** (in `profession.rs`'s `#[cfg(test)] mod tests`, or add one). Use `ProfessionDb::from_json` with a minimal inline professiondb JSON containing at least one `gather-*` action whose profession `ref` is the skill_ref. Two tests:
  - `validate_skill_refs_ok_when_all_known`: build a db, call `validate_skill_refs(|r| r == "mining")` for a db whose only gather skill_ref is `mining` → assert `Ok(())`.
  - `validate_skill_refs_reports_missing`: same db, call `validate_skill_refs(|_| false)` → assert `Err(v)` where `v == vec!["mining".to_string()]` (sorted, deduped).
  Derive the exact minimal JSON shape from `from_json`'s `RawRoot`/`RawProfession`/`RawAction` structs in the same file (match their serde field names — e.g. `ref`, `actions`, `outputs`, `itemRef`). If constructing valid JSON for `from_json` is impractical, instead build the `ProfessionDb` via `from_json` with the smallest JSON that yields one gather entry, and assert on that. Keep the fixture tiny.

- [ ] **Step 2: Run tests, verify they FAIL** (method not defined):
  `npx nx run bevy_items:test 2>&1 | tail -20` (fallback `cargo test -p bevy_items validate_skill_refs`). Expect compile error / failing tests.

- [ ] **Step 3: Implement the method** on `ProfessionDb` in `profession.rs`:
```rust
    pub fn validate_skill_refs<F: Fn(&str) -> bool>(&self, is_known: F) -> Result<(), Vec<String>> {
        let mut missing: Vec<String> = self
            .gather
            .values()
            .map(|g| g.skill_ref.clone())
            .filter(|r| !is_known(r))
            .collect();
        missing.sort();
        missing.dedup();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(missing)
        }
    }
```

- [ ] **Step 4: Run tests, verify they PASS:**
  `npx nx run bevy_items:test 2>&1 | tail -20` (fallback `cargo test -p bevy_items validate_skill_refs`). Both pass.

- [ ] **Step 5: Add the axum startup system** in `apps/kbve/axum-kbve/src/gameserver/mod.rs`, near `register_server_skills`. Confirm the exact import paths already in the file for `SkillRegistry` and `get_profession_db` and reuse them (do not add duplicate `use`s):
```rust
fn validate_professiondb_skills(registry: Res<SkillRegistry>) {
    let Some(db) = get_profession_db() else {
        return;
    };
    match db.validate_skill_refs(|r| registry.id_for_ref(r).is_some()) {
        Ok(()) => {
            tracing::info!("[professiondb] all gather skill_refs resolve in SkillRegistry");
        }
        Err(missing) => {
            panic!(
                "[professiondb] gather skill_refs missing from SkillRegistry: {missing:?} — register these skills or correct professiondb"
            );
        }
    }
}
```
(Match the file's actual `Res`/`Startup` import style — if it uses `bevy::prelude::*`, no new import is needed; otherwise add `Res` from the same path the file already imports Bevy ECS types.)

- [ ] **Step 6: Wire it** — where `app.add_systems(Startup, register_server_skills)` is registered, add the validator ordered after it:
```rust
    app.add_systems(
        Startup,
        validate_professiondb_skills.after(register_server_skills),
    );
```
(If the existing line already groups Startup systems in a tuple, add `validate_professiondb_skills.after(register_server_skills)` to that tuple instead of a second `add_systems` call — match the file's existing pattern. Ensure `.after` is available — `IntoSystemConfigs`/`bevy::prelude::*` is already in scope for the existing `add_systems`.)

- [ ] **Step 7: Compile-gate axum:**
  `npx nx run axum-kbve:check-desktop 2>&1 | tail -20` (fallback `cargo check -p axum-kbve` from workspace root). Passes.

- [ ] **Step 8: Full bevy_items test + clippy sanity:**
  `npx nx run bevy_items:test 2>&1 | tail -10` passes. If a lint target exists, run it; otherwise skip.

- [ ] **Step 9: Commit:**
```bash
git add packages/rust/bevy/bevy_items/src/profession.rs apps/kbve/axum-kbve/src/gameserver/mod.rs
git commit -m "feat(axum): assert professiondb gather skill_refs resolve in SkillRegistry at startup"
```

## Task 2: gate + push + PR

- [ ] **Step 1:** Re-run `npx nx run bevy_items:test` + `npx nx run axum-kbve:check-desktop` — both green. `git status --porcelain` clean.
- [ ] **Step 2:** Push `git push -u origin trunk/professiondb-skill-assertion`.
- [ ] **Step 3:** PR `--base dev`, title `feat(axum): assert professiondb gather skill_refs resolve in SkillRegistry`. Body: this is B2 from the professiondb epic — a fail-loud startup guard (passes today 3/3, trips on future drift); `bevy_items` gained no `bevy_skills` dep (resolver closure); compress skill_refs not validated (no field); the deeper "source SkillRegistry FROM professiondb" refactor is a deferred follow-up.

## RISKS

- **`from_json` fixture shape:** the tests must feed JSON matching the private `RawRoot`/`RawAction` serde shape — read those structs in `profession.rs` and mirror their field names exactly, or the fixture yields an empty `gather` map and the test is vacuous. Assert the db actually has ≥1 gather entry before trusting the Ok/Err result.
- **Panic aggressiveness:** intentional (fail-loud startup contract). Do not soften to a warn — the whole point is to halt boot on drift.
- **Bevy import drift:** `.after(...)` and `Res` must resolve from the file's existing Bevy imports; do not introduce a conflicting `use`.

## Self-Review

- Scope = the assertion only (per decision). "Source SkillRegistry from professiondb" is explicitly deferred.
- `bevy_items` dependency-free guarantee preserved via the closure.
- Passes today; value is the regression tripwire on future gather-profession additions.
