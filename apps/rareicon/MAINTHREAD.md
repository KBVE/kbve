# Main-thread audit — Rareicon DOTS

Inventory of where the Unity DOTS build does work on the main thread, plus a ranked list of consolidations. Scope: `apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/`.

There are ~30 `SystemBase` (managed, main-thread) systems and ~64 Bursted `ISystem` structs. Most `SystemBase` usage is justified — `UnityEngine.Object` allocation, `Shader.SetGlobal*`, one-shot init, input polling, UI messaging. A handful do per-frame entity iteration on the main thread that could move to jobs, and several Bursted systems chain jobs serially where one would do.

Each refactor below is kept isolated (single system, no architectural shifts), verifiable in play mode, and reversible if it regresses frame time.

---

## Tier 1 — Ship first (high ROI, low risk)

### 1A. Collapse `BuildingActiveVisualSystem` 5 jobs → 1 — **FUSE**

Path: [unity-rareicon/Assets/\_RareIcon/Scripts/ECS/Systems/BuildingActiveVisualSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/BuildingActiveVisualSystem.cs)

`OnUpdate` currently schedules five jobs chained through `state.Dependency`:

- `ResetBuildingActiveJob` → `BuildingActiveVisual = 0`
- `FurnaceActiveJob` → reads `FurnaceProduction`, writes `vis = 1` if active
- `PassiveProductionActiveJob` → reads `PassiveProduction`, writes `vis = 1`
- `ProductionRecipeActiveJob` → reads `ProductionRecipe` buffer, writes `vis = 1`
- `OutpostActiveJob` → reads `OutpostTag`+`EmpireConnected`, writes `vis = 1`

All five must serialize (same write target on overlapping entities). Collapse into one `IJobEntity` that iterates the `BuildingActiveVisual` archetype once and pulls the source components via `ComponentLookup<FurnaceProduction>`, `ComponentLookup<PassiveProduction>`, `BufferLookup<ProductionRecipe>`, `ComponentLookup<OutpostTag>`, `ComponentLookup<EmpireConnected>` to compute the final flag in a single pass.

Benefit: 5 job dispatches + 4 dependency barriers → 1. ~20-30 buildings iterated once instead of five partial passes. Every-frame hot path in `SimulationSystemGroup`.

### 1B. Parallelize `EquipmentVisualMirrorSystem` 3 serial → 3 concurrent — **PARALLEL**

Path: [unity-rareicon/Assets/\_RareIcon/Scripts/ECS/Systems/EquipmentVisualMirrorSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/EquipmentVisualMirrorSystem.cs)

`OnUpdate` calls three `ScheduleParallel()` in sequence without explicit dependency passing, so they chain through the default `state.Dependency`. The jobs write different components (`UnitWeaponVisual`, `UnitHelmetVisual`, `UnitShieldVisual`) with no overlap — they can run concurrently.

**Do not fuse** into one `IJobEntity` with all three `ref` params: the three visuals sit on different archetypes (goblin has weapon only; king has weapon+helmet; future soldier has weapon+shield), so a tripled-query would silently skip entities missing any one visual.

Fix: capture the base `Dependency`, schedule each with it independently, combine via `JobHandle.CombineDependencies`:

```csharp
var baseDep = state.Dependency;
var h1 = new MirrorWeaponVisualJob().ScheduleParallel(baseDep);
var h2 = new MirrorHelmetVisualJob().ScheduleParallel(baseDep);
var h3 = new MirrorShieldVisualJob().ScheduleParallel(baseDep);
state.Dependency = JobHandle.CombineDependencies(h1, h2, h3);
```

Benefit: three jobs run on worker threads simultaneously instead of serializing. Runs every frame in `CleanupSystemGroup`.

---

## Tier 2 — Medium ROI, small new surface

### 2A. `FactionCensusSystem` singleton — **SINGLETON_CACHE**

Two spawners do full-entity scans to count factions / unit types:

- [HostileSpawnerSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/HostileSpawnerSystem.cs) — `foreach (var f in Query<RefRO<Faction>>())` counting Hostile
- [ZombieNightSpawnSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/ZombieNightSpawnSystem.cs) — `foreach (var u in Query<RefRO<Unit>>())` counting Zombie

Both only fire every 8-12s, so cost is small today — but the pattern spreads (any future hostile-type spawner copy-pastes another scan). Add a small Bursted `FactionCensusSystem` (ISystem, `SimulationSystemGroup`, throttle to ~1 Hz) that writes a `FactionCensus` singleton:

```csharp
public struct FactionCensus : IComponentData
{
    public int Hostile, Player, Wildlife, Beast;
    public int Zombies, Bandits, Goblins; // by type — 256 bytes total
}
```

Both spawners replace the loop with `SystemAPI.GetSingleton<FactionCensus>()`. O(1) reads, single authoritative scan.

Benefit: one shared scan instead of N, and the cap logic becomes data-driven (trivially extendable to new unit types).

### 2B. Extract `RenderAssetRegistry` — **SHARED_UTIL** (optional)

[UnitSpawnSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/UnitSpawnSystem.cs) and [BuildingSpawnSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/BuildingSpawnSystem.cs) both keep static `_mesh` / `_material` / `_renderDesc` / `_renderArray` / `_renderAssetsReady` fields and lazily initialize them in an `EnsureRenderAssets()`-style method. Same pattern, two copies. One-shot cost so no perf win — just de-duplicate ~30 lines and give future art variants (hero materials, projectile materials) a cleaner pattern.

Skip unless you're already in that file.

---

## Tier 3 — Lower ROI, note-only

### 3A. `StatsRegenSystem` main-thread Burst → parallel jobs

[StatsRegenSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/StatsRegenSystem.cs) is already `[BurstCompile] ISystem` but runs three serial `foreach (var ... in SystemAPI.Query<...>())` loops on the main thread inside `OnUpdate`. With < 200 units this is faster than job dispatch overhead — keep as-is until a profiler frame shows it in the top 10.

Convert to three parallel `IJobEntity` (one per stat) only if unit count grows past ~500 or the regen bodies get heavier (status-effect modifiers, etc.).

### 3B. `JobSystem` offer-enumeration phase

[JobSystem.cs](unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/JobSystem.cs) uses `EntityManager` heavily to build offer lists across HexResources / ConstructionSite / Buildings / Caves, then scores per unit. Runs every 10 ticks. Could split offer-collection into a Burst pass, but:

- Main-thread cost is ~0.5ms every 10 ticks (estimate) — not a bottleneck.
- Refactor is large (managed `List<Offer>` → NativeList, per-type collectors), current code is readable.

Skip until the profiler shows it. Revisit if unit count jumps.

---

## Non-candidates (reviewed, keep as-is)

Legitimate main-thread:

- **Render-global**: `WorldClockSystem` (Shader.SetGlobal).
- **Render setup / one-shot init**: `UnitSpawnSystem`, `BuildingSpawnSystem`, `FarmInitSystem`, `BarracksInitSystem`, `FurnaceInitSystem`, `PlayerInitSystem`, `ItemDBBootstrapSystem`, `BloodDecalBootstrapSystem`, `ProjectileBootstrapSystem`, `ActivityFeedBootstrapSystem`, `RiverSpawnSystem`, `HexChunkSystem`, `OceanTrackCameraSystem`.
- **UI / message bridges**: `HexHoverSystem`, `BuildPreviewSystem`, `ControlledUnitCommandSystem`, `PossessSystem`, `MouseStateSystem`, `CapitalAttackAlertSystem`.
- **Managed service I/O**: `ActivityFeedWriterSystem`, `ActivityFeedDrainSystem`, `WorldStoreSystem`.

Heavy singleton readers (`WorldClock`, `HexLookupSingleton`) are fine — singleton reads are O(1), no cache layer needed.

---

## Verification recipe

For each refactor:

1. Open the Rareicon scene in the Unity editor, hit Play.
2. Watch the empire for one full day/night cycle (~6 min) — confirm:
    - **1A**: buildings still light up/dim — furnace smoke toggles with smelt cycles, farm/barracks glow during production, outposts glow when empire-connected.
    - **1B**: unit equipment still renders correctly — king keeps crown, garrison goblins keep crossbows, weapon swap updates the visual same frame.
    - **2A**: hostile waves still cap at 12; zombie waves still cap at 18.
3. DOTS Hierarchy → confirm no new errors/warnings on the modified systems.
4. Entities → Systems window → confirm job scheduling count dropped for collapsed systems (5 → 1 for `BuildingActiveVisualSystem`).
5. Profiler frame capture before + after on a scene with ~50 units + 10 buildings: compare `SimulationSystemGroup` and `CleanupSystemGroup` times.

No existing automated tests cover these systems. Manual playtest is the verification path.
