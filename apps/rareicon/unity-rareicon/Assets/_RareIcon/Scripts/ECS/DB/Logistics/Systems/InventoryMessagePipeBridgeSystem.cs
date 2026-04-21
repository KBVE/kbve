using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Phase 6 boundary: completes the logistics pipeline handle, drains LogisticsDBSingleton.CommittedEvents on the main thread, and publishes each entry via IPublisher&lt;InventoryChangedMessage&gt;. The publisher is resolved lazily from GlobalMessagePipe so this system can exist before VContainer initialization.</summary>
    [UpdateInGroup(typeof(LogisticsEndGroup))]
    [UpdateAfter(typeof(LedgerMirrorSystem))]
    public partial class InventoryMessagePipeBridgeSystem : SystemBase
    {
        IPublisher<InventoryChangedMessage> _publisher;

        protected override void OnCreate()
        {
            RequireForUpdate<LogisticsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            db.PipelineHandle.Complete();

            var list = db.CommittedEvents;
            if (!list.IsCreated || list.Length == 0) return;

            if (_publisher == null)
            {
                try { _publisher = GlobalMessagePipe.GetPublisher<InventoryChangedMessage>(); }
                catch { return; }
            }

            for (int i = 0; i < list.Length; i++)
                _publisher.Publish(list[i]);

            list.Clear();
        }
    }
}
