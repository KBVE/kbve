using Unity.Entities;

namespace RareIcon
{
    public struct UnitBagStatus : IComponentData
    {
        public byte FilledSlots;
        public byte Capacity;
        public bool IsFull => FilledSlots > 0 && FilledSlots >= Capacity;
    }

    public struct CaveFoodStatus : IComponentData
    {
        public ushort FoodCount;
        public ushort Capacity;
        public bool IsNeedy => FoodCount < Capacity;
    }

    public struct CapitalStatus : IComponentData
    {
        public byte HasFood;
    }

    public struct BarracksSupplyStatus : IComponentData
    {
        public byte IsNeedy;
    }
}
