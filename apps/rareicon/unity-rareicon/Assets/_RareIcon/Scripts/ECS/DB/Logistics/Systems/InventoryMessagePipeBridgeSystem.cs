using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Phase 6 boundary: completes the logistics pipeline handle and hands ReadBuffer to the LogisticsEventDispatcher which publishes each entry via IPublisher&lt;InventoryChangedMessage&gt;. Dispatcher is resolved lazily from GlobalMessagePipe so this system can exist before VContainer initialisation.</summary>
    [UpdateInGroup(typeof(LogisticsEndGroup))]
    [UpdateAfter(typeof(LedgerMirrorSystem))]
    public partial class InventoryMessagePipeBridgeSystem : SystemBase
    {
        ILogisticsEventDispatcher _dispatcher;

        protected override void OnCreate()
        {
            RequireForUpdate<LogisticsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            db.PipelineHandle.Complete();

            var read = db.ReadBuffer;
            if (!read.IsCreated || read.Length == 0) return;

            if (_dispatcher == null)
            {
                try
                {
                    var publisher = GlobalMessagePipe.GetPublisher<InventoryChangedMessage>();
                    _dispatcher   = new LogisticsEventDispatcher(publisher);
                }
                catch { return; }
            }

            _dispatcher.PublishBatch(read);
        }
    }
}
