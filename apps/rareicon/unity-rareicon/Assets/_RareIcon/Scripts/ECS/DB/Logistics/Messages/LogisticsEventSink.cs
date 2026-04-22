using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Burst-safe append path for InventoryChangedMessage. LedgerCommitJob (and any future commit/mirror producers) must use this instead of calling NativeList.Add directly — one place the message is constructed.</summary>
    public static class LogisticsEventSink
    {
        public static void Add(
            ref NativeList<InventoryChangedMessage> buffer,
            Entity bank,
            ushort itemId,
            int delta,
            int newCount)
        {
            buffer.Add(new InventoryChangedMessage(bank, itemId, delta, newCount));
        }
    }
}
