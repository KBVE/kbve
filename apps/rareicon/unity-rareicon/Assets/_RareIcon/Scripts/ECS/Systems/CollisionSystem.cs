using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>
    /// Projectile-vs-unit collision pass. For every projectile, probes
    /// the spatial hash for candidates in the 9 surrounding cells,
    /// filters out same-faction targets, and emits a DamageEvent for
    /// any overlap. Projectile is destroyed on first hit.
    ///
    /// Uses a Burst-compiled IJobEntity scheduled in parallel so the
    /// scan distributes across all worker threads — the hot path is
    /// purely math on pre-hashed data with zero managed lookups.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(ProjectileSystem))]
    [UpdateAfter(typeof(SpatialHashSystem))]
    public partial class CollisionSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<Projectile>();
        }

        protected override void OnUpdate()
        {
            var hashSys = World.GetExistingSystemManaged<SpatialHashSystem>();
            if (hashSys == null || !hashSys.Hash.IsCreated) return;

            var ecb = new EntityCommandBuffer(Allocator.TempJob);

            Dependency = new CollisionJob
            {
                Hash = hashSys.Hash,
                Ecb  = ecb.AsParallelWriter(),
            }.ScheduleParallel(Dependency);

            // Sync before playback — damage events need to exist by the
            // time DamageSystem runs next in the group.
            Dependency.Complete();

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }

    /// <summary>
    /// Per-projectile overlap probe. Reads only its own projectile
    /// position + the hash (both read-only) and writes solely through
    /// the ECB, so all entity mutations are deferred to playback.
    /// </summary>
    [BurstCompile]
    public partial struct CollisionJob : IJobEntity
    {
        [ReadOnly]
        public NativeParallelMultiHashMap<int, HashedTarget> Hash;

        public EntityCommandBuffer.ParallelWriter Ecb;

        // Arrow / bolt physical radius. Unit radius comes from each
        // Collidable so big creatures can have bigger hitboxes.
        const float ProjectileRadius = 0.12f;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in LocalTransform transform,
                     in Projectile projectile)
        {
            float2 pos = new float2(transform.Position.x, transform.Position.y);
            int cx = (int)math.floor(pos.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(pos.y / SpatialHashSystem.CellSize);

            // 9-cell scan: self + all 8 neighbours. A projectile can
            // only overlap a target whose centre is within
            // (projR + targetR) world units, which is well below the
            // CellSize for our values, so 3×3 coverage is sufficient.
            for (int dx = -1; dx <= 1; dx++)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                    if (!Hash.TryGetFirstValue(key, out var target, out var it))
                        continue;

                    do
                    {
                        // Faction filter — no friendly fire.
                        if (target.Faction == projectile.OwnerFaction) continue;

                        float reach = target.Radius + ProjectileRadius;
                        if (math.distancesq(pos, target.Position) < reach * reach)
                        {
                            // Hit — emit damage event, kill projectile.
                            var evt = Ecb.CreateEntity(chunkIdx);
                            Ecb.AddComponent(chunkIdx, evt, new DamageEvent
                            {
                                Target        = target.Entity,
                                Amount        = projectile.Damage,
                                Mod           = projectile.Mod,
                                SourceFaction = projectile.OwnerFaction,
                            });
                            Ecb.DestroyEntity(chunkIdx, entity);
                            return;  // one hit per projectile
                        }
                    } while (Hash.TryGetNextValue(out target, ref it));
                }
            }
        }
    }
}
