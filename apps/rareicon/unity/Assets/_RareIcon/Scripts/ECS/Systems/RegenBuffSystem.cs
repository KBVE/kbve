using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Ticks active RegenBuff components: restores Health.Value by AmountPerSecond * dt each frame, clamps at Health.Max, removes the component via the end-sim ECB ParallelWriter when TimeRemaining ≤ 0. Runs in BehaviorSystemGroup after ReliefSystem so consumption-side systems (Medkit, food-at-Barracks) have already added/refreshed the buff this frame. Parallel IJobEntity replaces the prior main-thread foreach.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    public partial struct RegenBuffSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<EndSimulationEntityCommandBufferSystem.Singleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            if (dt <= 0f) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new RegenBuffTickJob
            {
                Dt  = dt,
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct RegenBuffTickJob : IJobEntity
    {
        public float                                  Dt;
        public EntityCommandBuffer.ParallelWriter     Ecb;

        void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, ref RegenBuff buff, ref Health health)
        {
            buff.TimeRemaining -= Dt;
            health.Value = math.min(health.Max, health.Value + buff.AmountPerSecond * Dt);

            if (buff.TimeRemaining <= 0f)
                Ecb.RemoveComponent<RegenBuff>(chunkIndex, entity);
        }
    }
}
