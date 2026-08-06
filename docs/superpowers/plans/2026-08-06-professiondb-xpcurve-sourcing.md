# professiondb XP curve → SkillRegistry (3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Source each skill's XP curve from the professiondb profession that defines it, so the authored per-profession POLYNOMIAL curves (mining 50/1.6, smithing 60/1.7, …) actually drive leveling instead of every skill falling back to the default quadratic `{50,25,99}`.

**Architecture:** Turn `bevy_skills::XpCurve` from a fixed quadratic struct into an enum — `Quadratic{base,scaling,max_level}` (the existing default, behavior unchanged) + `Polynomial{base_xp,growth_factor,max_level}` (`xp_for_level(n) = round(base_xp · n^growth_factor)`). Extend `bevy_items` `ProfessionInfo` to carry the parsed curve (kind/base_xp/growth_factor/max_level, currently only max_level survives). `SkillRegistry::register_professions` (added in #15436) maps a profession's POLYNOMIAL curve → `XpCurve::Polynomial`, leaving unknown/unauthored kinds as `None` (registry default).

**Tech Stack:** Rust, serde (`bevy_items::profession`), `bevy_skills` XP math.

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-xpcurve`, branch `trunk/professiondb-xpcurve`. Never the main tree. Absolute paths.
- DROP ALL code comments in newly authored/edited Rust EXCEPT: preserve/adapt the existing doc-comment on `XpCurve` describing the formula (it's a `///` rustdoc on a public API — keep it accurate for both variants). Do not add non-doc comments.
- Behavior parity for existing users: `XpCurve::default()` MUST remain `Quadratic{base:50,scaling:25,max_level:99}` with identical `xp_for_level`/`level_for_xp` output to today. No skill currently sets a real curve (all `None`), so only the default path is exercised pre-migration — it must not change.
- POLYNOMIAL formula is fixed: `xp_for_level(n) = round(base_xp as f64 · (n as f64).powf(growth_factor)) as u64`. `xp_for_level(0) = 0`. (base_xp is the level-1 anchor: n=1 ⇒ base_xp.)
- Only POLYNOMIAL is sourced now (all 8 professions author POLYNOMIAL); LINEAR/EXPONENTIAL/TABLE kinds map to `None` (default) until authored — do NOT build them.
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.
- Use cargo (worktrees lack node_modules): `cargo test -p <crate>` / `cargo check -p <crate>`.

## Verified facts

- `packages/rust/bevy/bevy_skills/src/xp.rs`: `XpCurve{ base:u64, scaling:u64, max_level:u32 }` (Default `{50,25,99}`); `xp_for_level(n)=base*n+scaling*n*n` (`xp.rs:40`); `level_for_xp` loops `while level < self.max_level && self.xp_for_level(level+1) <= total_xp` (`xp.rs:56-58`); also `xp_to_next_level`, `progress`. Public: `pub use xp::XpCurve` (`lib.rs:78`).
- Call sites of the type/methods: `systems.rs:32-34` (`registry.xp_curve(id).level_for_xp(total)`), `registry.rs:41` (`SkillDef.xp_curve: Option<XpCurve>`), `registry.rs:59` (`default_curve: XpCurve`), `registry.rs:112-116` (`xp_curve(id)->&XpCurve`, falls back to `&self.default_curve`), `registry.rs:121` (`set_default_curve`). `profile.rs:13` doc-comment only. All internal to `bevy_skills`.
- `packages/rust/bevy/bevy_items/src/profession.rs`: `RawProfession.experience_curve: Option<RawExperienceCurve>` (`:23`); `RawExperienceCurve` currently only `max_level:u32` (`:30-33`); `ProfessionInfo{ ref, name, category, emoji, max_level }` built at `:114-130` (curve → only `max_level`). `professions()->&[ProfessionInfo]` accessor exists.
- Proto `packages/data/proto/profession/professiondb.proto:59-66`: `ExperienceCurve{ kind:CurveKind, base_xp:u32, growth_factor:optional float, max_level:u32, level_table:repeated }`. Generated JSON `kind` = enum string e.g. `"CURVE_KIND_POLYNOMIAL"`; all 8 professions author `POLYNOMIAL` with `baseXp`/`growthFactor`/`maxLevel`.
- `register_professions(&mut self, db: &bevy_items::profession::ProfessionDb)` (bevy_skills `registry.rs`, from #15436) currently sets `xp_curve: None`. `bevy_skills` already deps `bevy_items` (optional, under `bevy` feature).

---

## Task 1: `XpCurve` → enum (`bevy_skills`)

**Files:** Modify `packages/rust/bevy/bevy_skills/src/xp.rs` (type + methods + tests).

**Interfaces:**
- Produces: `pub enum XpCurve { Quadratic{base:u64,scaling:u64,max_level:u32}, Polynomial{base_xp:u64,growth_factor:f64,max_level:u32} }` with unchanged method surface (`xp_for_level`, `level_for_xp`, `xp_to_next_level`, `progress`, and a `max_level()` accessor) and `Default = Quadratic{50,25,99}`.

- [ ] **Step 1: Add failing tests** in `xp.rs` test module: (a) `default_is_quadratic_unchanged` — `XpCurve::default().xp_for_level(10)` equals the pre-migration value `50*10 + 25*100 = 3000`, and a couple more levels, so the default path is provably unchanged; (b) `polynomial_anchors_and_grows` — `let c = XpCurve::Polynomial{base_xp:50, growth_factor:1.6, max_level:99}; assert_eq!(c.xp_for_level(0), 0); assert_eq!(c.xp_for_level(1), 50);` and assert `xp_for_level(2)` == `round(50 * 2f64.powf(1.6))` (compute the literal expected u64), and monotonic increase; (c) `polynomial_level_for_xp_roundtrips` — for the same curve, `level_for_xp(c.xp_for_level(7))` == 7 and stays `<= max_level`.
- [ ] **Step 2: Run, verify FAIL** (`Polynomial` variant undefined): `cargo test -p bevy_skills xp`. Expect compile error.
- [ ] **Step 3: Implement.** Rewrite `XpCurve` as the enum. Update the rustdoc to describe both variants' formulas. Implement methods by matching:
```rust
impl XpCurve {
    pub fn max_level(&self) -> u32 {
        match self {
            XpCurve::Quadratic { max_level, .. } => *max_level,
            XpCurve::Polynomial { max_level, .. } => *max_level,
        }
    }

    pub fn xp_for_level(&self, level: u32) -> u64 {
        match self {
            XpCurve::Quadratic { base, scaling, .. } => {
                let n = level as u64;
                base * n + scaling * n * n
            }
            XpCurve::Polynomial { base_xp, growth_factor, .. } => {
                if level == 0 {
                    return 0;
                }
                (*base_xp as f64 * (level as f64).powf(*growth_factor)).round() as u64
            }
        }
    }

    pub fn level_for_xp(&self, total_xp: u64) -> u32 {
        let mut level = 0u32;
        while level < self.max_level() && self.xp_for_level(level + 1) <= total_xp {
            level += 1;
        }
        level
    }
    // xp_to_next_level / progress: keep existing bodies, but replace any direct
    // `self.max_level`/`self.xp_for_level` field/method use with `self.max_level()`
    // (they already call xp_for_level/level_for_xp, so likely unchanged).
}

impl Default for XpCurve {
    fn default() -> Self {
        XpCurve::Quadratic { base: 50, scaling: 25, max_level: 99 }
    }
}
```
Keep `#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]` on the enum (serde tagged enum is fine — nothing external persists it; there is no skilldb-data.json). Replace any remaining `self.max_level` field access anywhere in `xp.rs` with `self.max_level()`.
- [ ] **Step 4: Run, verify PASS.** `cargo test -p bevy_skills` — new tests pass AND the full suite (incl. the pre-existing curve tests) stays green. If a pre-existing test constructed `XpCurve{ base, scaling, max_level }` struct-literally, update it to `XpCurve::Quadratic{ .. }` (that's a mechanical fixup, not a behavior change).
- [ ] **Step 5: Compile the whole crate** (`cargo check -p bevy_skills`) — `systems.rs`/`registry.rs` should compile unchanged (they only call methods / hold `XpCurve` by value). Fix any struct-literal `XpCurve{..}` construction sites to `XpCurve::Quadratic{..}` (esp. `registry.rs` `default_curve` init if it uses a literal — but Default derive/impl covers it).
- [ ] **Step 6: Commit.** `git commit -am "feat(skills): make XpCurve an enum with a Polynomial variant"` (add xp.rs + any touched registry.rs/systems.rs).

## Task 2: `ProfessionInfo` carries the curve (`bevy_items`)

**Files:** Modify `packages/rust/bevy/bevy_items/src/profession.rs` (RawExperienceCurve + ProfessionInfo + from_json + tests).

**Interfaces:**
- Produces: `pub struct ProfessionCurve { pub kind: String, pub base_xp: u64, pub growth_factor: f64, pub max_level: u32 }` and a new `pub curve: Option<ProfessionCurve>` field on `ProfessionInfo` (existing `max_level` field stays). `kind` normalized lowercase-short (e.g. `"polynomial"`).

- [ ] **Step 1: Add failing test** in `profession.rs` tests: build a `ProfessionDb::from_json` from a fixture whose profession has `experienceCurve: { kind: "CURVE_KIND_POLYNOMIAL", baseXp: 50, growthFactor: 1.6, maxLevel: 99 }`; assert `db.profession("mining").unwrap().curve` is `Some` with `kind=="polynomial"`, `base_xp==50`, `growth_factor==1.6` (use an approx/float-eq), `max_level==99`. Also assert a profession with NO experienceCurve has `curve == None`.
- [ ] **Step 2: Run, verify FAIL** (`curve` field/`ProfessionCurve` undefined): `cargo test -p bevy_items profession`.
- [ ] **Step 3: Implement.** Extend `RawExperienceCurve` to parse the fields (all `#[serde(default)]`):
```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawExperienceCurve {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    base_xp: u64,
    #[serde(default)]
    growth_factor: f64,
    #[serde(default)]
    max_level: u32,
}
```
Add the public `ProfessionCurve` struct (derive `Debug, Clone, PartialEq`). Add a `normalize_curve_kind(&str)->String` helper mirroring `normalize_category` (strip `CURVE_KIND_` prefix, lowercase → `"polynomial"`; empty/unspecified → `""`). In the `from_json` profession build, populate `curve`:
```rust
curve: profession.experience_curve.as_ref().and_then(|c| {
    let kind = normalize_curve_kind(&c.kind);
    if kind.is_empty() { None } else {
        Some(ProfessionCurve {
            kind,
            base_xp: c.base_xp,
            growth_factor: c.growth_factor,
            max_level: if c.max_level > 0 { c.max_level } else { 99 },
        })
    }
}),
```
Keep the existing `max_level` field on `ProfessionInfo` populated as before.
- [ ] **Step 4: Run, verify PASS.** `cargo test -p bevy_items` — new test passes, full suite green. Note `f64` equality in the test: parse `1.6` may be exact from JSON, but prefer `(gf - 1.6).abs() < 1e-9`.
- [ ] **Step 5: Commit.** `git commit -am "feat(items): parse professiondb experience curve into ProfessionInfo"`

## Task 3: `register_professions` sources the Polynomial curve (`bevy_skills`)

**Files:** Modify `packages/rust/bevy/bevy_skills/src/registry.rs` (the `register_professions` method + tests).

**Interfaces:**
- Consumes: `ProfessionInfo.curve` (Task 2) + `XpCurve::Polynomial` (Task 1).

- [ ] **Step 1: Add failing test** (in registry.rs, `#[cfg(all(test, feature="bevy"))]` block that already exists from #15436): build a `ProfessionDb` from a fixture with a POLYNOMIAL-curve profession `mining`; `register_professions`; then `let curve = reg.xp_curve(reg.id_for_ref("mining").unwrap()); assert!(matches!(curve, XpCurve::Polynomial{ base_xp: 50, .. }));` and assert a profession with no curve resolves to the default (`Quadratic`). (Bring `XpCurve` into test scope.)
- [ ] **Step 2: Run, verify FAIL** (register_professions still sets None): `cargo test -p bevy_skills register_professions`.
- [ ] **Step 3: Implement.** In `register_professions`, replace `xp_curve: None` with a mapping from `profession.curve`:
```rust
let xp_curve = profession.curve.as_ref().and_then(|c| match c.kind.as_str() {
    "polynomial" => Some(XpCurve::Polynomial {
        base_xp: c.base_xp,
        growth_factor: c.growth_factor,
        max_level: c.max_level,
    }),
    _ => None,
});
self.register(SkillDef {
    r#ref: profession.r#ref.clone(),
    name: profession.name.clone(),
    category: profession.category.clone(),
    icon: profession.emoji.clone(),
    xp_curve,
});
```
Ensure `XpCurve` is imported in `registry.rs` (it already uses `crate::xp::XpCurve` at `:5`).
- [ ] **Step 4: Run, verify PASS.** `cargo test -p bevy_skills`. Full suite green.
- [ ] **Step 5: Commit.** `git commit -am "feat(skills): source Polynomial XP curves from professiondb professions"`

## Task 4: gate + push + PR

- [ ] **Step 1:** `cargo test -p bevy_skills` + `cargo test -p bevy_items` green; `cargo check -p axum-kbve` + `cargo check -p isometric-game` compile (they consume register_professions / XpCurve transitively — confirm the enum change didn't break a consumer). `git status --porcelain` clean.
- [ ] **Step 2:** Push `git push -u origin trunk/professiondb-xpcurve`.
- [ ] **Step 3:** PR `--base dev`, title `feat(skills): source professiondb XP curves into SkillRegistry`. Body: (a) `XpCurve` is now an enum (Quadratic default unchanged + new Polynomial `base_xp·n^growth_factor`); (b) `ProfessionInfo` parses the authored curve; (c) `register_professions` maps POLYNOMIAL→`XpCurve::Polynomial`, so all 8 professions' authored curves now drive leveling (was: every skill on the default quadratic); (d) LINEAR/EXPONENTIAL/TABLE kinds still default until authored; both consumers (axum server + isometric client) pick this up identically via the shared builder.

## RISKS

- **Behavior change for real curves:** skills go from default quadratic to authored polynomial — intended, but it changes level thresholds. No persisted XP-by-level data or skilldb JSON exists to migrate (confirmed), and Task 1 proves the *default* path is byte-identical for skills without a curve.
- **enum serde:** `XpCurve` gains a tagged-enum JSON shape. Nothing external serializes/deserializes it (no skilldb-data.json), so no compatibility break — but Task 1 keeps the derives so `SkillDef` still compiles.
- **f64 in a `Copy`/`Eq` context:** `XpCurve` previously may have derived `Eq`/`Hash`; `f64` forbids those. If a derive breaks, drop `Eq`/`Hash`/`PartialEq` from `XpCurve` (grep for uses — it's held in `SkillDef`/`default_curve`, not used as a map key). Adjust `SkillDef` derives similarly if needed. This is the most likely compile snag — handle in Task 1.
- **Consumer compile:** the enum change is internal to bevy_skills' public `XpCurve`; axum/isometric don't construct `XpCurve` literals (they used `xp_curve: None`), so they should be unaffected — Task 4 Step 1 confirms.

## Self-Review

- Faithful single-source: authored professiondb curves drive leveling; default preserved for unauthored.
- Bounded to POLYNOMIAL (the only authored kind); extensible enum leaves room for the others.
- Both consumers get it free via the shared `register_professions` (no per-app change) — no drift.
