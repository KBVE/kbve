using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Drains the activity ring queue once per frame and forwards each snapshot to ActivityFeedService. Every 60 frames, sweeps ReactiveProperty handles whose entity no longer exists.</summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ActivityFeedDrainSystem : SystemBase
    {
        const int StaleSweepInterval = 60;
        const int MaxDrainPerFrame   = 4096;

        int _frameCounter;

        const double DiagIntervalSeconds = 30.0;

        int    _diagTotalDrained;
        bool   _diagSawNullService;
        bool   _diagSawNullSingleton;
        double _nextDiagTime = 3.0;

        protected override void OnUpdate()
        {
            var service = ActivityFeedBridge.Source;
            if (service == null) { _diagSawNullService = true; MaybeLogDiag(null, 0); return; }
            if (!SystemAPI.TryGetSingleton<ActivityFeedSingleton>(out var feed)) { _diagSawNullSingleton = true; MaybeLogDiag(service, 0); return; }
            if (!feed.Queue.IsCreated) { MaybeLogDiag(service, 0); return; }

            int drained = 0;
            while (drained < MaxDrainPerFrame && feed.Queue.TryDequeue(out var snapshot))
            {
                service.Push(in snapshot);
                drained++;
            }
            _diagTotalDrained += drained;

            _frameCounter++;
            if (_frameCounter >= StaleSweepInterval)
            {
                _frameCounter = 0;
                SweepStaleEntries(service);
            }

            MaybeLogDiag(service, drained);
        }

        void MaybeLogDiag(ActivityFeedService service, int drainedThisFrame)
        {
            if (SystemAPI.Time.ElapsedTime < _nextDiagTime) return;
            _nextDiagTime = SystemAPI.Time.ElapsedTime + DiagIntervalSeconds;

            int tracked = service == null ? 0 : service.GetTrackedEntities().Length;
            Debug.Log($"[ActivityDrain diag] sawNullService={_diagSawNullService} sawNullSingleton={_diagSawNullSingleton} " +
                      $"totalDrained={_diagTotalDrained} trackedEntities={tracked} drainedThisFrame={drainedThisFrame}");
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
