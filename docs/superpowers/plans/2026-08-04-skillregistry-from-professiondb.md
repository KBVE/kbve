# SkillRegistry sourced from professiondb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make professiondb the single source of truth for the skill registry: one shared builder in `bevy_skills` that constructs `SkillDef`s from professiondb professions, called by both axum-kbve and isometric, deleting the hand-maintained hardcoded `SkillDef` lists that the code comments already flag as drift-prone.

**Architecture:** Add `SkillRegistry::register_professions(&mut self, db: &ProfessionDb)` (loops `db.professions()` → `register(SkillDef{ref,name,category,icon:emoji,xp_curve:None})`) and `SkillRegistry::register_gathering_fallback(&mut self)` (the woodcutting/mining/foraging fallback) to `bevy_skills`. This requires a new `bevy_skills → bevy_items` dependency (no cycle — the crates are independent leaves today). Both consumers' register systems collapse to: `if let Some(db) = get_profession_db() { registry.register_professions(db) } else { registry.register_gathering_fallback() }`. axum's hardcoded 3-skill list and isometric's inline profession loop are both replaced by these shared methods.

**Tech Stack:** Rust, Bevy ECS resources, prost/serde (`bevy_items::profession::ProfessionDb`), nx/cargo.

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-skillsrc`, branch `trunk/professiondb-skill-source`. Never the main tree. Absolute paths.
- DROP ALL code comments in newly authored/edited Rust. (This includes REMOVING the now-obsolete "keep slugs aligned with isometric… drift will desync" comment above axum's `register_server_skills` — the drift risk it warns about is exactly what this migration eliminates.)
- Behavior parity: both apps must register the SAME skills from the SAME logic. `register_professions` registers ALL professions (every category), matching isometric's existing behavior — this also makes every professiondb gather/compress `skill_ref` resolve (closes the compress-skill gap).
- `xp_curve: None` (registry default) and `icon: profession.emoji.clone()` — mirror isometric's current mapping exactly. Do NOT extend `ProfessionInfo` or attempt to source the professiondb `ExperienceCurve` (curve shapes differ; out of scope).
- Keep axum's `validate_professiondb_skills` system (B2) — harmless invariant guard; do not delete.
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.
- Prefer nx for Rust build/test; fall back to `cargo test -p <crate>` / `cargo check -p <crate>` from the workspace root only if no nx target fits (worktrees lack `node_modules`, so nx may be unavailable — the cargo fallbacks are expected).

## Verified facts (from `.superpowers/sdd/skillsrc-facts.md`)

- `bevy_skills` (`packages/rust/bevy/bevy_skills/src/registry.rs`): `SkillDef{ r#ref:String, name:String, xp_curve:Option<XpCurve>, category:String, icon:Option<String> }`; `SkillRegistry` has `register(SkillDef)->SkillId`, `len`, `iter`, `id_for_ref`, `get`, `xp_curve`, etc. `XpCurve` in `src/xp.rs` = `{base:u64, scaling:u64, max_level:u32}` (Default `{50,25,99}`).
- `bevy_items::profession` (`packages/rust/bevy/bevy_items/src/profession.rs`): `ProfessionInfo{ r#ref:String, name:String, category:String, emoji:Option<String>, max_level:u32 }`; `ProfessionDb::professions(&self) -> &[ProfessionInfo]` (public accessor; the Vec itself is private); `from_json(&str)->Result<Self,_>`; module singleton `get_profession_db()->Option<&'static ProfessionDb>`.
- Dep direction: `bevy_skills` and `bevy_items` are independent leaves — neither deps the other. Adding `bevy_skills → bevy_items` creates NO cycle.
- axum `apps/kbve/axum-kbve/src/gameserver/mod.rs`: `register_server_skills` (L226-253) hardcodes 3 `SkillDef`s and ignores `ProfessionDb`; `load_server_professiondb()` runs synchronously at app-build BEFORE any Startup system, so `get_profession_db()` IS populated when `register_server_skills` runs; wiring at L874-881 (`add_systems(Startup, register_server_skills)` + `validate_professiondb_skills.after(...)`). Imports already include `get_profession_db`, `SkillDef`, `SkillRegistry`.
- isometric `apps/kbve/isometric/src-tauri/src/game/skills.rs`: ALREADY sources from professiondb — `register_skills` (L52+) loops `db.professions()` building `SkillDef{ ref, name, category, icon:emoji, xp_curve:None }` with a hardcoded-3 fallback; `load_baked_professiondb` runs `.before(register_skills)`. This inline loop is the reference mapping to lift into the shared method.
- Read call-sites (`id_for_ref`, `get`, `xp_curve`) in axum/isometric/`bevy_skills::systems` touch only reads — population change is safe for them.

---

## Task 1: shared builders in `bevy_skills` (+ bevy_items dep)

**Files:**
- Modify: `packages/rust/bevy/bevy_skills/Cargo.toml` (add `bevy_items` dep)
- Modify: `packages/rust/bevy/bevy_skills/src/registry.rs` (add two methods + tests)

**Interfaces:**
- Produces: `impl SkillRegistry { pub fn register_professions(&mut self, db: &bevy_items::profession::ProfessionDb); pub fn register_gathering_fallback(&mut self); }`

- [ ] **Step 1:** Inspect how sibling bevy crates reference each other in Cargo.toml (path vs workspace dep). Run `grep -rn "bevy_items" packages/rust/bevy/*/Cargo.toml` and match that style. Add `bevy_items` to `bevy_skills`'s `[dependencies]` the same way (likely `bevy_items = { path = "../bevy_items" }` or `bevy_items.workspace = true`). Confirm `bevy_items`'s default features don't force anything unwanted; if `bevy_items` has a `bevy` feature gate like `bevy_skills` does, mirror whatever the sibling apps enable.

- [ ] **Step 2: Write failing tests** in `registry.rs`'s test module. Build a `ProfessionDb` via `bevy_items::profession::ProfessionDb::from_json` with a tiny fixture containing ≥2 professions (e.g. `mining` category gathering, `cooking` category production — mirror the RawRoot/RawProfession serde shape used by `from_json`; read it in profession.rs to get exact field names like `ref`, `name`, `category`, `emoji`). Two tests:
  - `register_professions_builds_one_skill_per_profession`: `let mut r = SkillRegistry::default(); r.register_professions(&db); assert_eq!(r.len(), <#professions>); assert!(r.id_for_ref("mining").is_some()); assert!(r.id_for_ref("cooking").is_some());` and assert a `get_by_ref("mining")` has `category`/`name` matching the fixture and `icon` == the fixture emoji.
  - `register_gathering_fallback_builds_three`: `let mut r = SkillRegistry::default(); r.register_gathering_fallback(); assert_eq!(r.len(), 3); for s in ["woodcutting","mining","foraging"] { assert!(r.id_for_ref(s).is_some()); }`.
  Before asserting, confirm the fixture db actually has the professions (`assert_eq!(db.professions().len(), N)`).

- [ ] **Step 3: Run tests, verify FAIL** (methods undefined): `cargo test -p bevy_skills register_professions register_gathering_fallback` (or `nx run bevy_skills:test`). Expect compile error.

- [ ] **Step 4: Implement** in `registry.rs` (NO comments):
```rust
    pub fn register_professions(&mut self, db: &bevy_items::profession::ProfessionDb) {
        for profession in db.professions() {
            self.register(SkillDef {
                r#ref: profession.r#ref.clone(),
                name: profession.name.clone(),
                category: profession.category.clone(),
                icon: profession.emoji.clone(),
                xp_curve: None,
            });
        }
    }

    pub fn register_gathering_fallback(&mut self) {
        for (r#ref, name) in [
            ("woodcutting", "Woodcutting"),
            ("mining", "Mining"),
            ("foraging", "Foraging"),
        ] {
            self.register(SkillDef {
                r#ref: r#ref.into(),
                name: name.into(),
                category: "gathering".into(),
                icon: None,
                xp_curve: None,
            });
        }
    }
```
(Place both inside the existing `impl SkillRegistry` block. If `SkillDef`/`XpCurve` need importing into scope they are already in this module.)

- [ ] **Step 5: Run tests, verify PASS.** `cargo test -p bevy_skills` — the two new tests pass, and the full bevy_skills suite stays green.

- [ ] **Step 6: Commit.**
```bash
git add packages/rust/bevy/bevy_skills/Cargo.toml packages/rust/bevy/bevy_skills/src/registry.rs
git commit -m "feat(skills): build SkillRegistry from professiondb professions (shared)"
```

## Task 2: axum uses the shared builder

**Files:**
- Modify: `apps/kbve/axum-kbve/src/gameserver/mod.rs`

- [ ] **Step 1:** Replace the body of `register_server_skills` (L226-253) — delete the 3 hardcoded `registry.register(SkillDef{...})` blocks AND the obsolete doc-comment above the fn — with:
```rust
fn register_server_skills(mut registry: ResMut<SkillRegistry>) {
    if let Some(db) = get_profession_db() {
        registry.register_professions(db);
    } else {
        registry.register_gathering_fallback();
    }
    tracing::info!("[skills] server registered {} skills", registry.len());
}
```
Leave the `add_systems(Startup, register_server_skills)` wiring and `validate_professiondb_skills` untouched. If `SkillDef` is now unused in the file, remove it from the `use bevy_skills::{...}` import to avoid an unused-import warning (check first — other code may still use it).

- [ ] **Step 2: Compile + test.** `cargo check -p axum-kbve` (or `nx run axum-kbve:check-desktop`). Passes with no unused-import/unused-var warnings introduced. If a lint/clippy target exists, run it.

- [ ] **Step 3: Commit.**
```bash
git add apps/kbve/axum-kbve/src/gameserver/mod.rs
git commit -m "refactor(axum): source server skills from professiondb, drop hardcoded list"
```

## Task 3: isometric uses the shared builder

**Files:**
- Modify: `apps/kbve/isometric/src-tauri/src/game/skills.rs`

- [ ] **Step 1:** Replace the inline `for profession in db.professions() { registry.register(SkillDef{...}) }` loop AND the hardcoded fallback `for (r#ref,name) in [...] { registry.register(...) }` in `register_skills` with the shared methods:
```rust
fn register_skills(mut registry: ResMut<SkillRegistry>) {
    if let Some(db) = get_profession_db() {
        registry.register_professions(db);
        info!("[skills] registered {} skills from professiondb", registry.len());
    } else {
        registry.register_gathering_fallback();
        warn!("[skills] professiondb unavailable — registered {} fallback skills", registry.len());
    }
}
```
Preserve the existing `info!`/`warn!` logging intent. Remove any now-unused imports (`SkillDef` if no longer referenced in the file — check `notify_level_ups`/others first).

- [ ] **Step 2: Compile.** Determine isometric's Tauri Rust crate/package name (`grep -m1 "^name" apps/kbve/isometric/src-tauri/Cargo.toml`), then `cargo check -p <that-name>` (or the appropriate nx target if one exists, e.g. `nx run isometric:check-*`). Passes, no new warnings.

- [ ] **Step 3: Commit.**
```bash
git add apps/kbve/isometric/src-tauri/src/game/skills.rs
git commit -m "refactor(isometric): use shared professiondb skill builder"
```

## Task 4: gate + push + PR

- [ ] **Step 1:** `cargo test -p bevy_skills` green; `cargo check -p axum-kbve` + `cargo check -p <isometric-crate>` green. `git status --porcelain` clean.
- [ ] **Step 2:** Push `git push -u origin trunk/professiondb-skill-source`.
- [ ] **Step 3:** PR `--base dev`, title `refactor(skills): single-source SkillRegistry from professiondb`. Body: (a) one shared builder in bevy_skills replaces the two hand-maintained hardcoded skill lists (axum) / inline loop (isometric) → no more drift (the exact risk the old code comments warned about); (b) both apps now register ALL professiondb professions, so every gather/compress skill_ref resolves (closes the compress-skill gap, makes the B2 assertion structurally satisfied); (c) `bevy_skills` gained a `bevy_items` dep (no cycle); (d) xp_curve still defaults (professiondb ExperienceCurve sourcing deferred — different curve shape).

## RISKS

- **New crate dep `bevy_skills → bevy_items`:** confirmed no cycle (bevy_items has no path back). Watch for feature-flag mismatches (the `bevy` optional feature) — Task 1 Step 1 mirrors the sibling apps' feature selection.
- **Unused-import warnings:** removing the hardcoded `SkillDef{...}` literals may leave `SkillDef` unused in axum/isometric imports — Tasks 2/3 check and prune. A leftover unused import can fail a `-D warnings` CI lint.
- **isometric crate name for `cargo check`:** the Tauri package name may differ from the directory — Task 3 Step 2 derives it from Cargo.toml rather than guessing.
- **Behavior change — axum now registers ALL professions, not just 3:** intended (parity with isometric + closes compress gap). Confirm no downstream axum code assumes exactly 3 skills (grep for `.len() == 3` / hardcoded skill counts near the registry — none expected).

## Self-Review

- Single source achieved: one builder + one fallback in `bevy_skills`, called identically by both apps; zero hardcoded skill lists remain in app code.
- Read API of `SkillRegistry` unchanged — only population moved.
- xp_curve sourcing explicitly deferred (curve-shape mismatch); parity preserved (both apps used `None` already).
- The B2 validator is retained as a cheap invariant, not deleted.
