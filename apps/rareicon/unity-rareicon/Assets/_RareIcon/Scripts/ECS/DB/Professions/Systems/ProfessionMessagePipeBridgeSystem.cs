using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Drains ProfessionsDBSingleton.CommittedEvents each frame and publishes via IPublisher&lt;ProfessionChangedMessage&gt;. Runs after ProfessionDispatchSystem so all per-frame intent changes are captured before the list resets.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial class ProfessionMessagePipeBridgeSystem : SystemBase
    {
        IPublisher<ProfessionChangedMessage> _publisher;

        protected override void OnCreate()
        {
            RequireForUpdate<ProfessionsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            ref var db = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;

            db.PipelineHandle.Complete();

            var list = db.CommittedEvents;
            if (!list.IsCreated || list.Length == 0) return;

            if (_publisher == null)
            {
                try { _publisher = GlobalMessagePipe.GetPublisher<ProfessionChangedMessage>(); }
                catch { return; }
            }

            for (int i = 0; i < list.Length; i++)
                _publisher.Publish(list[i]);

            list.Clear();
        }
    }
}
