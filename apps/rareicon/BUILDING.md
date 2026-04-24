# Buildings architecture — Rareicon DOTS

Design reference for the building subsystem. Scope: everything under `apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/` that touches the `Building` component. This doc is the spec; the `ECS/DB/Buildings/` code is the implementation.

**Target location** is `ECS/DB/Buildings/` alongside the other authoritative domains (`DB/Hex`, `DB/Combat`, `DB/Logistics`, `DB/Professions`, `DB/Quests`). This matches the convention already in place for every other major subsystem. See §10 for the DB event pipeline and §11 for offloaded-chunk ghost simulation.

The current codebase assembles buildings through a three-stage runtime flow — shared-prefab clone, big `switch (building.Type)` in `ConstructionCompleteSystem`, then per-type `*InitSystem` for second-stage setup. Around that, 3 tender-scan systems, 5 per-type production jobs, and the legacy `FurnaceProduction` component each carry the same pattern copied N times. ~60% of the architecture is already well-composed (shared `Building`/`BuildingHealth`/`BuildingVisual`, `BankLedgerBase` reinterpret polymorphism, `ProductionRecipe` dynamic buffer, capability service components `ProvidesFood`/`ProvidesSleep`/`ProvidesHealing`). This doc captures the target state after we finish the job.

---

## 1. Vision

Every building is one `Entity` carrying a bundle of **capability components**. Behavior emerges from component _presence_, not from a `BuildingType` switch. The `BuildingType` byte survives only for two out-of-band concerns:

1. **Shader dispatch** — `HexBuilding.shader` picks its `Draw*` function off `_BuildingType`.
2. **Save serialization** — a save file records "hex X has a building of type Y", and the loader looks up the prefab.

Everything behavioral dispatches by querying for capabilities:

- `TenderScanSystem` iterates `Building + TenderedBy + TenderMultiplier` — no switch, no per-type variants.
- `UnifiedProductionSystem` iterates `Building + ProductionRecipe` — every recipe-based building runs the same cycle loop.
- Service-seeker systems already query `ProvidesFood` / `ProvidesSleep` / `ProvidesHealing` without caring about building type.
- Per-type quirks (`OutpostVolley`, `BarracksSupplyStatus`, `DockProduction`, `GoblinCaveProduction`) live on their own components and are queried by the systems that care.

Composition is assembled once, in pure C# at bootstrap, by `BuildingPrefabRegistrySystem`. There's exactly one prefab entity per `BuildingType`. Spawning a building is `em.Instantiate(registry.ByType[type])` — archetype, buffers, and initial values all come across in one call.

**Not doing:** Unity editor authoring, ScriptableObjects, SubScenes, Bakers. The registry is pure runtime C#. Revisit only if designer-tunable values without recompile becomes a real ask.

---

## 2. Component taxonomy

Grouped by role. `Present on` lists which building types carry each component after the refactor.

### Identity

| Component                    | Shape                                                          | Present on        |
| ---------------------------- | -------------------------------------------------------------- | ----------------- |
| `Building`                   | `{ byte Type, int2 RootHex, byte OwnerFaction }`               | All               |
| `BuildingVisual`             | `{ float Value }` — per-instance `_BuildingType` shader prop   | All               |
| `BuildingActiveVisual`       | `{ float Value }` — per-instance `_BuildingActive` shader prop | All               |
| `ConstructionProgressVisual` | `{ float Value }` — ghost→solid fade during build              | All               |
| `<Type>Tag`                  | empty struct, archetype marker                                 | Per type (see §3) |

Per-type tags (`FarmTag`, `LumbercampTag`, etc.) stay as archetype markers so existing `[WithAll(typeof(FarmTag))]` queries keep working. New unified systems query by capability (`TenderedBy`, `ProductionRecipe`) instead.

### Lifecycle

| Component              | Purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `BuildingHealth`       | `{ ushort Value, ushort Max, float LastRepairAbsSeconds }`                           |
| `ConstructionSite`     | Marker — entity is a blueprint, not a finished building                              |
| `ConstructionMaterial` | Buffer tracking per-item `{ Needed, Delivered }` while `ConstructionSite` is present |
| `NeedsStaffing`        | Added on completion; profession dispatcher reads it to funnel workers                |

### Capability — inputs (what the building needs)

| Component              | Shape                                                            | Meaning                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TenderedBy`           | `{ byte Profession, byte FootprintRadius, bool RequiresTender }` | A worker of `Profession` within `FootprintRadius` hexes of `RootHex` (or sheltered inside) sets `TenderMultiplier.Value = 1`. If `RequiresTender`, production halts without one. |
| `ConstructionMaterial` | buffer                                                           | Materials needed to complete construction (only during blueprint stage)                                                                                                          |

### Capability — outputs (services the building provides)

| Component                 | Shape                                             | Consumer                                         |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `ProvidesFood`            | `{ byte Priority }`                               | Eat-relief seekers; higher priority wins ties    |
| `ProvidesSleep`           | `{ byte Capacity }`                               | Sleep-relief seekers                             |
| `ProvidesHealing`         | `{ byte Priority }`                               | Injured-unit medic flow                          |
| `TerritoryEmitter`        | `{ int2 Center, byte Radius, byte OwnerFaction }` | `CombatThreatScanSystem`, empire-territory BFS   |
| `ProvidesFuel` _(future)_ | `{ ushort ItemId, byte Priority }`                | Furnace / Dock / future fuel-consuming buildings |

### Production

| Component                                     | Shape                                                                                                                | Meaning                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ProductionRecipe`                            | buffer of `{ Input1Id, Input1Amount, …, Output1Id, Output1Amount, …, CycleDuration, CycleEndsAt, PullsFromCapital }` | Unified cycle loop consumes inputs from the local ledger (or Capital) and emits outputs |
| `TenderMultiplier`                            | `{ float Value }`                                                                                                    | Production cycle gate — `RequiresTender` recipes pause when `Value == 0`                |
| `SurplusExport`                               | buffer of `{ ushort ItemId, int Floor }`                                                                             | `BuildingSurplusTransferSystem` ships anything above `Floor` to the Capital             |
| `PassiveProduction` _(legacy, kept for Dock)_ | `{ ushort OutputId, int OutputAmount, float CycleEndsAt, float CycleDuration }`                                      | Timed passive yield, no inputs/tender                                                   |

### Storage

| Component              | Purpose                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Type>Ledger` buffers | `CapitalLedger`, `FarmLedger`, …, `GoblinCaveLedger` — per-type storage buffer. All 10 share identical binary layout `{ ulong Uid, ushort ItemId, int Count }` and reinterpret-cast to `BankLedgerBase` for shared algorithms (`BankLedgerOps.CountOf` / `HasFood` / `RemoveItem`). |

### Bespoke (per-type, not unified)

These stay specialized — their state shapes don't match the generic recipe pattern.

| Component                                    | On                                   | Purpose                                                               |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `OutpostVolley`, `OutpostArrowPool`          | Outpost                              | Cooldown-gated AoE arrow volley + ammo stock                          |
| `BarracksSupplyStatus`, `BarracksProduction` | Barracks                             | Soldier recruitment cadence + supply-fetch gating                     |
| `DockProduction`                             | Dock                                 | Boat-build cadence (every N turns drain 1 Timber, emit a FishingBoat) |
| `GoblinCaveProduction`, `CaveFoodStatus`     | GoblinCave                           | Looter-spawn cadence + food-per-goblin upkeep                         |
| `BuildingTier`                               | Market (future: Farm/Barracks tiers) | Tier upgrade chains                                                   |
| `FarmLivestock` buffer                       | Farm                                 | Cow / chicken / sheep roster (egg/milk/wool/meat generation)          |

---

## 3. Per-type recipe table

Canonical component bundle for each type. `BuildingPrefabRegistrySystem.Build<Type>Prefab` assembles exactly this.

All types also carry the Identity + Lifecycle set implicitly: `Building`, `BuildingVisual`, `BuildingHealth`, `BuildingActiveVisual`, `ConstructionProgressVisual`, `LocalTransform`, render mesh + `Prefab` tag. Only the distinguishing components are listed below.

### Capital (Type = 1)

- **Tags**: `CapitalTag`
- **Services**: `ProvidesFood{1}`, `ProvidesSleep{10}`
- **Production**: `ProductionRecipe[Timber→Plank, Stone→Brick]`, `SurplusExport[…]`
- **Bespoke**: `CapitalStatus`, `TerritoryEmitter{radius=5, Player}`, `EmpireConnected`, `ReservedRoles`
- **Buffers**: `CapitalLedger`
- **No `TenderedBy`** — Capital produces passively

### Farm (Type = 2)

- **Tags**: `FarmTag`
- **Services**: `ProvidesFood{2}`
- **Production**: `ProductionRecipe[Compost→Carrot]`, `SurplusExport[Carrot(floor=8), Egg, Milk, Wool, Meat]`
- **Tender**: `TenderedBy{Farmer, radius=1, required=true}`, `TenderMultiplier{0}`
- **Buffers**: `FarmLedger`, `FarmLivestock`

### Lumbercamp (Type = 9)

- **Tags**: `LumbercampTag`
- **Production**: `ProductionRecipe[→WoodLog]`, `SurplusExport[WoodLog]`
- **Tender**: `TenderedBy{Lumberjack, radius=0, required=true}`, `TenderMultiplier{0}`
- **Buffers**: `LumbercampLedger`

### MiningPit (Type = 10)

- **Tags**: `MiningPitTag`
- **Production**: `ProductionRecipe[→Stone]`, `SurplusExport[Stone]`
- **Tender**: `TenderedBy{Miner, radius=0, required=true}`, `TenderMultiplier{0}`
- **Buffers**: `MiningPitLedger`

### Furnace (Type = 4) _— migrated to ProductionRecipe_

- **Tags**: `FurnaceTag`
- **Production**: `ProductionRecipe[IronOre+Coal→IronIngot, Stone+Coal→Brick]`, `SurplusExport[IronIngot, Brick]`
- **Tender**: _none_ — furnace runs whenever inputs are present
- **Buffers**: `FurnaceLedger`

Migration note: `FurnaceProduction` IComponentData + `FurnaceInitSystem` + `FurnaceActiveJob` are all deleted. `ProductionRecipeActiveJob` in `BuildingActiveVisualSystem` picks up the ember glow automatically.

### Barracks (Type = 3)

- **Tags**: `BarracksTag`
- **Services**: `ProvidesHealing{2}`, `ProvidesSleep{5}`, `ProvidesFood{1}`
- **Production**: `ProductionRecipe[Wood+Iron→Arrow (Craftsman path)]` (for the crafting system), `SurplusExport[Arrow]`
- **Bespoke**: `BarracksSupplyStatus{IsNeedy=1}`, `BarracksProduction` (soldier recruitment cadence)
- **Buffers**: `BarracksLedger`, `StorageCapacity`
- **No `TenderedBy`** — Barracks uses Craftsman-per-unit callbacks for crafting + passive recruitment cycle

### Inn (Type = 6)

- **Tags**: `InnTag`
- **Services**: `ProvidesFood{1}`, `ProvidesSleep{5}`
- **Buffers**: `InnLedger`

### Market (Type = 7)

- **Tags**: `MarketTag`
- **Bespoke**: `BuildingTier{0}`
- **Buffers**: `MarketLedger`

### Outpost (Type = 8)

- **Tags**: `OutpostTag`
- **Services**: `ProvidesFood{1}`, `ProvidesSleep{10}`, `ProvidesHealing{1}`
- **Bespoke**: `TerritoryEmitter{radius=5}`, `OutpostVolley{…}`, `OutpostArrowPool{100}`, `EmpireConnected` (added post-empire-BFS)
- **Buffers**: `OutpostLedger`

### Dock (Type = 11)

- **Tags**: `DockTag`
- **Services**: `ProvidesFood{1}`
- **Production**: `PassiveProduction[→Meat ×2 every 20s]` (to Capital)
- **Tender**: `TenderMultiplier{0}` (written by `DockTenderScanSystem` when a Craftsman is on the hex — halves boat-build cadence)
- **Bespoke**: `DockProduction{cadence=2 turns, TimberCost=1}`
- **Note**: Dock's tender is Craftsman (not a laborer) and halves a bespoke cadence rather than gating a `ProductionRecipe`. `DockTenderScanSystem` stays specialized — not folded into the unified `TenderScanSystem`.

### GoblinCave (Type = 5)

- **Tags**: `GoblinCaveTag`
- **Bespoke**: `GoblinCaveProduction{cadence=1, FoodPerGoblin=50, StorageCap=200}`, `CaveFoodStatus{0, 200}`
- **Buffers**: `GoblinCaveLedger`

### BanditCamp _(spawner-placed, not player-buildable)_

Currently shares the generic `BuildingPrefabSingleton`. In Phase 2 it migrates to `registry.ByType[BuildingType.BanditCamp]` like any other type.

---

## 4. Lifecycle flow

```
                ┌───────────────────────────────┐
(boot)          │ BuildingPrefabRegistrySystem  │
                │   OnCreate: 11 prefab Entities │
                │   registered by type byte      │
                └───────────────────────────────┘
                            │
     player blueprint       │
     placement              ▼
┌──────────────┐    ┌───────────────────────────┐
│ BuildRequest │ ─► │ BuildingSpawnSystem       │
│   { type,    │    │   em.Instantiate(         │
│     hex }    │    │       registry[type]      │
└──────────────┘    │   )                        │
                    │   + ConstructionSite tag   │
                    │   + ConstructionMaterial   │
                    └───────────────────────────┘
                            │
     builders deliver       │
     materials over time    ▼
                    ┌───────────────────────────┐
                    │ BuilderDepositSystem      │
                    │   mats[i].Delivered++     │
                    └───────────────────────────┘
                            │
     all materials in       ▼
                    ┌───────────────────────────┐
                    │ ConstructionCompleteSystem│
                    │   - remove ConstructionSite│
                    │   - remove ConstructionMaterial│
                    │   - add NeedsStaffing      │
                    │   (~20 LOC — no switch)   │
                    └───────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │ Operating building —        │
              │ production / tender /       │
              │ services / surplus all run  │
              │ via capability queries      │
              └─────────────────────────────┘
                            │
     HP → 0                 ▼
                    ┌───────────────────────────┐
                    │ BuildingDeathSystem       │
                    │   destroy entity          │
                    │ (CombatBuildingDeathHook  │
                    │  emits event before this) │
                    └───────────────────────────┘
```

Key shift: `em.Instantiate(registry[type])` is the only place per-type composition happens. After instantiation, the building is fully composed — `ConstructionSite` + `ConstructionMaterial` are bolted on top during the blueprint stage, then peeled off on completion.

---

## 5. System dispatch matrix

Every Core system queries by capability. No `switch (building.Type)` in Core. Per-type quirks stay in `Types/`.

### Core systems (unified)

| System                                     | Query                                                                                          | Writes                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `BuildingPrefabRegistrySystem` (bootstrap) | n/a                                                                                            | 11 prefab entities + registry singleton                             |
| `BuildingSpawnSystem`                      | `BuildRequest`                                                                                 | Instantiated building + `ConstructionSite` + `ConstructionMaterial` |
| `BuilderDepositSystem`                     | `ConstructionSite + ConstructionMaterial`                                                      | `ConstructionMaterial[i].Delivered`                                 |
| `ConstructionCompleteSystem`               | `ConstructionSite + ConstructionMaterial`                                                      | remove Site/Material, add `NeedsStaffing`                           |
| `TenderScanSystem`                         | `Building + TenderedBy + TenderMultiplier`                                                     | `TenderMultiplier.Value`                                            |
| `UnifiedProductionSystem`                  | `Building + ProductionRecipe` (+ optional `TenderedBy`)                                        | `ProductionRecipe.CycleEndsAt`, Reservations                        |
| `BuildingSurplusTransferSystem`            | `Building + SurplusExport + <ledger>`                                                          | Reservations (ship to Capital)                                      |
| `BuildingActiveVisualSystem`               | `BuildingActiveVisual` (+ `ProductionRecipe` / `OutpostTag` / `PassiveProduction` via lookups) | `BuildingActiveVisual.Value`                                        |
| `BuildingRepairSystem`                     | `Building + BuildingHealth`                                                                    | `BuildingHealth.Value`                                              |
| `BuildingDeathSystem`                      | `Building + BuildingHealth (Value==0)`                                                         | destroy                                                             |
| `BuildModeSystem`, `BuildPreviewSystem`    | input + hex state                                                                              | `BuildRequest`, preview ghosts                                      |
| `BuilderJobSystem`                         | `ProfessionIntent == Builder`                                                                  | job assignment                                                      |

### Types/ systems (bespoke)

| System                                                                                              | Query                                                   | Kept because                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| `OutpostVolleySystem`                                                                               | `OutpostVolley + OutpostArrowPool + Building + Faction` | Projectile combat, unique to Outpost         |
| `BarracksSupplyJobSystem`, `*DepositSystem`, `*HealExecutor`, `*RestBonusSystem`, `*CraftingSystem` | Various `Barracks*` components                          | Per-unit callback patterns, not recipe-cycle |
| `DockTenderScanSystem`, `DockFishingSystems`, `DockProductionSystem`                                | `DockTag`, `DockProduction`, `PassiveProduction`        | Craftsman tender + boat-build cadence        |
| `GoblinCaveSystems`, `GoblinCaveProduction` cadence                                                 | `GoblinCaveProduction`, `CaveFoodStatus`                | Unit-spawn cadence, not item production      |

---

## 6. Why no SubScene / Baker / ScriptableObject

- **Single source of truth in code** — all 11 recipes live in `BuildingPrefabRegistrySystem.cs`. One file, one `OnCreate`, 11 methods. Legible at a glance.
- **No editor dependency for a gameplay-driven system** — buildings aren't designer-tuned art assets; they're gameplay configurations. Code is fine.
- **No serialization / asset import overhead** — runtime prefab entities have zero build-time cost, no asset database hit, no SubScene streaming.
- **Burst-friendly** — the bake runs once at bootstrap on the main thread; subsequent Instantiate calls are Burst-compilable.
- **Authoring can be added later** if we ever want designer-tunable numbers without code change. Would wrap the same runtime concept (`BuildingPrefabRegistry` singleton of `NativeHashMap<byte, Entity>`) behind a `Baker<BuildingDefAuthoring>`. No architectural change needed.

---

## 7. Why per-type tags stay

`FarmTag`, `LumbercampTag`, `OutpostTag`, etc. survive the refactor alongside the new capability components. Reasoning:

- **Archetype filtering is free.** `[WithAll(typeof(LumbercampTag))]` narrows the job query at archetype level; replacing with `[WithAll(typeof(TenderedBy))]` doesn't distinguish Lumbercamp from Farm (both carry `TenderedBy`) and would require an in-job `Building.Type` check to re-specialize. Archetype filter is strictly better when the system is genuinely per-type.
- **Migration cost.** ~30 existing queries use `[WithAll(typeof(XxxTag))]`. Removing the tags means auditing all of them. Not worth it this round.
- **New unified systems simply don't use the tags** — `TenderScanSystem` filters on `TenderedBy`, `UnifiedProductionSystem` filters on `ProductionRecipe`. The tags are harmless residuals for the per-type `Types/` systems that genuinely need them.

Future: once the per-type systems all move to capability queries, the tags can be dropped in one pass. Not a goal for the current refactor.

---

## 8. Open questions / follow-ups

- **Dock Craftsman tender** — the unified `TenderScanSystem` assumes `TenderedBy { Profession }` halts a `ProductionRecipe` cycle. Dock's Craftsman instead _halves_ `DockProduction.CadenceTurns`. Options:
    1. Keep `DockTenderScanSystem` specialized (current plan, simplest)
    2. Generalize `TenderedBy` to include `{ SpeedMultiplier }` and have `DockProductionSystem` read `TenderMultiplier.Value` as a modifier
       Defer decision until after Phase 2 lands; low urgency.

- **Blueprint / construction lifecycle audit** — with the prefab-instantiate pattern, buildings enter the world with full capability components attached, just with `ConstructionSite` + `ConstructionMaterial` bolted on top. Systems that operate on capability components must skip blueprint-stage entities. Audit list (add `[WithNone(typeof(ConstructionSite))]`):
    - `UnifiedProductionSystem` — must not produce before construction completes
    - `TenderScanSystem` — pointless to write `TenderMultiplier` on a blueprint
    - `BuildingSurplusTransferSystem` — no surplus on blueprints
    - Service-seeker systems that read `ProvidesFood` / `ProvidesSleep` / `ProvidesHealing` — units shouldn't path to a blueprinted Inn
    - `OutpostVolleySystem`, `BarracksSupplyJobSystem`, etc. — same reasoning
      This audit happens in Phase 2 when registry is wired to spawn.

- **Save / load** — `BuildingType` byte is the stable ID. Serializing a world writes `(type, root hex, faction, health, recipe cycle state, ledger contents)` per building; loading re-instantiates from the registry and re-applies the state. No current save system — note for when it's added.

- **FurnaceProduction cycle migration** — existing saves (if any) carry `FurnaceProduction` data. No save format exists yet, so no migration burden. Confirm before Phase 2 ships.

- **Per-type ledger unification** — 10 ledger IBufferElementData types with identical binary layout. `BankLedgerBase` reinterpret already makes them interchangeable for reads/writes via `BankLedgerOps`. Could collapse into one `BankLedger` with a `byte Kind` field, but the per-type buffer tags provide free archetype filtering ("give me all Farm ledgers, not Capital ledgers"). Not worth the churn.

- **BanditCamp** — enemy-placed, not player-built. Shares `BuildingPrefabSingleton` today. Migrate to `registry[BuildingType.BanditCamp]` in Phase 2 so `BanditCampSpawnerSystem` uses the same Instantiate path.

---

## 9. Execution phases

Tracked in the plan at `/Users/alappatel/.claude/plans/identify-any-main-thread-mighty-elephant.md`. Summary:

- **Phase 0** — this doc.
- **Phase 1** — `TenderedBy` component + `BuildingPrefabRegistrySystem` with 11 bake methods. Registry not yet wired to spawn; existing flow unchanged.
- **Phase 2** — wire registry into `BuildingSpawnSystem`, slim `ConstructionCompleteSystem` to ~20 LOC, introduce `TenderScanSystem` + `UnifiedProductionSystem`, migrate Furnace to `ProductionRecipe`, delete 6 `*InitSystem` files, audit `[WithNone(typeof(ConstructionSite))]` sites.
- **Phase 3** — folder reorg under `ECS/DB/Buildings/{Components, Messages, Systems}/` matching the existing DB/\* domain convention.
- **Phase 4** — offloaded-chunk ghost simulation (§11). Unloaded-registry + worker-thread advance + reload hydrate.

---

## 10. DB event pipeline

`ECS/DB/Buildings/` mirrors the `DB/Hex`, `DB/Combat`, `DB/Logistics`, `DB/Professions`, `DB/Quests` convention. Same single-buffer-safe event flow as HexDB:

```
Per-type system applies lifecycle change (main thread, inside existing Burst job)
    ↓
BuildingsDB.EnqueueXxx(...)  → BuildingsDBSingleton.Events (NativeList)
    ↓
Init OrderFirst: BuildingsDomainSystem
    ↓  (owns singleton; future: drains Pending requests like HexDomainSystem)
Sim / Economy / Cleanup phases — Burst readers query BuildingsDBSingleton.Lookup / counters if needed
    ↓
Presentation: BuildingsBridgeSystem drains Events → GlobalMessagePipe.Publish<T>
    ↓
UI / audio / Steam achievement subscribers receive main-thread messages
```

Producer→consumer never overlap phases → single-buffer Events is safe.

### Layout

```
ECS/DB/Buildings/
├── Components/
│   └── BuildingsDBSingleton.cs      # Events + (future) UnloadedBuildings registry
├── Messages/
│   └── BuildingsMessages.cs         # BuildingSpawnedMessage, BuildingDestroyedMessage, BuildingTierChangedMessage, BuildingConstructionCompleteMessage, BuildingDamagedMessage, BuildingRepairedMessage, BuildingDemolishedMessage
├── Systems/
│   ├── BuildingsDomainSystem.cs     # Owns singleton; Init OrderFirst
│   ├── BuildingsBridgeSystem.cs     # Presentation; drains Events → MessagePipe (client-only)
│   └── BuildingsGhostSimSystem.cs   # Phase 4: worker-thread advance of unloaded buildings
└── BuildingsDB.cs                   # Static producer API
```

### Event types (v0)

| Event                                 | Emitted by                      | When                                            |
| ------------------------------------- | ------------------------------- | ----------------------------------------------- |
| `BuildingSpawnedMessage`              | BuildingSpawnSystem             | After entity created + all components attached  |
| `BuildingConstructionCompleteMessage` | ConstructionCompleteSystem      | All materials delivered, NeedsStaffing added    |
| `BuildingTierChangedMessage`          | BuildingUpgradeSystem           | Tier bumped (Market→Trade House etc.)           |
| `BuildingDamagedMessage`              | Projectile collision / attacker | BuildingHealth.Value decreased                  |
| `BuildingRepairedMessage`             | BuildingRepairSystem            | BuildingHealth.Value increased                  |
| `BuildingDestroyedMessage`            | BuildingDeathSystem             | About to destroy (HP ≤ 0)                       |
| `BuildingDemolishedMessage`           | DemolishBuildingSystem          | Player-initiated teardown (distinct from death) |

---

## 11a. Cross-process persistence + unit ghost sim (FFI-dependent)

Two planned extensions wait on Rust FFI schema work:

**BuildingsDBSingleton.Unloaded persistence.** In-memory only today — buildings survive chunk unload-then-reload during a session, but not across process restart. Scaffolded in `NativeWorld.TrySaveUnloadedBuilding` / `NativeWorld.TakeUnloadedBuildingsInChunk` (stubbed). Requires these Rust endpoints:

```
uniti_world_save_building(world, FfiUnloadedBuilding)
uniti_world_building_count_in_chunk(world, cx, cy) -> uint
uniti_world_take_buildings_in_chunk(world, cx, cy, out_buf, cap) -> uint
```

`FfiUnloadedBuilding` shape mirrors `UnloadedBuildingRecord` — same field set, blittable, versioned. Once the bindings regenerate, `HexChunkSystem.SnapshotBuildingsInChunk` / `HydrateUnloadedBuildings` gain FFI fast-paths and the in-memory NativeList becomes a write-through cache.

**UnitsGhostSimSystem.** Ticks Hunger / Fatigue / Energy on units stored via the existing `FfiGhostUnit` while their chunks are offline. Disabled today (`Enabled = false` in OnCreate). Unblocks when `FfiGhostUnit` extends with Hunger/Fatigue/Energy + their Max + PerSecond fields. See `ECS/DB/Units/Systems/UnitsGhostSimSystem.cs` for the implementation sketch.

Both extensions live in the DB/\* domains (`DB/Buildings/`, `DB/Units/`) alongside the in-memory loop — when the FFI path lands it's a drop-in replacement for the storage layer, not a rewrite of the simulation logic.

---

## 11. Offloaded-chunk ghost simulation

### Goal

A building in an unloaded chunk (outside `HexChunkSystem` load radius) keeps accumulating state — production cycles, repair timers, recruitment cadence, arrow-pool refills — **without** loading its ECS entity. When the player returns and the chunk reloads, the building respawns with all accrued deltas pre-applied.

### Threading rules

- **Snapshot path** — `HexChunkSystem.DespawnChunk` iterates `Building` entities in the chunk (main thread, single writer) and appends serialized records to `BuildingsDBSingleton.Unloaded`. No contention.
- **Ghost simulator** — `BuildingsGhostSimSystem`, Burst `ISystem` running at low cadence (1 Hz). Schedules an `IJob` that reads+writes `Unloaded` on a worker thread. Pure data transform, DOTS-tracked safety handle.
- **Reload hydrate** — `HexChunkSystem.SpawnChunk` → for each `UnloadedBuildingRecord` inside the loaded bounds, spawn the building via `BuildingSpawnSystem` (main thread, managed Instantiate) and apply accrued HP / production state.
- **Persistence** — `BuildingsDBSingleton.Unloaded` serialises via the Rust FFI `WorldStoreSystem` path so offline state survives process restart.

All three paths serialise through the `BuildingsDBSingleton.Unloaded` safety handle. No manual sync points.

### Record shape (v0 sketch)

```csharp
public struct UnloadedBuildingRecord
{
    public byte   Type;                  // BuildingType
    public int2   RootHex;
    public byte   OwnerFaction;
    public ushort Health;
    public ushort HealthMax;
    public byte   Tier;
    public uint   LastTickTurn;          // WorldClock turn at unload
    public float  AccruedProduction;     // cycles completed since unload
    public float  AccruedInput;          // inputs consumed (reload deducts from Capital)
    public byte   Flags;                 // IsBandit | HasRecipe | Destroyed | …
}
```

Versioned via `UnloadedBuildingVersion` const — bump on schema change to invalidate stale persisted records.

### What does NOT ghost-simulate while offloaded

- Combat (no live units in unloaded chunks)
- Pathing / AI (no live units period)
- Visual state (no renderers)
- Per-hex queries (no live hex entities)
- Surplus transfer to Capital (optional — could be done, but simpler to flush on reload)

Unloaded buildings are purely economic actors while offline.

### Hydrate ordering

1. `HexChunkSystem.SpawnChunk` creates hex entities → HexDB.EnqueueAdd → `HexDBSingleton.Lookup` populated next `Init`.
2. `HexChunkSystem.SpawnChunk` enumerates matching `UnloadedBuildingRecord`s → calls `BuildingSpawnSystem.SpawnFromRecord(record)` which clones the registry prefab + applies record deltas + removes from `Unloaded`.
3. `BuildingsDomainSystem` publishes `BuildingSpawnedMessage` on next Presentation tick.

### Multiplayer

- `BuildingsDBSingleton.Unloaded` is **server-only** (`WorldSystemFilter(ServerSimulation)`). Clients never see the offline accumulator; they hydrate replicated entities when chunks stream in via NetCode.
- Ghost-replicated live buildings (via `[GhostComponent]` on `Building`, `BuildingHealth`, `BuildingTier`, `BuildingVisual`) let clients render the same state the server has on load.

---
