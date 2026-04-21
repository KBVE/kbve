using System;
using System.Collections.Generic;
using R3;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Main-thread bridge from ECS activity snapshots into the reactive UI layer. NOT thread-safe — Burst producers enqueue into the native ring queue and a main-thread system (ActivityFeedDrainSystem) is the only caller of Push / Forget / Clear.</summary>
    public sealed class ActivityFeedService : IDisposable
    {
        readonly Dictionary<Entity, ReactiveProperty<ActivitySnapshot>> _byEntity = new();

        public ReadOnlyReactiveProperty<ActivitySnapshot> For(Entity entity)
        {
            if (!_byEntity.TryGetValue(entity, out var prop))
            {
                prop = new ReactiveProperty<ActivitySnapshot>(default);
                _byEntity.Add(entity, prop);
            }
            return prop;
        }

        public bool TryGetCurrent(Entity entity, out ActivitySnapshot snapshot)
        {
            if (_byEntity.TryGetValue(entity, out var prop))
            {
                snapshot = prop.CurrentValue;
                return true;
            }
            snapshot = default;
            return false;
        }

        public ActivitySnapshot CurrentFor(Entity entity)
            => _byEntity.TryGetValue(entity, out var prop) ? prop.CurrentValue : default;

        public void Push(in ActivitySnapshot snapshot)
        {
            if (_byEntity.TryGetValue(snapshot.Entity, out var prop))
            {
                prop.Value = snapshot;
                return;
            }
            _byEntity.Add(snapshot.Entity, new ReactiveProperty<ActivitySnapshot>(snapshot));
        }

        public bool Forget(Entity entity)
        {
            if (!_byEntity.TryGetValue(entity, out var prop)) return false;
            _byEntity.Remove(entity);
            prop.Dispose();
            return true;
        }

        public Entity[] GetTrackedEntities()
        {
            var result = new Entity[_byEntity.Count];
            int i = 0;
            foreach (var entity in _byEntity.Keys) result[i++] = entity;
            return result;
        }

        public void Clear()
        {
            foreach (var prop in _byEntity.Values) prop.Dispose();
            _byEntity.Clear();
        }

        public void Dispose() => Clear();
    }
}
