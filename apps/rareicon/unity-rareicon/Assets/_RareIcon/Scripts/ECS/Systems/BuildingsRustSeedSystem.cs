using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that drains every persisted UnloadedBuilding from the Rust SQLite store into <see cref="BuildingsDBSingleton.Unloaded"/>. Rust is the canonical persistence layer; the in-memory list is a session cache. Without this seed, restarting the app loses all unloaded buildings until the next chunk-unload re-snapshot. Runs once after BuildingsDBSingleton + WorldStoreSystem are both ready, then disables itself.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class BuildingsRustSeedSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<BuildingsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            var nativeWorld = WorldStoreSystem.Instance;
            if (nativeWorld == null || !nativeWorld.IsValid) return;

            uint total = nativeWorld.TotalBuildingCount();
            if (total == 0) { Enabled = false; return; }

            var dbRW = SystemAPI.GetSingletonRW<BuildingsDBSingleton>();
            ref var unloaded = ref dbRW.ValueRW.Unloaded;
            if (!unloaded.IsCreated) return;

            int needed = unloaded.Length + (int)total;
            if (unloaded.Capacity < needed) unloaded.Capacity = needed;

            var buf = new FfiUnloadedBuilding[total];
            uint drained = nativeWorld.TakeAllBuildings(buf);
            for (int i = 0; i < drained; i++)
            {
                var f = buf[i];
                unloaded.Add(new UnloadedBuildingRecord
                {
                    Type              = f.building_type,
                    RootHex           = new int2(f.root_q, f.root_r),
                    OwnerFaction      = f.owner_faction,
                    Health            = f.health,
                    HealthMax         = f.health_max,
                    Tier              = f.tier,
                    LastTickTurn      = f.last_tick_turn,
                    AccruedProduction = f.accrued_production,
                    AccruedInput      = f.accrued_input,
                    Flags             = f.flags,
                    RecipeCycleRemaining = f.recipe_cycle_remaining,
                    Slot0Id = f.slot0_id, Slot0Count = f.slot0_count,
                    Slot1Id = f.slot1_id, Slot1Count = f.slot1_count,
                    Slot2Id = f.slot2_id, Slot2Count = f.slot2_count,
                    Slot3Id = f.slot3_id, Slot3Count = f.slot3_count,
                });
            }

            Debug.Log($"[BuildingsRustSeed] seeded {drained}/{total} buildings from Rust SQLite store");
            Enabled = false;
        }
    }
}
