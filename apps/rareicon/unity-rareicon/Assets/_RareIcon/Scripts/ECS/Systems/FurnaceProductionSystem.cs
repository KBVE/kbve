using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Drives the per-furnace active cycle on a worker thread. Inputs
    /// consumed from the Capital treasury (CapitalLedger), outputs land
    /// in the Capital treasury too. Forest furnaces also carry a
    /// <see cref="PassiveProduction"/> component which
    /// <see cref="PassiveProductionSystem"/> ticks independently.
    ///
    /// Timing anchored to <see cref="WorldClock"/>.AbsSeconds via
    /// value-capture into the job — no per-system delta accumulator.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct FurnaceProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;

            state.Dependency = new FurnaceTickJob
            {
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                Now           = now,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct FurnaceTickJob : IJobEntity
    {
        public Entity Capital;
        public BufferLookup<CapitalLedger> CapitalLookup;
        public float Now;

        public void Execute(in FurnaceTag tag, ref FurnaceProduction prod)
        {
            var storage = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();

            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;

                if (prod.Output1Amount > 0) BankLedgerOps.AddItem(ref storage, prod.Output1Id, prod.Output1Amount, default);
                if (prod.Output2Amount > 0) BankLedgerOps.AddItem(ref storage, prod.Output2Id, prod.Output2Amount, default);
                if (prod.Output3Amount > 0) BankLedgerOps.AddItem(ref storage, prod.Output3Id, prod.Output3Amount, default);
                prod.CycleEndsAt = 0f;
                return;
            }

            if (prod.Input1Amount > 0 && BankLedgerOps.CountOf(storage, prod.Input1Id) < prod.Input1Amount) return;
            if (prod.Input2Amount > 0 && BankLedgerOps.CountOf(storage, prod.Input2Id) < prod.Input2Amount) return;

            if (prod.Input1Amount > 0) BankLedgerOps.RemoveItem(ref storage, prod.Input1Id, prod.Input1Amount);
            if (prod.Input2Amount > 0) BankLedgerOps.RemoveItem(ref storage, prod.Input2Id, prod.Input2Amount);

            prod.CycleEndsAt = Now + prod.CycleDuration;
        }
    }
}
