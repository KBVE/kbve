using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-hex catch-yield carried by river + ocean tiles. <see cref="ItemId"/> is the harvested fish (Salmon for river, BlueShark for ocean). <see cref="Amount"/> is the live stock; <see cref="MaxAmount"/> is the regen ceiling. <see cref="NextRegenSecond"/> is the WorldClock.AbsSeconds floor before the next +1 tops up the stock. Drops to 0 when fished out and rebuilds passively.</summary>
    public struct WaterResource : IComponentData
    {
        public ushort ItemId;
        public byte   Amount;
        public byte   MaxAmount;
        public float  NextRegenSecond;
    }
}
