using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Lifecycle of a queued task entry. Head is Active once promoted to JobIntent; Invalidated/Completed entries get popped next dispatcher pass.</summary>
    public static class TaskState
    {
        public const byte Pending     = 0;
        public const byte Active      = 1;
        public const byte Completed   = 2;
        public const byte Invalidated = 3;
    }

    /// <summary>Per-unit task queue. Head (index 0) mirrors JobIntent while Active. Dispatcher refills on drain; execution systems mark Completed; TaskInvalidationSystem marks Invalidated when the target dies.</summary>
    [InternalBufferCapacity(3)]
    public struct TaskMemory : IBufferElementData
    {
        public byte   Kind;
        public int2   TargetHex;
        public Entity TargetEntity;
        public byte   State;
        public uint   IssuedTick;
    }

    /// <summary>Sub-kind for a TaskOffer — differentiates Looter haul variants (deliver / fetch / arrow / forage) and Builder work types (site / damaged-repair) that share a Kind but need distinct gating at scoring time.</summary>
    public static class OfferVariant
    {
        public const byte Default         = 0;
        public const byte BuilderSite     = 0;   // alias for Default on Builder offers
        public const byte BuilderDamaged  = 1;
        public const byte LooterDeliver   = 10;  // haul food to a needy cave; unit must be carrying food
        public const byte LooterFetch     = 11;  // pick food up at Capital; needy caves must exist
        public const byte LooterArrow     = 12;  // reclaim a GroundArrow
        public const byte LooterForage    = 13;  // harvest a forage-resource hex
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
