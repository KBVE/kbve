using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Route-planner layer between Behavior and Locomotion. Reads each
    /// unit's <see cref="MovementGoal"/> and stamps the next per-hex
    /// waypoint into <see cref="UnitMovement.TargetHex"/>. Greedy
    /// neighbor pick — good enough on an open map; swap for BFS/A*
    /// when walls / water / mountains block tiles.
    ///
    /// Parallel IJobEntity: each entity reads MovementGoal + its own
    /// UnitMovement, writes only its own UnitMovement. Zero cross-entity
    /// dependency → ScheduleParallel fans across worker threads. Scales
    /// linearly with goal count as the unit population grows.
    ///
    /// Pipeline:
    ///   Behaviors → MovementGoal (intent)
    ///   PathfindingSystem → UnitMovement.TargetHex (step)
    ///   UnitMovementSystem → Position (locomotion)
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(UnitMovementSystem))]
    public partial struct PathfindingSystem : ISystem
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
            new PathfindingJob().ScheduleParallel();
        }
    }

    /// <summary>
    /// Per-entity pathfinding tick. Writes UnitMovement.TargetHex /
    /// LastDir / DwellTimer / RandomState only — all within-entity,
    /// so the parallel writer can run lock-free across chunks.
    ///
    /// Dwell + per-unit jitter live here (not in locomotion) because
    /// this is the system that knows the turn the unit is about to
    /// make, and the turn sharpness drives the dwell multiplier.
    /// </summary>
    [BurstCompile]
    public partial struct PathfindingJob : IJobEntity
    {
        const float DwellMin = 0.12f;
        const float DwellMax = 0.30f;

        void Execute(ref MovementGoal goal, ref UnitMovement m)
        {
            if (goal.Kind == GoalKind.None) return;

            // Arrived at the final destination.
            if (m.CurrentHex.Equals(goal.TargetHex))
            {
                // Player orders are one-shot — clear on arrival so
                // lower-priority behaviors (ReturnToBase, Wander)
                // naturally resume. Other goal kinds (Wander re-rolls
                // its target, ReturnToBase clears on inventory+hunger
                // satisfied) manage their own lifecycle.
                if (goal.Kind == GoalKind.MoveToHex)
                {
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.None,
                        Priority  = GoalPriority.None,
                        TargetHex = m.CurrentHex,
                    };
                }
                return;
            }

            // Mid-traversal — let locomotion finish the in-flight
            // step before we repath. Pathfinding only plans when
            // the unit is actually at a hex boundary.
            if (!m.TargetHex.Equals(m.CurrentHex)) return;

            byte oldDir  = m.LastDir;
            int  newDir  = HexMeshUtil.HexStepToward(m.CurrentHex, goal.TargetHex);
            int2 nextHex = m.CurrentHex + HexMeshUtil.HexNeighbor(newDir);

            // Dwell — short pause before the next step so turns read
            // as deliberate. Jitter + turn-sharpness scaling keep a
            // crowd from stepping in perfect lockstep.
            uint rng       = Rng(m.RandomState ^ HashHex(m.CurrentHex));
            float jitter   = ((rng >> 16) & 0xFFFFu) / 65535f;
            float baseD    = math.lerp(DwellMin, DwellMax, jitter);
            float turnMul  = TurnSharpnessScale(oldDir, (byte)newDir);

            m.RandomState = rng;
            m.TargetHex   = nextHex;
            m.LastDir     = (byte)newDir;
            m.DwellTimer  = baseD * turnMul;
        }

        // 1.0 = straight ahead, up to ~2.1 for a 180° reverse. Scales
        // dwell so sharp reversals get a longer pause-to-reorient.
        // 255 sentinel = "no previous direction" → neutral multiplier.
        static float TurnSharpnessScale(byte lastDir, byte newDir)
        {
            if (lastDir > 5) return 1.0f;
            int diff = math.abs(((int)newDir - (int)lastDir + 9) % 6 - 3);
            return 0.6f + diff * 0.5f;
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
