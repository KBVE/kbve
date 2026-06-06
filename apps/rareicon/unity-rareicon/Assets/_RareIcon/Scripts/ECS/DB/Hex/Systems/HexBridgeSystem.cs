using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Presentation-side drain for the HexDB event channel. Each tick:
    ///   1. Read <see cref="HexDBSingleton.Events"/> (populated by
    ///      <see cref="HexDomainSystem"/> earlier in the frame).
    ///   2. Publish one <see cref="HexChangedMessage"/> per entry via
    ///      <see cref="GlobalMessagePipe"/> so managed subscribers (UI
    ///      panels, audio cues, minimap) react on the main thread.
    ///   3. Clear the list.
    ///
    /// Single-buffer is safe because the producer (HexDomainSystem,
    /// Burst main-thread inline drain) runs in InitializationSystemGroup
    /// OrderFirst, and this bridge runs in PresentationSystemGroup —
    /// zero phase overlap, zero contention. Publisher is resolved
    /// lazily from GlobalMessagePipe so the bridge survives a
    /// pre-VContainer boot without throwing.
    ///
    /// Client-only: UI reactors don't exist on dedicated server worlds.
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class HexBridgeSystem : SystemBase
    {
        IPublisher<HexChangedMessage> _publisher;

        protected override void OnCreate()
        {
            RequireForUpdate<HexDBSingleton>();
        }

        protected override void OnUpdate()
        {
            if (_publisher == null)
            {
                try { _publisher = GlobalMessagePipe.GetPublisher<HexChangedMessage>(); }
                catch { return; }
            }

            var dbRW = SystemAPI.GetSingletonRW<HexDBSingleton>();
            ref var events = ref dbRW.ValueRW.Events;
            if (!events.IsCreated || events.Length == 0) return;

            int n = events.Length;
            for (int i = 0; i < n; i++)
            {
                var e = events[i];
                _publisher.Publish(new HexChangedMessage(e.Kind, e.Coord, e.Entity));
            }
            events.Clear();
        }
    }
}
