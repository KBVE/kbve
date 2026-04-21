using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Chunk-A shim: drains every legacy NativeQueue&lt;BankTransfer&gt; producer queue into LogisticsDBSingleton.PendingDeltas as raw per-key deltas (skipping the reservation phase because legacy producers aren't reservation-aware). Goes away entirely in Chunk B once every producer emits ReservationRecord directly. Runs OrderLast in EconomySystemGroup — the last touch before LogisticsEndGroup resolves / commits / mirrors.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial class InventoryTransferApplierSystem : SystemBase
    {
        BankTransferQueueSystem _bus;

        protected override void OnCreate()
        {
            _bus = World.GetExistingSystemManaged<BankTransferQueueSystem>()
                ?? World.CreateSystemManaged<BankTransferQueueSystem>();
            RequireForUpdate<LogisticsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            var queues = _bus.Queues;
            if (queues.Count == 0) return;

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            var dep = JobHandle.CombineDependencies(Dependency, _bus.GetProducerHandle(), db.PipelineHandle);

            for (int i = 0; i < queues.Count; i++)
            {
                dep = new TranslateBankTransferJob
                {
                    Queue         = queues[i],
                    PendingDeltas = db.PendingDeltas.AsParallelWriter(),
                }.Schedule(dep);
            }

            Dependency        = dep;
            db.PipelineHandle = dep;
            _bus.ResetProducerHandle();
        }
    }

    [BurstCompile]
    public struct TranslateBankTransferJob : IJob
    {
        public NativeQueue<BankTransfer>                                 Queue;
        public NativeParallelMultiHashMap<LedgerKey, int>.ParallelWriter PendingDeltas;

        public void Execute()
        {
            while (Queue.TryDequeue(out var t))
            {
                if (t.Delta == 0) continue;
                PendingDeltas.Add(new LedgerKey { Bank = t.Target, ItemId = t.ItemId }, t.Delta);
            }
        }
    }
}
