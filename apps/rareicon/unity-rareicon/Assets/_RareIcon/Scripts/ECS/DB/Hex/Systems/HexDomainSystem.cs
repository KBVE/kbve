using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Authoritative owner of <see cref="HexDBSingleton"/>. Allocates the
    /// coord→entity NativeHashMap + pending-request NativeList at
    /// OnCreate; drains pending mutations inside a Burst-compiled
    /// main-thread loop each tick.
    ///
    /// <para>Why main-thread-Burst instead of scheduled IJob: the drain
    /// work is O(pending.Length) with trivial per-op cost (HashMap set /
    /// remove / clear). Scheduling overhead + safety-handle juggling
    /// between the drain job and main-thread producers
    /// (HexChunkSystem.SpawnChunk) would cost more than the inline
    /// execution. Burst still optimises the loop.</para>
    ///
    /// <para>Readers (Burst jobs querying <c>HexDBSingleton.Lookup</c>)
    /// continue to run on worker threads — that's where the
    /// multi-threaded win actually lives. DOTS's atomic safety handle on
    /// the NativeHashMap auto-serialises reader jobs against the
    /// main-thread drain, so no manual sync points needed downstream.</para>
    ///
    /// <para>Runs <c>OrderFirst</c> in
    /// <see cref="InitializationSystemGroup"/> so all downstream groups
    /// this frame observe a freshly-applied index.</para>
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
            // DrainInline mutates db.Lookup / db.Pending / db.Events on the
            // main thread. Burst ISystem direct-call paths do NOT auto-sync
            // state.Dependency before inner-NativeContainer access, even
            // when GetSingletonRW registers write intent on the parent
            // component. Reader jobs scheduled last frame (e.g.
            // BuildingRepairJob with [ReadOnly] HexLookup) still hold the
            // NativeHashMap's safety handle until their JobHandle completes.
            // CompleteDependency flushes them synchronously so the drain is
            // race-free.
            state.CompleteDependency();
            var dbRW = SystemAPI.GetSingletonRW<HexDBSingleton>();
            ref var db = ref dbRW.ValueRW;
            if (!db.Pending.IsCreated || db.Pending.Length == 0) return;

            DrainInline(ref db.Lookup, ref db.Pending, ref db.Events);
        }

        [BurstCompile]
        static void DrainInline(
            ref NativeHashMap<int2, Entity> lookup,
            ref NativeList<HexIndexRequest> pending,
            ref NativeList<HexEvent>        events)
        {
            int n = pending.Length;
            for (int i = 0; i < n; i++)
            {
                var r = pending[i];
                switch (r.Op)
                {
                    case HexIndexOp.Add:
                        lookup[r.Coord] = r.Entity;
                        events.Add(new HexEvent
                        {
                            Kind = HexEventKind.Added,
                            Coord = r.Coord,
                            Entity = r.Entity,
                        });
                        break;
                    case HexIndexOp.Remove:
                        if (lookup.TryGetValue(r.Coord, out var prior))
                        {
                            lookup.Remove(r.Coord);
                            events.Add(new HexEvent
                            {
                                Kind = HexEventKind.Removed,
                                Coord = r.Coord,
                                Entity = prior,
                            });
                        }
                        break;
                    case HexIndexOp.Clear:
                        // Bulk reset — no per-entry events (subscribers
                        // resync from Lookup on the following frame).
                        lookup.Clear();
                        break;
                }
            }
            pending.Clear();
        }
    }
}
