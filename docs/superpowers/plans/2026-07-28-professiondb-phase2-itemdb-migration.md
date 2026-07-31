# professiondb Phase 2 — itemdb Economics Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all itemdb harvest/recipe economics into professiondb as the single source of truth: 29 `skilling` blocks → gather actions (adding the **foraging** profession), 19 `compress` blocks → production actions; author the one real missing item (`pickaxe`); reserve the vacated itemdb proto fields; keep the Phase-1 seed as drafted future reference.

**Architecture:** professiondb action files (folder-per-profession, Phase 1 layout) gain 48 migrated actions built from real itemdb values. The migrated items lose their `skilling`/`compress` frontmatter (economics now live on the action that outputs them). `itemdb.proto` reserves the vacated field numbers so they can never be silently reused. The cross-ref validator stays **warn-only** (hard-fail is Phase 4).

**Tech Stack:** protobuf (`protoc` + `@bufbuild/protobuf`), `@kbve/devops` proto-to-zod codegen, Astro content collections, gray-matter, nx.

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-professiondb-itemdb-migration`, branch `trunk/professiondb-itemdb-migration-1785409291`. All work here; never the main tree.
- No comments in authored code/frontmatter (repo rule: drop all comments).
- Run nx via `./kbve.sh -nx <target>`; set `export NX_WORKSPACE_ROOT_PATH=$PWD` for direct `npx tsx` codegen calls.
- Proto changes: **additive** on professiondb (`resource_node_ref`); **reserve-only** on itemdb (no field reuse). Never renumber.
- Validator stays **warn-only** this phase. Unresolved refs (Phase-1 seed's fake items, mapdb resource_nodes) are expected warnings, not failures.
- Commit messages: no `Co-Authored-By`, no "Generated with Claude" text.

## Decisions carried from brainstorming (flagged for confirmation at plan review)

1. **Seed disposition.** mining + woodcutting have REAL itemdb data → their Phase-1 seed actions (`mine-copper-ore`, `mine-iron-ore`, `chop-oak-log`, `chop-willow-log`) are **superseded** by real migrated actions (deleted). The genuinely-future seed professions (alchemy, smithing, fishing, farming, cooking — 10 actions) are **kept but marked `drafted: true`** — reference for future professions, excluded from the resolvable graph, undrafted as their items get authored later.
2. **Compress → profession mapping:** `→meal` (14 items) = **cooking**; `log→timber` = **woodcutting**; `coin→gold-bar`, `stone→stone-block`, `arrow→quiver` = **smithing**. (No new "crafting" profession this phase — keeps to existing folders. Revisit if fletching/masonry wanted later.)
3. **`resource_node_ref` on ProfessionAction (new optional proto field):** records the world-node slug each gather action is performed at (`ore-copper`, `flower-allium`, …). It is a foreign key to a future mapdb `WorldObjectDef` (Phase 3), NOT spatial data — it preserves the itemdb `resource_node` values through the migration so Phase 3 can seed mapdb links. Spatial props (respawn/collision) still live only on mapdb.

## Migration source data

### Skilling → gather actions (29 items). Action ref = `gather-<item>`; profession = skill; output = the item (qty 1); `resource_node_ref` from `resource_node`; `tool_refs` from `tool_required`; `required_level`/`xp_reward` from item; `duration_ms` = `gather_time × 1000`.

| item-ref     | profession  | key(action) | req_level | xp  | duration_ms | resource_node_ref    | tool    |
| ------------ | ----------- | ----------- | --------- | --- | ----------- | -------------------- | ------- |
| copper-ore   | mining      | 15          | 1         | 18  | 3000        | ore-copper           | pickaxe |
| iron-ore     | mining      | 16          | 15        | 35  | 4000        | ore-iron             | pickaxe |
| crystal-ore  | mining      | 17          | 30        | 65  | 5000        | ore-crystal          | pickaxe |
| mossy-stone  | mining      | 18          | 0         | 15  | 2500        | mossy-rock           | -       |
| stone        | mining      | 19          | 0         | 8   | 2000        | boulder              | -       |
| log          | woodcutting | 20          | 0         | 10  | 2500        | tree                 | -       |
| branches     | woodcutting | 21          | 0         | 0   | 0           | -                    | -       |
| leaves       | woodcutting | 22          | 0         | 0   | 0           | -                    | -       |
| allium       | foraging    | 23          | 0         | 5   | 500         | flower-allium        | -       |
| bellflower   | foraging    | 24          | 0         | 5   | 500         | flower-bell          | -       |
| blue-orchid  | foraging    | 25          | 0         | 8   | 500         | flower-blue-orchid   | -       |
| chanterelle  | foraging    | 26          | 0         | 10  | 500         | mushroom-chanterelle | -       |
| cornflower   | foraging    | 27          | 0         | 5   | 500         | flower-cornflower    | -       |
| daisy        | foraging    | 28          | 0         | 5   | 500         | flower-daisy         | -       |
| fly-agaric   | foraging    | 29          | 0         | 12  | 500         | mushroom-fly-agaric  | -       |
| lavender     | foraging    | 30          | 0         | 7   | 500         | flower-lavender      | -       |
| porcini      | foraging    | 31          | 0         | 8   | 500         | mushroom-porcini     | -       |
| rose         | foraging    | 32          | 0         | 6   | 500         | flower-rose          | -       |
| sunflower    | foraging    | 33          | 0         | 6   | 500         | flower-sunflower     | -       |
| tulip        | foraging    | 34          | 0         | 5   | 500         | flower-tulip         | -       |
| wildflower   | foraging    | 35          | 0         | 4   | 500         | flower-wildflower    | -       |
| berry        | foraging    | 36          | 0         | 0   | 0           | -                    | -       |
| cacti-needle | foraging    | 37          | 0         | 0   | 0           | -                    | -       |
| cacti-seeds  | foraging    | 38          | 0         | 0   | 0           | -                    | -       |
| dragonfruit  | foraging    | 39          | 0         | 0   | 0           | -                    | -       |
| herb         | foraging    | 40          | 0         | 0   | 0           | -                    | -       |
| mushroom     | foraging    | 41          | 0         | 0   | 0           | -                    | -       |
| prickly-pear | foraging    | 42          | 0         | 0   | 0           | -                    | -       |
| raw-cacti    | foraging    | 43          | 0         | 0   | 0           | -                    | -       |

**Field requiredness (verified against generated `ProfessionActionSchema`):** `ref`, `name`, `key`, `required_level`, `xp_reward` are **REQUIRED** — always emit, even when the value is 0. `duration_ms`, `tool_refs`, `resource_node_ref`, `inputs`, `outputs` are **optional** — omit entirely when the table shows `-` or 0. So a bare foraging item (e.g. `berry`, xp 0) still emits `required_level: 0` and `xp_reward: 0`, but omits `duration_ms`/`resource_node_ref`/`tool_refs`.

### Compress → production actions (19 items). Action ref = `compress-<item>`; profession per Decision 2; input = the item (qty = `ratio`, i.e. 100); output = `target_ref` (qty 1); no tool.

| item-ref       | target      | profession  | key(action) | input qty |
| -------------- | ----------- | ----------- | ----------- | --------- |
| berry          | meal        | cooking     | 44          | 100       |
| carrot         | meal        | cooking     | 45          | 100       |
| cheese         | meal        | cooking     | 46          | 100       |
| cooked-beef    | meal        | cooking     | 47          | 100       |
| cooked-chicken | meal        | cooking     | 48          | 100       |
| cooked-egg     | meal        | cooking     | 49          | 100       |
| cooked-mutton  | meal        | cooking     | 50          | 100       |
| dragonfruit    | meal        | cooking     | 51          | 100       |
| egg            | meal        | cooking     | 52          | 100       |
| fresh-milk     | meal        | cooking     | 53          | 100       |
| mushroom       | meal        | cooking     | 54          | 100       |
| prickly-pear   | meal        | cooking     | 55          | 100       |
| raw-beef       | meal        | cooking     | 56          | 100       |
| raw-chicken    | meal        | cooking     | 57          | 100       |
| raw-mutton     | meal        | cooking     | 58          | 100       |
| log            | timber      | woodcutting | 59          | 100       |
| stone          | stone-block | smithing    | 60          | 100       |
| coin           | gold-bar    | smithing    | 61          | 100       |
| arrow          | quiver      | smithing    | 62          | 100       |

Note: `berry`, `dragonfruit`, `log`, `mushroom`, `prickly-pear`, `stone` appear in BOTH tables (a gather action AND a compress action) — that is correct, they are two different verbs on the same item.

---

### Task 1: professiondb proto — add `resource_node_ref` to ProfessionAction

**Files:** Modify `packages/data/proto/profession/professiondb.proto`; regenerate descriptor + schema.

- [ ] **Step 1:** In `ProfessionAction`, after `optional string facility_ref = 13;` add:

```proto
  optional string resource_node_ref = 14;
```

- [ ] **Step 2:** Regenerate: `cd <worktree> && export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx packages/data/codegen/gen-all.mjs professiondb 2>&1 | grep -v "npm warn"`. Expect the two ✓ lines.
- [ ] **Step 3:** Verify `grep -n "resource_node_ref" packages/data/codegen/generated/professiondb-schema.ts` shows `resource_node_ref: z.string().optional()` in `ProfessionActionSchema`.
- [ ] **Step 4:** Commit: `git commit -m "feat(professiondb): add resource_node_ref to ProfessionAction"` (proto + descriptor + schema).

### Task 2: Add the foraging profession + seed reconciliation

**Files:** Create `professiondb/foraging/index.mdx`; delete 4 superseded seed actions; add `drafted: true` to 10 future-reference seed actions.

- [ ] **Step 1:** Create `apps/kbve/astro-kbve/src/content/docs/professiondb/foraging/index.mdx` (`kind: profession`, `ref: foraging`, `key: 8`, `id`: a fresh ULID-shaped string `01KPROFFORAGING0000000008`, `name: Foraging`, `category: gathering`, `emoji: 🌿`, `max_level: 99`, `experience_curve` polynomial base_xp 40 growth 1.5 max_level 99). No inline actions.
- [ ] **Step 2:** Delete the 4 superseded seed action files: `professiondb/mining/mine-copper-ore.mdx`, `professiondb/mining/mine-iron-ore.mdx`, `professiondb/woodcutting/chop-oak-log.mdx`, `professiondb/woodcutting/chop-willow-log.mdx`. Also remove their entries from `mining/index.mdx` and `woodcutting/index.mdx` `unlocks:` blocks if they reference those action refs.
- [ ] **Step 3:** Add `drafted: true` to the 10 future-reference seed action files (alchemy/_, smithing/_, fishing/_, farming/_, cooking/_ — the cook-shrimp/bake-bread + grow-_ + catch-_ + brew-_ + forge/smelt actions). These stay as reference; the data-gen skips `drafted: true`.
- [ ] **Step 4:** Commit: `git commit -m "feat(professiondb): add foraging profession, draft future-reference seed actions"`.

### Task 3: Migrate 29 skilling blocks → gather action files

**Files:** Create 29 `professiondb/<profession>/gather-<item>.mdx`; (blocks stripped from itemdb in Task 5).

- [ ] **Step 1:** For each row in the skilling table, create `professiondb/<profession>/gather-<item-ref>.mdx` with frontmatter: `kind: action`, `profession: <profession>`, `ref: gather-<item-ref>`, `key: <key>`, `name: '<Verb> <Item Name>'` (mining=Mine, woodcutting=Chop, foraging=Forage), **always** `required_level: <n>` and `xp_reward: <n>` (emit even when 0), `outputs: [{ item_ref: <item-ref>, quantity: 1 }]`, and `duration_ms`/`resource_node_ref`/`tool_refs` ONLY when the table value is not `-`/0. One-line body.
- [ ] **Step 2:** Run `npx tsx packages/data/codegen/gen-professiondb-data.mjs` — expect 8 professions, action count = 10 (remaining drafted-excluded seed) ... actually drafted are skipped, so live actions = 29 gather + (compress added Task 4) + 0 non-drafted seed. Verify no throw, foraging present with 21 actions.
- [ ] **Step 3:** Assert: `node -e "const d=require('./packages/data/codegen/generated/professiondb-data.json'); const f=d.professions.find(p=>p.ref==='foraging'); console.log('foraging actions', f.actions.length); const cu=d.professions.find(p=>p.ref==='mining').actions.find(a=>a.ref==='gather-copper-ore'); console.log(JSON.stringify(cu));"` → foraging 21; gather-copper-ore has key 15, resourceNodeRef ore-copper, toolRefs [pickaxe], xpReward 18.
- [ ] **Step 4:** Commit: `git commit -m "feat(professiondb): migrate 29 itemdb skilling blocks to gather actions"`.

### Task 4: Migrate 19 compress blocks → production action files

**Files:** Create 19 `professiondb/<profession>/compress-<item>.mdx`.

- [ ] **Step 1:** For each compress-table row create `professiondb/<profession>/compress-<item-ref>.mdx`: `kind: action`, `profession: <profession>`, `ref: compress-<item-ref>`, `key: <key>`, `name: 'Compress <Item Name>'`, `required_level: 0`, `xp_reward: 0` (both REQUIRED by schema), `inputs: [{ item_ref: <item-ref>, quantity: 100 }]`, `outputs: [{ item_ref: <target>, quantity: 1 }]`. One-line body. Note: `compress-<item>` and `gather-<item>` refs are distinct, so the 6 items in both tables get two separate action files — no ref collision.
- [ ] **Step 2:** Run the data-gen; assert cooking has 15 compress actions, smithing has 3 (compress-stone/coin/arrow), woodcutting has compress-log. `node -e "const d=require('./packages/data/codegen/generated/professiondb-data.json'); for(const r of ['cooking','smithing','woodcutting']){const p=d.professions.find(x=>x.ref===r); console.log(r, p.actions.map(a=>a.ref).filter(x=>x.startsWith('compress')).length);}"`.
- [ ] **Step 3:** Commit: `git commit -m "feat(professiondb): migrate 19 itemdb compress blocks to production actions"`.

### Task 5: Author `pickaxe` item + strip migrated blocks from itemdb

**Files:** Create `itemdb/pickaxe.mdx`; edit 29 + 19 (deduped: 42 unique) itemdb item files to remove `skilling:`/`compress:` blocks.

- [ ] **Step 1:** Create `apps/kbve/astro-kbve/src/content/docs/itemdb/pickaxe.mdx` using the identity-only template (title/template splash/sidebar hidden/description/lore/ref `pickaxe`/key **634**/id fresh ULID-shaped/name/type_flags for a tool/consumable false/stackable false/max_stack 1/rarity common/buy_price/sell_price/emoji ⛏️/weight/tags) + the standard `<ItemDBPanel data={frontmatter} />` body. No skilling block.
- [ ] **Step 2:** Remove the top-level `skilling:` block from all 29 skilling items and the top-level `compress:` block from all 19 compress items (42 unique files; 6 items have both). Leave every other field (identity, food, stacking, pool_group) untouched.
- [ ] **Step 3:** Regen itemdb data: `npx tsx packages/data/codegen/gen-itemdb-data.mjs` (+ zod if needed). Assert no `skilling`/`compress` remain: `node -e "const d=require('./packages/data/codegen/generated/itemdb-data.json'); const bad=d.items.filter(i=>i.skilling||i.compress); console.log('residual', bad.length); console.log('pickaxe', !!d.items.find(i=>i.ref==='pickaxe'));"` → residual 0, pickaxe true.
- [ ] **Step 4:** Commit: `git commit -m "feat(itemdb): author pickaxe, strip migrated skilling/compress blocks"`.

### Task 6: Reserve vacated itemdb proto fields

**Files:** Modify `packages/data/proto/item/itemdb.proto`; regenerate itemdb descriptor + schema.

- [ ] **Step 1:** On the `Item` message, replace `optional SkillingInfo skilling = 42;` and `optional CompressInfo compress = 48;` with reservations:

```proto
  reserved 42, 48;
  reserved "skilling", "compress";
```

(Place the `reserved` lines in the message; delete the two field lines. Leave the `SkillingInfo`/`CompressInfo` message definitions in the file — harmless, now unreferenced — unless a grep shows no other use, in which case they may stay for Phase-3/4 reference.)

- [ ] **Step 2:** In `FoodInfo`, reserve the two cooking fields (0 data, per spec): remove `optional int32 cooking_level = 3;` and `optional float cooking_xp = 4;`, add `reserved 3, 4; reserved "cooking_level", "cooking_xp";`.
- [ ] **Step 3:** Regenerate itemdb: `npx tsx packages/data/codegen/gen-all.mjs itemdb 2>&1 | grep -v "npm warn"`. Then re-run `gen-itemdb-data.mjs`. Confirm it still encodes (the stripped MDX has no skilling/compress, so no data references the reserved fields).
- [ ] **Step 4:** Grep no consumer references the reserved fields as live: `grep -rniE "\.skilling|\.compress|cooking_level|cooking_xp" apps packages --include=*.ts --include=*.cs --include=*.rs 2>/dev/null | grep -v node_modules | grep -viE "generated|-schema|\.g\.cs"` — investigate any hit (Unity Itemdb.cs generated is fine; hand code is not).
- [ ] **Step 5:** Commit: `git commit -m "feat(itemdb): reserve skilling/compress/cooking fields (economics moved to professiondb)"`.

### Task 7: Regenerate, validate, sync, PR

- [ ] **Step 1:** Full regen chain: `npx tsx packages/data/codegen/gen-professiondb-data.mjs` (auto-chains xref). Confirm xref warn-only exit 0; the newly-real refs (copper-ore, iron-ore, meal, timber, gold-bar, stone-block, quiver, pickaxe) now RESOLVE — fewer warnings than Phase 1. `node -e "const x=require('./packages/data/codegen/generated/xref-index.json'); console.log('produced_by keys', Object.keys(x.produced_by).length); const pk=x.slug_to_key['pickaxe']; console.log('pickaxe tool_for', x.tool_for[pk]);"`.
- [ ] **Step 2:** `./kbve.sh -nx astro-kbve:sync` — must be green (validates all new action files + foraging index + drafted seed + pickaxe item + stripped items).
- [ ] **Step 3:** Barrel round-trip: `getActionsProducing(slug_to_key['copper-ore'])` returns the gather-copper-ore action key (15); `getActionsForTool(slug_to_key['pickaxe'])` returns the 3 mining actions that use it.
- [ ] **Step 4:** Commit any regenerated artifacts. Push `git push -u origin trunk/professiondb-itemdb-migration-1785409291`. (Controller opens the PR after final review.)

## Self-Review

- **Spec coverage (Phase 2 slice):** author real missing item (pickaxe) ✓; migrate 29 skilling → actions ✓; migrate compress → actions ✓ (spec's CompressInfo row); FoodInfo cooking migration = empty (0 data) but fields reserved ✓; reserve SkillingInfo(42)/CompressInfo(48) ✓; strip blocks from items ✓; resource_node preserved for Phase-3 mapdb via `resource_node_ref` ✓. Deferred correctly: mapdb changes + node authoring (Phase 3), hard-fail + graph-integrity + UE (Phase 4).
- **Key consistency:** action keys 15–62 continue Phase-1's 1–14 without collision; superseded seed actions (1–4) deleted, drafted seed (5–14) retained; foraging profession key 8 (professions 1–7 + 8). itemdb pickaxe key 634 (max was 633).
- **Type consistency:** gather action output = item, compress input=item(qty ratio)/output=target; `resource_node_ref`/`tool_refs`/`facility_ref` optional. Data-gen strips `kind`/`profession`; `resource_node_ref` is a real proto field (survives).
- **Flagged for plan-review confirmation:** (1) seed supersession vs draft; (2) compress→profession mapping; (3) `resource_node_ref` on the action. All three are called out at the top.
