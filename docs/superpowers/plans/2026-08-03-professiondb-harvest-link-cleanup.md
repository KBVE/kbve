# professiondb harvest-link + skilling cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `harvest_weight` loop end-to-end (mapdb MDX → generated JSON → engine-neutral runtime view → UE struct) with a coherent uniform default, and delete the dead `SkillingType`/`SkillingInfo` itemdb proto types that professiondb superseded.

**Architecture:** Three independent tasks. (A-data) normalize `harvest_weight` to `100` on every mapdb `resource_node` MDX and regenerate the derived artifacts — the existing runtime-view join and bidirectional xref validator already exist and just need to see coherent values. (A-ue) add the missing `HarvestWeight` field + JSON parse to the UE `KBVEMapDB` plugin (proto field 75 is currently never round-tripped). (B1-cleanup) remove `enum SkillingType` + `message SkillingInfo` from `itemdb.proto` (already `reserved` on `ItemDef`, zero consumers repo-wide) and regenerate every itemdb-derived artifact, plus delete the hand-written dead `skilling_type_to_skill_ref()`.

**Tech Stack:** Astro MDX frontmatter, Node ESM codegen, nx `run-commands`, `protoc`, prost (Rust, `BUILD_PROTO=1`), UE5 C++ (`FJsonObject` parse, `GameInstanceSubsystem`).

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-link`, branch `trunk/professiondb-link-integrity`. Never the main tree. Absolute paths.
- DROP ALL code comments in newly authored/edited C++ and Rust. Do not add comments.
- Never hand-edit generated files (`item.rs`, `itemdb-schema.ts`, `*.binpb`, `*-data.json`, `KBVEItemDBProto*.h`) — regenerate via codegen. The one hand edit is the `.proto` source.
- `harvest_weight` uniform default = `100` (integer) on ALL `resource_node` MDX. No per-node balance authoring (deferred design pass).
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.
- NO UE toolchain here — the UE C++ (Task 2) and the regenerated `KBVEItemDBProto*.h` (Task 3) cannot be compiled locally; correctness = structural parity + field-name existence. Real gate = `ci-unreal-plugins.yml`.
- After any `nx run … sync:*`, revert stray churn to files this task does not own (e.g. `sync:itemdb-uecpp` header regen when only mapdb changed): `git checkout -- <path>`. Only commit the files each task owns.

## Verified facts (VERIFIED read-only — see `.superpowers/sdd/phaseAB-facts.md` for full quotes)

- **zod already validates the 4 harvest fields** — `packages/data/codegen/generated/mapdb-schema.ts:879-880,931-932` (`harvest_time_ms`, `harvest_yield`, `profession_action_ref`, `harvest_weight`), merged into `IMapObjectSchema` (`apps/kbve/astro-kbve/src/data/schema/IMapSchema.ts:172`). No `.int()`/range convention exists in that generated file. NO schema work in this plan.
- **bidirectional node↔action xref check already exists + hard-fails** — `packages/data/codegen/gen-professiondb-xref.mjs:117-163` (forward action→node, reverse node→action, back-ref match). NO xref work in this plan; Task 1 just re-runs it as a regression gate.
- **mapdb codegen is generic snake→camel passthrough** — `packages/data/codegen/gen-mapdb-data.mjs:135-154`. Adding/normalizing frontmatter values needs no codegen change.
- **32 `resource_node` MDX files** under `apps/kbve/astro-kbve/src/content/docs/mapdb/`: 16 missing `harvest_weight` entirely, 16 set to `0`. None nonzero. (Lists in the dossier §B; the implementer must re-derive the live set by grep, not trust a stale list.)
- **runtime-view join** — `gen-professiondb-data.mjs` `buildRuntimeView()` bakes `harvestWeight` from the mapdb node referenced by a gather action's `resourceNodeRef` (default 100 when absent). After normalization the baked value becomes an explicit 100.
- **UE round-trip missing** — `packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h` `FKBVEWorldObjectDef` has `ProfessionActionRef` + `HarvestTimeMs` but NO `HarvestWeight`. `Private/KBVEMapDatabase.cpp` parses with `FJsonObject` `TryGet*Field` (NOT yyjson); `int32` fields use `Obj->TryGetNumberField(TEXT("..."), Def.Field)`.
- **dead skilling types** — `packages/data/proto/item/itemdb.proto`: `enum SkillingType` + `message SkillingInfo`; `ItemDef` already has `reserved "skilling", "compress";`. Generated into `packages/rust/bevy/bevy_items/src/proto/item.rs` (`SkillingInfo` ~L280, `SkillingType` ~L1445) and `packages/data/codegen/generated/itemdb-schema.ts` (`SkillingTypes`/`SkillingTypeSchema` ~L144-164). Hand-written dead fn `skilling_type_to_skill_ref()` at `packages/rust/bevy/bevy_items/src/lib.rs:47-65`. Repo-wide grep: ZERO consumers outside `bevy_items` itself (incl. axum). Safe to delete.
- **itemdb regen has NO single nx target** — `itemdb.binpb` is built by a manual `protoc` (analogous to the `sync:mapdb-zod` command at `project.json:332`); `itemdb-schema.ts` via `npx tsx packages/data/codegen/gen-itemdb-zod.mjs`; `item.rs` via `BUILD_PROTO=1` build of `bevy_items`; UE headers via `nx run astro-kbve:sync:itemdb-uecpp`; `itemdb-data.json` via `nx run astro-kbve:sync:itemdb`.
- **B2 (profession-ref→SkillRegistry assertion) is OUT OF SCOPE** — no bootstrap owns both a populated `SkillRegistry` and `ProfessionDb::from_json` (`load_server_professiondb()` runs before the Bevy `Startup` schedule that registers the 3 hardcoded skills); no `skilldb-data.json` exists. Deferred to a skilldb-as-source pass / Phase C.

---

## Task 1: normalize mapdb `harvest_weight` → 100 + regenerate derived artifacts

**Files:**
- Modify: every `apps/kbve/astro-kbve/src/content/docs/mapdb/*.mdx` whose frontmatter is `type: "resource_node"` (~32 files).
- Regenerate (do NOT hand-edit): `packages/data/codegen/generated/mapdb-data.json`, `packages/data/codegen/generated/professiondb-runtime.json`, `packages/data/codegen/generated/professiondb-data.json`, `packages/data/codegen/generated/xref-index.json`, and any synced engine copies the sync targets own.

**Interfaces:**
- Produces: coherent `harvestWeight: 100` on every resource node in `mapdb-data.json`, baked into `professiondb-runtime.json` gather entries. Task 2 (UE) will read `harvestWeight` from the synced `mapdb-data.json`.

- [ ] **Step 1: Derive the live resource_node set.** Run:
```bash
cd /Users/alappatel/Documents/GitHub/kbve-professiondb-link
grep -rl 'type: "resource_node"' apps/kbve/astro-kbve/src/content/docs/mapdb/*.mdx | sort
```
Record the count. For each file, check whether it already has a `harvest_weight:` frontmatter line (`grep -c '^harvest_weight:' <file>`).

- [ ] **Step 2: Normalize every resource_node.** For each file in the set:
  - If it has `harvest_weight: <n>` (any value, incl. 0) → set the value to `100` (Edit the line to `harvest_weight: 100`).
  - If it has NO `harvest_weight:` line → add `harvest_weight: 100` inside the frontmatter block, immediately after the existing `harvest_time_ms:` line (or after `harvest_yield:` if no `harvest_time_ms:`), matching the file's exact indentation/quoting style.
  - Do NOT touch any non-`resource_node` MDX. Do NOT add `harvest_weight` to nodes that are not `resource_node`.

- [ ] **Step 3: Verify all frontmatter is 100 before regen.**
```bash
grep -L '^harvest_weight: 100$' $(grep -rl 'type: "resource_node"' apps/kbve/astro-kbve/src/content/docs/mapdb/*.mdx)
```
Expected: prints NOTHING (every resource_node now has exactly `harvest_weight: 100`).

- [ ] **Step 4: Regenerate.** Run the umbrella sync (it cascades mapdb → professiondb runtime view → xref):
```bash
npx nx run astro-kbve:sync:professiondb --skip-nx-cache 2>&1 | tail -15
```
Expected: succeeds (the xref validator at `gen-professiondb-xref.mjs` does NOT throw). If it throws a `node_links`/`graph_integrity` error, STOP and report — the normalization exposed a real dangling ref, not a plan defect.

- [ ] **Step 5: Revert stray churn.** The cascade also runs `sync:itemdb`/`sync:itemdb-uecpp`/`sync:mapdb`. Inspect and revert anything this task does not own:
```bash
git status --porcelain
```
Keep ONLY: the 32 MDX, `mapdb-data.json`, `professiondb-data.json`, `professiondb-runtime.json`, `xref-index.json`, and any `mapdb`/`professiondb` synced engine copies. `git checkout --` any `itemdb`-derived churn (`generated/itemdb*`, `KBVEItemDBProto*.h`, `StreamingAssets/itemdb*`) that changed as a no-op side effect.

- [ ] **Step 6: Verify the runtime-view join baked 100.**
```bash
node -e "const d=require('./packages/data/codegen/generated/professiondb-runtime.json');const s=new Set();for(const p of d.professions)for(const a of(p.actions||[]))if(a.gather&&a.gather.harvestWeight!==undefined)s.add(a.gather.harvestWeight);console.log('distinct baked harvestWeight values:',[...s])"
```
Expected: `[ 100 ]` (only 100; no 0s remain). (If the runtime shape nests differently, adapt the path — confirm no `0`/`undefined` harvestWeight survives on a gather entry whose node was normalized.)

- [ ] **Step 7: Verify mapdb-data.json nodes.**
```bash
node -e "const d=require('./packages/data/codegen/generated/mapdb-data.json');const bad=d.objectDefs.filter(o=>o.type==='WORLD_OBJECT_RESOURCE_NODE'&&o.harvestWeight!==100);console.log('resource nodes not 100:',bad.map(o=>o.ref+':'+o.harvestWeight))"
```
Expected: `resource nodes not 100: []`.

- [ ] **Step 8: Commit.**
```bash
git add apps/kbve/astro-kbve/src/content/docs/mapdb packages/data/codegen/generated
git commit -m "feat(mapdb): normalize resource-node harvest_weight to 100, regen runtime view + xref"
```

## Task 2: UE `HarvestWeight` round-trip (`KBVEMapDB`)

**Files:**
- Modify: `packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h`
- Modify: `packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp`

**Interfaces:**
- Consumes: the synced `mapdb-data.json` `harvestWeight` (int, now uniformly 100) from Task 1.
- Produces: `FKBVEWorldObjectDef::HarvestWeight` (`int32`) populated at load.

- [ ] **Step 1: Add the field.** In `KBVEMapTypes.h`, immediately AFTER the `ProfessionActionRef` UPROPERTY block, add (match the surrounding style exactly — tabs, `Category = "KBVE|Map"`):
```cpp
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	int32 HarvestWeight = 0;
```
Do NOT touch `HarvestYield` (its pre-existing `FName` type is out of scope — leave it).

- [ ] **Step 2: Add the parse.** In `KBVEMapDatabase.cpp`, in the per-object parse loop, immediately AFTER the `professionActionRef` line, add:
```cpp
		Obj->TryGetNumberField(TEXT("harvestWeight"), Def.HarvestWeight);
```
(Match the existing `TryGetNumberField` int32 style used for `HarvestTimeMs`/`MaxAmount`/`SpawnCount`.)

- [ ] **Step 3: Static verify (NO compiler here).**
```bash
grep -n "int32 HarvestWeight" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h
grep -n 'TryGetNumberField(TEXT("harvestWeight"), Def.HarvestWeight)' packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp
```
Both must print exactly once. Confirm the JSON key case is `harvestWeight` (camelCase — matches `mapdb-data.json`, verify with `grep -m1 harvestWeight packages/data/codegen/generated/mapdb-data.json`).

- [ ] **Step 4: Commit.**
```bash
git add packages/unreal/KBVEMapDB
git commit -m "feat(unreal): round-trip mapdb harvest_weight into FKBVEWorldObjectDef"
```

## Task 3: delete dead `SkillingType`/`SkillingInfo` + regenerate itemdb artifacts

**Files:**
- Modify (source): `packages/data/proto/item/itemdb.proto` (remove `enum SkillingType {}` + `message SkillingInfo {}`).
- Modify (source): `packages/rust/bevy/bevy_items/src/lib.rs` (delete `skilling_type_to_skill_ref()` fn + its doc comment + any now-unused `use` of `SkillingType`).
- Regenerate (do NOT hand-edit): `packages/data/codegen/descriptors/itemdb.binpb`, `packages/data/codegen/generated/itemdb-schema.ts`, `packages/rust/bevy/bevy_items/src/proto/item.rs`, `packages/unreal/KBVEItemDB/Source/KBVEItemDB/Public/Generated/KBVEItemDBProto*.h`, `packages/data/codegen/generated/itemdb-data.json` (+ synced Unity copies).

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (independent).
- Produces: an itemdb proto with no skilling types; `item.rs` no longer defines `SkillingType`/`SkillingInfo`.

- [ ] **Step 1: Confirm zero consumers (guard against regression before deleting).**
```bash
grep -rnE "SkillingType|SkillingInfo|skilling_type_to_skill_ref" packages apps --include=*.rs | grep -v "packages/rust/bevy/bevy_items/src/proto/item.rs" | grep -v "packages/rust/bevy/bevy_items/src/lib.rs"
```
Expected: NO output. If anything prints, STOP and report (a consumer exists; deletion unsafe).

- [ ] **Step 2: Edit the proto.** In `packages/data/proto/item/itemdb.proto`, delete the entire `enum SkillingType { ... }` block and the entire `message SkillingInfo { ... }` block. Leave the `ItemDef` `reserved "skilling", "compress";` line untouched. Do NOT renumber or touch any other field. Verify no remaining reference:
```bash
grep -nE "SkillingType|SkillingInfo" packages/data/proto/item/itemdb.proto
```
Expected: NO output.

- [ ] **Step 3: Rebuild the descriptor** (mirror the mapdb protoc pattern at `project.json:332`):
```bash
protoc --include_imports --descriptor_set_out=packages/data/codegen/descriptors/itemdb.binpb --proto_path=packages/data/proto item/itemdb.proto && echo "binpb ok"
```
Expected: `binpb ok`. (If `protoc` is unavailable, STOP and report — the regen cannot proceed without it.)

- [ ] **Step 4: Regenerate the zod schema.**
```bash
npx tsx packages/data/codegen/gen-itemdb-zod.mjs
grep -nE "SkillingType|SkillingInfo" packages/data/codegen/generated/itemdb-schema.ts
```
Expected: generator prints `✓ Generated itemdb-schema.ts`; the grep prints NO output (types dropped).

- [ ] **Step 5: Regenerate `item.rs`** (prost, gated on `BUILD_PROTO`):
```bash
BUILD_PROTO=1 npx nx build bevy_items 2>&1 | tail -8
grep -nE "struct SkillingInfo|enum SkillingType" packages/rust/bevy/bevy_items/src/proto/item.rs
```
Expected: build succeeds; grep prints NO output. (If `nx build bevy_items` does not honor `BUILD_PROTO`, fall back to `BUILD_PROTO=1 cargo build -p bevy_items` from the workspace root.)

- [ ] **Step 6: Delete the dead fn.** In `packages/rust/bevy/bevy_items/src/lib.rs`, remove `skilling_type_to_skill_ref()` (lines ~47-65) including its doc comment, and any `use ...::SkillingType;` that becomes unused.

- [ ] **Step 7: Regenerate itemdb UE headers + data JSON** (they read the new descriptor):
```bash
npx nx run astro-kbve:sync:itemdb-uecpp --skip-nx-cache 2>&1 | tail -5
npx nx run astro-kbve:sync:itemdb --skip-nx-cache 2>&1 | tail -5
grep -rn "SkillingInfo\|SkillingType" packages/unreal/KBVEItemDB/Source/KBVEItemDB/Public/Generated/ || echo "UE headers clean"
```
Expected: both succeed; `UE headers clean`.

- [ ] **Step 8: Compile-gate the Rust.**
```bash
npx nx run bevy_items:check-desktop 2>&1 | tail -15
```
Expected: passes (no reference to the deleted symbols). (If no `check-desktop` target fits, use `cargo check -p bevy_items` from the workspace root.)

- [ ] **Step 9: Commit** (proto source + hand edit + ALL regenerated artifacts together, so the tree is self-consistent):
```bash
git add packages/data/proto/item/itemdb.proto packages/rust/bevy/bevy_items packages/data/codegen/descriptors/itemdb.binpb packages/data/codegen/generated/itemdb-schema.ts packages/data/codegen/generated/itemdb-data.json packages/data/codegen/generated/itemdb-data.binpb packages/data/codegen/generated/itemdb.json packages/unreal/KBVEItemDB apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb.json apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb.binpb
git status --porcelain
git commit -m "refactor(itemdb): remove dead SkillingType/SkillingInfo proto types (superseded by professiondb)"
```
Before committing, confirm `git status --porcelain` shows no OTHER unexpected regenerated files; if the sync produced additional owned itemdb outputs, add them too. Do NOT leave a half-regenerated tree.

## Task 4: full gate + push

- [ ] **Step 1:** Re-run the two isolated regens; confirm idempotent (no diff):
```bash
npx nx run astro-kbve:sync:professiondb --skip-nx-cache >/dev/null 2>&1
git checkout -- $(git status --porcelain | awk '{print $2}' | grep -i itemdb) 2>/dev/null || true
git status --porcelain
```
Expected: clean (or only itemdb-uecpp no-op churn to revert).
- [ ] **Step 2:** Push: `git push -u origin trunk/professiondb-link-integrity`.
- [ ] **Step 3:** Open PR `--base dev` (title `feat(professiondb): close harvest_weight loop + drop dead skilling types`). PR body: note (a) Phase A closes the harvest_weight round-trip end-to-end (mapdb → runtime view → UE); (b) B1 removes the dead itemdb skilling types superseded by professiondb; (c) B2 (SkillRegistry assertion) + Phase C (UE gameplay resolution) are deferred follow-ups; (d) UE C++ is static-verified only — real gate is `ci-unreal-plugins.yml`.

## RISKS

- **Task 1 cascade churn:** `sync:professiondb` cascades into itemdb targets that regenerate no-op UE header churn — must be reverted, not committed. Step 5 handles it.
- **Task 3 blast radius:** editing shared `itemdb.proto` fans out to 5+ regenerated artifacts + a manual `protoc` step with no single nx target. The commit MUST be self-consistent (proto + all derived). A half-regen (e.g. `item.rs` updated but `itemdb-schema.ts` stale) would drift. Step 9 gates on `git status`.
- **No local UE compile:** Task 2 + the regenerated `KBVEItemDBProto*.h` in Task 3 are static-verified only; a UHT/UBT error surfaces only in `ci-unreal-plugins.yml`.
- **`protoc`/`BUILD_PROTO` availability:** Task 3 Steps 3/5 depend on `protoc` and a `BUILD_PROTO`-honoring build; if either is missing in this env, STOP and escalate rather than committing a partial regen.
- **Name collision:** `SkillingInfo.harvest_weight` (itemdb tag 8, deleted in Task 3) is unrelated to `WorldObjectDef.harvest_weight` (mapdb tag 75, normalized in Task 1). Do not conflate them.

## Self-Review

- **Scope:** Phase A (data normalize + UE round-trip) + Phase B1 (dead-type deletion). B2 (SkillRegistry assertion) and Phase C (UE gameplay resolution) are explicitly deferred, with reasons in Global Constraints/facts.
- **No new schema/xref work:** both already exist and hard-fail — Task 1 exercises them as regression gates rather than adding logic.
- **Idempotence:** Task 4 re-runs codegen to prove the committed artifacts match a fresh generation (drift check).
