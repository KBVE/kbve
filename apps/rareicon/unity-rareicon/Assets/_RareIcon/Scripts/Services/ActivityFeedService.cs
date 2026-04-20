using System.Collections.Generic;
using R3;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Managed bridge between the Burst-side activity ring queue and the
    /// reactive UI layer. The drain system pumps snapshots in via Push();
    /// UI subscribes via For(entity).Subscribe(...) and only re-renders
    /// on actual change (R3 ReactiveProperty dedupes by EqualityComparer
    /// — and the writer already filters to deltas, so subscribers fire
    /// exactly once per real activity transition).
    ///
    /// Entity → ReactiveProperty cache grows lazily and is pruned by the
    /// drain when an entity stops existing in the EntityManager. No
    /// frame-loop polling, no per-tick managed query — exactly the
    /// "compute in Burst, observe in managed" split the architecture
    /// targets.
    /// </summary>
    public class ActivityFeedService
    {
        readonly Dictionary<Entity, ReactiveProperty<ActivitySnapshot>> _byEntity = new();

        /// <summary>Subscribe to a unit's activity stream. Idempotent — repeated calls for the same entity return the same source. Returns ReadOnlyReactiveProperty so callers can both subscribe AND read CurrentValue without being able to mutate.</summary>
        public ReadOnlyReactiveProperty<ActivitySnapshot> For(Entity entity)
        {
            if (!_byEntity.TryGetValue(entity, out var prop))
            {
                prop = new ReactiveProperty<ActivitySnapshot>(default);
                _byEntity[entity] = prop;
            }
            return prop;
        }

        /// <summary>Snapshot accessor for one-shot reads (e.g. RosterTab building the row label without subscribing). Returns default when the entity hasn't emitted yet.</summary>
        public ActivitySnapshot CurrentFor(Entity entity)
            => _byEntity.TryGetValue(entity, out var prop) ? prop.CurrentValue : default;

        /// <summary>Called by the drain system once per snapshot pulled from the ring queue. Sets the per-entity ReactiveProperty; R3 dedupes so the actual subscriber fires only on real changes.</summary>
        public void Push(in ActivitySnapshot snapshot)
        {
            if (!_byEntity.TryGetValue(snapshot.Entity, out var prop))
            {
                prop = new ReactiveProperty<ActivitySnapshot>(snapshot);
                _byEntity[snapshot.Entity] = prop;
                return;
            }
            prop.Value = snapshot;
        }

        /// <summary>Called by the drain system when an entity is gone from the EntityManager. Disposes the property and drops the cache slot so long-running sessions don't accrete stale handles.</summary>
        public void Forget(Entity entity)
        {
            if (_byEntity.Remove(entity, out var prop))
                prop.Dispose();
        }

        /// <summary>Iterate currently-tracked entities — used by the drain system's stale-entry sweep.</summary>
        public Dictionary<Entity, ReactiveProperty<ActivitySnapshot>>.KeyCollection TrackedEntities
            => _byEntity.Keys;

        public void Clear()
        {
            foreach (var prop in _byEntity.Values) prop.Dispose();
            _byEntity.Clear();
        }
    }
}
