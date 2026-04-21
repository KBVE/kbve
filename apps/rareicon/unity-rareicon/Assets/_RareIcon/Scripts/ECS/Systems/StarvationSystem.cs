using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains Health once Hunger has been at Max for longer than the grace period; tags DeadTag on fatal drain. Async ECB via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(ConsumeFoodExecutor))]
    public partial struct StarvationSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new StarvationJob
            {
                Dt            = SystemAPI.Time.DeltaTime,
                TimerLookup   = SystemAPI.GetComponentLookup<StarvationTimer>(false),
                DeadTagLookup = SystemAPI.GetComponentLookup<DeadTag>(true),
                Ecb           = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct StarvationJob : IJobEntity
    {
        const float GracePeriod = 3.0f;
        const float StarveDPS   = 2.0f;

        public float Dt;

        [NativeDisableParallelForRestriction] public ComponentLookup<StarvationTimer> TimerLookup;
        [Unity.Collections.ReadOnly]          public ComponentLookup<DeadTag>         DeadTagLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in Hunger hunger,
                     ref Health health)
        {
            bool starving = hunger.Max > 0f && hunger.Value >= hunger.Max;
            bool hasTimer = TimerLookup.HasComponent(entity);

            if (!starving)
            {
                if (hasTimer)
                {
                    var t = TimerLookup[entity];
                    if (t.TimeStarving != 0f)
                    {
                        t.TimeStarving = 0f;
                        TimerLookup[entity] = t;
                    }
                }
                return;
            }

            if (!hasTimer)
            {
                Ecb.AddComponent(chunkIdx, entity, new StarvationTimer { TimeStarving = Dt });
                return;
            }

            var timer = TimerLookup[entity];
            timer.TimeStarving += Dt;
            TimerLookup[entity] = timer;

            if (timer.TimeStarving <= GracePeriod) return;

            health.Value = math.max(0f, health.Value - StarveDPS * Dt);

            if (health.Value <= 0f && !DeadTagLookup.HasComponent(entity))
                Ecb.AddComponent<DeadTag>(chunkIdx, entity);
        }
    }
}
