using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>Per-tick safety net for units whose CurrentHex drifts into an unloaded chunk between full chunk-unload sweeps. <see cref="HexChunkSystem.DespawnChunk"/> already evicts everyone in a chunk that just unloaded; this system catches the residual case where a wandering / patrolling unit walks across a chunk seam into an already-unloaded neighbour. Hex absence from <see cref="HexDBSingleton.Lookup"/> is the proxy for "chunk not loaded" — every loaded chunk's hexes live in the index. Cadence: every 2 seconds; cheap O(N_units) main-thread scan.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderLast = true)]
    public partial class UnitBoundaryEvictSystem : SystemBase
    {
        const float ScanIntervalSecs = 2f;
        float _accum;

        EntityQuery _unitQuery;

        protected override void OnCreate()
        {
            _unitQuery = GetEntityQuery(typeof(Unit), typeof(UnitMovement));
            RequireForUpdate<HexDBSingleton>();
        }

        protected override void OnUpdate()
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < ScanIntervalSecs) return;
            _accum = 0f;

            HexChunkSystem chunkSys = World.GetExistingSystemManaged<HexChunkSystem>();
            if (chunkSys == null) return;

            bool hasUnitsDb = SystemAPI.HasSingleton<UnitsDBSingleton>();
            NativeList<UnloadedUnitRecord> unloaded = default;
            if (hasUnitsDb)
                unloaded = SystemAPI.GetSingletonRW<UnitsDBSingleton>().ValueRW.Unloaded;

            var nativeWorld = WorldStoreSystem.Instance;
            bool canSave = nativeWorld != null && nativeWorld.IsValid;

            float nowSecs = SystemAPI.HasSingleton<WorldClock>()
                ? SystemAPI.GetSingleton<WorldClock>().AbsSeconds
                : 0f;

            var em = EntityManager;
            using var arr = _unitQuery.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var entity = arr[i];
                if (!em.HasComponent<UnitMovement>(entity)) continue;
                var hex = em.GetComponentData<UnitMovement>(entity).CurrentHex;
                if (chunkSys.IsHexLoaded(hex)) continue;

                var rec = UnitColdStoreOps.Snapshot(em, entity, nowSecs);
                if (hasUnitsDb && unloaded.IsCreated) unloaded.Add(rec);
                if (canSave) nativeWorld.SaveUnit(UnitColdStoreOps.ToFfi(rec));
                em.DestroyEntity(entity);
            }
        }
    }
}
