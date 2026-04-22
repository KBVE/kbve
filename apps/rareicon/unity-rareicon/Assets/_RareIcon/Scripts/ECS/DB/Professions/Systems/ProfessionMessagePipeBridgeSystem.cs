using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Flush point for the profession event pipeline. Each tick: completes the pipeline handle, hands ReadBuffer to the coalescing dispatcher which publishes one IPublisher&lt;ProfessionChangedMessage&gt; per distinct entity. Dispatcher is resolved lazily from GlobalMessagePipe so this system can exist before VContainer initialisation.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionsDomainSystem))]
    public partial class ProfessionMessagePipeBridgeSystem : SystemBase
    {
        IProfessionEventDispatcher _dispatcher;

        protected override void OnCreate()
        {
            RequireForUpdate<ProfessionsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            ref var db = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            db.PipelineHandle.Complete();

            var read = db.ReadBuffer;
            if (!read.IsCreated || read.Length == 0) return;

            if (_dispatcher == null)
            {
                try
                {
                    var publisher = GlobalMessagePipe.GetPublisher<ProfessionChangedMessage>();
                    _dispatcher   = new ProfessionEventDispatcher(publisher);
                }
                catch { return; }
            }

            _dispatcher.PublishBatch(read);
        }
    }
}
