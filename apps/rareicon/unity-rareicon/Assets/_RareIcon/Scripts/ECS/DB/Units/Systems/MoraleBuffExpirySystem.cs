using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Strips <see cref="MoraleBuff"/> components once <see cref="WorldClock"/>.TurnIndex reaches the buff's <see cref="MoraleBuff.ExpiresAtTurn"/>. Parallel IJobEntity scans only buffed units; structural removals go through end-sim ECB ParallelWriter with [ChunkIndexInQuery] for deterministic playback order.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct MoraleBuffExpirySystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<MoraleBuff>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new ExpireMoraleBuffJob
            {
                Turn = turn,
                Ecb  = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ExpireMoraleBuffJob : IJobEntity
    {
        public uint                                Turn;
        public EntityCommandBuffer.ParallelWriter  Ecb;

        void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, in MoraleBuff buff)
        {
            if (Turn >= buff.ExpiresAtTurn)
                Ecb.RemoveComponent<MoraleBuff>(chunkIndex, entity);
        }
    }
}
