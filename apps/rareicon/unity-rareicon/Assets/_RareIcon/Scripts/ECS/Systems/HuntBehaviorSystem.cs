using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Points every Hostile unit's MovementGoal at the player's Capital so they march on the base.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct HuntBehaviorSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            int2 capitalHex = default;
            bool hasCapital = false;
            foreach (var b in SystemAPI.Query<RefRO<Building>>())
            {
                if (b.ValueRO.Type == BuildingType.Capital)
                {
                    capitalHex = b.ValueRO.RootHex;
                    hasCapital = true;
                    break;
                }
            }
            if (!hasCapital) return;

            new HuntJob { TargetHex = capitalHex }.ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct HuntJob : IJobEntity
    {
        public int2 TargetHex;

        void Execute(in Faction faction, in UnitMovement m, ref MovementGoal goal)
        {
            if (faction.Value != FactionType.Hostile) return;
            if (goal.Priority > GoalPriority.Hunt) return;

            goal = new MovementGoal
            {
                Kind      = GoalKind.Hunt,
                Priority  = GoalPriority.Hunt,
                TargetHex = TargetHex,
            };
        }
    }
}
