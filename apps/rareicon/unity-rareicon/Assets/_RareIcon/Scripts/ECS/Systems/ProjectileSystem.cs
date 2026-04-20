using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>
    /// Advances every projectile's position along its velocity and ticks
    /// the lifetime down. Projectiles whose lifetime reaches zero are
    /// destroyed via the job's parallel command buffer.
    ///
    /// Burst-compiled `IJobEntity` — movement is embarrassingly parallel
    /// (each projectile reads only its own components) so the work scales
    /// linearly with thread count. 10k+ projectiles run comfortably.
    ///
    /// No collision yet — that lands as a separate pass (spatial hash
    /// over units, queried per-arrow) once ranged units start firing.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial struct ProjectileSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<Projectile>();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = new EntityCommandBuffer(Allocator.TempJob);

            new ProjectileTickJob
            {
                Dt  = SystemAPI.Time.DeltaTime,
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel();

            // Complete before playback so destroyed entities are removed
            // this frame — avoids a one-frame render of expired projectiles.
            state.CompleteDependency();
            ecb.Playback(state.EntityManager);
            ecb.Dispose();
        }
    }

    /// <summary>
    /// Per-projectile tick. Reads velocity, writes transform + lifetime,
    /// emits DestroyEntity on expiry. `in` on velocity tells Burst the
    /// field is read-only so chunks can be iterated without aliasing
    /// guards.
    /// </summary>
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
            if (projectile.Lifetime <= 0f)
            {
                Ecb.DestroyEntity(chunkIdx, entity);
            }
        }
    }
}
