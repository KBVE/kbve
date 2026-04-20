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
            int lumberjacks = 0, miners = 0, guards = 0, looters = 0;
            int farmers = 0, builders = 0, chefs = 0, hunters = 0;

            var pureLooters = new NativeList<Entity>(16, Allocator.Temp);

            for (int i = 0; i < Units.Length; i++)
            {
                var e = Units[i];
                if (!FactionLookup.HasComponent(e)) continue;
                if (FactionLookup[e].Value != FactionType.Player) continue;
                if (!PrioritiesLookup.HasComponent(e)) continue;

                var p = PrioritiesLookup[e];
                if (p.Lumberjack > 0) lumberjacks++;
                if (p.Miner      > 0) miners++;
                if (p.Guard      > 0) guards++;
                if (p.Looter     > 0) looters++;
                if (p.Farmer     > 0) farmers++;
                if (p.Builder    > 0) builders++;
                if (p.Chef       > 0) chefs++;
                if (p.Hunter     > 0) hunters++;

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

            uint autoFilled   = 0u;
            uint unfillable   = 0u;

            // Essential: Lumberjack + Miner always wanted (wood + stone chains).
            if (lumberjacks == 0)
            {
                if (TryPromote(pureLooters, JobKind.Lumberjack)) { autoFilled |= 1u << JobKind.Lumberjack; lumberjacks++; }
                else                                             unfillable  |= 1u << JobKind.Lumberjack;
            }
            if (miners == 0)
            {
                if (TryPromote(pureLooters, JobKind.Miner))      { autoFilled |= 1u << JobKind.Miner;      miners++; }
                else                                             unfillable  |= 1u << JobKind.Miner;
            }

            // Building-conditional: only stamp Farmer if a Farm exists, etc.
            if (farms > 0 && farmers == 0)
            {
                if (TryPromote(pureLooters, JobKind.Farmer))     { autoFilled |= 1u << JobKind.Farmer; farmers++; }
                else                                             unfillable  |= 1u << JobKind.Farmer;
            }
            if (furnaces > 0 && chefs == 0)
            {
                if (TryPromote(pureLooters, JobKind.Chef))       { autoFilled |= 1u << JobKind.Chef; chefs++; }
                else                                             unfillable  |= 1u << JobKind.Chef;
            }
            if (barracks > 0 && guards == 0)
            {
                if (TryPromote(pureLooters, JobKind.Guard))      { autoFilled |= 1u << JobKind.Guard; guards++; }
                else                                             unfillable  |= 1u << JobKind.Guard;
            }

            // Builder keeps pace with open ConstructionSites — if there are
            // more sites than Builders, promote one generalist each turn
            // until the backlog is covered. BuildingStaffingSystem stamps a
            // specialty Builder when the Capital lands, so tribes always
            // start with at least one once construction's in flight.
            if (SiteCount > builders)
            {
                if (TryPromote(pureLooters, JobKind.Builder))    { autoFilled |= 1u << JobKind.Builder; builders++; }
                else                                             unfillable  |= 1u << JobKind.Builder;
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

        bool TryPromote(NativeList<Entity> pool, byte roleKind)
        {
            if (pool.Length == 0) return false;
            int idx = pool.Length - 1;
            var e = pool[idx];
            pool.RemoveAt(idx);

            var p = PrioritiesLookup[e];
            p.Set(roleKind, 1);
            PrioritiesLookup[e] = p;
            return true;
        }

        // "Promotable" = generalist still. The default goblin carries Looter +
        // Lumberjack + Miner + Hunter, so those slots don't disqualify — only
        // the specialty roles (Farmer / Chef / Guard / Builder) being set mean
        // the goblin has already been dedicated by BuildingStaffingSystem or
        // an earlier LogisticsSystem pass and shouldn't be re-promoted.
        static bool IsPureLooter(in JobPriorities p)
        {
            if (p.Looter == 0) return false;
            return p.Farmer  == 0
                && p.Chef    == 0
                && p.Guard   == 0
                && p.Builder == 0;
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
