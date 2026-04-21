using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Single additive/subtractive bank transaction. Producers emit positive deltas (credit a ledger) and negative deltas (debit a ledger) into BankTransferQueue.Queue via NativeQueue&lt;BankTransfer&gt;.ParallelWriter from worker threads. InventoryTransferApplierSystem is the sole RW writer of every bank ledger — it completes producer dependencies, dequeues, and applies. Producers keep only RO BufferLookups on source ledgers so the entire producer→applier graph has exactly one writer per ledger type and cross-producer safety races cannot exist.</summary>
    public struct BankTransfer
    {
        public Entity Target;
        public ushort ItemId;
        public int    Delta;
    }

    /// <summary>Singleton wrapping the process-wide NativeQueue&lt;BankTransfer&gt;. Allocated at boot by ItemDBBootstrapSystem (persistent allocator) and disposed on world teardown. Producers receive AsParallelWriter() copies via job fields; the applier drains sequentially in its own IJob.</summary>
    public struct BankTransferQueue : IComponentData
    {
        public NativeQueue<BankTransfer> Queue;
    }
}
