using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>One-shot managed bootstrap that allocates the ActivityFeed ring queue and stamps it into a singleton component. Owns disposal in OnDestroy so the queue's persistent allocation never leaks across world reloads. The Burst writer + managed drain both consult the singleton via TryGetSingleton, so neither ever has to touch managed allocator code.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class ActivityFeedBootstrapSystem : SystemBase
    {
        // 1024 entries × 16 bytes = 16 KB — comfortably above any realistic
        // single-tick churn (delta-only writer + max ~200 player units).
        // Sized once; resizing a ring queue at runtime isn't supported.
        const int QueueCapacity = 1024;

        Entity _singletonEntity;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (_initialized) return;

            var queue = new UnsafeRingQueue<ActivitySnapshot>(QueueCapacity, Allocator.Persistent);

            _singletonEntity = EntityManager.CreateEntity(typeof(ActivityFeedSingleton));
            EntityManager.SetComponentData(_singletonEntity, new ActivityFeedSingleton { Queue = queue });

            _initialized = true;
        }

        protected override void OnDestroy()
        {
            // Defensive — if Bootstrap fired the singleton might still hold
            // the live queue handle; pull it back and dispose.
            if (!_initialized) return;
            if (!EntityManager.Exists(_singletonEntity)) return;

            var s = EntityManager.GetComponentData<ActivityFeedSingleton>(_singletonEntity);
            if (s.Queue.IsCreated) s.Queue.Dispose();
        }
    }
}
