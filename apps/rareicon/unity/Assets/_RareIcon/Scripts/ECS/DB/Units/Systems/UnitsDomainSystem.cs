using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    [UpdateAfter(typeof(HexDomainSystem))]
    public partial struct UnitsDomainSystem : ISystem
    {
        const int InitialEventsCapacity   = 256;
        const int InitialUnloadedCapacity = 256;

        public void OnCreate(ref SystemState state)
        {
            if (SystemAPI.HasSingleton<UnitsDBSingleton>()) return;

            var singleton = new UnitsDBSingleton
            {
                Events            = new NativeList<UnitEvent>(InitialEventsCapacity, Allocator.Persistent),
                Unloaded          = new NativeList<UnloadedUnitRecord>(InitialUnloadedCapacity, Allocator.Persistent),
                EventsWriteHandle = default,
            };
            var e = state.EntityManager.CreateEntity(typeof(UnitsDBSingleton));
            state.EntityManager.SetComponentData(e, singleton);
            state.EntityManager.SetName(e, "UnitsDBSingleton");
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<UnitsDBSingleton>()) return;
            var db = SystemAPI.GetSingleton<UnitsDBSingleton>();
            db.EventsWriteHandle.Complete();
            if (db.Events.IsCreated)   db.Events.Dispose();
            if (db.Unloaded.IsCreated) db.Unloaded.Dispose();
        }

        public void OnUpdate(ref SystemState state) { }
    }
}
