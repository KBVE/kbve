using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ticks PassiveProduction entities — free per-cycle output emitted to Capital. No inputs, no RW on any ledger; enqueues a +OutputAmount BankTransfer when the cycle clock fires.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup), OrderFirst = true)]
    public partial struct PassiveProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            if (!SystemAPI.TryGetSingleton<BankTransferQueue>(out var qSingleton)) return;
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new PassiveTickJob
            {
                Capital = capital,
                Queue   = qSingleton.Queue.AsParallelWriter(),
                Now     = now,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct PassiveTickJob : IJobEntity
    {
        public Entity Capital;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        public float Now;

        public void Execute(ref PassiveProduction prod)
        {
            if (prod.CycleEndsAt == 0f)
            {
                prod.CycleEndsAt = Now + prod.CycleDuration;
                return;
            }
            if (Now < prod.CycleEndsAt) return;

            Queue.Enqueue(new BankTransfer { Target = Capital, ItemId = prod.OutputId, Delta = prod.OutputAmount });
            prod.CycleEndsAt = prod.CycleEndsAt + prod.CycleDuration;
        }
    }
}
