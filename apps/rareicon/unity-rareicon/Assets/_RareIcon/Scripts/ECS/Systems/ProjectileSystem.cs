using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Advances projectiles and ticks lifetime. On Arrow/Bolt expiry converts in place to GroundArrow; other types destroy. ECB plays back via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial struct ProjectileSystem : ISystem
    {
        const float GroundArrowLifetimeSec = 300f;

        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<Projectile>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float abs = 0f;
            if (SystemAPI.TryGetSingleton<WorldClock>(out var clock))
                abs = clock.AbsSeconds;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new ProjectileTickJob
            {
                Dt             = SystemAPI.Time.DeltaTime,
                AbsNow         = abs,
                GroundLifetime = GroundArrowLifetimeSec,
                Ecb            = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ProjectileTickJob : IJobEntity
    {
        public float Dt;
        public float AbsNow;
        public float GroundLifetime;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref LocalTransform transform,
                     ref Projectile projectile,
                     in ProjectileVelocity velocity)
        {
            float3 pos = transform.Position;
            pos.x += velocity.Value.x * Dt;
            pos.y += velocity.Value.y * Dt;
            transform.Position = pos;

            projectile.Lifetime -= Dt;
            if (projectile.Lifetime > 0f) return;

            bool reclaimable = projectile.Type == ProjectileType.Arrow
                            || projectile.Type == ProjectileType.Bolt;

            if (reclaimable)
            {
                Ecb.RemoveComponent<Projectile>(chunkIdx, entity);
                Ecb.RemoveComponent<ProjectileVelocity>(chunkIdx, entity);
                Ecb.AddComponent(chunkIdx, entity, new GroundArrow
                {
                    SpawnedAtAbsSeconds = AbsNow,
                    DespawnAtAbsSeconds = AbsNow + GroundLifetime,
                    ClaimedBy           = Entity.Null,
                });
                return;
            }

            Ecb.DestroyEntity(chunkIdx, entity);
        }
    }
}
