using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Producer-side API for the hex coord → entity index. Call <see cref="EnqueueAdd"/> / <see cref="EnqueueRemove"/> from any system whose hot path generates or destroys hex tiles; <see cref="HexDomainSystem"/> applies the change inside its per-tick Burst drain job, keeping writes off the main thread's critical path. All calls are safe to batch inline with EntityManager.CreateEntity / DestroyEntity from a SystemBase since we only touch <c>NativeList.Add</c> here.</summary>
    public static class HexDB
    {
        /// <summary>Resolves the HexDBSingleton from the given world. Returns false if the domain system hasn't booted yet — treat as "drop this request" on the caller side, because there is nothing for the lookup to index until HexDomainSystem.OnCreate runs.</summary>
        static bool TryGet(World world, out HexDBSingleton db, out Entity e)
        {
            db = default;
            e = Entity.Null;
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadWrite<HexDBSingleton>());
            if (q.CalculateEntityCount() == 0) return false;
            e  = q.GetSingletonEntity();
            db = em.GetComponentData<HexDBSingleton>(e);
            return true;
        }

        public static void EnqueueAdd(World world, int2 coord, Entity entity)
        {
            if (!TryGet(world, out var db, out _)) return;
            if (!db.Pending.IsCreated) return;
            db.Pending.Add(new HexIndexRequest { Coord = coord, Entity = entity, Op = HexIndexOp.Add });
        }

        public static void EnqueueRemove(World world, int2 coord)
        {
            if (!TryGet(world, out var db, out _)) return;
            if (!db.Pending.IsCreated) return;
            db.Pending.Add(new HexIndexRequest { Coord = coord, Entity = Entity.Null, Op = HexIndexOp.Remove });
        }

        public static void EnqueueClear(World world)
        {
            if (!TryGet(world, out var db, out _)) return;
            if (!db.Pending.IsCreated) return;
            db.Pending.Add(new HexIndexRequest { Coord = default, Entity = Entity.Null, Op = HexIndexOp.Clear });
        }

        /// <summary>Read-side helper for managed main-thread queries (UI hover, click resolution). Burst consumers should inline the singleton read via SystemAPI.GetSingleton so dependency tracking covers the access.</summary>
        public static bool TryGetEntity(World world, int2 coord, out Entity entity)
        {
            entity = Entity.Null;
            if (!TryGet(world, out var db, out _)) return false;
            if (!db.Lookup.IsCreated) return false;
            return db.Lookup.TryGetValue(coord, out entity);
        }
    }
}
