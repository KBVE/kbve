# Rareicon Inventory Refactor Plan

> **Status:** Planning. Band-aid `InventorySyncBarrierSystem` currently keeps the game playable; this doc is the execution plan for the proper fix.

## 1. Problem statement

Today `InventorySlot : IBufferElementData` is one buffer type shared by **every entity** that stores items:

- Every Player unit (goblin pack, hero carry, soldier kit, King inventory).
- Every building (Capital stockpile, Farm crate, Barracks storage, GoblinCave food store, Furnace smelter stash).
- Future containers (ground loot, merchant stalls, chests).

### Why this breaks DOTS parallelism

Unity's job-safety system tracks dependencies **at the component type level, not the entity level**. A Burst job with `BufferLookup<InventorySlot>` (read-only) must wait for **any** job in the world that writes `InventorySlot`, even if the writer only touches Capital storage and the reader only touches a goblin's pack.

Concrete failures we've observed:

- `SurplusTransferJob` (Economy) writes Capital/Farm storage → `BuilderJobRefineJob` (Behavior, next frame) reads goblin pack → Unity safety throws `InvalidOperationException`.
- Same pattern for `PassiveTickJob`, `FurnaceTickJob`, `CookingJob` vs. `BarracksSupplyPlannerJob`, `UpdateBagStatusJob`, `UnitBehaviorJob`.
- Structural changes (Furnace coming online mid-game) introduce a new writer whose handle isn't yet in the world dep manager, tripping the safety check on the first tick of the new archetype.

No amount of `UpdateAfter` / `OrderLast` / `CompleteDependencyBeforeRW` scoping makes the races go away cleanly — it only hides them. The only real fix is to give units and buildings **separate access domains**.

## 2. Target architecture

### Three buffer types

| Type                                          | Owner                                                                          | Use                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `PackSlot : IBufferElementData`               | Units (goblins, knights, soldiers, mages, King)                                | Items the unit is physically carrying. Capped by `EquippedBag` slot count. |
| `InventorySlot : IBufferElementData`          | Buildings (Capital, Farm, Barracks, GoblinCave, Furnace, Inn, Market, Outpost) | Building stockpile. Capped by `StorageCapacity`.                           |
| `ContainerSlot : IBufferElementData` (future) | Ground loot piles, chests, merchant stalls, animal carcasses                   | World-placed containers. Not yet needed.                                   |

`InventorySlot` keeps its name — it's the building-side buffer that most systems already treat as "stockpile". Units move to `PackSlot`.

### Shared schema — ULID-keyed stacks

Each slot is a timestamp-sortable stack with its own `Ulid`. All three buffer types share this shape, reusing the **[Cysharp.Ulid](https://github.com/Cysharp/Ulid)** package (installed via NuGetForUnity at `Assets/Packages/Ulid.1.4.1/`):

```csharp
using System; // Cysharp's Ulid lives in the System namespace, matching System.Guid.

public struct PackSlot : IBufferElementData
{
    public Ulid   Uid;     // 16 bytes — Cysharp.Ulid, blittable, Burst-safe
    public ushort ItemId;  //  2 bytes
    public ushort Count;   //  2 bytes
    // 4 bytes pad → 24 bytes/slot
}

// InventorySlot and ContainerSlot use the same layout.
```

Cysharp's `Ulid` is a readonly 16-byte struct (48-bit unix-ms timestamp + 80 bits random), matches Rust's `ulid::Ulid` (u128) byte-for-byte for FFI, exposes `Ulid.NewUlid()` as the factory, and round-trips through Crockford base32 for logging. The type lives in `System` (not `Cysharp.*`) so the only import needed is `using System;`.

**Why Uid on every stack:**

- FFI to Rust: stack Uids become natural persistence keys in the Rust save store — no need to map ECS `Entity` indexes across save/load, which aren't stable.
- Transfer audit / UI: "this pile was harvested 03:42 yesterday" comes free off the Uid's timestamp prefix.
- Unique items later: an heirloom sword is just a stack with `Count=1` that doesn't merge — the Uid is the item's identity.
- Cost: 6× the slot size (4 → 24 bytes). At 1000 buildings × 8 slots + 100 units × 8 slots = ~211 KB total. Negligible.

**Merge semantics** (two stacks of the same `ItemId` in the same buffer):

- Target stack (the one being added to) keeps its Uid.
- Incoming stack's Uid is destroyed.
- On cross-buffer transfer (deposit / pickup), if the destination has no existing stack of that `ItemId`, the incoming stack's Uid carries over. If it does, the destination's older Uid wins — merge by count into the older stack.
- Rule of thumb: **the older Uid always wins**, so stack birthtime stays meaningful in audit views.

**Consolidation Uids** (Section 3):

- When 100 raw items roll up into 1 bulk item, the resulting bulk stack gets a **fresh Uid** stamped with the consolidation moment. No lineage table — contributing raw stack's Uid dies with it. Simple, re-addable later if audit needs it.

**Generation:** `Ulid.NewUlid()` is the canonical factory and is safe from managed contexts (system `OnUpdate` bodies, deposit appliers, etc.). Inside Burst jobs that need deterministic seeding, we'll wrap a `UlidFactory` helper that takes `Unity.Mathematics.Random` + `SystemAPI.Time.ElapsedTime` and emits bytes into `Ulid.TryParse`/`new Ulid(ReadOnlySpan<byte>)` — no managed allocation. `Ulid.Empty` (`default(Ulid)`) is the sentinel for "not yet assigned".

### Helper extensions

`DynamicBuffer<PackSlot>.AddItemManaged(...)` etc. are duplicated per buffer type (not generic) so Burst doesn't fight an `IItemSlot` interface constraint. Zero-cost abstraction beats clever generics here.

### Access-domain win

After the split:

- Burst reader of `PackSlot` (e.g. `UnitBagStatusJob`) **never conflicts** with Burst writer of `InventorySlot` (e.g. `SurplusTransferJob`).
- `InventorySyncBarrierSystem` can be deleted — no more main-thread sync point.
- Cross-frame races disappear because the types are isolated.
- Mental model aligns with gameplay: "what's on me" vs "what's in the warehouse" are different things in every RTS/colony sim, and now they're different things in the ECS too.

## 3. Storage compression — raw items consolidate 100:1 into bulk units

Raw items carried in a `PackSlot` are fine-grained (per-chop, per-pickup). Building storage should hold the compressed bulk form so the economy can reason at ingredient scale instead of tallying thousands of individual items. Consolidation is one-way, at-deposit, and applied by a bridge system after the unit→building transfer lands.

### Fixed 100:1 ratio, `ItemDB`-driven

Every raw item declares its bulk form and ratio in `ItemDB`:

| Raw (in-field / in-pack)                                                                            | Bulk (in storage) | Ratio                                             |
| --------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| `Log`                                                                                               | `Timber`          | 100:1                                             |
| `Stone`                                                                                             | `StoneBlock`      | 100:1                                             |
| `Arrow`                                                                                             | `Quiver`          | 100:1                                             |
| `Berry` / `Mushroom` / `Herb` / `Cactus` / `RawBeef` / `CookedBeef` / `Egg` / `Milk` / `Cheese` / … | `Meal`            | 100:1 (shared pool — any food source contributes) |

Ratio stays blanket 100:1 for simplicity — tune the numbers elsewhere (spawn rates, build costs, food consumption) rather than reasoning about mixed ratios per item. Build costs migrate from raw to bulk units: `Farm.Cost = 5 Timber` (not 5 Log), `Barracks.Cost = 8 Timber + 3 StoneBlock`, etc.

### ItemDB schema

```csharp
public struct ItemDef
{
    public ushort Id;
    public ushort CompressesTo;   // 0 = doesn't compress (already bulk / unique)
    public ushort CompressRatio;  // e.g. 100
    public ushort PoolGroup;      // shared pool for food → Meal (0 = standalone)
    // existing fields: StackMax, StoreEnergy, ResourceTag, …
}
```

`PoolGroup` handles the Meal case: all food items share a pool ID, the consolidator sums their raw counts across the building's inventory and rolls whole hundreds into `Meal`.

### Consolidator system

New `StorageConsolidatorSystem` in `EconomySystemGroup`, runs after all deposits (`OrderLast = true` alongside `UnitBagStatusSystem`, or a shared group slot). For each building `InventorySlot` buffer:

1. **Single-source items** (Log, Stone, Arrow): if `count >= 100`, subtract 100, add 1 to `CompressesTo`. Loop until `count < 100`.
2. **Pooled items** (food): sum all pool members' counts. Convert `floor(total / 100)` into `Meal`, then deduct 100 per meal proportionally across the pool members (oldest-first by slot order, or largest-first — design decision, same result at scale).

Pure Burst IJobEntity, reads `ItemDB` definitions baked into a `NativeHashMap<ushort, ItemDef>` (already the direction for the Burst-friendly ItemDB per [project_rareicon_phase8_plan.md](../../.../memory/project_rareicon_phase8_plan.md)).

### One-way by design

Bulk units never de-compress back into raw. Consumers pay the bulk cost:

- Builders deliver **Timber** (not Log) — `BuilderDepositSystem.TryPickup` walks `ConstructionMaterial` bill, pulls from Capital's `Timber` slot.
- Barracks recruitment eats **Meal** (not Berry × 20) — `BarracksProductionSystem.FoodCost` counts from `Meal`.
- Archers refill from **Quiver** (not Arrow × 100) — `ArcherRefillSystem` pulls a Quiver and the archer's pack receives 100 Arrows materialized on equip (this is the only exception — re-materialize at equip-time, not at storage).

### In-pack identity — not individual entities

`PackSlot { itemId, count }` stays a stackable slot for raw items. A goblin chopping accumulates `Log count=30` in one PackSlot entry, not 30 log entities. This keeps per-chop yield cheap while the world-placed log sprite on the ground (if we render them) can still be one visual per chop — the sprite is a presentation concern, decoupled from the inventory representation.

Unique items — named weapons, heirlooms, quest items — will eventually want per-instance entities with `ItemIdentity { Ulid, OriginTimestamp, Quality, Durability }`. That's a later refactor on top of this; document it in a follow-up section or its own doc when the gameplay calls for it.

### Build-cost migration checklist

`BuildingDB.CostXxx` arrays switch from raw items to bulk units:

- `CostCapital` — still the `CapitalLandGrant` (unique ingredient, stays).
- `CostFarm` — `5 WoodLog` → `5 Timber`.
- `CostBarracks` — `8 WoodLog + 3 Stone` → `8 Timber + 3 StoneBlock`.
- `CostFurnace` — `6 WoodLog + 4 Stone` → `6 Timber + 4 StoneBlock`.
- `CostGoblinCave` — current `20 Berry + 30 Stone + 30 WoodLog` → `2 Meal + 3 StoneBlock + 3 Timber` (numerically equivalent at scale).
- `CostInn` / `CostMarket` / `CostOutpost` — convert similarly.

### Production recipe migration

`ProductionRecipe` + `FurnaceProduction` + `BarracksProduction` entries need case-by-case review against the bulk scale. Rule of thumb: if the recipe operates on what a _building_ has stockpiled, use bulk inputs; if it operates on what a _unit_ is actively carrying or processing at a workbench, stay raw.

| Recipe                                         | Before (raw)                                   | After (bulk where appropriate)                                                          |
| ---------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Capital arrow craft                            | 1 WoodLog + 1 CactiNeedle + 1 Stone → 10 Arrow | 1 Timber + 1 CactiNeedle + 1 StoneBlock → 10 Arrow (consolidated into Quiver next tick) |
| Capital compost                                | 1 Leaf + 1 Branch → 1 Compost                  | stays raw — compost is low-volume, not worth a bulk form                                |
| Furnace smelting                               | Wood + Sand → Coal + Ash + Glass               | Timber + Sand → Coal + Ash + Glass                                                      |
| Barracks recruitment                           | CoinCost BanditCoin + FoodCost (any food)      | CoinCost BanditCoin + FoodCost (Meal)                                                   |
| Farm livestock                                 | 1 Carrot → 1 Egg / 1 Milk / 1 Wool             | stays raw — per-animal tick, low cycle output                                           |
| BarracksCraftingSystem (Craftsman at Barracks) | 1 WoodLog + 1 CactiNeedle → 5 Arrow            | 1 Timber + 1 CactiNeedle → 5 Arrow (also consolidated)                                  |

Output items that are raw (Arrow, Compost, Egg, Milk) get swept into their bulk form (Quiver, Meal) next tick by the Consolidator — the recipe doesn't need to know. Input items that were raw become bulk only where the _building_ is paying the cost; workbench-style recipes where a carrying unit provides the material keep raw inputs (the unit's pack holds raw items, can't carry a Timber).

## 4. Transfer semantics (the bridge layer)

Most inventory work in the game is **transfer between domains**. Each direction needs an explicit bridge function:

### Unit → Building (deposit)

- **Caller:** `EmpireDepositSystem`, `BarracksSupplyDepositSystem`, `BuilderDepositSystem.TryDeliver`, `GoblinCave` drop-off
- **Signature:** `Transfer.UnitToBuilding(ref DynamicBuffer<PackSlot> pack, ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort count, int storageCap)`
- **Semantics:** move items from pack to storage, respecting `storageCap` and item stack max.

### Building → Unit (withdraw / pickup)

- **Caller:** `BuilderDepositSystem.TryPickup`, `BarracksSupplyDepositSystem` pickup at Capital, `GoblinCave` food fetch at Capital, `EmpireWithdrawSystem`
- **Signature:** `Transfer.BuildingToUnit(ref DynamicBuffer<InventorySlot> storage, ref DynamicBuffer<PackSlot> pack, in DynamicBuffer<EquippedBag> bags, ushort itemId, ushort count, int stackMax)`
- **Semantics:** move from storage to pack, respecting `EquippedBag`-derived slot cap.

### Unit → Unit (peer share)

- **Caller:** `EmpireSharingSystem`
- **Signature:** `Transfer.UnitToUnit(ref DynamicBuffer<PackSlot> from, ref DynamicBuffer<PackSlot> to, in DynamicBuffer<EquippedBag> toBags, ushort itemId, ushort count)`
- **Semantics:** peer-to-peer food handoff when hungry goblin is adjacent to one carrying food.

### Building → Building (surplus)

- **Caller:** `BuildingSurplusTransferSystem` (Farm/Furnace → Capital via `PendingItemTransfer`)
- **Signature:** `Transfer.BuildingToBuilding(ref DynamicBuffer<InventorySlot> from, Entity toBuilding, EntityCommandBuffer.ParallelWriter ecb, ushort itemId, ushort count)`
- **Semantics:** drain source, queue pending transfer; `InventoryTransferApplierSystem` folds into the destination. Already works this way via ECB — no behaviour change, just the `from` type changes if the source is a unit (it's always a building for Surplus).

### Harvest / in-place mutation

- **Caller:** `HarvestSystem.TryTakeResource`, `HarvestSystem.TryTakeCactus`, `LooterPickupSystem`
- **Signature:** writes directly into `DynamicBuffer<PackSlot>` with bag-cap awareness.
- No building involvement — pure add to pack.

### Production into storage

- **Caller:** `FurnaceTickJob`, `PassiveTickJob`, `ProductionJob`, `BarracksCraftingSystem`, `CookingJob`, `FarmLivestockProductionJob`
- **Semantics:** direct mutation of `InventorySlot` on the producer building, or on Capital if the recipe says `PullsFromCapital`. All building-side — no unit involvement. No cross-domain concern.

## 5. File-by-file migration inventory (42 files)

### Component definitions

| File                                                             | Change                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Assets/_RareIcon/Scripts/ECS/Components/InventoryComponents.cs` | Define new `PackSlot` struct + its extension methods (`AddItem`, `AddItemCapped`, `AddItemManaged`, `RemoveItem`, `CountOf`). Keep `InventorySlot` for buildings. Add shared helpers via copy or generic. |
| `Assets/_RareIcon/Scripts/ECS/Components/BuildingComponents.cs`  | No direct buffer change; review any `DynamicBuffer<InventorySlot>` refs in the Treasury/storage comments.                                                                                                 |
| `Assets/_RareIcon/Scripts/ECS/Components/UnitBagStatus.cs`       | No change — status components are derivatives, unaware of buffer type.                                                                                                                                    |
| `Assets/_RareIcon/Scripts/ECS/Components/PendingItemTransfer.cs` | Confirm target is always a building (it is); the applier uses `InventorySlot` on the target.                                                                                                              |
| `Assets/_RareIcon/Scripts/Data/FoodItems.cs`                     | Currently `Count(DynamicBuffer<InventorySlot>)` — add `Count(DynamicBuffer<PackSlot>)` overload or use generic.                                                                                           |

### Spawn sites (unit → PackSlot)

| File                 | Change                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UnitSpawnSystem.cs` | `em.AddBuffer<InventorySlot>` → `em.AddBuffer<PackSlot>` on every unit spawn (Goblin, Knight, King, hero, garrison archer). Initial item inserts (King's `CapitalLandGrant`, garrison's `Arrow`) use PackSlot. |

### Spawn sites (building → keep InventorySlot)

| File                     | Change                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `BuildingSpawnSystem.cs` | Capital treasury, GoblinCave storage, Barracks inventory — all stay `InventorySlot`. |
| `BarracksInitSystem.cs`  | Stays InventorySlot.                                                                 |
| `FarmInitSystem.cs`      | Stays InventorySlot.                                                                 |

### Unit-only systems (migrate to PackSlot)

| File                     | Current → New                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `HarvestSystem.cs`       | `DynamicBuffer<InventorySlot>` in Execute → `DynamicBuffer<PackSlot>`. `AddItemManaged` overload for PackSlot. |
| `LooterPickupSystem.cs`  | Unit inventory → PackSlot.                                                                                     |
| `ConsumeFoodExecutor.cs` | Unit inventory → PackSlot.                                                                                     |
| `BagAutoEquipSystem.cs`  | Reads unit inventory for Bag-type items → PackSlot.                                                            |
| `UnitBagStatusSystem.cs` | `UpdateBagStatusJob.InvLookup` → `BufferLookup<PackSlot>`.                                                     |

### Building-only systems (stay on InventorySlot)

| File                                                             | Notes                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `FurnaceProductionSystem.cs`                                     | Capital write only.                                           |
| `PassiveProductionSystem.cs`                                     | Capital / self write only.                                    |
| `ProductionSystem.cs`                                            | Self / Capital write only.                                    |
| `BarracksProductionSystem.cs`                                    | Barracks storage only.                                        |
| `BarracksCraftingSystem.cs`                                      | Barracks storage only.                                        |
| `CookingSystem.cs`                                               | Capital storage only.                                         |
| `BuildingSurplusTransferSystem.cs`                               | Building → Capital surplus, both sides building.              |
| `InventoryTransferApplierSystem.cs`                              | ECB-driven; destination is always building.                   |
| `UnitBagStatusSystem.cs` (cave + capital + barracks status jobs) | These read building `InventorySlot` to compute status — stay. |

### Cross-domain bridge systems (touch BOTH)

These are the interesting ones. Each needs to declare `BufferLookup<PackSlot>` **and** `BufferLookup<InventorySlot>` as separate job fields:

| File                             | Bridge direction                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmpireDepositSystem.cs`         | unit pack → Capital storage (drain on Capital hex)                                                                                                         |
| `EmpireWithdrawSystem.cs`        | Capital storage → unit pack                                                                                                                                |
| `EmpireSharingSystem.cs`         | unit pack ↔ unit pack (no building involvement — actually unit-only)                                                                                       |
| `BuilderDepositSystem.cs`        | pickup: Capital → pack. deliver: pack → ConstructionMaterial buffer (not InventorySlot — separate buffer).                                                 |
| `BarracksSupplyDepositSystem.cs` | pickup: Capital → pack. deposit: pack → Barracks InventorySlot.                                                                                            |
| `BarracksSupplyJobSystem.cs`     | reads pack to decide carry state. Uses `BufferLookup<PackSlot>`.                                                                                           |
| `BuilderJobSystem.cs`            | reads pack to decide carry state. Uses `BufferLookup<PackSlot>`.                                                                                           |
| `GoblinCaveSystems.cs`           | `CapitalFoodPickupSystem` main-thread Query, pickup Capital → pack. Dropoff at cave: pack → cave InventorySlot.                                            |
| `ArcherRefillSystem.cs`          | Barracks → archer pack (supply resupply).                                                                                                                  |
| `RangedAttackSystem.cs`          | Consumes arrows from archer pack.                                                                                                                          |
| `WildlifeSystems.cs`             | Animal production writes to... farm storage (InventorySlot) in `FarmLivestockProductionJob`. Animal entities themselves don't carry — stays building-side. |
| `HunterSystems.cs`               | Confirm: hunting output goes to Capital (InventorySlot) and/or unit (pack)? Currently `InvLookup` RW in job — audit which side.                            |

### Query systems (read-only)

| File                    | Change                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JobSystem.cs`          | `caveInvLookup = SystemAPI.GetBufferLookup<InventorySlot>(true)` for needy-cave check — stays InventorySlot (cave is building). `unitInvLookup` for Looter carry-check — → PackSlot. |
| `HexHoverSystem.cs`     | UI tooltip; audit whether it reads unit or building inventory.                                                                                                                       |
| `HexSpawnSystem.cs`     | If unrelated, leave.                                                                                                                                                                 |
| `BuildPreviewSystem.cs` | UI preview; probably reads building.                                                                                                                                                 |
| `WeaponSelectSystem.cs` | Reads unit pack → PackSlot.                                                                                                                                                          |

### UI layer

| File                           | Change                                                   |
| ------------------------------ | -------------------------------------------------------- |
| `UITreasury.cs`                | Capital treasury panel — reads InventorySlot. Stays.     |
| `UIBuildingInspector.cs`       | Building inventory view → InventorySlot. Stays.          |
| `UIBuildingPalette.cs`         | Probably reads build cost (ConstructionMaterial). Audit. |
| _Future:_ `UIUnitInventory.cs` | Would read PackSlot. Not yet present.                    |

## 6. Execution order (safe, incremental)

### Step 0 — wire Cysharp.Ulid into the slot schema

The `Ulid` type is already available (Cysharp.Ulid 1.4.1 via NuGetForUnity, resolves as `global::System.Ulid`). What this step does:

- Add `public Ulid Uid;` as the first field of the existing `InventorySlot` struct.
- Add a thin `UlidFactory` helper at `Assets/_RareIcon/Scripts/ECS/Components/UlidFactory.cs` exposing:
    - `static Ulid NewUid()` — main-thread path, calls `Ulid.NewUlid()`.
    - `static Ulid NewUid(ref Unity.Mathematics.Random rng, double nowMs)` — Burst-safe path that builds the 16 bytes (6-byte ms timestamp + 10 random) and returns `new Ulid(span)`.
    - `static readonly Ulid Empty = default;` for the sentinel.
- Every existing call site that builds an `InventorySlot { ItemId = x, Count = y }` gets a compile error; fix each to also set `Uid = UlidFactory.NewUid()` at creation or `Uid = default` for migration-fill.
- Save-load: old saves (no Uid field) load as `Uid = default`; the first post-load merge/deposit regenerates a real Uid for the stack.

No new type is introduced in this step — it's purely "put the Uid on the existing buffer". PackSlot comes in Step 1.

### Step 1 — add `PackSlot` alongside `InventorySlot` (no removals)

Define `PackSlot : IBufferElementData` (with the same `Uid / ItemId / Count` layout) + its extension methods. Compile — nothing breaks yet.

### Step 2 — migrate unit spawn sites

`UnitSpawnSystem.AttachJobsIfPlayer`, `SpawnKingAt`, etc. — add `em.AddBuffer<PackSlot>(entity)` alongside the existing `AddBuffer<InventorySlot>`. At this point every unit has BOTH buffers. Harmless.

### Step 3 — migrate unit-side readers/writers one system at a time

For each system in "Unit-only systems" and "Cross-domain bridge systems":

1. Add the new `BufferLookup<PackSlot>` field (RW where needed).
2. Switch the job logic to read/write PackSlot instead of InventorySlot.
3. Update callers (main-thread Query iterations, ECB emits).
4. Test the specific flow (harvest a mushroom, loot an arrow, deliver a building material, etc).

Keep the unit's `InventorySlot` buffer populated in parallel as a dead weight during migration — this avoids a big-bang risk.

### Step 4 — remove `InventorySlot` from unit archetype

Once every unit-side system is reading/writing PackSlot, delete the `AddBuffer<InventorySlot>` call from `UnitSpawnSystem`. Compile. Any remaining consumer will break loudly and point at the final holdouts.

### Step 5 — delete `InventorySyncBarrierSystem`

No longer needed. The cross-domain races are gone.

### Step 6 — regression pass

- Full gameplay test: spawn, harvest, deliver to capital, build a farm, build a barracks, craft arrows, feed goblins, repel a hostile wave.
- Profile the arbiter and Economy dispatchers — look for the parallel scaling win (no main-thread stalls).
- Confirm `[JobSystem diag]` counts stabilize.

### Step 7 — clean up status-component overlap

`UnitBagStatus`, `CaveFoodStatus`, `CapitalStatus`, `BarracksSupplyStatus` were added as workarounds to avoid cross-domain reads. After the split they're still useful (keep status aggregates out of hot paths), but some were pre-computed specifically to avoid `InventorySlot` races — audit whether any can be simplified or deleted.

### Step 8 — wire the 100:1 storage consolidator

Independent of the PackSlot split but a natural follow-on — see Section 3.

1. Extend `ItemDB` / `ItemDef` with `CompressesTo`, `CompressRatio`, `PoolGroup`.
2. Add `Timber`, `StoneBlock`, `Quiver`, `Meal` item IDs. No raw-item analogue — they only exist in bulk form.
3. `StorageConsolidatorSystem` in `EconomySystemGroup` (OrderLast peer of `UnitBagStatusSystem`): walks building `InventorySlot` buffers, rolls whole hundreds into their bulk form, handles food pool.
4. Migrate `BuildingDB.CostXxx` arrays from raw → bulk units.
5. Migrate `ProductionRecipe` / `FurnaceProduction` / `BarracksProduction` inputs where the building pays the cost (Furnace, Capital Arrow craft, Barracks recruitment) from raw → bulk. Outputs stay raw when the production cycle's natural scale is per-item (Arrow, Egg, Compost) — the Consolidator rolls them up after deposit.
6. `ArcherRefillSystem` re-materializes Arrows at equip time (the one exception to one-way consolidation).

### Step 9 — regression pass #2

- Harvest → deposit → build a Farm with bulk Timber path end-to-end.
- Confirm food pool consolidation handles mixed Berry / Mushroom / CookedBeef without leaking raw items at storage tick boundaries.
- Confirm Quiver → Arrow re-materialization at archer refill.

## 7. Naming and conventions

- **Extension methods:** `DynamicBuffer<PackSlot>.AddItemManaged(...)` mirrors the existing `DynamicBuffer<InventorySlot>.AddItemManaged(...)`. Don't over-generic this with interfaces that break Burst — just duplicate the small extension set.
- **`FoodItems.Count` overloads:** add `Count(DynamicBuffer<PackSlot>)` next to the existing InventorySlot version. Inline duplication is cheaper than a generic constraint.
- **Consumer-side variable names:** `unitInv` / `pack` for PackSlot; `storage` / `treasury` / `cap_inv` for InventorySlot. Stay consistent.
- **Transfer helpers:** put them in a new `InventoryTransfer.cs` static class so the domain boundary is explicit.

## 8. Risk & rollback

- **Risk: incomplete migration leaves a system still reading old InventorySlot on a unit → silent "nothing happens"** (unit's InventorySlot is empty after the spawn-change).
    - _Mitigation:_ keep InventorySlot on units until the migration is complete (step 4 removes it). During the in-between, both buffers coexist — harmless if either is read.

- **Risk: the ECB-based `PendingItemTransfer` applier targets a unit**
    - _Audit:_ `PendingItemTransfer.Target` is always `Capital` or a building in current code. Confirm this during step 3. If a unit ever becomes a target, add a parallel `PendingPackTransfer` for unit deposits.

- **Risk: UI / HUD reads the wrong buffer post-migration**
    - _Mitigation:_ UI changes in step 3 alongside the bridge systems; test the roster and treasury panels explicitly.

- **Rollback:** each step is a single commit. Revert the offending commit if a specific flow breaks; the types are additive until step 4.

## 9. Follow-ups enabled by the split

- **ContainerSlot** for ground-loot piles (dead animals, dropped items) — decouple from unit pack, enable "loot corpse" without bag-cap conflicts.
- **Unit-to-unit trade / gifting** — add an `OfferedItem` tag that's only on PackSlot entities.
- **Threaded inventory ticks** — pack tick loops (food rot, tool wear) can run completely in parallel with building economy ticks.
- **Replay / save format** — separating buffers makes it easier to snapshot unit state vs world state.
- **Per-instance unique items as entities** — named weapons, heirlooms, quest loot with `ItemIdentity { Ulid, OriginTimestamp, Quality, Durability, LineageOwner[] }`. Coexists with the stack-based representation for fungibles; the 100:1 consolidator from Section 3 only applies to fungible stacks, unique items stay as entities end-to-end.

## 10. Band-aid in place today

Until this refactor lands:

- `InventorySyncBarrierSystem` (`ECS/Systems/InventorySyncBarrierSystem.cs`) — runs first in `BehaviorSystemGroup`, force-completes `InventorySlot` + `EquippedBag` writers via `state.EntityManager.CompleteDependencyBeforeRW<T>()` once per frame.
- Not a world barrier — scoped to those two types. Cost is the main-thread wait for the ~5-10 in-flight Economy writes, typically sub-millisecond.
- Delete it in step 5.

---

_Author: drafted during 2026-04-20 job-dispatcher refactor session, after repeated cross-system safety exceptions traced to the shared `InventorySlot` type._
