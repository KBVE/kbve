using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-turn shrine grant. Reads <see cref="WorldClock"/>.TurnIndex, change-gates on turn delta, then iterates shrines once per turn. A shrine grants its reward when (TerritoryActive AND root hex carries faction territory) OR (KingVisitActive AND King.RootHex == shrine.RootHex), and (TurnIndex >= NextEligibleTurn). Grants land in the Capital ledger; NextEligibleTurn advances by CadenceTurns. Burst ISystem; no managed allocs.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct ShrineProductionSystem : ISystem
    {
        EntityQuery _shrineQuery;
        EntityQuery _kingQuery;
        EntityQuery _capitalQuery;
        uint _lastSeenTurn;
        Unity.Mathematics.Random _rng;

        public void OnCreate(ref SystemState state)
        {
            _shrineQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<LandmarkShrine, Building>()
                .Build(ref state);
            _kingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<KingTag, UnitMovement>()
                .Build(ref state);
            _capitalQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<CapitalTag, CapitalLedger>()
                .Build(ref state);
            _lastSeenTurn = uint.MaxValue;
            _rng = new Unity.Mathematics.Random(0x5421A37Du);

            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<LandmarkShrine>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint turn = clock.TurnIndex;
            if (turn == _lastSeenTurn) return;
            _lastSeenTurn = turn;
            long unixMs = (long)(clock.AbsSeconds * 1000d);

            if (_capitalQuery.IsEmpty) return;
            Entity capital = _capitalQuery.GetSingletonEntity();

            int2 kingHex = new int2(int.MinValue, int.MinValue);
            bool hasKing = false;
            if (!_kingQuery.IsEmpty)
            {
                using var kingArr = _kingQuery.ToEntityArray(Allocator.Temp);
                if (kingArr.Length > 0
                    && SystemAPI.HasComponent<UnitMovement>(kingArr[0]))
                {
                    kingHex = SystemAPI.GetComponent<UnitMovement>(kingArr[0]).CurrentHex;
                    hasKing = true;
                }
            }

            var territoryLookup = SystemAPI.GetComponentLookup<TerritoryVisual>(true);
            var hexDB           = SystemAPI.GetSingleton<HexDBSingleton>();

            var capitalLedger = SystemAPI.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            foreach (var (shrineRef, building, rewards) in
                     SystemAPI.Query<RefRW<LandmarkShrine>, RefRO<Building>, DynamicBuffer<LandmarkShrineRewardItem>>())
            {
                ref var shrine = ref shrineRef.ValueRW;
                if (turn < shrine.NextEligibleTurn) continue;

                int2 hex = building.ValueRO.RootHex;
                bool eligible = false;

                if ((shrine.Flags & ShrineFlags.TerritoryActive) != 0
                    && hexDB.Lookup.TryGetValue(hex, out var tile)
                    && territoryLookup.HasComponent(tile))
                {
                    float tv = territoryLookup[tile].Value;
                    if (tv > 0f && tv < 3f) eligible = true;
                }
                if (!eligible
                    && hasKing
                    && (shrine.Flags & ShrineFlags.KingVisitActive) != 0
                    && kingHex.Equals(hex))
                {
                    eligible = true;
                }
                if (!eligible) continue;

                if (shrine.RewardCoin > 0)
                    BankLedgerOps.AddItem(ref capitalLedger, (ushort)ItemId.Coin, shrine.RewardCoin, UlidFactory.NewUid(ref _rng, unixMs));
                for (int i = 0; i < rewards.Length; i++)
                {
                    if (rewards[i].ItemId == 0 || rewards[i].Amount == 0) continue;
                    BankLedgerOps.AddItem(ref capitalLedger, rewards[i].ItemId, rewards[i].Amount, UlidFactory.NewUid(ref _rng, unixMs));
                }
                shrine.NextEligibleTurn = turn + shrine.CadenceTurns;
            }
        }
    }
}
