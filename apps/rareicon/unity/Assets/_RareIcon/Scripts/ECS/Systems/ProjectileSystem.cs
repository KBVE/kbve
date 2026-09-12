using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Advances projectiles; destroys all types on lifetime expiry.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial struct ProjectileSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<Projectile>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new ProjectileTickJob
            {
                Dt  = SystemAPI.Time.DeltaTime,
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ProjectileTickJob : IJobEntity
    {
        public float Dt;
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

            Ecb.DestroyEntity(chunkIdx, entity);
        }
    }
}
