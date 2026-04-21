using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Burst-safe append path for ProfessionChangedMessage. Producers (ProfessionDispatchSystem today, future ISystem/IJob producers tomorrow) must use this instead of calling NativeList.Add or IPublisher.Publish directly — one place that enforces Frame + Reason on every write.</summary>
    public static class ProfessionEventSink
    {
        public static void Add(
            ref NativeList<ProfessionChangedMessage> buffer,
            Entity entity,
            byte oldKind,
            byte newKind,
            int2 targetHex,
            Entity targetEntity,
            uint frame,
            ProfessionChangeReason reason)
        {
            buffer.Add(new ProfessionChangedMessage(
                entity, oldKind, newKind, targetHex, targetEntity, frame, reason));
        }
    }
}
