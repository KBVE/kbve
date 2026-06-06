using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Rebuilds a 2D spatial hash of all Collidable units for O(1) "who's nearby" queries. Double-buffered: each frame, readers consume the previously-built buffer (singleton's <see cref="SpatialHashSingleton.Hash"/> always points to the just-completed buffer) while a fresh build runs async into the back buffer. The previous frame's build handle is Complete()'d at the start of the next frame's OnUpdate before the swap, so readers always see fully-built data without paying the build cost on their critical path. Cost: one frame of staleness — units appear lagged by a single tick to combat / threat scan / click router, invisible at 30Hz tick. Frees the main thread from waiting on BuildHashJob in the same frame it's scheduled. Safe to ship after MeleeAttackSystem's main-thread <c>ComponentLookup&lt;LocalTransform&gt;</c> staging was moved into a Burst <c>IJob</c> — the prior single-buffer Complete was implicitly syncing that latent race; see <c>feedback_burst_isystem_lookup_sync.md</c> for the audit pattern.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    public partial class SpatialHashSystem : SystemBase
    {
        public const float CellSize = 1.0f;

        NativeParallelMultiHashMap<int, HashedTarget> _hashA;
        NativeParallelMultiHashMap<int, HashedTarget> _hashB;
        bool _readIsA;
        bool _primed;

        /// <summary>Currently-published read buffer (last frame's build, fully completed). Exposed for legacy direct readers; new code should go through <see cref="SpatialHashSingleton"/>.</summary>
        public NativeParallelMultiHashMap<int, HashedTarget> Hash => _readIsA ? _hashA : _hashB;

        JobHandle _writeHandle;
        EntityQuery _query;

        protected override void OnCreate()
        {
            _hashA = new NativeParallelMultiHashMap<int, HashedTarget>(1024, Allocator.Persistent);
            _hashB = new NativeParallelMultiHashMap<int, HashedTarget>(1024, Allocator.Persistent);
            _readIsA = true;

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

            var singleton = EntityManager.CreateEntity(typeof(SpatialHashSingleton));
            EntityManager.SetComponentData(singleton, new SpatialHashSingleton
            {
                Hash        = _hashA,
                WriteHandle = default,
            });
        }

        protected override void OnDestroy()
        {
            _writeHandle.Complete();
            if (_hashA.IsCreated) _hashA.Dispose();
            if (_hashB.IsCreated) _hashB.Dispose();
        }

        protected override void OnUpdate()
        {
            int count = _query.CalculateEntityCount();

            if (!_primed)
            {

                Dependency = new ResetHashJob
                {
                    Hash       = _hashA,
                    NewCapacity = count * 2,
                }.Schedule(Dependency);
                Dependency = new BuildHashJob
                {
                    Writer = _hashA.AsParallelWriter(),
                }.ScheduleParallel(Dependency);
                Dependency.Complete();

                _readIsA = true;
                SystemAPI.SetSingleton(new SpatialHashSingleton
                {
                    Hash        = _hashA,
                    WriteHandle = default,
                });

                Dependency = new ResetHashJob
                {
                    Hash       = _hashB,
                    NewCapacity = count * 2,
                }.Schedule(Dependency);
                Dependency = new BuildHashJob
                {
                    Writer = _hashB.AsParallelWriter(),
                }.ScheduleParallel(Dependency);
                _writeHandle = Dependency;
                _primed = true;
                return;
            }

            _writeHandle.Complete();
            _readIsA = !_readIsA;

            var readBuf  = _readIsA ? _hashA : _hashB;
            var writeBuf = _readIsA ? _hashB : _hashA;

            SystemAPI.SetSingleton(new SpatialHashSingleton
            {
                Hash        = readBuf,
                WriteHandle = default,
            });

            Dependency = new ResetHashJob
            {
                Hash       = writeBuf,
                NewCapacity = count * 2,
            }.Schedule(Dependency);

            Dependency = new BuildHashJob
            {
                Writer = writeBuf.AsParallelWriter(),
            }.ScheduleParallel(Dependency);

            _writeHandle = Dependency;
        }

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

    /// <summary>Singleton mirror of SpatialHashSystem.Hash; Burst ISystems read this via SystemAPI.GetSingleton since state.World is not Burst-accessible. <see cref="WriteHandle"/> tracks the in-flight ResetHash + BuildHash chain so any main-thread reader (managed code, click router, hover probe consumers) can <c>Complete()</c> it before iterating without going through <c>state.Dependency</c>. Burst job readers automatically chain through the <see cref="Hash"/> NativeContainer safety system and don't need to touch the handle.</summary>
    public struct SpatialHashSingleton : IComponentData
    {
        public NativeParallelMultiHashMap<int, HashedTarget> Hash;
        public Unity.Jobs.JobHandle WriteHandle;
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
