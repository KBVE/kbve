# professiondb Phase 2b-Rust — Engine Consumers Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Rust `bevy_items` + `axum-kbve` engine consumers off the now-reserved itemdb proto fields `Item.skilling`(42) / `Item.compress`(48) and `FoodInfo.cooking_level`(3) / `cooking_xp`(4). Add a professiondb loader to Rust (none exists today) and rewire the two axum gameserver sites that gate collects and grant skilling XP so they resolve gather economics from professiondb instead of `Item.skilling`.

**Architecture:** A new `bevy_items::profession` module parses `professiondb-data.json` (serde, no proto/prost dependency) into two lookups — `item_ref → GatherInfo { skill_ref, required_level, xp_reward, resource_node_ref }` (from `gather-*` actions' outputs) and `item_ref → CompressInfo { target_ref, ratio }` (from `compress-*` actions' inputs/outputs). axum embeds the JSON (`include_str!`), builds a `ProfessionDb`, `Box::leak`s it into a process-global `OnceLock` (mirroring the existing `bevy_items::inventory_adapter` itemdb pattern), and the two gameserver sites query it by item ref. Profession `ref` (mining/woodcutting/foraging/…) equals the `bevy_skills` skill ref, so profession→skill is identity. The itemdb proto is regenerated (`BUILD_PROTO=1`), which removes the reserved fields **and** brings the checked-in generated `item.rs` up to date with the current proto (which has drifted well beyond the reservations — see Decision 1). The regen and the `json.rs`/axum fixes land in one commit so the workspace always compiles.

**Tech Stack:** Rust, `prost` / `prost-build` (proto codegen, gated behind `BUILD_PROTO=1` in `build.rs`), `serde` / `serde_json`, Bevy, nx (`@monodon/rust`), `cargo`.

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-professiondb-engine-consumers`, branch `trunk/professiondb-engine-consumers-1785586967`. All work here; never the main tree. Use absolute paths.
- **No comments in authored Rust code** (repo rule — drop all `//` and `///` in new/edited code). The new `profession.rs` carries zero comments.
- Commit messages: **no** `Co-Authored-By`, **no** "Generated with Claude" / "🤖 Generated" text.
- **The proto regen (which removes the reserved fields) and the `json.rs` + axum fixes MUST land together in one commit (Task 4).** A regen alone leaves `json.rs`/`axum-kbve` referencing dead fields; the fixes alone won't compile against the stale generated file. Never leave a commit where `cargo build` fails.
- `prost-build` shells out to `protoc` — ensure `protoc` is installed before the `BUILD_PROTO=1` regen step.
- Build/test gates are `cargo` / nx `@monodon/rust`. bevy_items: `cargo build -p bevy_items`, `cargo test -p bevy_items`, `cargo clippy -p bevy_items -- -D warnings`. axum: `cargo build -p axum-kbve`. **`bevy_items` lint denies warnings**, so no dead code may remain.

## Decisions (flag for confirmation at plan review)

1. **The checked-in generated `packages/rust/bevy/bevy_items/src/proto/item.rs` is far more stale than "just the reserved fields."** A `BUILD_PROTO=1` regen will, besides **removing** `Item.skilling` and `FoodInfo.cooking_level`/`cooking_xp`, **add** ~20 fields the current proto grew (`Item` tags 49-57: stacking/pool*group/weapon/fuel/container/planting/projectile/trap/enchantment; `FoodInfo` tags 8-14: restore_energy/restore_mana/regen*\*/perishable/shelf_life_seconds/spoils_into_ref; `EquipmentInfo` tags 7-10) plus new messages. Because `json.rs` builds these prost structs with **exhaustive struct literals** (no `..Default::default()`), the regen breaks the `Item`/`FoodInfo`/`EquipmentInfo` literals with `E0063 missing fields` **beyond** the removals. **Chosen fix:** add `..Default::default()` to those three literals (prost structs impl `Default`) — matches json.rs's "unmapped fields ignored" philosophy and is forward-proof. **CONFIRM** over hand-mapping every new field (which would substantially grow Task 4).
2. **`professiondb-data.json` already contains all 48 actions** (verified: mining/gather-copper-ore key 15, camelCase). The Task 2 regen is idempotent safety (refresh + copy to axum), NOT a "nothing to read" blocker. The JSON is **proto-canonical camelCase** (`requiredLevel`, `xpReward`, `itemRef`, `resourceNodeRef`, `durationMs`, `toolRefs`) — the serde structs use `rename_all = "camelCase"`.
3. **Embed strategy:** copy the regenerated `professiondb-data.json` into `apps/kbve/axum-kbve/src/data/professiondb.json` and `include_str!("../data/professiondb.json")` — mirrors `BAKED_ITEMDB_JSON = include_str!("../data/itemdb.json")`, keeps the embed inside the crate's `src` tree (container-build safe), checked in. **CONFIRM** over `include_str!`-ing the generated path (fragile, not in Docker build context). Follow-up (out of scope): a sync script that writes `src/data/professiondb.json` like itemdb's.
4. **profession `ref` → skill_ref is IDENTITY.** The 8 profession refs (`alchemy/cooking/farming/fishing/foraging/mining/smithing/woodcutting`) are all valid `bevy_skills` slugs already produced by the old `skilling_type_to_skill_ref`. No mapping table; pass `profession.ref` straight into `SkillId::from_ref`.
5. **Global `OnceLock` accessor** in `bevy_items::profession` (mirrors `inventory_adapter::{init_item_db, get_item_db}`) rather than a Bevy `Resource` — the two gameserver sites already reach itemdb via the process-global, so this keeps the rewrite minimal. **CONFIRM** over a `Res<ProfessionDb>`.

## Verified facts (anchors)

- **Consumers of the vanishing fields (exhaustive):** only `apps/kbve/axum-kbve/src/gameserver/mod.rs` (site A ~L1908-1943 collect gating, site B ~L2035-2060 XP grant) and `packages/rust/bevy/bevy_items/src/json.rs` (`parse_food` ~L344, `parse_skilling`/`parse_skilling_type` ~L366/L224, and the `skilling:` assignment in `json_value_to_item` ~L112). `arpg-server`, `isometric-game`, `discordsh-bot` depend on `bevy_items` but reference none — post-regen `cargo check` only.
- **Reservations in place** (`packages/data/proto/item/itemdb.proto`): `Item { reserved 42, 48; reserved "skilling","compress"; }`; `FoodInfo { reserved 3,4; reserved "cooking_level","cooking_xp"; }`. `message SkillingInfo` + `message CompressInfo` still exist (survive regen as standalone structs; only the `Item` fields referencing them are gone).
- **itemdb load pattern to mirror** (`mod.rs`): `const BAKED_ITEMDB_JSON: &str = include_str!("../data/itemdb.json");` → `fn load_server_itemdb()` does `ItemDb::from_json` → `Box::leak` → `init_item_db`; called ~L836. `bevy_items::inventory_adapter` holds `static ITEM_DB_REF: OnceLock<&'static ItemDb>` with `init_item_db`/`get_item_db`.

---

### Task 1: Add the `bevy_items::profession` loader module

**Files:** Create `packages/rust/bevy/bevy_items/src/profession.rs`; edit `packages/rust/bevy/bevy_items/src/lib.rs` (add `pub mod profession;`).

- [ ] **Step 1:** Add `pub mod profession;` to `lib.rs` next to `pub mod json;`.
- [ ] **Step 2:** Create `profession.rs` (no comments) with serde raw structs (`#[serde(rename_all = "camelCase")]`), public `GatherInfo`/`CompressInfo`/`ProfessionDb`, and a process-global accessor mirroring `inventory_adapter`. Build `gather` from `gather-*` actions' `outputs[].item_ref → { skill_ref = profession.ref, required_level, xp_reward, resource_node_ref }` and `compress` from `compress-*` actions' `inputs[0].item_ref → { target_ref = outputs[0].item_ref, ratio = inputs[0].quantity }`. `from_json(&str) -> Result<Self, ProfessionLoadError>`, `gather(item_ref)`, `compress(item_ref)`, `gather_len`/`compress_len`/`is_empty`, `static PROFESSION_DB_REF: OnceLock<&'static ProfessionDb>`, `init_profession_db`/`get_profession_db`. Include a `#[cfg(test)]` fixture test (camelCase JSON) asserting `gather("copper-ore") = {mining,1,18,Some("ore-copper")}` and `compress("berry") = {meal,100}`. (Full reference implementation in the plan's companion snippet — the implementer may reproduce it; key point: camelCase serde, `starts_with("gather-")`/`"compress-"`, `.or_insert_with` first-wins.)
- [ ] **Step 3:** Gate: `cargo test -p bevy_items profession 2>&1 | tail -20` → `loads_gather_and_compress ... ok`. (This task does NOT touch the proto.)
- [ ] **Step 4:** Gate: `cargo clippy -p bevy_items -- -D warnings 2>&1 | tail -5` → no warnings.
- [ ] **Step 5:** Commit: `git commit -am "feat(bevy_items): add professiondb loader module"`.

### Task 2: Embed professiondb data into axum

**Files:** Refresh `packages/data/codegen/generated/professiondb-data.json` (idempotent); create `apps/kbve/axum-kbve/src/data/professiondb.json`.

- [ ] **Step 1:** Refresh the data (idempotent — actions already present): `cd <worktree> && export NX_WORKSPACE_ROOT_PATH=$PWD && node packages/data/codegen/gen-professiondb-data.mjs 2>&1 | grep -v "npm warn"` → `Loaded 8 profession defs`, wrote json + binpb.
- [ ] **Step 2:** Assert actions carry camelCase economics: `node -e "const d=require('./packages/data/codegen/generated/professiondb-data.json'); const m=d.professions.find(p=>p.ref==='mining').actions.find(a=>a.ref==='gather-copper-ore'); console.log(JSON.stringify(m)); const c=d.professions.find(p=>p.ref==='cooking').actions.find(a=>a.ref==='compress-berry'); console.log(JSON.stringify(c));"` → gather shows requiredLevel/xpReward:18/resourceNodeRef/outputs; compress shows inputs berry×100/outputs meal×1.
- [ ] **Step 3:** Copy into axum crate src tree: `cp packages/data/codegen/generated/professiondb-data.json apps/kbve/axum-kbve/src/data/professiondb.json`.
- [ ] **Step 4:** Round-trip sanity: `node -e "const d=require('./apps/kbve/axum-kbve/src/data/professiondb.json'); console.log('professions', d.professions.length, 'has-actions', d.professions.some(p=>(p.actions||[]).length>0));"` → `8 true`.
- [ ] **Step 5:** Commit: `git commit -am "chore(axum-kbve): embed professiondb-data.json for the gameserver"`.

### Task 3: Regen itemdb proto + fix `json.rs` + rewire axum — ONE atomic commit

**Files:** Regenerate `packages/rust/bevy/bevy_items/src/proto/item.rs` (`BUILD_PROTO=1`); edit `packages/rust/bevy/bevy_items/src/json.rs`; edit `apps/kbve/axum-kbve/src/gameserver/mod.rs`.

- [ ] **Step 1 — regen:** `BUILD_PROTO=1 cargo build -p bevy_items 2>&1 | tail -30`. Rewrites `item.rs` (build then FAILS on json.rs — expected, fixed below). Confirm: `node -e "const s=require('fs').readFileSync('packages/rust/bevy/bevy_items/src/proto/item.rs','utf8'); console.log('cooking_level', s.includes('cooking_level'), 'Item.skilling', /pub skilling:/.test(s), 'WeaponInfo', s.includes('struct WeaponInfo'));"` → `false false true`. (If protoc missing, install + retry.)
- [ ] **Step 2 — json.rs `json_value_to_item`:** delete `skilling: parse_skilling(v.get("skilling")),` (~L112); add `..Default::default()` as the final element of the `item::Item { … }` literal (after `drafted: bool_opt(v, "drafted"),`).
- [ ] **Step 3 — json.rs `parse_food`:** delete the `cooking_level:` and `cooking_xp:` fields; add `..Default::default()` after `buff_effects`.
- [ ] **Step 4 — json.rs `parse_equipment` + dead-code:** add `..Default::default()` after the last field of the `item::EquipmentInfo { … }` literal (gained tags 7-10). Then DELETE `fn parse_skilling` and `fn parse_skilling_type` (now unused; `bevy_items` lint denies warnings). Leave `skilling_type_to_skill_ref` in lib.rs + the `SkillingType`/`SkillingInfo` proto types alone.
- [ ] **Step 5 — gate bevy_items:** `cargo build -p bevy_items 2>&1 | tail -20 && cargo test -p bevy_items 2>&1 | tail -15 && cargo clippy -p bevy_items -- -D warnings 2>&1 | tail -5` → clean build, tests ok, no warnings.
- [ ] **Step 6 — axum embed + loader:** in `mod.rs` next to `BAKED_ITEMDB_JSON`/`load_server_itemdb`, add `const BAKED_PROFESSIONDB_JSON: &str = include_str!("../data/professiondb.json");` + `fn load_server_professiondb()` that does `ProfessionDb::from_json(BAKED_PROFESSIONDB_JSON)` → on Ok `Box::leak` + `init_profession_db` + `tracing::info!` gather/compress counts; on Err `tracing::warn!` (gating/XP disabled). Call `load_server_professiondb();` right after `load_server_itemdb();` (~L836).
- [ ] **Step 7 — axum site A (collect gating ~L1912-1943):** replace `skilling_meta` + the SkillingType-wrapped gate with: `let gather_meta = if candidate_item_ref.is_empty() { None } else { bevy_items::profession::get_profession_db().and_then(|db| db.gather(candidate_item_ref)) };` then gate on `gather.required_level` vs `profile.level(SkillId::from_ref(&gather.skill_ref))` (continue if below). Uses `gather.skill_ref` directly — no `skilling_type_to_skill_ref`.
- [ ] **Step 8 — axum site B (XP grant ~L2035-2060):** replace `kind.item().and_then(|i| i.skilling.as_ref())` with `bevy_items::profession::get_profession_db().and_then(|db| db.gather(drop_ref))`; use `gather.xp_reward as f32` for `xp_per`, `SkillId::from_ref(&gather.skill_ref)`, and `gather.skill_ref.clone()` for the `SkillXpGrant.skill_ref`. (`drop_ref` is in scope from the `for (drop_ref, drop_qty) in &drops` loop.)
- [ ] **Step 9 — remove unused import:** delete `use bevy_items::skilling_type_to_skill_ref;` (~L22). Verify: `node -e "const s=require('fs').readFileSync('apps/kbve/axum-kbve/src/gameserver/mod.rs','utf8'); console.log('helper', s.includes('skilling_type_to_skill_ref'), 'SkillingType', s.includes('SkillingType'), '.skilling', s.includes('.skilling'));"` → all `false`.
- [ ] **Step 10 — gate axum:** `cargo build -p axum-kbve 2>&1 | tail -25` clean; then `cargo build -p bevy_items 2>&1 | tail -5` again (workspace coherent).
- [ ] **Step 11 — commit (atomic):** `git commit -am "feat(engine): move Rust skilling gate/XP to professiondb; regen itemdb proto"` — one commit containing regenerated `item.rs` + `json.rs` + `mod.rs`.

### Task 4: Verify other bevy_items consumers still compile

- [ ] **Step 1:** `cargo check -p arpg-server 2>&1 | tail -15` → clean.
- [ ] **Step 2:** `cargo check -p isometric-game 2>&1 | tail -15` → clean (if Tauri-feature-gated, also its nx check).
- [ ] **Step 3:** `cargo check -p discordsh-bot 2>&1 | tail -15` → clean.
- [ ] **Step 4:** Safety net: `cargo check -p bevy_items -p axum-kbve -p arpg-server -p isometric-game -p discordsh-bot 2>&1 | tail -20` → clean. Any break = a consumer used a removed field the grep missed; fix in place.
- [ ] **Step 5:** If Steps 1-4 needed fixes, commit: `git commit -am "fix(engine): keep bevy_items consumers compiling after itemdb regen"`. Else no commit.

### Task 5: Final lint, test, push

- [ ] **Step 1:** `cargo test -p bevy_items 2>&1 | tail -15` + `cargo clippy -p bevy_items -- -D warnings 2>&1 | tail -5` → ok / no warnings.
- [ ] **Step 2:** `cargo build -p axum-kbve 2>&1 | tail -10` → clean.
- [ ] **Step 3:** No live refs to removed fields in hand code: `grep -rnE "\.skilling|\.compress\b|cooking_level|cooking_xp" apps packages --include=*.rs | grep -v "src/proto/item.rs" || echo CLEAN` → CLEAN (regenerated item.rs may still hold SkillingInfo/CompressInfo message structs — fine).
- [ ] **Step 4:** Push `git push -u origin trunk/professiondb-engine-consumers-1785586967`. (Controller opens PR after final review.)

## Rollback / risk

- Task 3 Step 1 mutates a **tracked** generated file (`item.rs`); abort mid-way with `git checkout -- packages/rust/bevy/bevy_items/src/proto/item.rs` to restore the working stale version.
- If Decision 1's `..Default::default()` is rejected, Task 3 Steps 2-4 must enumerate every new field — larger, error-prone.
- Skill-ref parity assumed (Decision 4). If the gameserver's `SkillRegistry` ever diverges from the profession refs, `SkillId::from_ref` silently no-ops XP/gating. Defensive follow-up (out of scope): assert each profession ref is registered at load time.

## Self-Review

- **Scope:** unblocks the Rust half of Phase 2b (bevy_items + axum + 3 downstream crates). rareicon Unity is the separate 2b-Unity phase (deferred).
- **Atomicity:** the field-removing regen and its fixes are one commit (Task 3) — workspace always compiles.
- **Consistency:** `GatherInfo.skill_ref` = profession ref (identity, Decision 4); both axum sites use it via `SkillId::from_ref`; xp_reward is uint32 (always present). camelCase serde matches the verified JSON.
- **Flagged for confirmation:** Decisions 1 (`..Default::default()`), 3 (embed path), 5 (OnceLock).
