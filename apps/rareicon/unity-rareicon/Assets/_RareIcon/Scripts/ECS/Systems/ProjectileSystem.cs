using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Advances projectile positions and ticks lifetime. On Arrow/Bolt expiry the entity converts in-place to a GroundArrow (strip Projectile + Velocity, add GroundArrow) so Looter-priority units can reclaim it; other projectile types just destroy.</summary>
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial class ProjectileSystem : SystemBase
    {
        const float GroundArrowLifetimeSec = 300f;

        protected override void OnCreate() => RequireForUpdate<Projectile>();

        protected override void OnUpdate()
        {
            float abs = 0f;
            if (SystemAPI.TryGetSingleton<WorldClock>(out var clock))
                abs = clock.AbsSeconds;

            var ecb = new EntityCommandBuffer(Allocator.TempJob);

            Dependency = new ProjectileTickJob
            {
                Dt     = SystemAPI.Time.DeltaTime,
                AbsNow = abs,
                GroundLifetime = GroundArrowLifetimeSec,
                Ecb    = ecb.AsParallelWriter(),
            }.ScheduleParallel(Dependency);

            Dependency.Complete();
            ecb.Playback(EntityManager);
            ecb.Dispose();
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
                // Convert in place — removes the moving-projectile components
                // so ProjectileSystem stops iterating this entity, but keeps
                // render + transform + visual properties so the sprite stays
                // where it landed.
                Ecb.RemoveComponent<Projectile>(chunkIdx, entity);
                Ecb.RemoveComponent<ProjectileVelocity>(chunkIdx, entity);
                Ecb.AddComponent(chunkIdx, entity, new GroundArrow
                {
                    SpawnedAtAbsSeconds = AbsNow,
                    DespawnAtAbsSeconds = AbsNow + GroundLifetime,
                });
                return;
            }

            Ecb.DestroyEntity(chunkIdx, entity);
        }
    }
}
