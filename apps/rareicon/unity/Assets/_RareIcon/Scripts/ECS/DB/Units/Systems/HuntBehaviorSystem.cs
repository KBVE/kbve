using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Points Hostile units' MovementGoal at the player's Capital. If a damaged Player building is within <see cref="HuntJob.TargetingRadius"/> hexes of the hostile's current hex, the nearest damaged building wins. If a BanditScout has reported additional Player buildings into <see cref="KnownPlayerHexesSingleton"/>, those land in the same scan with a wider <see cref="HuntJob.KnownTargetRadius"/> — lets raid bandits divert to outposts the scout uncovered, even when the player's structures are intact. GarrisonPost defenders + BanditHome laborers are excluded. Damaged-building prep scan jobified as a parallel IJobEntity into NativeList.ParallelWriter so the per-frame scan stays off the main thread at scale.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct HuntBehaviorSystem : ISystem
    {
        const int TargetingRadius = 12;

        EntityQuery _buildingQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();
            _buildingQuery = SystemAPI.QueryBuilder().WithAll<Building, BuildingHealth>().Build();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            int buildingCap = _buildingQuery.CalculateEntityCount();
            var damagedHexes = new NativeList<int2>(math.max(1, buildingCap), Allocator.TempJob);
            var damagedHandle = new CollectDamagedHexesJob
            {
                Writer = damagedHexes.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            var knownHexes = new NativeList<int2>(8, Allocator.TempJob);
            if (SystemAPI.TryGetSingletonEntity<KnownPlayerHexesSingleton>(out var knownEntity)
                && SystemAPI.HasBuffer<KnownPlayerHex>(knownEntity))
            {
                var buf = SystemAPI.GetBuffer<KnownPlayerHex>(knownEntity);
                for (int i = 0; i < buf.Length; i++) knownHexes.Add(buf[i].Hex);
            }

            var handle = new HuntJob
            {
                CapitalHex        = capitalHex,
                DamagedHexes      = damagedHexes.AsDeferredJobArray(),
                KnownHexes        = knownHexes.AsDeferredJobArray(),
                TargetingRadius   = TargetingRadius,
                KnownTargetRadius = KnownTargetRadius,
            }.ScheduleParallel(JobHandle.CombineDependencies(damagedHandle, state.Dependency));

            state.Dependency = damagedHexes.Dispose(handle);
            state.Dependency = knownHexes  .Dispose(state.Dependency);
        }

        public const int KnownTargetRadius = 24;
    }

    [BurstCompile]
    public partial struct CollectDamagedHexesJob : IJobEntity
    {
        public NativeList<int2>.ParallelWriter Writer;

        void Execute(in Building b, in BuildingHealth hp)
        {
            if (b.OwnerFaction != FactionType.Player) return;
            if (hp.Value >= hp.Max) return;
            Writer.AddNoResize(b.RootHex);
        }
    }

    [BurstCompile]
    [WithNone(typeof(GarrisonPost))]
    [WithNone(typeof(BanditHome))]
    [WithNone(typeof(BanditScoutTag))]
    public partial struct HuntJob : IJobEntity
    {
        public int2                     CapitalHex;
        [ReadOnly] public NativeArray<int2> DamagedHexes;
        [ReadOnly] public NativeArray<int2> KnownHexes;
        public int                      TargetingRadius;
        public int                      KnownTargetRadius;

        void Execute(in Faction faction, in UnitMovement m, ref MovementGoal goal)
        {
            if (faction.Value != FactionType.Hostile) return;
            if (goal.Priority > GoalPriority.Hunt) return;

            int2 target = CapitalHex;
            int bestD = int.MaxValue;
            for (int i = 0; i < DamagedHexes.Length; i++)
            {
                int d = AxialDistance(m.CurrentHex - DamagedHexes[i]);
                if (d <= 0) continue;
                if (d > TargetingRadius) continue;
                if (d < bestD) { bestD = d; target = DamagedHexes[i]; }
            }
            for (int i = 0; i < KnownHexes.Length; i++)
            {
                int d = AxialDistance(m.CurrentHex - KnownHexes[i]);
                if (d <= 0) continue;
                if (d > KnownTargetRadius) continue;
                if (d < bestD) { bestD = d; target = KnownHexes[i]; }
            }

            if (target.Equals(m.CurrentHex)) return;

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
