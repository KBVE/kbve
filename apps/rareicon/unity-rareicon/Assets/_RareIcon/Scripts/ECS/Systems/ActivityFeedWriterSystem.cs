using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-tick activity classifier for Player units. Walks the (ReliefIntent → JobIntent → MovementGoal) chain, derives an ActivityKind, and pushes a delta-only snapshot straight into ActivityFeedService. Main-thread SystemBase — player-unit counts (16-200) make the managed path free, and it sidesteps the UnsafeRingQueue cross-copy hazard the previous ring-queue design hit.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobMovementExecutor))]
    [UpdateAfter(typeof(WanderBehaviorSystem))]
    [UpdateAfter(typeof(ReturnToBaseSystem))]
    public partial class ActivityFeedWriterSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var service = ActivityFeedBridge.Source;
            if (service == null) return;

            foreach (var (stateRW, jobIntent, reliefIntent, goal, movement, entity) in
                     SystemAPI.Query<
                         RefRW<ActivityState>,
                         RefRO<JobIntent>,
                         RefRO<ReliefIntent>,
                         RefRO<MovementGoal>,
                         RefRO<UnitMovement>>()
                              .WithAll<JobPriorities>()
                              .WithEntityAccess())
            {
                byte kind = Classify(
                    reliefIntent.ValueRO,
                    jobIntent.ValueRO,
                    goal.ValueRO,
                    movement.ValueRO.CurrentHex);

                if (kind == stateRW.ValueRO.LastKind) continue;
                stateRW.ValueRW.LastKind = kind;

                int2 targetHex = jobIntent.ValueRO.TargetHex;
                if (math.all(targetHex == int2.zero) && goal.ValueRO.Kind != GoalKind.None)
                    targetHex = goal.ValueRO.TargetHex;

                service.Push(new ActivitySnapshot
                {
                    Entity       = entity,
                    Kind         = kind,
                    TargetHex    = targetHex,
                    TargetItemId = 0,
                });
            }
        }

        static byte Classify(in ReliefIntent relief, in JobIntent job, in MovementGoal goal, int2 currentHex)
        {
            switch (relief.Kind)
            {
                case ReliefKind.Eat:             return ActivityKind.Eating;
                case ReliefKind.Sleep:           return ActivityKind.Sleeping;
                case ReliefKind.Heal:            return ActivityKind.Healing;
                case ReliefKind.ReturnToCapital: return ActivityKind.ReturningToBase;
                case ReliefKind.SeekAid:         return ActivityKind.SeekingAid;
            }

            if (job.Kind != JobKind.None && !math.all(job.TargetHex == currentHex))
                return ActivityKind.TravelingToWork;

            switch (job.Kind)
            {
                case JobKind.Lumberjack: return ActivityKind.Lumberjacking;
                case JobKind.Miner:      return ActivityKind.Mining;
                case JobKind.Guard:      return ActivityKind.Guarding;
                case JobKind.Looter:     return ActivityKind.Looting;
                case JobKind.Farmer:     return ActivityKind.Farming;
                case JobKind.Builder:    return ActivityKind.Building;
                case JobKind.Chef:       return ActivityKind.Cooking;
                case JobKind.Hunter:     return ActivityKind.Hunting;
            }

            switch (goal.Kind)
            {
                case GoalKind.MoveToHex:
                    return goal.Priority == GoalPriority.Order
                        ? ActivityKind.MovingToOrder
                        : ActivityKind.Wandering;
                case GoalKind.Wander:
                case GoalKind.Follow:
                    return ActivityKind.Wandering;
                case GoalKind.ReturnToBase:
                    return ActivityKind.ReturningToBase;
                case GoalKind.Hunt:
                    return ActivityKind.Hunting;
            }

            return ActivityKind.Idle;
        }
    }
}
