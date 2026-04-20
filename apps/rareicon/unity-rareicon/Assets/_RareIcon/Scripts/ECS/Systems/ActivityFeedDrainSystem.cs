using Unity.Entities;

namespace RareIcon
{
    /// <summary>Periodically sweeps ReactiveProperty handles whose entity no longer exists. The writer now pushes directly into ActivityFeedService so there's no queue to drain — this system exists solely for long-session cleanup.</summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ActivityFeedDrainSystem : SystemBase
    {
        const int StaleSweepInterval = 60;

        int _frameCounter;

        protected override void OnUpdate()
        {
            var service = ActivityFeedBridge.Source;
            if (service == null) return;

            _frameCounter++;
            if (_frameCounter < StaleSweepInterval) return;
            _frameCounter = 0;

            var tracked = service.GetTrackedEntities();
            for (int i = 0; i < tracked.Length; i++)
            {
                if (!EntityManager.Exists(tracked[i])) service.Forget(tracked[i]);
            }
        }
    }
}
