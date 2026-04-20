using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>
    /// Builds a 2D spatial hash over every Collidable unit each frame so
    /// CollisionSystem can answer "what's near this projectile?" in O(1)
    /// average instead of scanning every unit per arrow.
    ///
    /// Cell size is ~1 world unit (roughly 4 hexes). At that scale a
    /// projectile only has to probe its own cell + 8 neighbours to find
    /// any overlap candidate — 9 bucket lookups per arrow regardless of
    /// how many units exist. 10k arrows × 10k units becomes ≈ 90k bucket
    /// probes with a handful of candidates each, linear in either count.
    ///
    /// The hash is rebuilt from scratch every frame rather than
    /// maintained incrementally; incremental bookkeeping is fiddly and
    /// rebuild-from-Burst is already fast.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(UnitMovementSystem))]
    public partial class SpatialHashSystem : SystemBase
    {
        public const float CellSize = 1.0f;

        public NativeParallelMultiHashMap<int, HashedTarget> Hash;

        EntityQuery _query;

        protected override void OnCreate()
        {
            Hash = new NativeParallelMultiHashMap<int, HashedTarget>(
                1024, Allocator.Persistent);

            _query = GetEntityQuery(
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<Faction>(),
                ComponentType.ReadOnly<Collidable>());
            RequireForUpdate(_query);
        }

        protected override void OnDestroy()
        {
            if (Hash.IsCreated) Hash.Dispose();
        }

        protected override void OnUpdate()
        {
            // Pre-size the map so the parallel writer can never run out
            // of capacity mid-write (that would corrupt the bucket list).
            int count = _query.CalculateEntityCount();
            if (Hash.Capacity < count * 2)
                Hash.Capacity = count * 2;
            Hash.Clear();

            Dependency = new BuildHashJob
            {
                Writer = Hash.AsParallelWriter(),
            }.ScheduleParallel(Dependency);

            // Sync here — downstream consumers (CollisionSystem) read the
            // hash immediately. The sync cost is ~tenths of a millisecond
            // per thousand units; optimise to JobHandle-chaining if the
            // profile ever complains.
            Dependency.Complete();
        }

        // Cheap pair hash. Spreads int2 cell coords across an int space
        // without collisions for typical world sizes.
        public static int CellKey(int cx, int cy)
        {
            return (cx * 73856093) ^ (cy * 19349663);
        }

        public static int CellKey(float2 pos)
        {
            int cx = (int)math.floor(pos.x / CellSize);
            int cy = (int)math.floor(pos.y / CellSize);
            return CellKey(cx, cy);
        }
    }

    /// <summary>
    /// Per-unit hash insert. Runs in parallel across all Collidable
    /// entities — lock-free because NativeParallelMultiHashMap's parallel
    /// writer serialises via atomics on each bucket head.
    /// </summary>
    [BurstCompile]
    public partial struct BuildHashJob : IJobEntity
    {
        public NativeParallelMultiHashMap<int, HashedTarget>.ParallelWriter Writer;

        void Execute(Entity entity,
                     in LocalTransform transform,
                     in Faction faction,
                     in Collidable collidable)
        {
            float2 pos = new float2(transform.Position.x, transform.Position.y);
            int key = SpatialHashSystem.CellKey(pos);
            Writer.Add(key, new HashedTarget
            {
                Entity   = entity,
                Position = pos,
                Radius   = collidable.Radius,
                Faction  = faction.Value,
            });
        }
    }
}
