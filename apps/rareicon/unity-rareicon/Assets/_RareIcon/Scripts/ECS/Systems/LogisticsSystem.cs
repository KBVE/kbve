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

            state.Dependency = new LogisticsCensusJob
            {
                Units            = units,
                Buildings        = buildings,
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

        static bool IsPureLooter(in JobPriorities p)
        {
            if (p.Looter == 0) return false;
            return p.Lumberjack == 0
                && p.Miner      == 0
                && p.Guard      == 0
                && p.Farmer     == 0
                && p.Builder    == 0
                && p.Chef       == 0
                && p.Hunter     == 0;
        }
    }

    /// <summary>Main-thread toast publisher for LogisticsReport. Reads the two role-mask bitfields LogisticsSystem writes each turn and fires MessagePipe toasts — info-kind for auto-filled roles ("No Chef was found, temp Chef assigned"), warning-kind for unfillable ones. Cooldown lives in the bitmask itself: LogisticsSystem only sets a bit on the tick a role flipped, so successive turns where the role stays filled/unfilled don't repeat the toast.</summary>
    // TODO(toast-drain): Bursted producers + main-thread MessagePipe publish is
    // the same pattern CapitalAttackAlertSystem hits, and future systems will
    // keep cloning it. Replace this per-producer SystemBase with a shared
    // ToastRequest intent entity + single ToastDrainSystem that pulls all
    // pending toasts off the ECS side each frame and fans them out through
    // GlobalMessagePipe. Lets every producer stay Burst ISystem and writes the
    // toast crossing into one place — same shape as SpawnSoldierRequest /
    // PendingItemTransfer.
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateAfter(typeof(LogisticsSystem))]
    public partial class LogisticsWarningSystem : SystemBase
    {
        uint _lastReportedTurn = uint.MaxValue;

        protected override void OnUpdate()
        {
            if (!SystemAPI.TryGetSingleton<LogisticsReport>(out var report)) return;
            if (report.LastCheckedTurn == _lastReportedTurn) return;
            _lastReportedTurn = report.LastCheckedTurn;

            if (report.RolesAutoFilled != 0) EmitAutoFilled(report.RolesAutoFilled);
            if (report.RolesUnfillable != 0) EmitUnfillable(report.RolesUnfillable);
        }

        void EmitAutoFilled(uint mask)
        {
            if ((mask & (1u << JobKind.Lumberjack)) != 0) Toast("No Lumberjack was found, temp Lumberjack assigned", ToastKind.Info);
            if ((mask & (1u << JobKind.Miner))      != 0) Toast("No Miner was found, temp Miner assigned",           ToastKind.Info);
            if ((mask & (1u << JobKind.Farmer))     != 0) Toast("No Farmer was found, temp Farmer assigned",         ToastKind.Info);
            if ((mask & (1u << JobKind.Chef))       != 0) Toast("No Chef was found, temp Chef assigned",             ToastKind.Info);
            if ((mask & (1u << JobKind.Guard))      != 0) Toast("No Guard was found, temp Guard assigned",           ToastKind.Info);
        }

        void EmitUnfillable(uint mask)
        {
            if ((mask & (1u << JobKind.Lumberjack)) != 0) Toast("Lumberjack unassigned — no free Looter",  ToastKind.Warning);
            if ((mask & (1u << JobKind.Miner))      != 0) Toast("Miner unassigned — no free Looter",       ToastKind.Warning);
            if ((mask & (1u << JobKind.Farmer))     != 0) Toast("Farmer unassigned — no free Looter",      ToastKind.Warning);
            if ((mask & (1u << JobKind.Chef))       != 0) Toast("Chef unassigned — no free Looter",        ToastKind.Warning);
            if ((mask & (1u << JobKind.Guard))      != 0) Toast("Guard unassigned — no free Looter",       ToastKind.Warning);
        }

        static void Toast(string text, ToastKind kind)
        {
            try
            {
                var pub = GlobalMessagePipe.GetPublisher<ToastMessage>();
                pub?.Publish(new ToastMessage(text, kind));
            }
            catch { }
        }
    }
}
