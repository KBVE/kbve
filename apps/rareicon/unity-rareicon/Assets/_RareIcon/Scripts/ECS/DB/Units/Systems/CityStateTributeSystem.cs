using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-gated tribute deposit. Every Vassal city-state with a <see cref="CityStateTribute"/> component drips CoinPerTurn + FoodPerTurn into the nearest player city's ledger when WorldClock.TurnIndex passes <see cref="CityStateTribute"/>.NextTurn. Routes via <see cref="CityIndexSingleton"/> + <see cref="CityRouterOps"/> so once the player owns multiple cities each vassal pays its closest one (Capital today, second city later) without further changes here.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct CityStateTributeSystem : ISystem
    {
        EntityQuery _vassalQuery;
        Unity.Mathematics.Random _rng;
        BufferLookup<CapitalLedger> _capLedger;
        BufferLookup<CityLedger>    _cityLedger;
        ComponentLookup<Building>   _buildingLookup;

        public void OnCreate(ref SystemState state)
        {
            _vassalQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CityStateTag, CityStateTribute, CityStateStatus>()
                .Build(ref state);
            _rng = new Unity.Mathematics.Random(0x9D8B2A11u);

            _capLedger      = state.GetBufferLookup<CapitalLedger>(false);
            _cityLedger     = state.GetBufferLookup<CityLedger>(false);
            _buildingLookup = state.GetComponentLookup<Building>(true);

            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<CityIndexSingleton>();
            state.RequireForUpdate(_vassalQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint turn = clock.TurnIndex;
            long unixMs = (long)(clock.AbsSeconds * 1000d);

            var index = SystemAPI.GetSingleton<CityIndexSingleton>();
            if (!index.Entries.IsCreated || index.Entries.Length == 0) return;

            _capLedger.Update(ref state);
            _cityLedger.Update(ref state);
            _buildingLookup.Update(ref state);

            foreach (var (tributeRW, status, vassalEntity)
                     in SystemAPI.Query<RefRW<CityStateTribute>,
                                        RefRO<CityStateStatus>>()
                                 .WithAll<CityStateTag>()
                                 .WithEntityAccess())
            {
                if (status.ValueRO.Value != CityStateStatusValue.Vassal) continue;
                ref var t = ref tributeRW.ValueRW;
                if (turn < t.NextTurn) continue;

                if (!_buildingLookup.HasComponent(vassalEntity)) continue;
                int2 vassalHex = _buildingLookup[vassalEntity].RootHex;

                if (!CityRouterOps.TryNearestCity(index.Entries, vassalHex, FactionType.Player, out var target))
                    continue;

                DynamicBuffer<BankLedgerBase> ledger;
                if (_capLedger.HasBuffer(target.Entity))
                    ledger = _capLedger[target.Entity].Reinterpret<BankLedgerBase>();
                else if (_cityLedger.HasBuffer(target.Entity))
                    ledger = _cityLedger[target.Entity].Reinterpret<BankLedgerBase>();
                else continue;

                if (t.CoinPerTurn > 0)
                    BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Coin, t.CoinPerTurn, UlidFactory.NewUid(ref _rng, unixMs));
                if (t.FoodPerTurn > 0)
                    BankLedgerOps.AddItem(ref ledger, (ushort)ItemId.Meal, t.FoodPerTurn, UlidFactory.NewUid(ref _rng, unixMs));

                t.NextTurn = turn + math.max(1u, t.CadenceTurns);
            }
        }
    }
}
