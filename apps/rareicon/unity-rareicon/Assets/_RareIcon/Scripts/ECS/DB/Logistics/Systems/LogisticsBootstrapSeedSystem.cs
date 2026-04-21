using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Seeds LogisticsDBSingleton.CurrentAmounts from each bank's initial DynamicBuffer<*Ledger> slots the first time the bank is seen. Tags the bank with BankSeededTag so subsequent frames skip it. Runs in LogisticsBeginGroup so CurrentAmounts is populated before any producer reservation resolves against it.</summary>
    [UpdateInGroup(typeof(LogisticsBeginGroup))]
    [UpdateAfter(typeof(LogisticsDomainSystem))]
    public partial struct LogisticsBootstrapSeedSystem : ISystem
    {
        EntityQuery _capitalQ;
        EntityQuery _furnaceQ;
        EntityQuery _farmQ;
        EntityQuery _barracksQ;
        EntityQuery _goblinCaveQ;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();

            _capitalQ    = new EntityQueryBuilder(Allocator.Temp).WithAll<CapitalLedger>().WithNone<BankSeededTag>().Build(ref state);
            _furnaceQ    = new EntityQueryBuilder(Allocator.Temp).WithAll<FurnaceLedger>().WithNone<BankSeededTag>().Build(ref state);
            _farmQ       = new EntityQueryBuilder(Allocator.Temp).WithAll<FarmLedger>().WithNone<BankSeededTag>().Build(ref state);
            _barracksQ   = new EntityQueryBuilder(Allocator.Temp).WithAll<BarracksLedger>().WithNone<BankSeededTag>().Build(ref state);
            _goblinCaveQ = new EntityQueryBuilder(Allocator.Temp).WithAll<GoblinCaveLedger>().WithNone<BankSeededTag>().Build(ref state);
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            bool any =
                !_capitalQ.IsEmpty ||
                !_furnaceQ.IsEmpty ||
                !_farmQ.IsEmpty ||
                !_barracksQ.IsEmpty ||
                !_goblinCaveQ.IsEmpty;

            if (!any) return;

            state.CompleteDependency();

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            db.PipelineHandle.Complete();

            SeedCapital(ref state, ref db);
            SeedFurnace(ref state, ref db);
            SeedFarm(ref state, ref db);
            SeedBarracks(ref state, ref db);
            SeedGoblinCave(ref state, ref db);
        }

        void SeedCapital(ref SystemState state, ref LogisticsDBSingleton db)
        {
            var entities = _capitalQ.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var buf = state.EntityManager.GetBuffer<CapitalLedger>(e).Reinterpret<BankLedgerBase>();
                SeedOne(ref db, e, buf);
                state.EntityManager.AddComponent<BankSeededTag>(e);
            }
            entities.Dispose();
        }

        void SeedFurnace(ref SystemState state, ref LogisticsDBSingleton db)
        {
            var entities = _furnaceQ.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var buf = state.EntityManager.GetBuffer<FurnaceLedger>(e).Reinterpret<BankLedgerBase>();
                SeedOne(ref db, e, buf);
                state.EntityManager.AddComponent<BankSeededTag>(e);
            }
            entities.Dispose();
        }

        void SeedFarm(ref SystemState state, ref LogisticsDBSingleton db)
        {
            var entities = _farmQ.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var buf = state.EntityManager.GetBuffer<FarmLedger>(e).Reinterpret<BankLedgerBase>();
                SeedOne(ref db, e, buf);
                state.EntityManager.AddComponent<BankSeededTag>(e);
            }
            entities.Dispose();
        }

        void SeedBarracks(ref SystemState state, ref LogisticsDBSingleton db)
        {
            var entities = _barracksQ.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var buf = state.EntityManager.GetBuffer<BarracksLedger>(e).Reinterpret<BankLedgerBase>();
                SeedOne(ref db, e, buf);
                state.EntityManager.AddComponent<BankSeededTag>(e);
            }
            entities.Dispose();
        }

        void SeedGoblinCave(ref SystemState state, ref LogisticsDBSingleton db)
        {
            var entities = _goblinCaveQ.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var buf = state.EntityManager.GetBuffer<GoblinCaveLedger>(e).Reinterpret<BankLedgerBase>();
                SeedOne(ref db, e, buf);
                state.EntityManager.AddComponent<BankSeededTag>(e);
            }
            entities.Dispose();
        }

        static void SeedOne(ref LogisticsDBSingleton db, Entity bank, in DynamicBuffer<BankLedgerBase> buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                var key = new LedgerKey { Bank = bank, ItemId = buf[i].ItemId };
                db.CurrentAmounts.TryGetValue(key, out var existing);
                db.CurrentAmounts[key] = existing + buf[i].Count;
            }
        }
    }
}
