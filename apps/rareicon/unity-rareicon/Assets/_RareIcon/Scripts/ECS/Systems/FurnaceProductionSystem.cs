using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-furnace active cycle. Reads CapitalLedger RO to check inputs; enqueues -input and +output BankTransfers for the applier to fold in. No direct RW on CapitalLedger → no cross-producer race.</summary>
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
            if (!SystemAPI.TryGetSingleton<BankTransferQueue>(out var qSingleton)) return;
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;

            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new FurnaceTickJob
            {
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                Queue         = qSingleton.Queue.AsParallelWriter(),
                Now           = now,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct FurnaceTickJob : IJobEntity
    {
        public Entity Capital;
        [ReadOnly] public BufferLookup<CapitalLedger> CapitalLookup;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        public float Now;

        public void Execute(in FurnaceTag tag, ref FurnaceProduction prod)
        {
            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;

                if (prod.Output1Amount > 0) Queue.Enqueue(new BankTransfer { Target = Capital, ItemId = prod.Output1Id, Delta =  prod.Output1Amount });
                if (prod.Output2Amount > 0) Queue.Enqueue(new BankTransfer { Target = Capital, ItemId = prod.Output2Id, Delta =  prod.Output2Amount });
                if (prod.Output3Amount > 0) Queue.Enqueue(new BankTransfer { Target = Capital, ItemId = prod.Output3Id, Delta =  prod.Output3Amount });
                prod.CycleEndsAt = 0f;
                return;
            }

            var storage = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (prod.Input1Amount > 0 && BankLedgerOps.CountOf(storage, prod.Input1Id) < prod.Input1Amount) return;
            if (prod.Input2Amount > 0 && BankLedgerOps.CountOf(storage, prod.Input2Id) < prod.Input2Amount) return;

            if (prod.Input1Amount > 0) Queue.Enqueue(new BankTransfer { Target = Capital, ItemId = prod.Input1Id, Delta = -prod.Input1Amount });
            if (prod.Input2Amount > 0) Queue.Enqueue(new BankTransfer { Target = Capital, ItemId = prod.Input2Id, Delta = -prod.Input2Amount });

            prod.CycleEndsAt = Now + prod.CycleDuration;
        }
    }
}
