# MapDB Integration — Rareicon

Companion to [BUILDING.md](./BUILDING.md). BUILDING.md covers one `WorldObjectType`; this doc covers the whole mapdb pool and how Rareicon consumes it.

## 1. Context

MapDB ([packages/data/proto/map/mapdb.proto](../../packages/data/proto/map/mapdb.proto)) is the shared game-data source for every KBVE game — Rareicon, the isometric project, and the discordsh MUD. Each game consumes a **filtered view** of the same mdx pool at `apps/kbve/astro-kbve/src/content/docs/mapdb/`. The frontmatter on each mdx is proto-typed (`WorldObjectDef` + Astro rendering extension) and baked to `/api/mapdb.json` at build time.

Rareicon's job is to read that JSON at startup and turn each record into runtime entities: a Farm mdx becomes a prefab entity in `BuildingPrefabRegistry`, an Iron-Vein mdx becomes a harvestable node template, a Dusty-Bazaar mdx becomes a merchant spawn point.

Today Rareicon hardcodes all of this. `BuildingDB.cs` + `HexResourceTable.cs` + `UnitSpawnSystem` per-type branches carry the same information the mdx already holds. The goal is to flip ownership: mdx is the source of truth, Rareicon's runtime is the consumer.

## 2. Type inventory

Current mapdb pool (39 entries as of 2026-04-22):

| `type`              | Count | Examples                                                   | Rareicon integration                                                           |
| ------------------- | ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `building`          | 11    | capital, farm, inn, dock, outpost, …                       | **Phase 1** — `BuildingPrefabRegistrySystem`                                   |
| `resource_node`     | 17    | coal-vein, iron-vein, oak-tree, ruby-crystal, quiet-spring | **Phase 2** — `ResourceNodePrefabRegistrySystem` (replaces `HexResourceTable`) |
| `settlement`        | 3     | dwarven-outpost, mushroom-bazaar, sunken-market            | **Phase 3** — `SettlementPrefabRegistrySystem` (future faction encounters)     |
| `npc_marker`        | 2     | dusty-bazaar, wanderers-nook                               | **Phase 3** — `NpcMarkerRegistrySystem` (merchants / questgivers)              |
| `landmark`          | 3     | mirror-chamber, whispering-hall, the-still-pool            | **Phase 4 (deferred)** — needs a quest-POI system Rareicon doesn't have yet    |
| `arena`             | 2     | prismatic-throne, shattered-crown                          | **Phase 5 (deferred)** — ship as part of the gameplay loop (boss encounters)   |
| `shrine` (sub_kind) | 2     | ember-hearth, luminous-alcove                              | **Skip** — Rareicon has no shrine buff mechanic yet                            |

Types we plan to integrate eventually cover **35 of 39 entries**. The remaining 4 are either game-mechanics we haven't shipped (shrines) or isometric/MUD-specific.

## 3. Shared infrastructure

All four registry systems share the same plumbing:

### 3.1 Ref hash

Every mdx carries a string `ref` (e.g. `"iron-vein"`). At runtime, Rareicon keys on a 32-bit **FNV-1a hash** of the ref, not the string — Burst-friendly, 4 bytes, zero allocations.

A build-time codegen step (extending the existing `gen-mapdb-zod.mjs`) emits:

```csharp
// apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/Data/MapdbRefs.cs (generated)
public static class MapdbRefs
{
    public const uint Capital       = 0x...;
    public const uint Farm          = 0x...;
    public const uint IronVein      = 0x...;
    public const uint DustyBazaar   = 0x...;
    // one constant per mdx entry
}
```

Runtime code reads `registry.ByRef[MapdbRefs.IronVein]` — same shape as `ItemId.WoodLog` today. No string anywhere in the hot path.

### 3.2 MapdbLoaderSystem (managed, one-shot)

`SystemBase` that runs once at bootstrap:

1. Loads `/api/mapdb.json` from `StreamingAssets/` (bundled at Unity build time).
2. Parses into per-type `List<WorldObjectDef>` views.
3. Passes each filtered list to the matching registry system via a `MapdbSingleton { NativeArray<WorldObjectDefRecord> Buildings, Resources, Settlements, NpcMarkers }` component.
4. Self-destroys after publishing the singleton.

`WorldObjectDefRecord` is a blittable struct mirroring the Zod shape (fixed-size strings as `FixedString64Bytes` / `FixedString128Bytes`, blobs for variable-length lists like recipes). Not human-legible, but zero-alloc for Burst consumers.

### 3.3 Capability handlers

One handler per proto message. Each handler reads a `WorldObjectDefRecord` capability and applies IComponentData + buffers to a target entity:

```csharp
static class ServiceCapabilityHandler
{
    public static void Apply(EntityManager em, Entity e, ServiceCapabilityRecord cap)
    {
        switch (cap.Kind) {
            case ServiceKind.Food:    em.AddComponentData(e, new ProvidesFood    { Priority = (byte)cap.Priority }); break;
            case ServiceKind.Sleep:   em.AddComponentData(e, new ProvidesSleep   { Capacity = (byte)cap.Capacity }); break;
            case ServiceKind.Healing: em.AddComponentData(e, new ProvidesHealing { Priority = (byte)cap.Priority }); break;
            // Training / Teleport / Storage / Merchant / Banker slot in here as Rareicon adds them
        }
    }
}
```

Handler roster:

| Handler                    | Reads proto                                                | Writes components                                                                            |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ServiceCapabilityHandler` | `ServiceCapability`                                        | `ProvidesFood`, `ProvidesSleep`, `ProvidesHealing`                                           |
| `TenderHandler`            | `TenderSpec`                                               | `TenderedBy`, `TenderMultiplier`                                                             |
| `TerritoryEmitterHandler`  | `TerritoryEmitterSpec`                                     | `TerritoryEmitter`                                                                           |
| `ProductionRecipeHandler`  | `ProductionRecipeSpec[]`                                   | `DynamicBuffer<ProductionRecipe>`                                                            |
| `SurplusExportHandler`     | `SurplusExportSpec[]`                                      | `DynamicBuffer<SurplusExport>`                                                               |
| `PassiveProductionHandler` | `PassiveProductionSpec`                                    | `PassiveProduction`                                                                          |
| `RangedAttackHandler`      | `RangedAttackSpec`                                         | `OutpostVolley`, `OutpostArrowPool` (Rareicon's bespoke; generic component might land later) |
| `PopulationSpawnHandler`   | `PopulationSpawnSpec`                                      | `BarracksProduction` / `GoblinCaveProduction` / `DockProduction` (per `spawn_entity_ref`)    |
| `RaidHandler`              | `RaidSpec`                                                 | `BanditCampState` / generic `RaidEmitter`                                                    |
| `UpgradeChainHandler`      | `UpgradeChainSpec`                                         | `UpgradeChain` buffer (per-tier costs)                                                       |
| `HarvestYieldHandler`      | WorldObjectDef.harvest_yield / max_amount / initial_amount | `HarvestYield`, `HarvestPool` (Phase 2 resource nodes)                                       |

Each handler is pure static + Burst-friendly + reusable across registries. A Farm's prefab-build call is just:

```csharp
ServiceCapabilityHandler.ApplyAll(em, prefab, def.Services);
TenderHandler.Apply(em, prefab, def.Tender);
ProductionRecipeHandler.Apply(em, prefab, def.Recipes);
SurplusExportHandler.Apply(em, prefab, def.Surplus);
```

All 11 buildings use the same 4–6 handler calls with different data — **no per-type bake methods**, no `switch (building.Type)`.

### 3.4 Biome mapping

Proto `Biome` enum values don't align 1:1 with Rareicon's `BiomeGenerator` byte constants. A single mapping table in `MapdbBiomeMap.cs` translates:

```csharp
public static byte ProtoToRareicon(int protoBiome) => protoBiome switch
{
    1  => BiomeGenerator.BIOME_GRASS,   // GRASSLAND
    2  => BiomeGenerator.BIOME_FOREST,
    3  => BiomeGenerator.BIOME_SAND,    // DESERT
    5  => BiomeGenerator.BIOME_SNOW,    // SWAMP → map however; SNOW better for now
    6  => BiomeGenerator.BIOME_STONE,   // MOUNTAIN
    8  => BiomeGenerator.BIOME_OCEAN,
    17 => BiomeGenerator.BIOME_RIVER,
    18 => BiomeGenerator.BIOME_DIRT,
    19 => BiomeGenerator.BIOME_SNOW,
    20 => BiomeGenerator.BIOME_STONE,
    _  => BiomeGenerator.BIOME_GRASS,   // fallback
};
```

Eventually Rareicon should adopt the proto numbering directly to eliminate this mapping, but until then one function in one file is fine.

## 4. Per-type registries

### Phase 1 — Buildings (11 entries)

Covered in full by [BUILDING.md](./BUILDING.md). `BuildingPrefabRegistrySystem` creates one prefab entity per building mdx, bundles capabilities via the handlers above. Runtime spawn = `em.Instantiate(registry.ByRef[hash])`.

Deliverables per BUILDING.md Phase 1–3. Folder: `ECS/Buildings/Core/`.

### Phase 2 — Resource Nodes (17 entries)

`ResourceNodePrefabRegistrySystem` replaces the current hardcoded spawning in `HexResourceTable`. Each mdx entry is one resource-node archetype with: `harvest_yield`, `max_amount`, `initial_amount`, `harvest_time_ms`, `tool_required`, `skill_type`, `skill_level`, `respawn_time_secs`, `spawn_weight`, `spawn_count`, `allowed_biomes`.

**Runtime flow:**

1. Bootstrap: registry bakes N prefab entities from the 17 mdx records, each carrying `HarvestYield`, `HarvestPool`, `ToolRequirement`, `RespawnTimer`, `ResourceNodeVisual` components.
2. Terrain generation pass: for each hex tile, roll against `spawn_weight` × `allowed_biomes` match across every resource node; winning node `em.Instantiate()`'s onto the tile.
3. Interaction: click a resource node → spawn a "harvest task" for the right profession (mapped from `skill_type` → `ProfessionKind`).
4. Harvest completion: emit the `loot_item_ref` items (hashed → `ItemId` via the same ref-hash codegen) into the harvester's PackSlot.
5. Depletion: when `HarvestPool.Current <= 0`, schedule respawn via `RespawnTimer`.

**Unlocks** (data-only, no code changes):

- Adamantine / Cobalt / Mithril / Salt / Uranium ores — currently Rareicon only has generic "Ore". Each becomes a distinct tier via different `harvest_yield`, `skill_level`, `tool_required`.
- Named trees: Oak vs Redwood drop different timber qualities.
- Crystals (Jade / Ruby / Sapphire) — rare high-value nodes with low `spawn_weight`.
- Water nodes (Quiet Spring, Still Pool) — drinking / fishing spots.

**Deliverables:**

- New components: `HarvestYield`, `HarvestPool`, `ToolRequirement`, `RespawnTimer`, `ResourceNodeVisual`.
- New system: `ResourceNodePrefabRegistrySystem` (bootstrap).
- Modified: `HexResourceTable` consumers swap to registry lookups. `BiomeGenerator` calls registry to pick resource nodes by biome.
- Shader: extend `HexTile.shader` (or add `HexResourceNode.shader`) with `Draw` branches per `sub_kind` — or better, use the `img` path from mdx to render sprites directly (proper sprite atlas), skipping the shader ladder.

**Open question:** shader path vs sprite-atlas path. Rareicon's building shader uses per-type `Draw` functions. For 17+ resource nodes across 3 games, the ladder doesn't scale. Probably ship Phase 2 with a sprite-atlas renderer that reads `img` + `pixels_per_unit` from mdx. Buildings can migrate later.

### Phase 3 — Settlements + NPC Markers

Two smaller registries:

**SettlementPrefabRegistrySystem** — set-piece buildings at fixed positions. Dwarven Outpost, Sunken Market, Mushroom Bazaar. Each mdx entry is a multi-hex POI with: a primary building footprint + child NPC spawns + a shop inventory ref + a zone connection. At world-gen time, place 0–N settlement instances on the map (governed by `spawn_weight` + `spawn_count`). Treat as a super-Outpost — it emits territory, hosts merchants, is raidable.

**NpcMarkerRegistrySystem** — standalone NPC spawn points (Dusty Bazaar, Wanderer's Nook). Each mdx entry defines an NPC archetype with: `sub_kind` ("merchant"), dialogue / shop ref, services offered (via `ServiceCapability`). At runtime, either pre-place (via `WorldObjectPlacement` in a zone) or wander (spawn on a timer, despawn after N turns).

**Shared need: a hex/world placement pipeline.** Rareicon's map generator currently only places resources + terrain. Phase 3 introduces a "POI pass" that consults the settlement + NPC registries to seed set-pieces after terrain + resources land.

**Deliverables:**

- New components: `SettlementDef`, `NpcMarkerDef`, `ShopInventoryRef`, `DialogueRef`.
- New systems: `SettlementPrefabRegistrySystem`, `NpcMarkerRegistrySystem`.
- World generator: new "POI pass" after terrain + resources.

### Phase 4 — Landmarks (deferred)

Landmark entries (mirror-chamber, whispering-hall, the-still-pool) are narrative story-POI markers. Rareicon has no quest-POI UI or story-trigger system today. When that ships, this is a 20-line registry that places named static entities on the map. Until then, skip.

### Phase 5 — Boss Arenas (deferred — gameplay-loop feature)

Arena entries (prismatic-throne, shattered-crown) are boss-encounter rooms. Ships as part of the Rareicon endgame loop: once a player reaches a threshold (empire tier, turn count, quest completion), an arena spawns somewhere accessible, a boss unit populates it, and defeating the boss clears the room + drops rewards.

Each arena mdx will need (additions to proto as Phase 5 approaches):

- `boss_unit_ref` — the enemy NPC archetype that populates the arena
- `victory_rewards` — items / tier unlocks on clear
- `entry_conditions` — gating (empire tier, quest completion, party level)
- `arena_layout` — room footprint or sub-hex tile pattern

Deliverables when Phase 5 lands:

- New proto messages: `ArenaSpec`, `BossEncounterSpec`
- `ArenaPrefabRegistrySystem` + world-gen placement rules
- Boss unit archetypes (shared with isometric's dungeon boss system if possible)
- Victory flow: clear detection → reward drop → arena seals

Keep arenas separate from Landmarks — they're combat set-pieces, not narrative markers. Landmark POIs can later be the triggers that reveal or gate arena placement.

## 5. Build-time flow

```
.mdx files (authoring)
   │
   ▼
Astro content collection (validates against mapdb-schema.ts)
   │
   ▼
/api/mapdb.json (build step, all entries serialized)
   │
   ▼
Nx target: rareicon:sync-mapdb
   ├─ Copies mapdb.json → StreamingAssets/
   └─ Generates MapdbRefs.cs (FNV-1a ref hashes as const uints)
   │
   ▼
Unity build (reads StreamingAssets at runtime)
   │
   ▼
MapdbLoaderSystem (bootstrap)
   ├─ Filters by type → 4 NativeArrays
   ├─ Publishes MapdbSingleton
   └─ Self-destroys
   │
   ▼
┌──────────────────────┬─────────────────────┬──────────────────────┬─────────────────────┐
│ BuildingPrefab       │ ResourceNodePrefab  │ SettlementPrefab     │ NpcMarkerRegistry   │
│ RegistrySystem       │ RegistrySystem      │ RegistrySystem       │ System              │
│                      │                     │                      │                     │
│ 11 prefab entities   │ 17 node archetypes  │ 3 set-piece POIs     │ 2 NPC archetypes    │
│ Instantiate on build │ Instantiate during  │ Place during world   │ Place via POI pass  │
│ request              │ biome gen           │ gen POI pass         │                     │
└──────────────────────┴─────────────────────┴──────────────────────┴─────────────────────┘
```

## 6. Open questions

- **Ref stability + save/load.** Saves store entity state by map position + type. For data-driven types we serialize the 32-bit ref-hash instead of a byte enum. If an mdx's `ref` changes or a record is deleted, saves break. Mitigation: CI job that diffs mdx refs between releases + a ref-alias table for renames.
- **Hash collisions.** FNV-1a is not collision-free. With hundreds of refs the probability is low but not zero. Migration path if a collision appears: swap to 64-bit hash (8-byte key) or require a per-game `type_id` prefix. Keep the 32-bit default until a collision actually happens.
- **Shader dispatch.** BuildingPrefabRegistry today relies on the `BuildingType` byte → shader-branch pattern. Scaling that to hundreds of entries doesn't work. Options: (a) switch all buildings to sprite-atlas rendering using `img` paths, (b) stay with shader branches but only the 11 "founder" buildings get shader coverage, the rest use sprites. Decide when building coverage exceeds ~20 types.
- **Dynamic mdx loading.** Can new mdx be added at runtime (mods, DLC) without a Unity rebuild? JSON-based loader supports this trivially as long as sprite assets are also loadable at runtime. Consider a mod folder that extends the baseline pool.
- **Authoring sprites.** Most current mdx entries carry an `img:` path. Some don't. For Rareicon we need a path for every entry we render. Audit + backfill in each Phase.
- **Biome overlap.** Multiple resource nodes can match the same biome (coal + iron + stone all fit `mountain`/`cave`). `spawn_weight` + `spawn_count` resolves the odds but the combined density can overproduce nodes. Phase 2 needs a weighted-pick algorithm that respects per-biome total caps.
- **Settlement world-gen seeding.** `WorldObjectPlacement` has explicit position fields, but our world is procedurally generated. Either: (a) settlement mdx defines abstract rules ("1 per frontier, near river") and the world-gen honours them, or (b) settlements are placed manually via zone authoring and mdx just defines the template. Probably (a) for roguelite runs, (b) for campaign maps.

## 7. Phase summary

| Phase | Types         | System count                                                    | Rough effort |
| ----- | ------------- | --------------------------------------------------------------- | ------------ |
| 1     | building      | 1 registry + 4–6 handlers + spawn rewire                        | 3–5 days     |
| 2     | resource_node | 1 registry + 2 handlers + sprite-atlas renderer                 | 3–4 days     |
| 3a    | settlement    | 1 registry + world-gen POI pass                                 | 2–3 days     |
| 3b    | npc_marker    | 1 registry + NPC spawn integration                              | 2 days       |
| 4     | landmark      | deferred until quest-POI system lands                           | —            |
| 5     | arena         | deferred, lands with the gameplay-loop / boss-encounter feature | —            |

Phases 1 and 2 are mutually decoupled — can run in parallel or either order. Phase 3 depends on Phase 1 (shared capability handlers) + Phase 2 (sprite-atlas renderer, probably). Phases 4 and 5 are out-of-scope until their gating features (quest-POI / gameplay-loop) ship.

## 8. Not doing

- **Modding runtime.** Shipping a `mods/` folder that loads extra mdx at runtime is a future project. Today we bake mdx into the build.
- **Multi-world mapdb branches.** Each game consumes the full pool via `type` filter; there's no per-game branch of mdx. If isometric wants an entry Rareicon doesn't, it just adds it with a type Rareicon doesn't consume.
- **Capability handlers for every proto field.** Handlers only cover what Rareicon needs. `PortalSpec`, `BarrierSpec`, `ArenaSpec` etc. stay on the shelf until a game needs them.

## 9. Execution plan

Tracked in `/Users/alappatel/.claude/plans/identify-any-main-thread-mighty-elephant.md`. Phases are separate commits / PRs; don't ship them as a single monolith.

---

Companion docs:

- [BUILDING.md](./BUILDING.md) — Phase 1 deep-dive
- [MAINTHREAD.md](./MAINTHREAD.md) — general DOTS main-thread audit
