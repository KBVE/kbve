using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial struct HexDomainSystem : ISystem
    {
        const int InitialLookupCapacity  = 8192;
        const int InitialPendingCapacity = 256;
        const int InitialEventsCapacity  = 256;

        public void OnCreate(ref SystemState state)
        {
            if (SystemAPI.HasSingleton<HexDBSingleton>()) return;

            var singleton = new HexDBSingleton
            {
                Lookup      = new NativeHashMap<int2, Entity>(InitialLookupCapacity, Allocator.Persistent),
                Pending     = new NativeList<HexIndexRequest>(InitialPendingCapacity, Allocator.Persistent),
                Events      = new NativeList<HexEvent>(InitialEventsCapacity, Allocator.Persistent),
                DrainHandle = default,
            };
            var e = state.EntityManager.CreateEntity(typeof(HexDBSingleton));
            state.EntityManager.SetComponentData(e, singleton);
            state.EntityManager.SetName(e, "HexDBSingleton");
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<HexDBSingleton>()) return;
            var db = SystemAPI.GetSingleton<HexDBSingleton>();
            db.DrainHandle.Complete();
            if (db.Lookup.IsCreated)  db.Lookup.Dispose();
            if (db.Pending.IsCreated) db.Pending.Dispose();
            if (db.Events.IsCreated)  db.Events.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var dbRW = SystemAPI.GetSingletonRW<HexDBSingleton>();
            ref var db = ref dbRW.ValueRW;
            if (!db.Pending.IsCreated || db.Pending.Length == 0)
            {
                db.DrainHandle = state.Dependency;
                return;
            }

            var deps = JobHandle.CombineDependencies(state.Dependency, db.DrainHandle);
            var handle = new DrainHexDBJob
            {
                Lookup  = db.Lookup,
                Pending = db.Pending,
                Events  = db.Events,
            }.Schedule(deps);

            db.DrainHandle  = handle;
            state.Dependency = handle;
        }
    }

    [BurstCompile]
    struct DrainHexDBJob : IJob
    {
        public NativeHashMap<int2, Entity> Lookup;
        public NativeList<HexIndexRequest> Pending;
        public NativeList<HexEvent>        Events;

        public void Execute()
        {
            int n = Pending.Length;
            for (int i = 0; i < n; i++)
            {
                var r = Pending[i];
                switch (r.Op)
                {
                    case HexIndexOp.Add:
                        Lookup[r.Coord] = r.Entity;
                        Events.Add(new HexEvent
                        {
                            Kind = HexEventKind.Added,
                            Coord = r.Coord,
                            Entity = r.Entity,
                        });
                        break;
                    case HexIndexOp.Remove:
                        if (Lookup.TryGetValue(r.Coord, out var prior))
                        {
                            Lookup.Remove(r.Coord);
                            Events.Add(new HexEvent
                            {
                                Kind = HexEventKind.Removed,
                                Coord = r.Coord,
                                Entity = prior,
                            });
                        }
                        break;
                    case HexIndexOp.Clear:
                        Lookup.Clear();
                        break;
                }
            }
            Pending.Clear();
        }
    }
}
