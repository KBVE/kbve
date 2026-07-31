# professiondb Phase 3 — mapdb Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mapdb `WorldObjectDef` the spatial placement layer that links to professiondb verbs: add `profession_action_ref` (+ `harvest_weight`), reserve the 4 truly-unused harvest fields, keep `harvest_time_ms` (live spatial property), and seed node↔action links for all 19 gather actions (retarget 3 to existing nodes, author 16 new ones).

**Architecture:** Each mapdb resource node points to the professiondb gather action performed at it (`profession_action_ref`), and each gather action points back to its node (`resource_node_ref`, added Phase 2). The action owns the verb economics (level/xp/tool/output); the node owns spatial specifics (where, respawn, `harvest_time_ms`, spawn weight). A warn-only validator check confirms both directions resolve.

**Tech Stack:** protobuf (`protoc` + `@bufbuild/protobuf`), `@kbve/devops` proto-to-zod codegen, Astro content collections, gray-matter, nx.

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-consolidation`, branch `trunk/professiondb-mapdb-consolidation-1785489787`. All work here; never the main tree.
- No comments in authored code/frontmatter (repo rule).
- Run nx via `./kbve.sh -nx <target>`; `export NX_WORKSPACE_ROOT_PATH=$PWD` for direct `npx tsx` codegen.
- Proto: **additive** (profession_action_ref, harvest_weight) + **reserve-only** for the 4 empty fields. **KEEP `harvest_time_ms = 14`** (15 nodes populate it, 3 TS/astro + 2 UE consumers read it; it is a legit spatial node property per the spec seam). Never renumber.
- Commit messages: no `Co-Authored-By`, no "Generated with Claude".

## Decisions (confirmed at brainstorming)

1. **harvest_time_ms stays** on `WorldObjectDef` — spatial node property (per-node harvest duration), distinct from `ProfessionAction.duration_ms` (base verb time). Reserve only `loot_item_ref`(13), `tool_required`(15), `skill_level`(16), `skill_type`(17) — all 0-data, **0 hand consumers** (verified) → no consumer break this phase.
2. **Retarget + author missing.** professiondb gather actions reference legacy slugs; mapdb has 16 real nodes under other names + no flowers/mushrooms. Retarget the 3 that map to existing nodes; author the 16 that don't.

## Node link source data

### Retarget map — 3 professiondb actions point at EXISTING mapdb nodes

| professiondb action      | resource_node_ref: old → new | existing mapdb node |
| ------------------------ | ---------------------------- | ------------------- |
| mining/gather-copper-ore | `ore-copper` → `copper-vein` | copper-vein         |
| mining/gather-iron-ore   | `ore-iron` → `iron-vein`     | iron-vein           |
| woodcutting/gather-log   | `tree` → `oak-tree`          | oak-tree            |

These 3 existing nodes get `profession_action_ref` set to the action's ref (`gather-copper-ore` / `gather-iron-ore` / `gather-log`).

### Author 16 NEW mapdb resource nodes (ref = the professiondb slug, so no retarget needed)

Each new node's `ref` matches the gather action's `resource_node_ref`; `profession_action_ref` = the gather action ref. `harvest_time_ms` = the action's `duration_ms` where the action has one (else 500 default for flowers/mushrooms). `sub_kind` = a short variant slug. `type: resource_node`.

| new node ref         | sub_kind    | profession_action_ref | harvest_time_ms | harvest_yield |
| -------------------- | ----------- | --------------------- | --------------- | ------------- |
| ore-crystal          | crystal_ore | gather-crystal-ore    | 5000            | 1             |
| mossy-rock           | mossy_stone | gather-mossy-stone    | 2500            | 1             |
| boulder              | stone       | gather-stone          | 2000            | 1             |
| flower-allium        | allium      | gather-allium         | 500             | 1             |
| flower-bell          | bellflower  | gather-bellflower     | 500             | 1             |
| flower-blue-orchid   | blue_orchid | gather-blue-orchid    | 500             | 1             |
| flower-cornflower    | cornflower  | gather-cornflower     | 500             | 1             |
| flower-daisy         | daisy       | gather-daisy          | 500             | 1             |
| flower-lavender      | lavender    | gather-lavender       | 500             | 1             |
| flower-rose          | rose        | gather-rose           | 500             | 1             |
| flower-sunflower     | sunflower   | gather-sunflower      | 500             | 1             |
| flower-tulip         | tulip       | gather-tulip          | 500             | 1             |
| flower-wildflower    | wildflower  | gather-wildflower     | 500             | 1             |
| mushroom-chanterelle | chanterelle | gather-chanterelle    | 500             | 1             |
| mushroom-fly-agaric  | fly_agaric  | gather-fly-agaric     | 500             | 1             |
| mushroom-porcini     | porcini     | gather-porcini        | 500             | 1             |

(19 total links = 3 retargeted existing + 16 new. The remaining 10 gather actions — bare foraging items berry/herb/etc. with no `resource_node_ref` — get no node this phase; they gather without a fixed world node.)

---

### Task 1: mapdb proto — add profession_action_ref + harvest_weight, reserve 4 empty fields

**Files:** Modify `packages/data/proto/map/mapdb.proto`; regenerate mapdb descriptor + `generated/mapdb-schema.ts`.

- [ ] **Step 1:** In `message WorldObjectDef`, DELETE these four field lines: `optional string loot_item_ref = 13;`, `optional string tool_required = 15;`, `optional int32 skill_level = 16;`, `optional string skill_type = 17;`. **KEEP `optional int32 harvest_time_ms = 14;` untouched.** Add reservations inside the message:

```proto
  reserved 13, 15, 16, 17;
  reserved "loot_item_ref", "tool_required", "skill_level", "skill_type";
```

- [ ] **Step 2:** Add two new fields at the next free numbers (max is 73):

```proto
  optional string profession_action_ref = 74;
  optional int32 harvest_weight = 75;
```

- [ ] **Step 3:** Regenerate: `cd <worktree> && export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx packages/data/codegen/gen-all.mjs mapdb 2>&1 | grep -v "npm warn"`. Expect the two ✓ lines.
- [ ] **Step 4:** Verify generated schema: `grep -nE "profession_action_ref|harvest_weight|harvest_time_ms|loot_item_ref|skill_type" packages/data/codegen/generated/mapdb-schema.ts` → `profession_action_ref`/`harvest_weight`/`harvest_time_ms` present, `loot_item_ref`/`skill_type`/`tool_required`/`skill_level` GONE.
- [ ] **Step 5:** Grep no hand consumer of the 4 reserved fields (should be none): `grep -rniE "loot_item_ref|lootItemRef|tool_required|toolRequired|skill_level|skillLevel|skill_type|skillType" apps/kbve/astro-kbve/src/components/mapdb packages/unreal/KBVEMapDB 2>/dev/null | grep -viE "generated"` → empty (harvest_time_ms consumers are NOT touched).
- [ ] **Step 6:** Commit: `git commit -m "feat(mapdb): add profession_action_ref + harvest_weight, reserve unused harvest fields"` (proto + descriptor + schema).

### Task 2: Retarget 3 gather actions + link 3 existing nodes

**Files:** Modify `professiondb/mining/gather-copper-ore.mdx`, `gather-iron-ore.mdx`, `woodcutting/gather-log.mdx`; modify `mapdb/copper-vein.mdx`, `iron-vein.mdx`, `oak-tree.mdx`.

- [ ] **Step 1:** Edit the 3 gather action files: change `resource_node_ref: 'ore-copper'` → `'copper-vein'`, `'ore-iron'` → `'iron-vein'`, `'tree'` → `'oak-tree'`.
- [ ] **Step 2:** Edit the 3 existing mapdb node files: add `profession_action_ref: "gather-copper-ore"` to copper-vein.mdx, `"gather-iron-ore"` to iron-vein.mdx, `"gather-log"` to oak-tree.mdx (add the line in the frontmatter, e.g. after `sub_kind`). Do NOT touch their existing `harvest_time_ms`/other fields.
- [ ] **Step 3:** Commit: `git commit -m "feat(professiondb,mapdb): link 3 gather actions to existing mapdb nodes"`.

### Task 3: Author 16 new mapdb resource nodes

**Files:** Create 16 `apps/kbve/astro-kbve/src/content/docs/mapdb/<ref>.mdx`.

- [ ] **Step 1:** Read `apps/kbve/astro-kbve/src/content/docs/mapdb/oak-tree.mdx` for the exact node frontmatter shape. For each row in the "Author 16 NEW nodes" table create `mapdb/<ref>.mdx` with frontmatter mirroring oak-tree (id = a fresh unique 26-char ULID-shaped string; ref = the table ref; drafted: false; name = Title-Case of sub_kind; title = same; template: splash; sidebar {label, hidden: true}; description = one line; type: "resource_node"; sub_kind = the table sub_kind; interactable: true; destructible: true; harvest_yield = table; max_amount: 50; initial_amount: 50; harvest_time_ms = table; harvest_weight: 0; spawn_weight: 0.3; spawn_count: 20; pixels_per_unit: 25; pivot_x: 0.5; pivot_y: 0.5; sorting_layer: "Foreground"; **profession_action_ref = the table value**). OMIT `img` (optional; no art yet). Short MDX body: import MapDBPanel from '@/components/mapdb/MapDBPanel.astro'; a `#` heading; one-line description; `<MapDBPanel data={frontmatter} />`.
- [ ] **Step 2:** Regenerate mapdb data: `export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx packages/data/codegen/gen-mapdb-data.mjs 2>&1 | grep -v "npm warn"`. Expect no throw; object count = previous + 16.
- [ ] **Step 3:** Assert the 16 nodes + profession_action_ref present: `node -e "const d=require('./packages/data/codegen/generated/mapdb-data.json'); const objs=d.objectDefs; const rose=objs.find(o=>o.ref==='flower-rose'); console.log('rose', rose&&rose.professionActionRef, rose&&rose.type); console.log('total resource_node w/ action', objs.filter(o=>o.professionActionRef).length);"` → rose `gather-rose` `WORLD_OBJECT_RESOURCE_NODE`; count = 19 (16 new + 3 existing linked in Task 2).
- [ ] **Step 4:** Commit: `git commit -m "feat(mapdb): author 16 resource nodes linked to professiondb gather actions"`.

### Task 4: Extend cross-ref validator — mapdb↔professiondb links (warn-only)

**Files:** Modify `packages/data/codegen/gen-professiondb-xref.mjs`.

- [ ] **Step 1:** Extend the xref generator to also load `generated/mapdb-data.json` and cross-check the new links (warn-only, no throw / no exit 1):
    - For every mapdb objectDef with `professionActionRef`: warn if that ref is not a known professiondb action ref.
    - For every professiondb action with `resourceNodeRef`: warn if that ref is not a known mapdb objectDef ref.
      Build a `node_links` section into `xref-index.json`: `{ action_key → mapdb_node_ref }` and its inverse `{ node_ref → action_key }` (keyed on action numeric key for engine O(1), mirroring the item maps).
- [ ] **Step 2:** Run `npx tsx packages/data/codegen/gen-professiondb-data.mjs` (auto-chains xref). Confirm exit 0. Assert: `node -e "const x=require('./packages/data/codegen/generated/xref-index.json'); console.log('node_links', Object.keys(x.node_links||{}).length); console.log('copper action->node', x.node_links);"` → 19 links, gather-copper-ore's key maps to `copper-vein`. Zero unresolved warnings (all 19 links resolve both ways).
- [ ] **Step 3:** Commit: `git commit -m "feat(professiondb): xref validator checks mapdb<->professiondb node links (warn)"`.

### Task 5: Regenerate, validate, sync, push

- [ ] **Step 1:** Full regen: `npx tsx packages/data/codegen/gen-mapdb-data.mjs && npx tsx packages/data/codegen/gen-professiondb-data.mjs` (xref auto-chains). Confirm idempotent (git status clean on generated after a second run) and exit 0.
- [ ] **Step 2:** THE GATE — `./kbve.sh -nx astro-kbve:sync 2>&1 | tail -6`. Must show `Synced content` + `Successfully ran target sync` (validates the 16 new mapdb nodes against IMapObjectSchema + the retargeted professiondb actions). If a new node fails schema, report the exact missing/invalid field. (Ignore the pre-existing `react-native-worklets` vite warning.)
- [ ] **Step 3:** Bidirectional resolve check: `node -e "const x=require('./packages/data/codegen/generated/xref-index.json'); const m=require('./packages/data/codegen/generated/mapdb-data.json'); const links=m.objectDefs.filter(o=>o.professionActionRef).length; console.log('mapdb nodes linked', links); console.log('xref node_links', Object.keys(x.node_links||{}).length);"` → both 19.
- [ ] **Step 4:** Commit any regenerated artifacts. Push `git push -u origin trunk/professiondb-mapdb-consolidation-1785489787`. (Controller opens the PR after final review.)

## Self-Review

- **Spec coverage (Phase 3 slice):** reserve mapdb harvest fields ✓ (4 of 5 — harvest_time_ms deliberately kept, documented deviation with rationale); add `profession_action_ref` ✓ + `harvest_weight` ✓; seed node↔action links ✓ (19: 3 retargeted + 16 authored). Deferred correctly: hard-fail flip + graph-integrity + UE `FKBVEWorldObjectDef` swap (Phase 4); the 10 node-less foraging actions (berry/herb/etc.) need no node.
- **Deviation from spec (intentional):** spec listed `harvest_time_ms` among fields to reserve; kept because it has live data + consumers + is a spatial property. Rationale in Decisions §1.
- **No consumer break:** the 4 reserved fields have 0 hand consumers; harvest_time_ms consumers (ServiceMapDB.ts, ReactMapDBPanel.tsx, MapDBPanel.astro, UE) untouched.
- **Key/ref consistency:** profession_action_ref/resource_node_ref use action ref slugs (authoring), xref node_links keyed on action numeric key (runtime). New mapdb node refs match the professiondb slugs so only 3 actions need retargeting.
- **Field numbers:** profession_action_ref=74, harvest_weight=75 (max was 73); reserved 13/15/16/17; harvest_time_ms=14 retained. No reuse.
