using System.Collections.Generic;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Coalesces ReadBuffer by entity (last-write-wins on NewKind/Target/Frame/Reason, preserves the original OldKind) and publishes one IPublisher&lt;ProfessionChangedMessage&gt; event per distinct entity per frame.</summary>
    public interface IProfessionEventDispatcher
    {
        void PublishBatch(NativeList<ProfessionChangedMessage> native);
    }

    public sealed class ProfessionEventDispatcher : IProfessionEventDispatcher
    {
        readonly IPublisher<ProfessionChangedMessage> _publisher;

        readonly Dictionary<Entity, ProfessionChangedMessage> _coalesced
            = new Dictionary<Entity, ProfessionChangedMessage>(512);

        public ProfessionEventDispatcher(IPublisher<ProfessionChangedMessage> publisher)
        {
            _publisher = publisher;
        }

        public void PublishBatch(NativeList<ProfessionChangedMessage> native)
        {
            if (!native.IsCreated || native.Length == 0) return;

            _coalesced.Clear();

            for (int i = 0; i < native.Length; i++)
            {
                var msg = native[i];
                if (_coalesced.TryGetValue(msg.Entity, out var existing))
                {
                    existing.NewKind      = msg.NewKind;
                    existing.TargetHex    = msg.TargetHex;
                    existing.TargetEntity = msg.TargetEntity;
                    existing.Frame        = msg.Frame;
                    existing.Reason       = msg.Reason;
                    _coalesced[msg.Entity] = existing;
                }
                else
                {
                    _coalesced[msg.Entity] = msg;
                }
            }

            foreach (var kv in _coalesced)
            {
                _publisher.Publish(kv.Value);
            }
        }
    }
}
