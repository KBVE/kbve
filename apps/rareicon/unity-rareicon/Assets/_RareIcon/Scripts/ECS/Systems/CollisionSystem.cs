using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Projectile-vs-unit overlap pass; emits DamageEvent on hit and destroys the projectile. ECB plays back via EndSimulationEntityCommandBufferSystem so this system never stalls the main thread; DamageEvent resolves next frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpatialHashSystem))]
    public partial struct CollisionSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<Projectile>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial)) return;
            if (!spatial.Hash.IsCreated) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new CollisionJob
            {
                Hash = spatial.Hash,
                Ecb  = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
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
                        if (target.Faction == FactionType.Neutral) continue;

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
