using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Flush point for the quests event pipeline. Each tick: completes the pipeline handle, hands both ReadBuffers to the coalescing <see cref="IQuestEventDispatcher"/> which publishes one <see cref="QuestStartedMessage"/> / <see cref="QuestCompletedMessage"/> per distinct QuestId. Dispatcher is resolved lazily from <see cref="GlobalMessagePipe"/> so this system can exist before VContainer initialisation. Only managed system in the quests domain — everything else is Burst ISystem.</summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(QuestsDomainSystem))]
    public partial class QuestsBridgeSystem : SystemBase
    {
        IQuestEventDispatcher _dispatcher;

        protected override void OnCreate()
        {
            RequireForUpdate<QuestDBSingleton>();
        }

        protected override void OnUpdate()
        {
            ref var db = ref SystemAPI.GetSingletonRW<QuestDBSingleton>().ValueRW;
            db.PipelineHandle.Complete();

            if (_dispatcher == null)
            {
                try
                {
                    var startedPub   = GlobalMessagePipe.GetPublisher<QuestStartedMessage>();
                    var completedPub = GlobalMessagePipe.GetPublisher<QuestCompletedMessage>();
                    _dispatcher      = new QuestEventDispatcher(startedPub, completedPub);
                }
                catch { return; }
            }

            _dispatcher.PublishStartedBatch(db.StartedReadBuffer);
            _dispatcher.PublishCompletedBatch(db.CompletedReadBuffer);
        }
    }
}
