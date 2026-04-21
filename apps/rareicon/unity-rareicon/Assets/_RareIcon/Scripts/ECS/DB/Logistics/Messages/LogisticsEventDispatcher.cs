using MessagePipe;
using Unity.Collections;

namespace RareIcon
{
    /// <summary>Pass-through publisher for InventoryChangedMessage. Logistics doesn't coalesce here because LedgerCommitJob already aggregates PendingDeltas per (Bank, ItemId) key before emitting, so every entry in ReadBuffer is already a net per-key delta for the frame.</summary>
    public interface ILogisticsEventDispatcher
    {
        void PublishBatch(NativeList<InventoryChangedMessage> native);
    }

    public sealed class LogisticsEventDispatcher : ILogisticsEventDispatcher
    {
        readonly IPublisher<InventoryChangedMessage> _publisher;

        public LogisticsEventDispatcher(IPublisher<InventoryChangedMessage> publisher)
        {
            _publisher = publisher;
        }

        public void PublishBatch(NativeList<InventoryChangedMessage> native)
        {
            if (!native.IsCreated || native.Length == 0) return;

            for (int i = 0; i < native.Length; i++)
            {
                _publisher.Publish(native[i]);
            }
        }
    }
}
