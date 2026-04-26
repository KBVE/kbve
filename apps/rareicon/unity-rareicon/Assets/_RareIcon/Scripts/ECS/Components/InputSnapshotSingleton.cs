using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Blittable snapshot of the currently hovered hex. Burst probe writes; main-thread presentation reads.</summary>
    public struct HoverSnapshot
    {
        public int Generation;
        public int2 HexCoord;
        public byte BiomeId;
        public byte IsLand;

        public byte Wood, Stone, Berries, Mushrooms, Herbs, Cactus, CactusVariant;

        public byte UnitType;
        public byte UnitFaction;
        public ushort UnitNameFirst, UnitNameEpithet;
        public float HpValue, HpMax;
        public float EnValue, EnMax;
        public float MpValue, MpMax;
        public float HgValue, HgMax;
        public float FgValue, FgMax;

        public ushort I0, C0, I1, C1, I2, C2, I3, C3;
    }

    /// <summary>Blittable click event captured by the Burst probe and consumed by the main-thread presentation.</summary>
    public struct ClickSnapshot
    {
        public int2 HexCoord;
        public byte BiomeId;
        public byte IsLand;
    }

    /// <summary>Singleton that owns the hover snapshot + click ringbuffer. Burst probe writes; main-thread presentation reads + dequeues clicks.</summary>
    public struct InputSnapshotSingleton : IComponentData
    {
        public NativeReference<HoverSnapshot> Hover;
        public NativeQueue<ClickSnapshot>     Clicks;

        /// <summary>Probe job handle. Consumer combines into its own Dependency or Completes it before reading <see cref="Hover"/> / draining <see cref="Clicks"/>.</summary>
        public JobHandle ProbeHandle;
    }
}
