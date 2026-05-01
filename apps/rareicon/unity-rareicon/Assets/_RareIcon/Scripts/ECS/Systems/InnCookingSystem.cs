using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodic Inn kitchen tick. Every <see cref="CookingCadenceTurns"/> sim-turns, walks Inn entities with an <see cref="InnLedger"/> + <see cref="BuildingTier"/> and runs at most one eligible recipe per Inn — consumes the ingredients, deposits the cooked food back into the same ledger. Recipes are tier-gated (T0 = Meal, T1 = Soup, T2 = Feast) so upgrading the Inn unlocks better food without touching the consumer side. Higher tiers are tried first so a Lodge always cooks Feasts before falling back to Meals.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct InnCookingSystem : ISystem
    {
        const uint CookingCadenceTurns = 6;

        EntityQuery _innQuery;
        NativeArray<InnRecipe> _recipes;
        uint _lastTurn;
        Unity.Mathematics.Random _rng;

        public void OnCreate(ref SystemState state)
        {
            _innQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag, BuildingTier, InnLedger>()
                .Build(ref state);
            _recipes = InnRecipeDB.Build(Allocator.Persistent);
            _lastTurn = uint.MaxValue;
            _rng = new Unity.Mathematics.Random(0x82B17C4Du);

            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate(_innQuery);
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            if (_recipes.IsCreated) _recipes.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            uint turn = clock.TurnIndex;
            if (_lastTurn != uint.MaxValue && turn - _lastTurn < CookingCadenceTurns) return;
            _lastTurn = turn;

            var entities  = _innQuery.ToEntityArray(Allocator.Temp);
            var tierLU    = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var ledgerLU  = SystemAPI.GetBufferLookup<InnLedger>(false);
            long unixMs   = (long)(clock.AbsSeconds * 1000d);

            for (int i = 0; i < entities.Length; i++)
            {
                var inn = entities[i];
                byte tier = tierLU[inn].Value;
                if (!ledgerLU.HasBuffer(inn)) continue;
                var ledger = ledgerLU[inn].Reinterpret<BankLedgerBase>();
                TryCook(ref ledger, tier, unixMs);
            }
            entities.Dispose();
        }

        void TryCook(ref DynamicBuffer<BankLedgerBase> ledger, byte tier, long unixMs)
        {
            for (int rIdx = _recipes.Length - 1; rIdx >= 0; rIdx--)
            {
                var r = _recipes[rIdx];
                if (r.MinTier > tier) continue;
                if (!HasInputs(ledger, r)) continue;

                ConsumeInputs(ref ledger, r);
                BankLedgerOps.AddItem(
                    ref ledger,
                    r.OutputId,
                    r.OutputCount,
                    UlidFactory.NewUid(ref _rng, unixMs));
                return;
            }
        }

        static bool HasInputs(DynamicBuffer<BankLedgerBase> ledger, in InnRecipe r)
        {
            if (r.InputId0 != 0 && BankLedgerOps.CountOf(ledger, r.InputId0) < r.InputCount0) return false;
            if (r.InputId1 != 0 && BankLedgerOps.CountOf(ledger, r.InputId1) < r.InputCount1) return false;
            if (r.InputId2 != 0 && BankLedgerOps.CountOf(ledger, r.InputId2) < r.InputCount2) return false;
            return true;
        }

        static void ConsumeInputs(ref DynamicBuffer<BankLedgerBase> ledger, in InnRecipe r)
        {
            if (r.InputId0 != 0) BankLedgerOps.RemoveItem(ref ledger, r.InputId0, r.InputCount0);
            if (r.InputId1 != 0) BankLedgerOps.RemoveItem(ref ledger, r.InputId1, r.InputCount1);
            if (r.InputId2 != 0) BankLedgerOps.RemoveItem(ref ledger, r.InputId2, r.InputCount2);
        }
    }
}
