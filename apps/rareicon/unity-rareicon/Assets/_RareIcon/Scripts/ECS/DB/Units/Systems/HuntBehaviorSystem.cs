using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Points Hostile units' MovementGoal at the player's Capital. If a damaged Player building is within TargetingRadius hexes of the hostile's current hex, the nearest damaged building wins — lets bandits swarm harassed outposts / farms instead of bypassing them to march on the Capital. GarrisonPost-tagged bandits (camp defenders) are excluded — they hold position and only swing their MeleeAttack at whatever comes into range.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct HuntBehaviorSystem : ISystem
    {
        const int TargetingRadius = 12;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            var damagedHexes = new NativeList<int2>(32, Allocator.TempJob);
            foreach (var (b, hp) in SystemAPI.Query<RefRO<Building>, RefRO<BuildingHealth>>())
            {
                if (b.ValueRO.OwnerFaction != FactionType.Player) continue;
                if (hp.ValueRO.Value >= hp.ValueRO.Max) continue;
                damagedHexes.Add(b.ValueRO.RootHex);
            }

            var handle = new HuntJob
            {
                CapitalHex       = capitalHex,
                DamagedHexes     = damagedHexes.AsDeferredJobArray(),
                TargetingRadius  = TargetingRadius,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = damagedHexes.Dispose(handle);
        }
    }

    [BurstCompile]
    [WithNone(typeof(GarrisonPost))]
    public partial struct HuntJob : IJobEntity
    {
        public int2                     CapitalHex;
        [ReadOnly] public NativeArray<int2> DamagedHexes;
        public int                      TargetingRadius;

        void Execute(in Faction faction, in UnitMovement m, ref MovementGoal goal)
        {
            if (faction.Value != FactionType.Hostile) return;
            if (goal.Priority > GoalPriority.Hunt) return;

            int2 target = CapitalHex;
            int bestD = int.MaxValue;
            for (int i = 0; i < DamagedHexes.Length; i++)
            {
                int d = AxialDistance(m.CurrentHex - DamagedHexes[i]);
                if (d > TargetingRadius) continue;
                if (d < bestD) { bestD = d; target = DamagedHexes[i]; }
            }

            goal = new MovementGoal
            {
                Kind      = GoalKind.Hunt,
                Priority  = GoalPriority.Hunt,
                TargetHex = target,
            };
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
