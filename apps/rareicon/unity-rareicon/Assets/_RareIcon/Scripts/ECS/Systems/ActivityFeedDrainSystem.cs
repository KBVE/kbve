using System.Collections.Generic;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Managed bridge that drains the activity ring queue once per frame and forwards each snapshot to the VContainer-resolved ActivityFeedService. Also sweeps stale entries (entities the EntityManager no longer holds) so long-running sessions don't accumulate orphan ReactiveProperty handles.</summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ActivityFeedDrainSystem : SystemBase
    {
        // Sweep stale entries every N frames — the writer only emits on
        // delta so most ticks have nothing to drain anyway. 60 frames =
        // ~once per second at 60fps; cheap.
        const int StaleSweepInterval = 60;

        readonly List<Entity> _staleScratch = new();
        int _frameCounter;

        protected override void OnUpdate()
        {
            var service = ActivityFeedBridge.Source;
            if (service == null) return;
            if (!SystemAPI.TryGetSingleton<ActivityFeedSingleton>(out var feed)) return;
            if (!feed.Queue.IsCreated) return;

            // Drain — bounded loop guards against a runaway producer ever
            // outpacing the drain (shouldn't happen, but defensive).
            int drained = 0;
            while (drained < 4096 && feed.Queue.TryDequeue(out var snapshot))
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

        // Iterates the service's tracked entities and forgets any whose
        // entity no longer exists. Uses a scratch list because we can't
        // mutate the service's dictionary mid-enumeration.
        void SweepStaleEntries(ActivityFeedService service)
        {
            _staleScratch.Clear();
            foreach (var entity in service.TrackedEntities)
            {
                if (!EntityManager.Exists(entity)) _staleScratch.Add(entity);
            }
            for (int i = 0; i < _staleScratch.Count; i++)
                service.Forget(_staleScratch[i]);
        }
    }
}
