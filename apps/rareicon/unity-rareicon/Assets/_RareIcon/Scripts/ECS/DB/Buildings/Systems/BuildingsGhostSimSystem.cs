using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Phase 4 — offloaded-chunk ghost simulation. Walks
    /// <see cref="BuildingsDBSingleton.Unloaded"/> at low cadence (default
    /// 1 Hz) and advances each record's accumulated production on
    /// worker threads via <see cref="IJobParallelForDefer"/>. When the
    /// player returns and the chunk reloads,
    /// <c>HexChunkSystem.HydrateUnloadedBuildings</c> spawns the building
    /// back into the live world with the accrued deltas applied.
    ///
    /// <para>Elapsed time is measured against <see cref="WorldClock"/>.AbsSeconds,
    /// not frame DeltaTime — this makes ghost-sim progress independent
    /// of real-world frame rate + survives editor pauses cleanly.</para>
    ///
    /// <para>Budget throttle — when the unloaded registry grows past
    /// <c>BudgetThreshold</c> records, advance only a windowed slice
    /// per tick. Records beyond the budget still get picked up on the
    /// following tick; worst-case per-record advance cadence is
    /// <c>ceil(N / BudgetPerTick)</c> seconds. Keeps the per-tick job
    /// bounded when the world has thousands of offloaded buildings.</para>
    ///
    /// <para>Server-only in multiplayer — clients receive live building
    /// state via ghost replication; the offline accumulator is an
    /// authority concern.</para>
    /// </summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ServerSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct BuildingsGhostSimSystem : ISystem
    {
        const float TickInterval    = 1.0f;   // advance once per world-second
        const int   BudgetThreshold = 1024;   // below this, advance all
        const int   BudgetPerTick   = 1024;   // above threshold, process this many per tick

        float _lastTickAbsSeconds;
        int   _cursor;                        // round-robin start index when budget active

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<BuildingsDBSingleton>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();

            // First tick — prime clock, no elapsed yet.
            if (_lastTickAbsSeconds <= 0f)
            {
                _lastTickAbsSeconds = clock.AbsSeconds;
                return;
            }

            float dt = clock.AbsSeconds - _lastTickAbsSeconds;
            if (dt < TickInterval) return;
            _lastTickAbsSeconds = clock.AbsSeconds;

            var dbRW = SystemAPI.GetSingletonRW<BuildingsDBSingleton>();
            var unloaded = dbRW.ValueRW.Unloaded;
            if (!unloaded.IsCreated || unloaded.Length == 0) return;

            int count = unloaded.Length;
            int start = 0;
            int length = count;

            if (count > BudgetThreshold)
            {
                start  = _cursor % count;
                length = math.min(BudgetPerTick, count);
                _cursor = (start + length) % count;
            }
            else
            {
                _cursor = 0;
            }

            state.Dependency = new AdvanceJob
            {
                Unloaded  = unloaded.AsDeferredJobArray(),
                DeltaTime = dt,
                NowTurn   = clock.TurnIndex,
                Count     = count,
                Start     = start,
            }.Schedule(length, 32, state.Dependency);
        }

        /// <summary>Indexing note: Schedule runs <c>length</c> parallel iterations (i = 0..length-1). We map i → (Start + i) mod Count inside Execute so round-robin throttling wraps cleanly at list bounds.</summary>
        [BurstCompile]
        struct AdvanceJob : IJobParallelFor
        {
            public NativeArray<UnloadedBuildingRecord> Unloaded;
            public float DeltaTime;
            public uint  NowTurn;
            public int   Count;
            public int   Start;

            public void Execute(int i)
            {
                int idx = (Start + i) % Count;
                var rec = Unloaded[idx];

                // Production accrual — plain rate model for v0. Recipe
                // cycle preservation lives on RecipeCycleRemaining so
                // live resumption is exact; the rate figure below feeds
                // the offline treasury deposit on hydrate.
                float rate = ProductionRate(rec.Type);
                if (rate > 0f) rec.AccruedProduction += rate * DeltaTime;

                // Recipe cycle decays — when it reaches 0 a cycle completes
                // offline (counted toward AccruedProduction via the rate
                // model above, so we just reset the clock).
                if (rec.RecipeCycleRemaining > 0f)
                {
                    rec.RecipeCycleRemaining -= DeltaTime;
                    if (rec.RecipeCycleRemaining < 0f) rec.RecipeCycleRemaining = 0f;
                }

                // Hostile-faction health decay — Bandit Camps + hostile
                // buildings slowly erode while offline if they're flagged
                // as sitting in enemy territory at snapshot time. Prevents
                // abandoned raid sources from piling up forever.
                if ((rec.Flags & UnloadedBuildingFlags.InHostileTerritory) != 0 && rec.Health > 0)
                {
                    float decayPerSec = HostileHealthDecayRate(rec.Type);
                    if (decayPerSec > 0f)
                    {
                        int loss = (int)math.floor(decayPerSec * DeltaTime);
                        rec.Health = (ushort)math.max(0, rec.Health - loss);
                    }
                }

                rec.LastTickTurn = NowTurn;
                Unloaded[idx] = rec;
            }

            /// <summary>Units/second baseline production rate per building type. Keep in sync with <see cref="HexChunkSystem.OfflineOutputItemId"/>.</summary>
            static float ProductionRate(byte type)
            {
                switch (type)
                {
                    case BuildingType.Farm:       return 0.125f;
                    case BuildingType.Village:    return 0.285f;
                    case BuildingType.Lumbercamp: return 0.333f;
                    case BuildingType.MiningPit:  return 0.333f;
                    case BuildingType.Furnace:    return 0.200f;
                    case BuildingType.Dock:       return 0.100f;
                    case BuildingType.GoblinCave: return 0.033f;
                    default:                      return 0f;
                }
            }

            /// <summary>HP/second loss for hostile-faction buildings sitting in Player territory when offline. Bandit Camps decay fastest since they're raid sources players deliberately ignore; fortified hostile types (Keep / Castle / Tower) decay slower. Zero = no offline decay.</summary>
            static float HostileHealthDecayRate(byte type)
            {
                switch (type)
                {
                    case BuildingType.BanditCamp: return 1.5f;  // 1.5 HP / s → dies in ~3.3 min at full HP
                    case BuildingType.GoblinCave: return 0.75f;
                    case BuildingType.Outpost:    return 0.5f;
                    default:                      return 0f;
                }
            }
        }
    }
}
