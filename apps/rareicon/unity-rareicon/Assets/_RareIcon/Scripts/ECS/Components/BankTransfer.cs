using Unity.Entities;

namespace RareIcon
{
    /// <summary>Single additive/subtractive bank transaction. Producers enqueue via the ParallelWriter obtained from BankTransferQueueSystem.CreateWriter(); InventoryTransferApplierSystem is the sole consumer and only RW writer of every bank ledger.</summary>
    public struct BankTransfer
    {
        public Entity Target;
        public ushort ItemId;
        public int    Delta;
    }
}
