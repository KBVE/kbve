using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Passive accumulators for Hunger + Fatigue; Fatigue pauses while SleepingTag is present.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(ReliefSystem))]
    public partial struct NeedAccumulationSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;

            new HungerTickJob   { Dt = dt }.ScheduleParallel();
            new FatigueTickJob  { Dt = dt }.ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct HungerTickJob : IJobEntity
    {
        public float Dt;

        void Execute(ref Hunger hunger)
        {
            hunger.Value = math.min(hunger.Max, hunger.Value + hunger.PerSecond * Dt);
        }
    }

    [BurstCompile]
    [WithNone(typeof(SleepingTag))]
    public partial struct FatigueTickJob : IJobEntity
    {
        public float Dt;

        void Execute(ref Fatigue fatigue)
        {
            fatigue.Value = math.min(fatigue.Max, fatigue.Value + fatigue.PerSecond * Dt);
        }
    }
}
