using System.Collections.Generic;
using R3;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Managed bridge between the Burst-side activity ring queue and the reactive UI layer. Per-entity SynchronizedReactiveProperty (the R3 thread-safe variant; matches MouseStateSource's pattern) ensures any UI subscriber sees a consistent value even if a future drain runs off the main thread.</summary>
    public class ActivityFeedService
    {
        readonly Dictionary<Entity, SynchronizedReactiveProperty<ActivitySnapshot>> _byEntity
            = new Dictionary<Entity, SynchronizedReactiveProperty<ActivitySnapshot>>();

        public ReadOnlyReactiveProperty<ActivitySnapshot> For(Entity entity)
        {
            if (_byEntity.TryGetValue(entity, out var prop)) return prop;
            prop = new SynchronizedReactiveProperty<ActivitySnapshot>(default(ActivitySnapshot));
            _byEntity[entity] = prop;
            return prop;
        }

        public ActivitySnapshot CurrentFor(Entity entity)
        {
            if (_byEntity.TryGetValue(entity, out var prop)) return prop.CurrentValue;
            return default(ActivitySnapshot);
        }

        public void Push(in ActivitySnapshot snapshot)
        {
            if (_byEntity.TryGetValue(snapshot.Entity, out var prop))
            {
                prop.Value = snapshot;
                return;
            }
            _byEntity[snapshot.Entity] = new SynchronizedReactiveProperty<ActivitySnapshot>(snapshot);
        }

        public void Forget(Entity entity)
        {
            if (!_byEntity.TryGetValue(entity, out var prop)) return;
            _byEntity.Remove(entity);
            prop.Dispose();
        }

        public IEnumerable<Entity> TrackedEntities => _byEntity.Keys;

        public void Clear()
        {
            foreach (var prop in _byEntity.Values) prop.Dispose();
            _byEntity.Clear();
        }
    }
}
