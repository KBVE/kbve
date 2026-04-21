using Unity.Entities;

namespace RareIcon
{
    /// <summary>Published by InventoryMessagePipeBridgeSystem once per (bank,item) key committed in LogisticsEndGroup Phase 4. Carries the post-commit state so subscribers never need to poll the ledger buffer back.</summary>
    public readonly struct InventoryChangedMessage
    {
        public readonly Entity Bank;
        public readonly ushort ItemId;
        public readonly int    Delta;
        public readonly int    NewCount;

        public InventoryChangedMessage(Entity bank, ushort itemId, int delta, int newCount)
        {
            Bank     = bank;
            ItemId   = itemId;
            Delta    = delta;
            NewCount = newCount;
        }
    }
}
