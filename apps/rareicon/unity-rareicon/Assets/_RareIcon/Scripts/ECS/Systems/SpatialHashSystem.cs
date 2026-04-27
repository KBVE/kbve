using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Rebuilds a 2D spatial hash of all Collidable units each frame for O(1) "who's nearby" queries.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    public partial class SpatialHashSystem : SystemBase
    {
        public const float CellSize = 1.0f;

        public NativeParallelMultiHashMap<int, HashedTarget> Hash;

        EntityQuery _query;

        protected override void OnCreate()
        {
            Hash = new NativeParallelMultiHashMap<int, HashedTarget>(
                1024, Allocator.Persistent);

            _query = GetEntityQuery(new EntityQueryDesc
            {
                All = new[]
                {
                    ComponentType.ReadOnly<LocalTransform>(),
                    ComponentType.ReadOnly<Faction>(),
                    ComponentType.ReadOnly<Collidable>(),
                },
                None = new[] { ComponentType.ReadOnly<ShelteredInside>() },
            });
            RequireForUpdate(_query);

            // Publish a singleton mirror so Burst-compiled ISystems can read
            // the hash via SystemAPI.GetSingleton — state.World is managed
            // and unreachable from Burst.
            var singleton = EntityManager.CreateEntity(typeof(SpatialHashSingleton));
            EntityManager.SetComponentData(singleton, new SpatialHashSingleton { Hash = Hash });
        }

        protected override void OnDestroy()
        {
            if (Hash.IsCreated) Hash.Dispose();
        }

        protected override void OnUpdate()
        {
            int count = _query.CalculateEntityCount();

            Dependency = new ResetHashJob
            {
                Hash       = Hash,
                NewCapacity = count * 2,
            }.Schedule(Dependency);

            Dependency = new BuildHashJob
            {
                Writer = Hash.AsParallelWriter(),
            }.ScheduleParallel(Dependency);

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

    /// <summary>Singleton mirror of SpatialHashSystem.Hash; Burst ISystems read this via SystemAPI.GetSingleton since state.World is not Burst-accessible.</summary>
    public struct SpatialHashSingleton : IComponentData
    {
        public NativeParallelMultiHashMap<int, HashedTarget> Hash;
    }

    /// <summary>Single-thread Burst clear + capacity grow. Scheduling through state.Dependency forces the framework to chain on every prior reader of the hash via its safety handle, eliminating the main-thread race against last-frame's UnitBehaviorJob.</summary>
    [BurstCompile]
    struct ResetHashJob : IJob
    {
        public NativeParallelMultiHashMap<int, HashedTarget> Hash;
        public int NewCapacity;

        public void Execute()
        {
            if (Hash.Capacity < NewCapacity) Hash.Capacity = NewCapacity;
            Hash.Clear();
        }
    }

    /// <summary>Per-unit hash insert. Runs in parallel across all Collidable entities — lock-free because NativeParallelMultiHashMap's parallel writer serialises via atomics on each bucket head.</summary>
    [BurstCompile]
    [WithNone(typeof(ShelteredInside))]
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
