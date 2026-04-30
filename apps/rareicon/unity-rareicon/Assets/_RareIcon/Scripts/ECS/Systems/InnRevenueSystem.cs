using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodic coin trickle from Tavern / Lodge sleepers into the Capital ledger. Runs once per <see cref="CadenceTurns"/> off the WorldClock turn delta. Inn (T0) yields nothing; Tavern (T1) mints 1 coin per occupied bed per cadence; Lodge (T2) mints 2 per. No revenue if there's no Capital or zero sleepers, so empty inns are free to keep around.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct InnRevenueSystem : ISystem
    {
        const uint CadenceTurns      = 4;
        const ushort CoinPerSleeperT1 = 1;
        const ushort CoinPerSleeperT2 = 2;

        EntityQuery _innQuery;
        EntityQuery _capitalQuery;
        EntityQuery _sleepersQuery;
        uint _lastTurn;
        Unity.Mathematics.Random _rng;

        public void OnCreate(ref SystemState state)
        {
            _innQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag, BuildingTier>()
                .Build(ref state);
            _capitalQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CapitalTag, CapitalLedger>()
                .Build(ref state);
            _sleepersQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<SleepingTag, UnitMovement>()
                .Build(ref state);

            _lastTurn = uint.MaxValue;
            _rng = new Unity.Mathematics.Random(0x4E13A8B1u);

            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate(_innQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint turn = clock.TurnIndex;
            if (_lastTurn != uint.MaxValue && turn - _lastTurn < CadenceTurns) return;
            _lastTurn = turn;

            if (_capitalQuery.IsEmpty) return;
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexDb)) return;

            var inns       = _innQuery.ToEntityArray(Allocator.Temp);
            var sleepers   = _sleepersQuery.ToEntityArray(Allocator.Temp);
            var movementLU = SystemAPI.GetComponentLookup<UnitMovement>(true);
            var occupantLU = SystemAPI.GetComponentLookup<HexOccupant>(true);
            var tierLU     = SystemAPI.GetComponentLookup<BuildingTier>(true);

            var counts = new NativeParallelHashMap<Entity, int>(inns.Length, Allocator.Temp);
            for (int i = 0; i < inns.Length; i++) counts.TryAdd(inns[i], 0);

            for (int i = 0; i < sleepers.Length; i++)
            {
                var s = sleepers[i];
                if (!movementLU.HasComponent(s)) continue;
                if (!hexDb.Lookup.TryGetValue(movementLU[s].CurrentHex, out var tile)) continue;
                if (!occupantLU.HasComponent(tile)) continue;
                Entity building = occupantLU[tile].Building;
                if (building == Entity.Null) continue;
                if (counts.TryGetValue(building, out int c)) counts[building] = c + 1;
            }

            Entity capital = _capitalQuery.GetSingletonEntity();
            var capitalLedger = SystemAPI.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            long unixMs = (long)(clock.AbsSeconds * 1000d);

            for (int i = 0; i < inns.Length; i++)
            {
                var e = inns[i];
                byte tier = tierLU[e].Value;
                if (tier == 0) continue;
                int sleeperCount = counts.TryGetValue(e, out int c) ? c : 0;
                if (sleeperCount == 0) continue;
                ushort yield = tier == 1 ? CoinPerSleeperT1 : CoinPerSleeperT2;
                int total = sleeperCount * yield;
                if (total <= 0) continue;
                BankLedgerOps.AddItem(
                    ref capitalLedger,
                    (ushort)ItemId.Coin,
                    (ushort)math.min(total, ushort.MaxValue),
                    UlidFactory.NewUid(ref _rng, unixMs));
            }

            counts.Dispose();
            inns.Dispose();
            sleepers.Dispose();
        }
    }
}
