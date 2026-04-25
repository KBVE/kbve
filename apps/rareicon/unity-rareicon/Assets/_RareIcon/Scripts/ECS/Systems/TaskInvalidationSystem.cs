using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    [UpdateBefore(typeof(ProfessionDispatchSystem))]
    public partial struct TaskInvalidationSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookupSingleton)) return;

            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            state.Dependency = new InvalidateTasksJob
            {
                HexLookup           = hexLookupSingleton.Lookup,
                HexResLookup        = SystemAPI.GetComponentLookup<HexResources>(true),
                ConstructionLookup  = SystemAPI.GetComponentLookup<ConstructionSite>(true),
                BuildingLookup      = SystemAPI.GetComponentLookup<Building>(true),
                BuildingHpLookup    = SystemAPI.GetComponentLookup<BuildingHealth>(true),
                GoblinCaveLookup    = SystemAPI.GetComponentLookup<GoblinCaveTag>(true),
                CapitalLookup       = SystemAPI.GetComponentLookup<CapitalTag>(true),
                FarmLookup          = SystemAPI.GetComponentLookup<FarmTag>(true),
                BarracksLookup      = SystemAPI.GetComponentLookup<BarracksTag>(true),
                FurnaceLookup       = SystemAPI.GetComponentLookup<FurnaceTag>(true),
                GroundArrowLookup   = SystemAPI.GetComponentLookup<GroundArrow>(true),
                CaveFoodLookup      = SystemAPI.GetComponentLookup<CaveFoodStatus>(true),
                CapitalStatusLookup = SystemAPI.GetComponentLookup<CapitalStatus>(true),
                NowTick             = nowTick,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct InvalidateTasksJob : IJobEntity
    {
        const uint TenderTimeoutTicks = 20000u;

        [ReadOnly] public NativeHashMap<int2, Entity>        HexLookup;
        [ReadOnly] public ComponentLookup<HexResources>      HexResLookup;
        [ReadOnly] public ComponentLookup<ConstructionSite>  ConstructionLookup;
        [ReadOnly] public ComponentLookup<Building>          BuildingLookup;
        [ReadOnly] public ComponentLookup<BuildingHealth>    BuildingHpLookup;
        [ReadOnly] public ComponentLookup<GoblinCaveTag>     GoblinCaveLookup;
        [ReadOnly] public ComponentLookup<CapitalTag>        CapitalLookup;
        [ReadOnly] public ComponentLookup<FarmTag>           FarmLookup;
        [ReadOnly] public ComponentLookup<BarracksTag>       BarracksLookup;
        [ReadOnly] public ComponentLookup<FurnaceTag>        FurnaceLookup;
        [ReadOnly] public ComponentLookup<GroundArrow>       GroundArrowLookup;
        [ReadOnly] public ComponentLookup<CaveFoodStatus>    CaveFoodLookup;
        [ReadOnly] public ComponentLookup<CapitalStatus>     CapitalStatusLookup;

        public uint NowTick;

        void Execute(DynamicBuffer<TaskMemory> tasks)
        {
            for (int i = 0; i < tasks.Length; i++)
            {
                var entry = tasks[i];
                if (entry.State == TaskState.Invalidated || entry.State == TaskState.Completed) continue;
                if (!IsValid(in entry)) { entry.State = TaskState.Invalidated; tasks[i] = entry; }
            }
        }

        bool IsValid(in TaskMemory entry)
        {
            switch (entry.Kind)
            {
                case ProfessionKind.None: return false;
                case ProfessionKind.Lumberjack: return HexHas(entry.TargetHex, HarvestRole.Lumberjack);
                case ProfessionKind.Miner:      return HexHas(entry.TargetHex, HarvestRole.Miner);
                case ProfessionKind.Farmer:
                    if (entry.TargetEntity == Entity.Null) return false;
                    return FarmLookup.HasComponent(entry.TargetEntity);
                case ProfessionKind.Chef:
                    if (entry.TargetEntity == Entity.Null) return false;
                    if (NowTick - entry.IssuedTick > TenderTimeoutTicks) return false;
                    return CapitalLookup.HasComponent(entry.TargetEntity);
                case ProfessionKind.Craftsman:
                    if (entry.TargetEntity == Entity.Null) return false;
                    if (NowTick - entry.IssuedTick > TenderTimeoutTicks) return false;
                    return BarracksLookup.HasComponent(entry.TargetEntity);
                case ProfessionKind.Blacksmith:
                    if (entry.TargetEntity == Entity.Null) return false;
                    if (NowTick - entry.IssuedTick > TenderTimeoutTicks) return false;
                    return FurnaceLookup.HasComponent(entry.TargetEntity);
                case ProfessionKind.Guard:
                    if (entry.TargetEntity == Entity.Null)
                    {
                        if (NowTick - entry.IssuedTick > TenderTimeoutTicks) return false;
                        return true;
                    }
                    return BuildingLookup.HasComponent(entry.TargetEntity)
                        || GroundArrowLookup.HasComponent(entry.TargetEntity);
                case ProfessionKind.Builder:
                    if (entry.TargetEntity == Entity.Null) return false;
                    if (ConstructionLookup.HasComponent(entry.TargetEntity)) return true;
                    if (BuildingLookup.HasComponent(entry.TargetEntity)
                        && BuildingHpLookup.HasComponent(entry.TargetEntity))
                    {
                        var hp = BuildingHpLookup[entry.TargetEntity];
                        var b  = BuildingLookup[entry.TargetEntity];
                        return b.OwnerFaction == FactionType.Player && hp.Value < hp.Max;
                    }
                    return false;
                case ProfessionKind.Looter:
                    return LooterValid(in entry);
                default:
                    return entry.TargetEntity != Entity.Null || !entry.TargetHex.Equals(int2.zero);
            }
        }

        bool LooterValid(in TaskMemory entry)
        {
            if (entry.TargetEntity == Entity.Null)
                return HexHas(entry.TargetHex, HarvestRole.Forager);
            if (GoblinCaveLookup.HasComponent(entry.TargetEntity))
            {
                if (!CaveFoodLookup.HasComponent(entry.TargetEntity)) return false;
                var status = CaveFoodLookup[entry.TargetEntity];
                return status.IsNeedy;
            }
            if (CapitalLookup.HasComponent(entry.TargetEntity))
            {
                return CapitalStatusLookup.HasComponent(entry.TargetEntity)
                    && CapitalStatusLookup[entry.TargetEntity].HasFood != 0;
            }
            if (GroundArrowLookup.HasComponent(entry.TargetEntity))
                return GroundArrowLookup[entry.TargetEntity].ClaimedBy == Entity.Null;
            return false;
        }

        bool HexHas(int2 hex, HarvestRole role)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return false;
            if (!HexResLookup.HasComponent(tile)) return false;
            var res = HexResLookup[tile];
            switch (role)
            {
                case HarvestRole.Forager:    return (res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0;
                case HarvestRole.Lumberjack: return (res.Wood | res.Leaves | res.Branches) != 0;
                case HarvestRole.Miner:      return res.Stone != 0;
                default:                     return false;
            }
        }
    }
}
