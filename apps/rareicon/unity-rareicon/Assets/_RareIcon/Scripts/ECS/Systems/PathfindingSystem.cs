using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Greedy hex-step planner: reads MovementGoal, writes the next UnitMovement.TargetHex.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(MovementSystemGroup))]
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

    [BurstCompile]
    public partial struct PathfindingJob : IJobEntity
    {
        const float DwellMin = 0.0f;
        const float DwellMax = 0.06f;

        void Execute(ref MovementGoal goal, ref UnitMovement m)
        {
            if (goal.Kind == GoalKind.None) return;

            if (m.CurrentHex.Equals(goal.TargetHex))
            {
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

            if (!m.TargetHex.Equals(m.CurrentHex)) return;

            byte oldDir  = m.LastDir;
            int  newDir  = HexMeshUtil.HexStepToward(m.CurrentHex, goal.TargetHex);
            int2 nextHex = m.CurrentHex + HexMeshUtil.HexNeighbor(newDir);

            uint  rng     = Rng(m.RandomState ^ HashHex(m.CurrentHex));
            float jitter  = ((rng >> 16) & 0xFFFFu) / 65535f;
            float baseD   = math.lerp(DwellMin, DwellMax, jitter);
            float turnMul = TurnSharpnessScale(oldDir, (byte)newDir);

            m.RandomState = rng;
            m.TargetHex   = nextHex;
            m.LastDir     = (byte)newDir;
            m.DwellTimer  = baseD * turnMul;
        }

        static float TurnSharpnessScale(byte lastDir, byte newDir)
        {
            if (lastDir > 5) return 0f;
            int diff = math.abs(((int)newDir - (int)lastDir + 9) % 6 - 3);
            if (diff == 0) return 0f;
            return 0.3f + diff * 0.4f;
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
