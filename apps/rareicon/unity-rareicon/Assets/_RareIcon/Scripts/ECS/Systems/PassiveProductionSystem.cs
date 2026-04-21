using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ticks PassiveProduction entities — free per-cycle output to Capital. Owns a dedicated producer queue.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderFirst = true)]
    public partial struct PassiveProductionSystem : ISystem
    {
        NativeQueue<BankTransfer> _queue;

        public void OnCreate(ref SystemState state)
        {
            var bus = state.World.GetExistingSystemManaged<BankTransferQueueSystem>()
                      ?? state.World.CreateSystemManaged<BankTransferQueueSystem>();
            _queue = bus.AllocateProducerQueue();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            var handle = new PassiveTickJob
            {
                Capital = capital,
                Queue   = _queue.AsParallelWriter(),
                Now     = now,
            }.ScheduleParallel(state.Dependency);

            state.World.GetExistingSystemManaged<BankTransferQueueSystem>().AddJobHandleForProducer(handle);
            state.Dependency = handle;
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
