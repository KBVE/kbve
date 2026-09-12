using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Snapshot of a cave that currently has food-storage headroom. Built by ProfessionOfferBuildSystem and consumed by ProfessionDispatchSystem when deciding a unit's Looter mode (Deliver / Fetch / arrow+forage fallback).</summary>
    public struct NeedyCave
    {
        public Entity Entity;
        public int2   Hex;
    }

    /// <summary>World-level dispatch context, rebuilt on cadence by ProfessionOfferBuildSystem and read by ProfessionDispatchSystem. Offers is the original insertion-order pool kept for back-compat; per-unit scoring iterates the OffersSortedByKind slice for each kind the unit cares about, looked up via OfferKindStart + OfferKindCount. BuildVersion increments on each rebuild so downstream consumers can gate work to fresh-data ticks without duplicating the cadence check.</summary>
    public struct ProfessionOffersSingleton : IComponentData
    {
        public NativeList<TaskOffer> Offers;
        public NativeArray<int>      OffersPerKind;

        public NativeList<TaskOffer> OffersSortedByKind;
        public NativeArray<int>      OfferKindStart;
        public NativeArray<int>      OfferKindCount;

        public bool   HasCapital;
        public Entity Capital;
        public int2   CapitalHex;
        public bool   CapitalHasFood;

        public NativeList<NeedyCave> NeedyCaves;

        public JobHandle PipelineHandle;

        public uint BuildVersion;
    }
}
