using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Marks a building entity as a construction site (not yet functional); paired with a ConstructionMaterial buffer that tracks required-vs-delivered amounts.</summary>

    public struct ConstructionSite : IComponentData
    {
        public int2 RootHex;
        public byte OwnerFaction;
    }

    /// <summary>Per-site material slot; Needed is set at site creation from BuildingDB.GetCost; Delivered ticks up as Builders drop items off.</summary>
    [InternalBufferCapacity(4)]
    public struct ConstructionMaterial : IBufferElementData
    {
        public ushort ItemId;
        public ushort Needed;
        public ushort Delivered;
    }
}
