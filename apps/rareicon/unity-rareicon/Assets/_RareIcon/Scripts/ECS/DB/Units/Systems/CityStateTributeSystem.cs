using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-gated tribute deposit. Every Vassal city-state with a <see cref="CityStateTribute"/> component drips CoinPerTurn + FoodPerTurn into the Capital ledger when WorldClock.TurnIndex passes <see cref="CityStateTribute"/>.NextTurn. Re-arms the cadence after each payment.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct CityStateTributeSystem : ISystem
    {
        EntityQuery _capitalQuery;
        EntityQuery _vassalQuery;
        Unity.Mathematics.Random _rng;

        public void OnCreate(ref SystemState state)
        {
            _capitalQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CapitalTag, CapitalLedger>()
                .Build(ref state);
            _vassalQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CityStateTag, CityStateTribute, CityStateStatus>()
                .Build(ref state);
            _rng = new Unity.Mathematics.Random(0x9D8B2A11u);

            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate(_vassalQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (_capitalQuery.IsEmpty) return;
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint turn = clock.TurnIndex;
            long unixMs = (long)(clock.AbsSeconds * 1000d);

            Entity capital = _capitalQuery.GetSingletonEntity();
            var ledger = SystemAPI.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            foreach (var (tributeRW, status)
                     in SystemAPI.Query<RefRW<CityStateTribute>,
                                        RefRO<CityStateStatus>>()
                                 .WithAll<CityStateTag>())
            {
                if (status.ValueRO.Value != CityStateStatusValue.Vassal) continue;
                ref var t = ref tributeRW.ValueRW;
                if (turn < t.NextTurn) continue;

                if (t.CoinPerTurn > 0)
                    BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, t.CoinPerTurn, UlidFactory.NewUid(ref _rng, unixMs));
                if (t.FoodPerTurn > 0)
                    BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Meal, t.FoodPerTurn, UlidFactory.NewUid(ref _rng, unixMs));

                t.NextTurn = turn + math.max(1u, t.CadenceTurns);
            }
        }
    }
}
