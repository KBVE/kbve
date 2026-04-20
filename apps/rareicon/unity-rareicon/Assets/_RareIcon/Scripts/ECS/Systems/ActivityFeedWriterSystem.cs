using Unity.Burst;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Pure-Burst per-tick activity classifier for Player units. Walks the (ReliefIntent → JobIntent → MovementGoal) chain to derive an ActivityKind, compares against ActivityState.LastKind, and only enqueues a snapshot when the kind changed (delta-only). Scheduled last in BehaviorSystemGroup via UpdateAfter on every goal-producing system so the read sees this tick's settled state. Single-threaded schedule because UnsafeRingQueue.TryEnqueue isn't thread-safe and player-unit counts (16-200) make a parallel split pointless overhead.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobMovementExecutor))]
    [UpdateAfter(typeof(WanderBehaviorSystem))]
    [UpdateAfter(typeof(ReturnToBaseSystem))]
    public partial struct ActivityFeedWriterSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<ActivityFeedSingleton>(out var feed)) return;
            if (!feed.Queue.IsCreated) return;

            new WriteJob { Queue = feed.Queue }.Schedule();
        }
    }

    /// <summary>Per-entity classifier — single-threaded so the un-thread-safe UnsafeRingQueue.TryEnqueue stays sound. Touches ActivityState writeably (one byte update on transition) and emits to the queue only on delta.</summary>
    [BurstCompile]
    [WithAll(typeof(JobPriorities))]  // proxy for "Player unit"; AttachJobsIfPlayer only adds JobPriorities for Player faction
    public partial struct WriteJob : IJobEntity
    {
        public UnsafeRingQueue<ActivitySnapshot> Queue;

        void Execute(Entity entity,
                     ref ActivityState state,
                     in JobIntent jobIntent,
                     in ReliefIntent reliefIntent,
                     in MovementGoal movementGoal)
        {
            byte kind = Classify(in reliefIntent, in jobIntent, in movementGoal);
            if (kind == state.LastKind) return;

            state.LastKind = kind;

            // Job target wins when present; movement goal target as
            // fallback so MovingToOrder / Wandering still carry their
            // destination hex.
            int2 targetHex = jobIntent.TargetHex;
            if (math.all(targetHex == int2.zero) && movementGoal.Kind != GoalKind.None)
                targetHex = movementGoal.TargetHex;

            Queue.TryEnqueue(new ActivitySnapshot
            {
                Entity       = entity,
                Kind         = kind,
                TargetHex    = targetHex,
                TargetItemId = 0,  // future: route Builder/Looter inventory item here
            });
        }

        // Priority: Relief beats Job beats Movement. Mirrors the dispatch
        // order ReliefSystem / JobSystem / WanderBehaviorSystem already
        // enforce on the goal pipeline — keeps the surfaced activity
        // matching what the unit is actually about to do this tick.
        static byte Classify(in ReliefIntent relief, in JobIntent job, in MovementGoal goal)
        {
            switch (relief.Kind)
            {
                case ReliefKind.Eat:             return ActivityKind.Eating;
                case ReliefKind.Sleep:           return ActivityKind.Sleeping;
                case ReliefKind.Heal:            return ActivityKind.Healing;
                case ReliefKind.ReturnToCapital: return ActivityKind.ReturningToBase;
                case ReliefKind.SeekAid:         return ActivityKind.SeekingAid;
            }

            switch (job.Kind)
            {
                case JobKind.Forager:    return ActivityKind.Foraging;
                case JobKind.Lumberjack: return ActivityKind.Lumberjacking;
                case JobKind.Miner:      return ActivityKind.Mining;
                case JobKind.Archer:     return ActivityKind.Hunting;
                case JobKind.Looter:     return ActivityKind.Looting;
                case JobKind.Farmer:     return ActivityKind.Farming;
                case JobKind.Builder:    return ActivityKind.Building;
                case JobKind.Chef:       return ActivityKind.Cooking;
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
