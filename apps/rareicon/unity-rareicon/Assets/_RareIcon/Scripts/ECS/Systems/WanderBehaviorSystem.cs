using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Passive roam — the default behavior for any unit with no higher-
    /// priority goal set. Picks a random hex 3–5 tiles away and drops
    /// it into <see cref="MovementGoal"/> at Wander priority;
    /// PathfindingSystem handles the per-hex steps, and when the unit
    /// reaches the target this system rolls a new one.
    ///
    /// Priority gating: only overwrites goals with priority ≤ Wander
    /// (None or another Wander). Higher-priority behaviors
    /// (ReturnToBase, player orders, flee) stay untouched.
    ///
    /// Burst + ScheduleParallel. Each entity writes only its own
    /// MovementGoal + UnitMovement.RandomState → lock-free across
    /// chunks, scales linearly with population.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(PathfindingSystem))]
    public partial struct WanderBehaviorSystem : ISystem
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
            new WanderJob().ScheduleParallel();
        }
    }

    // KingTag excluded — the King stays at rest until the player clicks.
    // Every other unit with MovementGoal + UnitMovement wanders by default.
    [BurstCompile]
    [WithNone(typeof(KingTag))]
    public partial struct WanderJob : IJobEntity
    {
        void Execute(ref MovementGoal goal, ref UnitMovement m)
        {
            // Let higher-priority behaviors own the unit. Same-priority
            // Wander re-rolls (below) are still permitted.
            if (goal.Priority > GoalPriority.Wander) return;

            // Only (re)pick when idle — no goal, or the previous wander
            // target has been reached. Mid-wander traversals belong to
            // pathfinding + locomotion.
            bool noGoal     = goal.Kind == GoalKind.None;
            bool wanderDone = goal.Kind == GoalKind.Wander && m.CurrentHex.Equals(goal.TargetHex);
            if (!noGoal && !wanderDone) return;

            // xor-shift salted with CurrentHex so two identical
            // RandomStates on the same tile still diverge.
            uint rng  = Rng(m.RandomState ^ HashHex(m.CurrentHex));
            int  dir  = (int)(rng % 6u);
            rng       = Rng(rng);
            int  dist = (int)(3u + (rng % 3u));

            int2 newTarget = m.CurrentHex + HexMeshUtil.HexNeighbor(dir) * dist;

            m.RandomState = rng;
            goal = new MovementGoal
            {
                Kind      = GoalKind.Wander,
                Priority  = GoalPriority.Wander,
                TargetHex = newTarget,
            };
        }

        static uint Rng(uint x)
        {
            x ^= x >> 13;
            x *= 0x85EBCA6Bu;
            x ^= x >> 16;
            x *= 0xC2B2AE35u;
            x ^= x >> 16;
            return x;
        }

        static uint HashHex(int2 hex)
        {
            uint h = (uint)hex.x * 0x9E3779B1u;
            h ^= (uint)hex.y * 0x85EBCA77u;
            h ^= h >> 16;
            h *= 0x7FEB352Du;
            h ^= h >> 15;
            h *= 0x846CA68Bu;
            h ^= h >> 16;
            return h;
        }
    }
}
