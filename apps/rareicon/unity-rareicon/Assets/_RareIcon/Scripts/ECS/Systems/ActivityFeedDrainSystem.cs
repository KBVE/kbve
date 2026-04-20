using Unity.Entities;

namespace RareIcon
{
    /// <summary>Drains the activity ring queue once per frame and forwards each snapshot to ActivityFeedService. Every 60 frames, sweeps ReactiveProperty handles whose entity no longer exists.</summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ActivityFeedDrainSystem : SystemBase
    {
        const int StaleSweepInterval = 60;
        const int MaxDrainPerFrame   = 4096;

        int _frameCounter;

        protected override void OnUpdate()
        {
            var service = ActivityFeedBridge.Source;
            if (service == null) return;
            if (!SystemAPI.TryGetSingleton<ActivityFeedSingleton>(out var feed)) return;
            if (!feed.Queue.IsCreated) return;

            int drained = 0;
            while (drained < MaxDrainPerFrame && feed.Queue.TryDequeue(out var snapshot))
            {
                service.Push(in snapshot);
                drained++;
            }

            _frameCounter++;
            if (_frameCounter >= StaleSweepInterval)
            {
                _frameCounter = 0;
                SweepStaleEntries(service);
            }
        }

        void SweepStaleEntries(ActivityFeedService service)
        {
            var tracked = service.GetTrackedEntities();
            for (int i = 0; i < tracked.Length; i++)
            {
                if (!EntityManager.Exists(tracked[i])) service.Forget(tracked[i]);
            }
        }
    }
}
