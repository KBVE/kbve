using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Rolls a random 3–5 hex MovementGoal for idle wildlife / beasts. Player units are excluded — Jobs / Relief / ReturnToBase / Shelter own their motion; a workerless goblin idles in place.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
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

            if (SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookup))
            {
                state.Dependency = new WaterWanderJob
                {
                    HexLookup   = hexLookup.Lookup,
                    BiomeLookup = SystemAPI.GetComponentLookup<BiomeType>(true),
                }.ScheduleParallel(state.Dependency);
            }
        }
    }

    [BurstCompile]
    [WithNone(typeof(ControlledUnitTag))]
    [WithNone(typeof(GarrisonPost))]
    [WithNone(typeof(ProfessionPriorities))]
    [WithNone(typeof(WaterLockedTag))]
    public partial struct WanderJob : IJobEntity
    {
        void Execute(ref MovementGoal goal, ref UnitMovement m)
        {
            if (goal.Priority > GoalPriority.Wander) return;

            bool noGoal     = goal.Kind == GoalKind.None;
            bool wanderDone = goal.Kind == GoalKind.Wander && m.CurrentHex.Equals(goal.TargetHex);
            if (!noGoal && !wanderDone) return;

            uint rng  = WanderRng.Rng(m.RandomState ^ WanderRng.HashHex(m.CurrentHex));
            int  dir  = (int)(rng % 6u);
            rng       = WanderRng.Rng(rng);
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
    }

    [BurstCompile]
    [WithAll(typeof(WaterLockedTag))]
    [WithNone(typeof(ControlledUnitTag))]
    [WithNone(typeof(GarrisonPost))]
    public partial struct WaterWanderJob : IJobEntity
    {
        const int MaxTries = 4;

        [ReadOnly] public Unity.Collections.NativeHashMap<int2, Entity> HexLookup;
        [ReadOnly] public ComponentLookup<BiomeType> BiomeLookup;

        void Execute(ref MovementGoal goal, ref UnitMovement m)
        {
            if (goal.Priority > GoalPriority.Wander) return;

            bool noGoal     = goal.Kind == GoalKind.None;
            bool wanderDone = goal.Kind == GoalKind.Wander && m.CurrentHex.Equals(goal.TargetHex);
            if (!noGoal && !wanderDone) return;

            uint rng = WanderRng.Rng(m.RandomState ^ WanderRng.HashHex(m.CurrentHex));

            for (int tri = 0; tri < MaxTries; tri++)
            {
                int  dir  = (int)(rng % 6u);
                rng       = WanderRng.Rng(rng);
                int  dist = (int)(2u + (rng % 3u));
                rng       = WanderRng.Rng(rng);
                int2 candidate = m.CurrentHex + HexMeshUtil.HexNeighbor(dir) * dist;

                if (IsWater(candidate))
                {
                    m.RandomState = rng;
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.Wander,
                        Priority  = GoalPriority.Wander,
                        TargetHex = candidate,
                    };
                    return;
                }
            }

            m.RandomState = rng;
        }

        bool IsWater(int2 hex)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return false;
            if (!BiomeLookup.HasComponent(tile)) return false;
            byte b = BiomeLookup[tile].Value;
            return b == BiomeGenerator.BIOME_RIVER || b == BiomeGenerator.BIOME_OCEAN;
        }
    }

    internal static class WanderRng
    {
        public static uint Rng(uint x)
        {
            x ^= x >> 13;
            x *= 0x85EBCA6Bu;
            x ^= x >> 16;
            x *= 0xC2B2AE35u;
            x ^= x >> 16;
            return x;
        }

        public static uint HashHex(int2 hex) => UnitHashOps.HexHash(hex);
    }
}
