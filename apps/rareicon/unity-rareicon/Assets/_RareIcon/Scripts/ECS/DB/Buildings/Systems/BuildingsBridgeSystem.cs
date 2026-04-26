using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Presentation-side drain for <see cref="BuildingsDBSingleton.Events"/>.
    /// Each tick:
    ///   1. Read Events populated by per-type lifecycle systems earlier
    ///      in the frame (Sim / Cleanup).
    ///   2. Dispatch each entry to the matching typed IPublisher&lt;T&gt;.
    ///   3. Clear Events.
    ///
    /// Single-buffer-safe because producer (per-type systems, Sim/Cleanup)
    /// and consumer (this system, Presentation) never overlap within a
    /// frame. Publishers are resolved lazily from GlobalMessagePipe so
    /// the bridge survives a pre-VContainer boot without throwing.
    ///
    /// Client-only — UI / achievement reactors don't exist on dedicated
    /// server worlds. Future multiplayer: emit-to-ghost-replicated-clients
    /// pattern goes here too.
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class BuildingsBridgeSystem : SystemBase
    {
        IPublisher<BuildingSpawnedMessage>              _pubSpawned;
        IPublisher<BuildingConstructionCompleteMessage> _pubConstruction;
        IPublisher<BuildingTierChangedMessage>          _pubTier;
        IPublisher<BuildingDamagedMessage>              _pubDamaged;
        IPublisher<BuildingRepairedMessage>             _pubRepaired;
        IPublisher<BuildingDestroyedMessage>            _pubDestroyed;
        IPublisher<BuildingDemolishedMessage>           _pubDemolished;

        protected override void OnCreate()
        {
            RequireForUpdate<BuildingsDBSingleton>();
        }

        bool TryResolve()
        {
            if (_pubSpawned != null) return true;
            try
            {
                _pubSpawned      = GlobalMessagePipe.GetPublisher<BuildingSpawnedMessage>();
                _pubConstruction = GlobalMessagePipe.GetPublisher<BuildingConstructionCompleteMessage>();
                _pubTier         = GlobalMessagePipe.GetPublisher<BuildingTierChangedMessage>();
                _pubDamaged      = GlobalMessagePipe.GetPublisher<BuildingDamagedMessage>();
                _pubRepaired     = GlobalMessagePipe.GetPublisher<BuildingRepairedMessage>();
                _pubDestroyed    = GlobalMessagePipe.GetPublisher<BuildingDestroyedMessage>();
                _pubDemolished   = GlobalMessagePipe.GetPublisher<BuildingDemolishedMessage>();
                return true;
            }
            catch { return false; }
        }

        protected override void OnUpdate()
        {
            if (!TryResolve()) return;

            var dbRW = SystemAPI.GetSingletonRW<BuildingsDBSingleton>();
            ref var db = ref dbRW.ValueRW;
            db.EventsWriteHandle.Complete();
            db.EventsWriteHandle = default;
            ref var events = ref db.Events;
            if (!events.IsCreated || events.Length == 0) return;

            int n = events.Length;
            for (int i = 0; i < n; i++)
            {
                var e = events[i];
                switch (e.Kind)
                {
                    case BuildingEventKind.Spawned:
                        _pubSpawned.Publish(new BuildingSpawnedMessage(e.Entity, e.Type, e.RootHex, e.OwnerFaction));
                        break;
                    case BuildingEventKind.ConstructionComplete:
                        _pubConstruction.Publish(new BuildingConstructionCompleteMessage(e.Entity, e.Type, e.RootHex, e.OwnerFaction));
                        break;
                    case BuildingEventKind.TierChanged:
                        _pubTier.Publish(new BuildingTierChangedMessage(e.Entity, e.Type, e.Tier));
                        break;
                    case BuildingEventKind.Damaged:
                        _pubDamaged.Publish(new BuildingDamagedMessage(e.Entity, e.HealthDelta, e.HealthCurrent));
                        break;
                    case BuildingEventKind.Repaired:
                        _pubRepaired.Publish(new BuildingRepairedMessage(e.Entity, e.HealthDelta, e.HealthCurrent));
                        break;
                    case BuildingEventKind.Destroyed:
                        _pubDestroyed.Publish(new BuildingDestroyedMessage(e.Entity, e.Type, e.RootHex, e.OwnerFaction));
                        break;
                    case BuildingEventKind.Demolished:
                        _pubDemolished.Publish(new BuildingDemolishedMessage(e.Entity, e.Type, e.RootHex));
                        break;
                }
            }
            events.Clear();
        }
    }
}
