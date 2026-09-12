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
        public byte   IsNeedy;
    }

    /// <summary>Shared hysteresis update for any "this storage needs supply" flag — Barracks, GoblinCave, future taverns / outposts. Once needy, stays needy until storage reaches stopPct of capacity. Once full, only re-becomes needy below triggerPct. Eliminates the swarming refill loop where every withdraw kicks off a new haul.</summary>
    public static class SupplyHysteresisOps
    {
        public static byte Update(int total, int capacity, byte triggerPercent, byte stopPercent, byte wasNeedy)
        {
            if (capacity <= 0) return 0;
            int trigger = (capacity * triggerPercent) / 100;
            int stop    = (capacity * stopPercent) / 100;
            return wasNeedy != 0
                ? (byte)(total < stop    ? 1 : 0)
                : (byte)(total < trigger ? 1 : 0);
        }
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
