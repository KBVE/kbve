using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Authoritative owner of <see cref="HexDBSingleton"/>. Allocates the
    /// coord→entity NativeHashMap + pending-request NativeList at
    /// OnCreate; schedules a Burst <see cref="DrainHexDBJob"/> each tick
    /// that applies pending mutations on a worker thread.
    ///
    /// <para>The drain runs as a scheduled IJob (not main-thread inline)
    /// so the framework chains it through <c>state.Dependency</c>. Reader
    /// jobs from the previous frame (BuildingRepairJob, ShelterJob, every
    /// other system that fetched <see cref="HexDBSingleton"/>) wait on
    /// the prior frame's drain handle automatically; the drain in turn
    /// waits on those readers via the same dependency graph. No manual
    /// <c>CompleteDependency</c> sync point, no main-thread stall.</para>
    ///
    /// <para>Producers calling <see cref="HexDB.EnqueueAdd"/> /
    /// <see cref="HexDB.EnqueueRemove"/> from the main thread go through
    /// <c>EntityManager.GetComponentData&lt;HexDBSingleton&gt;</c>, which
    /// auto-syncs against pending writers (the drain). Producers wait
    /// for the drain transparently, while the drain runs in parallel
    /// with any other Initialization-group work.</para>
    ///
    /// <para>Runs <c>OrderFirst</c> in
    /// <see cref="InitializationSystemGroup"/> so the first scheduled
    /// drain handle is in place before any later system this frame
    /// reads <see cref="HexDBSingleton.Lookup"/>.</para>
    /// </summary>
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
                Lookup  = new NativeHashMap<int2, Entity>(InitialLookupCapacity, Allocator.Persistent),
                Pending = new NativeList<HexIndexRequest>(InitialPendingCapacity, Allocator.Persistent),
                Events  = new NativeList<HexEvent>(InitialEventsCapacity, Allocator.Persistent),
            };
            var e = state.EntityManager.CreateEntity(typeof(HexDBSingleton));
            state.EntityManager.SetComponentData(e, singleton);
            state.EntityManager.SetName(e, "HexDBSingleton");
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<HexDBSingleton>()) return;
            var db = SystemAPI.GetSingleton<HexDBSingleton>();
            if (db.Lookup.IsCreated)  db.Lookup.Dispose();
            if (db.Pending.IsCreated) db.Pending.Dispose();
            if (db.Events.IsCreated)  db.Events.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var dbRW = SystemAPI.GetSingletonRW<HexDBSingleton>();
            ref var db = ref dbRW.ValueRW;
            if (!db.Pending.IsCreated || db.Pending.Length == 0) return;

            state.Dependency = new DrainHexDBJob
            {
                Lookup  = db.Lookup,
                Pending = db.Pending,
                Events  = db.Events,
            }.Schedule(state.Dependency);
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
                        // Bulk reset, no per-entry events (subscribers
                        // resync from Lookup on the following frame).
                        Lookup.Clear();
                        break;
                }
            }
            Pending.Clear();
        }
    }
}
