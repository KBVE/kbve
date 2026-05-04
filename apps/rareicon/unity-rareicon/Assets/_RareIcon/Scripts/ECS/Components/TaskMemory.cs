using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Lifecycle of a queued task entry. Head is Active once promoted to ProfessionIntent; Invalidated/Completed entries get popped next dispatcher pass.</summary>
    public static class TaskState
    {
        public const byte Pending     = 0;
        public const byte Active      = 1;
        public const byte Completed   = 2;
        public const byte Invalidated = 3;
    }

    /// <summary>Per-unit task queue. Head (index 0) mirrors ProfessionIntent while Active. Dispatcher refills on drain; execution systems mark Completed; TaskInvalidationSystem marks Invalidated when the target dies.</summary>
    [InternalBufferCapacity(3)]
    public struct TaskMemory : IBufferElementData
    {
        public byte   Kind;
        public int2   TargetHex;
        public Entity TargetEntity;
        public byte   State;
        public uint   IssuedTick;
    }

    /// <summary>Burst-safe helpers for mutating a unit's TaskMemory head. Used by executor systems (Harvest, Builder, Looter, Barracks supply) to flip the head's State to Completed/Invalidated on their work-done boundary.</summary>
    public static class TaskMemoryOps
    {
        public static void MarkHead(DynamicBuffer<TaskMemory> tasks, byte newState)
        {
            if (tasks.Length == 0) return;
            var head = tasks[0];
            if (head.State == TaskState.Active || head.State == TaskState.Pending)
            {
                head.State = newState;
                tasks[0]   = head;
            }
        }
    }

    /// <summary>Sub-kind for a TaskOffer — differentiates Looter haul variants (deliver / fetch / arrow / forage) and Builder work types (site / damaged-repair) that share a Kind but need distinct gating at scoring time.</summary>
    public static class OfferVariant
    {
        public const byte Default         = 0;
        public const byte BuilderSite     = 0;   // alias for Default on Builder offers
        public const byte BuilderDamaged  = 1;
        public const byte LooterDeliver   = 10;  // haul food to a needy cave; unit must be carrying food
        public const byte LooterFetch     = 11;  // pick food up at Capital; needy caves must exist
        public const byte LooterArrow     = 12;
        public const byte LooterForage    = 13;
        public const byte LooterDropPickup = 14;
    }

    /// <summary>World-level candidate job. Produced once per dispatcher tick by the offer enumeration pass; per-unit scoring walks this flat list instead of re-querying the world. Kind+Variant fully disambiguate the target type so TaskInvalidationSystem and the scorer can gate correctly.</summary>
    public struct TaskOffer
    {
        public byte   Kind;
        public byte   Variant;
        public int2   Hex;
        public Entity Target;
    }
}
