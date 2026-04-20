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

### Shared schema

All three types share the same struct shape:

```csharp
public struct PackSlot : IBufferElementData
{
    public ushort ItemId;
    public ushort Count;
}
```

This keeps item-transfer helpers portable across types via generic `where T : unmanaged, IBufferElementData, IItemSlot` with a shared `IItemSlot` interface exposing `ItemId` / `Count`. Alternatively, copy-paste each extension method set — less clever, zero runtime overhead.

### Access-domain win

After the split:

- Burst reader of `PackSlot` (e.g. `UnitBagStatusJob`) **never conflicts** with Burst writer of `InventorySlot` (e.g. `SurplusTransferJob`).
- `InventorySyncBarrierSystem` can be deleted — no more main-thread sync point.
- Cross-frame races disappear because the types are isolated.
- Mental model aligns with gameplay: "what's on me" vs "what's in the warehouse" are different things in every RTS/colony sim, and now they're different things in the ECS too.

## 3. Transfer semantics (the bridge layer)

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

## 4. File-by-file migration inventory (42 files)

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

## 5. Execution order (safe, incremental)

### Step 1 — add `PackSlot` alongside `InventorySlot` (no removals)

Define `PackSlot : IBufferElementData` + its extension methods. Compile — nothing breaks yet.

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

## 6. Naming and conventions

- **Extension methods:** `DynamicBuffer<PackSlot>.AddItemManaged(...)` mirrors the existing `DynamicBuffer<InventorySlot>.AddItemManaged(...)`. Don't over-generic this with interfaces that break Burst — just duplicate the small extension set.
- **`FoodItems.Count` overloads:** add `Count(DynamicBuffer<PackSlot>)` next to the existing InventorySlot version. Inline duplication is cheaper than a generic constraint.
- **Consumer-side variable names:** `unitInv` / `pack` for PackSlot; `storage` / `treasury` / `cap_inv` for InventorySlot. Stay consistent.
- **Transfer helpers:** put them in a new `InventoryTransfer.cs` static class so the domain boundary is explicit.

## 7. Risk & rollback

- **Risk: incomplete migration leaves a system still reading old InventorySlot on a unit → silent "nothing happens"** (unit's InventorySlot is empty after the spawn-change).
    - _Mitigation:_ keep InventorySlot on units until the migration is complete (step 4 removes it). During the in-between, both buffers coexist — harmless if either is read.

- **Risk: the ECB-based `PendingItemTransfer` applier targets a unit**
    - _Audit:_ `PendingItemTransfer.Target` is always `Capital` or a building in current code. Confirm this during step 3. If a unit ever becomes a target, add a parallel `PendingPackTransfer` for unit deposits.

- **Risk: UI / HUD reads the wrong buffer post-migration**
    - _Mitigation:_ UI changes in step 3 alongside the bridge systems; test the roster and treasury panels explicitly.

- **Rollback:** each step is a single commit. Revert the offending commit if a specific flow breaks; the types are additive until step 4.

## 8. Follow-ups enabled by the split

- **ContainerSlot** for ground-loot piles (dead animals, dropped items) — decouple from unit pack, enable "loot corpse" without bag-cap conflicts.
- **Unit-to-unit trade / gifting** — add an `OfferedItem` tag that's only on PackSlot entities.
- **Threaded inventory ticks** — pack tick loops (food rot, tool wear) can run completely in parallel with building economy ticks.
- **Replay / save format** — separating buffers makes it easier to snapshot unit state vs world state.

## 9. Band-aid in place today

Until this refactor lands:

- `InventorySyncBarrierSystem` (`ECS/Systems/InventorySyncBarrierSystem.cs`) — runs first in `BehaviorSystemGroup`, force-completes `InventorySlot` + `EquippedBag` writers via `state.EntityManager.CompleteDependencyBeforeRW<T>()` once per frame.
- Not a world barrier — scoped to those two types. Cost is the main-thread wait for the ~5-10 in-flight Economy writes, typically sub-millisecond.
- Delete it in step 5.

---

_Author: drafted during 2026-04-20 job-dispatcher refactor session, after repeated cross-system safety exceptions traced to the shared `InventorySlot` type._
