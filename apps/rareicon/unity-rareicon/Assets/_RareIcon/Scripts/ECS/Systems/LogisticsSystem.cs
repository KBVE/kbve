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

        // Bitmask indexed by JobKind byte value (Lumberjack=2, Miner=3, ...).
        // LogisticsWarningSystem walks each bit and toasts the matching locale
        // key on main thread; set-then-cleared each turn.
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
                .WithAll<JobPriorities, Faction, Unit>()
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

            // Singleton is created lazily — first frame returns after
            // queueing the create, actual work runs from next frame onward.
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
                PrioritiesLookup = SystemAPI.GetComponentLookup<JobPriorities>(false),
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
        // Promote at the same specialty priority BuildingStaffingSystem uses,
        // so a logistics quota goblin and a building-staffed goblin look the
        // same to JobSystem and to the IsPureLooter check (both gate on
        // specialty roles being zero).
        const byte SpecialtyPriority = 5;

        // Tribe-wide quotas — counted as "role at specialty priority", not
        // "role > 0" (every default goblin has Looter/Lumberjack/Miner/Hunter
        // baselined, so anything counting "> 0" would always read 100%).
        const int LumberjackQuota = 2;
        const int MinerQuota      = 2;
        const int HunterQuota     = 2;
        const int LooterQuota     = 4;

        [ReadOnly] public NativeArray<Entity> Units;
        [ReadOnly] public NativeArray<Entity> Buildings;

        public int SiteCount;

        [ReadOnly] public ComponentLookup<Faction>  FactionLookup;
        [ReadOnly] public ComponentLookup<Building> BuildingLookup;

        public ComponentLookup<JobPriorities>   PrioritiesLookup;
        public ComponentLookup<LogisticsReport> ReportLookup;
        public Entity ReportEntity;
        public uint   Turn;

        public void Execute()
        {
            // Counts here are SPECIALTY counts — goblins whose role priority
            // is at SpecialtyPriority. Generalist baseline (priority 1-3) does
            // not count toward a quota, so quotas measure "dedicated workers"
            // not "goblins capable of the role".
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

            // Tribe-wide raw-material quotas — Lumberjack and Miner first
            // because the whole craft chain stalls without them.
            FillQuota(JobKind.Lumberjack, ref lumberjacks, LumberjackQuota, pureLooters, ref autoFilled, ref unfillable);
            FillQuota(JobKind.Miner,      ref miners,      MinerQuota,      pureLooters, ref autoFilled, ref unfillable);
            FillQuota(JobKind.Hunter,     ref hunters,     HunterQuota,     pureLooters, ref autoFilled, ref unfillable);
            FillQuota(JobKind.Looter,     ref looters,     LooterQuota,     pureLooters, ref autoFilled, ref unfillable);

            // Building-conditional minima: only stamp Farmer/Chef/Blacksmith/
            // Guard if the matching building actually exists. Each is gated at
            // 1 — players can keep promoting via the Citizens UI past that.
            if (farms    > 0) FillQuota(JobKind.Farmer,     ref farmers,     1, pureLooters, ref autoFilled, ref unfillable);
            if (furnaces > 0) FillQuota(JobKind.Chef,       ref chefs,       1, pureLooters, ref autoFilled, ref unfillable);
            if (furnaces > 0) FillQuota(JobKind.Blacksmith, ref blacksmiths, 1, pureLooters, ref autoFilled, ref unfillable);
            if (barracks > 0) FillQuota(JobKind.Guard,      ref guards,      1, pureLooters, ref autoFilled, ref unfillable);

            // Builder keeps pace with open ConstructionSites — one builder per
            // site, capped to "match siteCount". BuildingStaffingSystem stamps
            // a specialty Builder when the Capital lands so tribes start with
            // at least one once construction's in flight.
            if (SiteCount > builders)
            {
                FillQuota(JobKind.Builder, ref builders, SiteCount, pureLooters, ref autoFilled, ref unfillable);
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

        // Pump generalists into a role until either the pool is exhausted or
        // the quota is met. Pops one promotion per call iteration so the same
        // generalist never gets two specialties — once stamped at SpecialtyPriority
        // they no longer pass IsPureLooter and the next pass skips them.
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

        // "Promotable" = no specialty stamp yet. The default goblin carries
        // Looter / Lumberjack / Miner / Hunter / Builder at generalist priority
        // (1-3), so the only filter is "no role is at SpecialtyPriority". Both
        // BuildingStaffingSystem stamps and earlier LogisticsSystem stamps
        // bump roles to SpecialtyPriority (5), so this check naturally avoids
        // poaching anyone who's already been assigned somewhere.
        bool IsPureLooter(in JobPriorities p)
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

    // TODO(toast-drain): LogisticsReport's RolesAutoFilled / RolesUnfillable
    // bitmasks already carry the data a toast would need — "No Chef was found,
    // temp Chef assigned" on info, "Chef unassigned — no free Looter" on
    // warning. The main-thread drain was removed because reading LogisticsReport
    // on main thread races with LogisticsCensusJob's ComponentLookup write. Once
    // a shared ToastRequest intent entity + single ToastDrainSystem lands (same
    // shape as SpawnSoldierRequest / PendingItemTransfer), switch LogisticsCensusJob
    // over to emitting toast intents via ECB instead of setting the masks, or
    // keep the masks and have the drain read LogisticsReport via a BurstCompiled
    // ISystem. Either way keeps the producer Burst and puts the MessagePipe
    // publish in one place.
}
