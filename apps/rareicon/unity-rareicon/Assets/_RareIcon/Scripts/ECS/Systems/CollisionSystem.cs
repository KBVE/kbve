using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Projectile-vs-unit overlap pass; emits DamageEvent on hit and destroys the projectile. ECB plays back via EndSimulationEntityCommandBufferSystem so this system never stalls the main thread; DamageEvent resolves next frame.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpatialHashSystem))]
    public partial class CollisionSystem : SystemBase
    {
        protected override void OnCreate() => RequireForUpdate<Projectile>();

        protected override void OnUpdate()
        {
            var hashSys = World.GetExistingSystemManaged<SpatialHashSystem>();
            if (hashSys == null || !hashSys.Hash.IsCreated) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(World.Unmanaged);

            Dependency = new CollisionJob
            {
                Hash = hashSys.Hash,
                Ecb  = ecb.AsParallelWriter(),
            }.ScheduleParallel(Dependency);
        }
    }

    [BurstCompile]
    public partial struct CollisionJob : IJobEntity
    {
        [ReadOnly]
        public NativeParallelMultiHashMap<int, HashedTarget> Hash;

        public EntityCommandBuffer.ParallelWriter Ecb;

        const float ProjectileRadius = 0.12f;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in LocalTransform transform,
                     in Projectile projectile)
        {
            float2 pos = new float2(transform.Position.x, transform.Position.y);
            int cx = (int)math.floor(pos.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(pos.y / SpatialHashSystem.CellSize);

            for (int dx = -1; dx <= 1; dx++)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                    if (!Hash.TryGetFirstValue(key, out var target, out var it))
                        continue;

                    do
                    {
                        if (target.Faction == projectile.OwnerFaction) continue;

                        float reach = target.Radius + ProjectileRadius;
                        if (math.distancesq(pos, target.Position) < reach * reach)
                        {
                            var evt = Ecb.CreateEntity(chunkIdx);
                            Ecb.AddComponent(chunkIdx, evt, new DamageEvent
                            {
                                Target        = target.Entity,
                                Amount        = projectile.Damage,
                                Mod           = projectile.Mod,
                                SourceFaction = projectile.OwnerFaction,
                            });
                            Ecb.DestroyEntity(chunkIdx, entity);
                            return;
                        }
                    } while (Hash.TryGetNextValue(out target, ref it));
                }
            }
        }
    }
}
