using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Per-producer-system NativeQueue registry — each producer owns a dedicated queue so there is zero cross-producer contention on ParallelWriter CAS operations. Bus tracks a combined JobHandle across every producer; the applier waits on it and drains every queue sequentially. Scales to 10k+ concurrent units/buildings because producer jobs never share a queue.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class BankTransferQueueSystem : SystemBase
    {
        readonly List<NativeQueue<BankTransfer>> _queues = new();
        JobHandle _combinedProducerHandle;

        public IReadOnlyList<NativeQueue<BankTransfer>> Queues => _queues;

        public NativeQueue<BankTransfer> AllocateProducerQueue()
        {
            var q = new NativeQueue<BankTransfer>(Allocator.Persistent);
            _queues.Add(q);
            return q;
        }

        public void AddJobHandleForProducer(JobHandle handle)
            => _combinedProducerHandle = JobHandle.CombineDependencies(_combinedProducerHandle, handle);

        public JobHandle GetProducerHandle() => _combinedProducerHandle;

        public void ResetProducerHandle() => _combinedProducerHandle = default;

        protected override void OnDestroy()
        {
            _combinedProducerHandle.Complete();
            for (int i = 0; i < _queues.Count; i++)
                if (_queues[i].IsCreated) _queues[i].Dispose();
            _queues.Clear();
        }

        protected override void OnUpdate() { }
    }
}
