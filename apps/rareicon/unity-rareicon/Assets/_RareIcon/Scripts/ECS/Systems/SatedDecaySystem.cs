using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Counts down Sated.SecondsRemaining each tick and removes the component on expiry. Burst ISystem, ScheduleParallel — each unit's Sated is private, no cross-entity contention.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct SatedDecaySystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new SatedDecayJob
            {
                Dt  = SystemAPI.Time.DeltaTime,
                Ecb = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct SatedDecayJob : IJobEntity
    {
        public float Dt;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute([ChunkIndexInQuery] int chunkIdx, Entity entity, ref Sated sated)
        {
            sated.SecondsRemaining -= Dt;
            if (sated.SecondsRemaining <= 0f)
                Ecb.RemoveComponent<Sated>(chunkIdx, entity);
        }
    }
}
