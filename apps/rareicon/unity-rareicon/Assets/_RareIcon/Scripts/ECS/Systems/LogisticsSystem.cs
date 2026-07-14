using MessagePipe;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Per-turn Player-faction role census + auto-promotion. Runs once at the end of each turn: counts how many units carry each role, counts completed buildings by type, and for every essential role that landed at zero it grabs a pure Looter (Looter > 0 with every other slot == 0) and stamps role = 1 so the logistics chain doesn't stall. Writes a LogisticsReport singleton with the final counts + two bitmasks — RolesAutoFilled (temp assignments made this turn) and RolesUnfillable (still missing because no pure Looter was available). LogisticsWarningSystem reads those masks on the main thread and publishes the toast.</summary>
    public struct LogisticsReport : IComponentData
    {
        public uint LastCheckedTurn;

        public int Lumberjacks;
        public int Miners;
        public int Guards;
        public int Looters;
        public int Farmers;
        public int Builders;
        public int Chefs;
        public int Hunters;

        public int Farms;
        public int Furnaces;
        public int Barracks;

        public uint RolesAutoFilled;
        public uint RolesUnfillable;
    }

    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct LogisticsSystem : ISystem
    {
        EntityQuery _unitQuery;
        EntityQuery _buildingQuery;
        EntityQuery _siteQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<WorldClock>();

            _unitQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<ProfessionPriorities, Faction, Unit>()
                .Build(ref state);

            _buildingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Building>()
                .WithNone<ConstructionSite>()
                .Build(ref state);

            _siteQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<ConstructionSite>()
                .Build(ref state);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            if (!SystemAPI.TryGetSingletonEntity<LogisticsReport>(out var reportEntity))
            {
                var ecbSeed = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                                       .CreateCommandBuffer(state.WorldUnmanaged);
                var e = ecbSeed.CreateEntity();
                ecbSeed.AddComponent(e, new LogisticsReport { LastCheckedTurn = uint.MaxValue });
                return;
            }

            var report = SystemAPI.GetComponent<LogisticsReport>(reportEntity);
            if (report.LastCheckedTurn == turn) return;

            var units     = _unitQuery    .ToEntityArray(Allocator.TempJob);
            var buildings = _buildingQuery.ToEntityArray(Allocator.TempJob);
            int siteCount = _siteQuery    .CalculateEntityCount();

            state.Dependency = new LogisticsCensusJob
            {
                Units            = units,
                Buildings        = buildings,
                SiteCount        = siteCount,
                FactionLookup    = SystemAPI.GetComponentLookup<Faction>(true),
                BuildingLookup   = SystemAPI.GetComponentLookup<Building>(true),
                PrioritiesLookup = SystemAPI.GetComponentLookup<ProfessionPriorities>(false),
                ReportEntity     = reportEntity,
                ReportLookup     = SystemAPI.GetComponentLookup<LogisticsReport>(false),
                Turn             = turn,
            }.Schedule(state.Dependency);

            state.Dependency = units    .Dispose(state.Dependency);
            state.Dependency = buildings.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public struct LogisticsCensusJob : IJob
    {

        const byte SpecialtyPriority = 5;

        const int LumberjackQuota = 2;
        const int MinerQuota      = 2;
        const int HunterQuota     = 2;
        const int LooterQuota     = 4;

        [ReadOnly] public NativeArray<Entity> Units;
        [ReadOnly] public NativeArray<Entity> Buildings;

        public int SiteCount;

        [ReadOnly] public ComponentLookup<Faction>  FactionLookup;
        [ReadOnly] public ComponentLookup<Building> BuildingLookup;

        public ComponentLookup<ProfessionPriorities>   PrioritiesLookup;
        public ComponentLookup<LogisticsReport> ReportLookup;
        public Entity ReportEntity;
        public uint   Turn;

        public void Execute()
        {

            int lumberjacks = 0, miners = 0, guards = 0, looters = 0;
            int farmers = 0, builders = 0, chefs = 0, hunters = 0, blacksmiths = 0;

            var pureLooters = new NativeList<Entity>(16, Allocator.Temp);

            for (int i = 0; i < Units.Length; i++)
            {
                var e = Units[i];
                if (!FactionLookup.HasComponent(e)) continue;
                if (FactionLookup[e].Value != FactionType.Player) continue;
                if (!PrioritiesLookup.HasComponent(e)) continue;

                var p = PrioritiesLookup[e];
                if (p.Lumberjack >= SpecialtyPriority) lumberjacks++;
                if (p.Miner      >= SpecialtyPriority) miners++;
                if (p.Guard      >= SpecialtyPriority) guards++;
                if (p.Looter     >= SpecialtyPriority) looters++;
                if (p.Farmer     >= SpecialtyPriority) farmers++;
                if (p.Builder    >= SpecialtyPriority) builders++;
                if (p.Chef       >= SpecialtyPriority) chefs++;
                if (p.Hunter     >= SpecialtyPriority) hunters++;
                if (p.Blacksmith >= SpecialtyPriority) blacksmiths++;

                if (IsPureLooter(p)) pureLooters.Add(e);
            }

            int farms = 0, furnaces = 0, barracks = 0;
            for (int i = 0; i < Buildings.Length; i++)
            {
                var e = Buildings[i];
                if (!BuildingLookup.HasComponent(e)) continue;
                var b = BuildingLookup[e];
                if (b.OwnerFaction != FactionType.Player) continue;
                if      (b.Type == BuildingType.Farm)     farms++;
                else if (b.Type == BuildingType.Furnace)  furnaces++;
                else if (b.Type == BuildingType.Barracks) barracks++;
            }

            uint autoFilled = 0u;
            uint unfillable = 0u;

            FillQuota(ProfessionKind.Lumberjack, ref lumberjacks, LumberjackQuota, pureLooters, ref autoFilled, ref unfillable);
            FillQuota(ProfessionKind.Miner,      ref miners,      MinerQuota,      pureLooters, ref autoFilled, ref unfillable);
            FillQuota(ProfessionKind.Hunter,     ref hunters,     HunterQuota,     pureLooters, ref autoFilled, ref unfillable);
            FillQuota(ProfessionKind.Looter,     ref looters,     LooterQuota,     pureLooters, ref autoFilled, ref unfillable);

            if (farms    > 0) FillQuota(ProfessionKind.Farmer,     ref farmers,     1, pureLooters, ref autoFilled, ref unfillable);
            if (furnaces > 0) FillQuota(ProfessionKind.Chef,       ref chefs,       1, pureLooters, ref autoFilled, ref unfillable);
            if (furnaces > 0) FillQuota(ProfessionKind.Blacksmith, ref blacksmiths, 1, pureLooters, ref autoFilled, ref unfillable);
            if (barracks > 0) FillQuota(ProfessionKind.Guard,      ref guards,      1, pureLooters, ref autoFilled, ref unfillable);

            if (SiteCount > builders)
            {
                FillQuota(ProfessionKind.Builder, ref builders, SiteCount, pureLooters, ref autoFilled, ref unfillable);
            }

            ReportLookup[ReportEntity] = new LogisticsReport
            {
                LastCheckedTurn  = Turn,
                Lumberjacks      = lumberjacks,
                Miners           = miners,
                Guards           = guards,
                Looters          = looters,
                Farmers          = farmers,
                Builders         = builders,
                Chefs            = chefs,
                Hunters          = hunters,
                Farms            = farms,
                Furnaces         = furnaces,
                Barracks         = barracks,
                RolesAutoFilled  = autoFilled,
                RolesUnfillable  = unfillable,
            };

            pureLooters.Dispose();
        }

        void FillQuota(byte roleKind, ref int currentCount, int quota,
                       NativeList<Entity> pool, ref uint autoFilled, ref uint unfillable)
        {
            uint roleBit = 1u << roleKind;
            bool didAny = false;

            while (currentCount < quota && pool.Length > 0)
            {
                int idx = pool.Length - 1;
                var e = pool[idx];
                pool.RemoveAt(idx);

                var p = PrioritiesLookup[e];
                p.Set(roleKind, SpecialtyPriority);
                PrioritiesLookup[e] = p;
                currentCount++;
                didAny = true;
            }

            if (didAny)               autoFilled |= roleBit;
            if (currentCount < quota) unfillable |= roleBit;
        }

        bool IsPureLooter(in ProfessionPriorities p)
        {
            if (p.Looter == 0) return false;
            return p.Lumberjack < SpecialtyPriority
                && p.Miner      < SpecialtyPriority
                && p.Guard      < SpecialtyPriority
                && p.Looter     < SpecialtyPriority
                && p.Farmer     < SpecialtyPriority
                && p.Builder    < SpecialtyPriority
                && p.Chef       < SpecialtyPriority
                && p.Hunter     < SpecialtyPriority
                && p.Blacksmith < SpecialtyPriority;
        }
    }

}
