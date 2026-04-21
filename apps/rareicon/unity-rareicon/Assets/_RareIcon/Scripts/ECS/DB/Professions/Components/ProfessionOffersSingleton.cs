using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Snapshot of a cave that currently has food-storage headroom. Built by ProfessionOfferBuildSystem and consumed by ProfessionDispatchSystem when deciding a unit's Looter mode (Deliver / Fetch / arrow+forage fallback).</summary>
    public struct NeedyCave
    {
        public Entity Entity;
        public int2   Hex;
    }

    /// <summary>World-level dispatch context, rebuilt on cadence by ProfessionOfferBuildSystem and read by ProfessionDispatchSystem. Offers is a flat candidate pool so per-unit scoring walks one list instead of re-querying the world per unit. BuildVersion increments on each rebuild so downstream consumers can gate work to fresh-data ticks without duplicating the cadence check.</summary>
    public struct ProfessionOffersSingleton : IComponentData
    {
        public NativeList<TaskOffer> Offers;
        public NativeArray<int>      OffersPerKind;

        public bool   HasCapital;
        public Entity Capital;
        public int2   CapitalHex;
        public bool   CapitalHasFood;

        public bool   HasFarm;
        public Entity NearestFarm;
        public int2   FarmHex;

        public NativeList<NeedyCave> NeedyCaves;

        public uint BuildVersion;
    }
}
