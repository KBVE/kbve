using Unity.Entities;
using UnityEngine;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that drains every persisted ghost unit from the Rust SQLite store into <see cref="UnitsDBSingleton.Unloaded"/>. Mirrors <see cref="BuildingsRustSeedSystem"/>; without this, restarts lose unit state from previously-unloaded chunks until the unit's chunk re-unloads.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class UnitsRustSeedSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<UnitsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            var nativeWorld = WorldStoreSystem.Instance;
            if (nativeWorld == null || !nativeWorld.IsValid) return;

            uint total = nativeWorld.TotalUnitCount();
            if (total == 0) { Enabled = false; return; }

            var dbRW = SystemAPI.GetSingletonRW<UnitsDBSingleton>();
            ref var unloaded = ref dbRW.ValueRW.Unloaded;
            if (!unloaded.IsCreated) return;

            int needed = unloaded.Length + (int)total;
            if (unloaded.Capacity < needed) unloaded.Capacity = needed;

            var buf = new FfiGhostUnit[total];
            uint drained = nativeWorld.TakeAllUnits(buf);
            for (int i = 0; i < drained; i++)
            {
                unloaded.Add(UnitColdStoreOps.FromFfi(buf[i]));
            }

            Debug.Log($"[UnitsRustSeed] seeded {drained}/{total} ghost units from Rust SQLite store");
            Enabled = false;
        }
    }
}
