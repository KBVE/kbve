using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Translates JobIntent into a MovementGoal at Harvest priority; Wander and Relief still override / are overridden by priority ordering.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    public partial struct JobMovementExecutor : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            new JobMovementJob().ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct JobMovementJob : IJobEntity
    {
        void Execute(in JobIntent intent, in UnitMovement movement, ref MovementGoal goal)
        {
            if (intent.Kind == JobKind.None)
            {
                if (goal.Kind == GoalKind.MoveToHex && goal.Priority == GoalPriority.Harvest)
                {
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.None,
                        Priority  = GoalPriority.None,
                        TargetHex = movement.CurrentHex,
                    };
                }
                return;
            }

            if (goal.Priority > GoalPriority.Harvest) return;

            goal = new MovementGoal
            {
                Kind      = GoalKind.MoveToHex,
                Priority  = GoalPriority.Harvest,
                TargetHex = intent.TargetHex,
            };
        }
    }
}
