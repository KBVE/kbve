# professiondb Skilling Unification — Design Spec

**Date:** 2026-07-28
**Status:** Design (awaiting review)
**Depends on:** #14702 (professiondb proto), #14756 (professiondb MDX+codegen) — both merged.

## Problem

Harvest/skilling/recipe truth is duplicated across **three** databases, and two of them are populated:

| DB               | Message / fields                                                                                                                                                                                                       | Data status                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **itemdb**       | `SkillingInfo` (skill, skill_level, xp_reward, tool_required, gather_time, respawn_time, resource_node, harvest_weight); `CompressInfo` (target_ref, ratio, facility); `FoodInfo.cooking_level`, `FoodInfo.cooking_xp` | **29 items populated**, in proto |
| **mapdb**        | `WorldObjectDef` harvest fields (skill_type, skill_level, tool_required, loot_item_ref, harvest_time_ms)                                                                                                               | in proto, **0 data**             |
| **professiondb** | `ProfessionAction` (required_level, xp_reward, duration_ms, tool_refs, inputs, outputs)                                                                                                                                | new, **7 seed** professions      |

professiondb, as introduced, re-implements a discipline system itemdb already has (`SkillingType` enum: MINING/COOKING/SMITHING/… mirrors professiondb categories). Three sources of the same fact drift independently. There is **no cross-DB validation anywhere** — every ref (`item_ref`, `resource_node`, `skill`) is a free string.

## Decision

**Model A — professiondb is the single source of truth for discipline verbs.** Chosen over "aggregate" (B) and "fold into itemdb" (C) because it is the correct long-term end-state, and the migration is at its cheapest now: mapdb harvest data is empty, professiondb is 7 seeds, only 29 itemdb items carry skilling, and both engine bindings are thin.

### Ownership seam

The invariant that prevents recurrence — **"how a thing is made or gathered" vs "what a thing is / does":**

- **professiondb** owns the _verb_: the action's level gate, xp, duration, tool, inputs, outputs, and the discipline's xp curve + unlocks. Universal, engine-agnostic.
- **itemdb** owns _item identity_: name, weight, price, stack, rarity, flavor, type_flags, and **consumable behavior** (`heals`, `doses`, `perishable`, `shelf_life_seconds`, `spoils_into_ref`, buff/restore effects) — these describe the item when _used_, not an action.
- **mapdb.WorldObjectDef** owns _spatial placement_: which action a node performs (`profession_action_ref`) plus the spatial-only gather props that never belonged to the verb — `resource_node` identity, `respawn_time`, `harvest_weight`, collision, spawn.

Field-by-field disposition:

| Source field                                                             | Destination                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `SkillingInfo.skill`                                                     | professiondb: which profession owns the action (derivable from action's profession)              |
| `SkillingInfo.skill_level`                                               | professiondb `action.required_level`                                                             |
| `SkillingInfo.xp_reward`                                                 | professiondb `action.xp_reward`                                                                  |
| `SkillingInfo.tool_required`                                             | professiondb `action.tool_refs`                                                                  |
| `SkillingInfo.gather_time`                                               | professiondb `action.duration_ms`                                                                |
| `SkillingInfo.resource_node`                                             | mapdb `WorldObjectDef.ref` (the node **is** the object); action link via `profession_action_ref` |
| `SkillingInfo.respawn_time`                                              | mapdb `WorldObjectDef.respawn_time_secs` (already exists)                                        |
| `SkillingInfo.harvest_weight`                                            | mapdb (spatial preference) — new `harvest_weight` on WorldObjectDef                              |
| `CompressInfo.target_ref` / `ratio`                                      | professiondb `action.inputs`/`outputs` (ratio = qty in : qty out)                                |
| `CompressInfo.facility`                                                  | professiondb `action.facility_ref` (NEW optional field)                                          |
| `FoodInfo.cooking_level`                                                 | professiondb cooking `action.required_level`                                                     |
| `FoodInfo.cooking_xp`                                                    | professiondb cooking `action.xp_reward`                                                          |
| `FoodInfo.heals/doses/perishable/shelf_life/spoils_into/buffs/restore_*` | **stay on itemdb** (consumable identity)                                                         |

### Reference direction — one authored edge, both-side O(1)

Only **one** edge is hand-authored: professiondb `action.outputs / inputs / tool_refs` (item refs). itemdb MDX stays identity-only — it never authors a link to an action.

The reverse link is **materialized at codegen into its own standalone artifact**, not inlined per-item and not computed per consumer:

- The cross-ref codegen makes a single linear pass over all action edges (`O(E)`, E = total input/output/tool references). That same pass validates, checks graph integrity, _and_ builds the reverse map.
- It emits a **standalone `xref-index`** artifact (`generated/xref-index.json` + `.binpb`) — a compact keyed table, NOT inlined into item records:
    - `produced_by: { item.key → action.key[] }`
    - `input_to:    { item.key → action.key[] }`
    - `tool_for:    { item.key → action.key[] }`
    - plus a `content_version` build stamp (mirrors `NpcRegistry.content_version`) so a multiplayer client/server can detect a stale index vs its peer.
- **Keyed on numeric `key`, not slug.** Slugs are authoring sugar; the durable runtime foreign key is uint32. Engines/servers index a flat array by key (true O(1), no hashing, no string parsing at runtime). A slug→key map ships once for tooling/logs.

Query cost, every engine, zero runtime index build:

- action → items: `action.outputs` — direct authored field, O(1)
- item → actions: `xref-index.produced_by[item.key]` — O(1)

Why this shape:

- **Linear build** — one sweep over total edges, never `O(items × actions)`.
- **Item-data stays lean** — reverse lists live in one separate table, not stamped onto every item record; mobile / bitecs consumers **lazy-load** the index only when they traverse the graph.
- **O(1) query everywhere** — the reverse link is materialized data; TS, Unity C#, UE, bitecs all deserialize and read; no per-engine index code, no runtime `Map` construction.
- **Zero drift** — the index is a projection regenerated on every build; the validator rides the same already-loaded pass, so both-direction consistency + version stamp are _build invariants_.
- The TS barrel exposes memoized `Map`s (`getActionsProducing(itemKey)`, `getActionsUsing(itemKey)`, `getActionsForTool(itemKey)`) as thin wrappers over the artifact — ergonomics only, not a second source.

**Economics never travel with the link.** The index carries only keys. If an item page wants to _show_ level/xp/tool/duration, it resolves the action and reads them there — a display projection, never a value authored or stored on the item.

## Safety guardrails (the "won't recur" layer)

1. **Reserved field numbers.** Every removed field gets `reserved <n>; reserved "<name>";` in its proto. Old wire-format readers never mis-decode; no one can silently re-add a field at that number with new meaning.
2. **Cross-ref validator = hard-fail CI gate.** New codegen step, runs in the pipeline. Single linear pass that both validates _and_ emits the baked bidirectional index (see Reference direction). Fails the build on any unresolved edge:
    - professiondb `action.inputs/outputs/tool_refs.item_ref` → must exist in itemdb
    - professiondb `action.facility_ref` → must exist in itemdb (or a stations set)
    - mapdb `WorldObjectDef.profession_action_ref` → must exist in professiondb
    - mapdb `loot_item_ref`, `build_costs[].item_ref` → must exist in itemdb
      Drift becomes unmergeable.
3. **Single-source invariant, asserted.** Validator also fails if any itemdb entry still carries skilling/compress economics (the reserved fields cannot return with data). professiondb is the only place a verb's economics may live.
4. **Graph-integrity checks.** The same validator pass fails the build on structural defects — the risks that actually bite at scale, not lookup speed:
    - **orphan action** — an action input with no producer action anywhere (unreachable recipe)
    - **unreachable item** — an item that is neither authored raw nor produced by any action
    - **cycle** — recipe DAG loop (ore → bar → ore)
    - **folder/field mismatch** — an action file whose `profession` field ≠ its parent folder (see Authoring layout)
5. **Phased & reversible.** Deprecate → migrate → verify green → remove. Old data stays readable until the new path is proven. No big-bang.

## Authoring layout — folder per profession, file per action

Actions are the high-cardinality entity (a discipline may have dozens of recipes). Inline `actions[]` frontmatter arrays don't scale and merge-conflict badly. Mirror itemdb (one file per item): one folder per profession, one file per action.

```
professiondb/
  alchemy/
    index.mdx               # kind: profession — identity, category, xp curve, unlocks
    brew-attack-potion.mdx  # kind: action — inputs/outputs/level/xp/tool/facility
    brew-health-potion.mdx
  mining/
    index.mdx
    mine-copper-ore.mdx
```

Rules:

- **Discriminator** — every file carries `kind: 'profession' | 'action'`. The Astro collection schema is a discriminated union on `kind` (one collection, two validated shapes).
- **Explicit association + folder assertion** — each action file carries `profession: '<ref>'` (machine truth). The folder (`alchemy/`) is human organization. The validator asserts folder name == `profession` field, so a misfiled recipe fails the build. Never parse the folder as the sole source.
- **`Profession.actions[]` is derived, not authored.** `index.mdx` owns curve / unlocks / identity only. `gen-professiondb-data.mjs` groups action files by `profession` and assembles each profession's `actions[]`. One authored place per action; the profession page composes them.
- **Uniqueness** — each action `ref` and `key` unique across the whole action space (validator-checked, like itemdb).
- **Per-action pages** — every action is now first-class addressable (its own `ref`/`key`, own page + recipe splash panel), and a natural node for the xref index.

**Proto is unchanged** — this is authoring layout + codegen assembly only. The wire shape stays `Profession { repeated ProfessionAction actions }`; the glob is already `**/*.mdx` (recursive).

## Proto changes

### professiondb.proto (additive)

- `ProfessionAction.facility_ref` (optional string) — production-station itemdb ref (from `CompressInfo.facility`).
- No breaking change; existing seed actions unaffected.

### itemdb.proto (remove + reserve)

- Reserve `SkillingInfo skilling = 42;` — remove message use, `reserved 42; reserved "skilling";`. (Keep the `SkillingType` enum — still used by `type_flags` semantics / other refs; verify.)
- Reserve `CompressInfo` field on `Item` (find its field number) + reserve.
- Remove `FoodInfo.cooking_level` / `cooking_xp` (reserve those two field numbers inside `FoodInfo`); keep the rest of `FoodInfo`.

### mapdb.proto (remove + reserve + add)

- Reserve `loot_item_ref=13, harvest_time_ms=14, tool_required=15, skill_level=16, skill_type=17` on `WorldObjectDef` + reserved names.
- Add `optional string profession_action_ref` at the next free field number.
- Add `optional int32 harvest_weight` (spatial preference migrated from SkillingInfo).

## Migration

- **29 itemdb `skilling` blocks → professiondb actions.** For each: create/extend a `ProfessionAction` under the right discipline (`skill`), fold level/xp/tool/gather_time; the item becomes the action's `outputs[0]`. `resource_node` becomes a mapdb `WorldObjectDef` (or links to one) with `profession_action_ref` → the new action.
- **CompressInfo / cooking items** similarly become production actions with inputs/outputs/ratio + `facility_ref`.
- **~26 missing referenced items** (from the current professiondb seed: tin-ore, oak-log, bronze-bar, tools, reagents…) authored into itemdb, keys from **634+** (max existing = 633). Identity only — no skilling blocks.
- Strip migrated blocks from the 29 items in the same PR the reserve lands, so the invariant validator stays green.

## Engine updates

- **Unity (rareicon):** `Mapdb.cs` / `Itemdb.cs` regenerate automatically from proto (protoc C#). No hand edits; confirm no hand-written C# reads the removed fields (grep clean except generated).
- **UE (`KBVEMapDB`):** hand-maintained `FKBVEWorldObjectDef` carries only `HarvestTimeMs` of the removed set → swap for `FName ProfessionActionRef`; update loader `KBVEMapDatabase.cpp:94` (`harvestTimeMs` read → `professionActionRef` string read). No UE professiondb module this phase.

## Out of scope

- Per-game runtime consumers of professiondb (C#/UE/bitecs bindings) — the phase this design unblocks, shipped after.
- Per-unit progression state (which unit has Mining L14) — remains each game's persist layer.

## Verification

- `gen-all.mjs` (itemdb, mapdb, professiondb) regenerate clean.
- All data-gens run; validator passes: all edges resolve, no residual skilling econ on itemdb, graph-integrity clean (no orphans/unreachable/cycles), every action `folder == profession`.
- `xref-index.json` + `.binpb` emitted with `content_version`; O(1) both-direction lookup verified in a barrel round-trip test.
- `nx run astro-kbve:sync` green (discriminated-union collection validates both `kind: profession` and `kind: action`).
- grep: no hand-written consumer references a removed field.

## Phasing (each = its own PR to dev)

1. **Restructure + validator (warn):** convert the 7 seed professions to folder/`index.mdx` + per-action files (`kind` discriminator, `profession` field); discriminated-union Astro schema; `gen-professiondb-data.mjs` assembles derived `actions[]`. Add `professiondb.proto` `facility_ref` (additive). Land the **cross-ref validator + `xref-index` emitter in warn-only mode** to surface current gaps.
2. **itemdb:** author ~26 identity items (keys 634+, no skilling blocks); migrate 29 skilling/compress/cooking blocks → professiondb action files; reserve `SkillingInfo` / `CompressInfo` / `FoodInfo.cooking_*` fields.
3. **mapdb:** reserve harvest fields (13–17), add `profession_action_ref` + `harvest_weight`; seed node↔action links from migrated `resource_node`s.
4. **Flip validator to hard-fail** + single-source invariant + graph-integrity asserts; UE `FKBVEWorldObjectDef` HarvestTimeMs→ProfessionActionRef + loader; confirm Unity C# regen.
