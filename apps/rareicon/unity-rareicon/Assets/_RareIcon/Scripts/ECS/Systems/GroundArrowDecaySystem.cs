using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Destroys GroundArrow entities once WorldClock.AbsSeconds passes their DespawnAtAbsSeconds; Looter pickups remove them earlier. Destroys defer to EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct GroundArrowDecaySystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<GroundArrow>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new GroundArrowDecayJob
            {
                AbsNow = SystemAPI.GetSingleton<WorldClock>().AbsSeconds,
                Ecb    = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct GroundArrowDecayJob : IJobEntity
    {
        public float AbsNow;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx, in GroundArrow arrow)
        {
            if (AbsNow >= arrow.DespawnAtAbsSeconds)
                Ecb.DestroyEntity(chunkIdx, entity);
        }
    }
}
