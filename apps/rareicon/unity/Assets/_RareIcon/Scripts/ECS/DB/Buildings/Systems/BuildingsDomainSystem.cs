using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Authoritative owner of <see cref="BuildingsDBSingleton"/>. Allocates
    /// the event buffer + (Phase 4) unloaded-chunk registry at OnCreate,
    /// disposes at OnDestroy, and runs OrderFirst in
    /// <see cref="InitializationSystemGroup"/> so downstream readers observe
    /// a well-initialized singleton before any gameplay system fires.
    ///
    /// Today the body is a no-op — events are produced mid-frame by
    /// per-type systems + drained at Presentation by
    /// <see cref="BuildingsBridgeSystem"/>. When Phase 4 ghost-sim lands,
    /// scheduling the per-tick <c>BuildingsGhostSimSystem</c> kick
    /// happens here (OnUpdate chains into the unloaded-registry advance
    /// job).
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial struct BuildingsDomainSystem : ISystem
    {
        const int InitialEventsCapacity   = 128;
        const int InitialUnloadedCapacity = 64;
        const int EventsHeadroomPerEntity = 2;
        const int EventsHeadroomFloor     = 64;

        EntityQuery _buildingQuery;

        public void OnCreate(ref SystemState state)
        {
            _buildingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Building>()
                .Build(ref state);

            if (SystemAPI.HasSingleton<BuildingsDBSingleton>()) return;

            var singleton = new BuildingsDBSingleton
            {
                Events   = new NativeList<BuildingEvent>(InitialEventsCapacity, Allocator.Persistent),
                Unloaded = new NativeList<UnloadedBuildingRecord>(InitialUnloadedCapacity, Allocator.Persistent),
            };
            var e = state.EntityManager.CreateEntity(typeof(BuildingsDBSingleton));
            state.EntityManager.SetComponentData(e, singleton);
            state.EntityManager.SetName(e, "BuildingsDBSingleton");
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<BuildingsDBSingleton>()) return;
            var db = SystemAPI.GetSingleton<BuildingsDBSingleton>();
            if (db.Events.IsCreated)   db.Events.Dispose();
            if (db.Unloaded.IsCreated) db.Unloaded.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<BuildingsDBSingleton>().ValueRW;
            if (!db.Events.IsCreated) return;

            int liveBuildings = _buildingQuery.CalculateEntityCount();
            int needed = db.Events.Length + liveBuildings * EventsHeadroomPerEntity + EventsHeadroomFloor;
            if (db.Events.Capacity < needed) db.Events.Capacity = needed;
        }
    }
}
