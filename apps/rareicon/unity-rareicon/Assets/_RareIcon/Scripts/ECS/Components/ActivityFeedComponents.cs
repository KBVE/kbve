using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Stable byte IDs for what a Player unit is currently doing — fed into the activity feed by ActivityFeedWriterSystem and surfaced to UI through ActivityFeedService. Mirrors a repr(u8) Rust enum for future FFI.</summary>

    public static class ActivityKind
    {
        public const byte None             = 0;
        public const byte Idle             = 1;
        public const byte Wandering        = 2;
        public const byte MovingToOrder    = 3;
        public const byte Sleeping         = 4;
        public const byte Eating           = 5;
        public const byte Healing          = 6;
        public const byte ReturningToBase  = 7;
        public const byte SeekingAid       = 8;
        public const byte Foraging         = 9;
        public const byte Lumberjacking    = 10;
        public const byte Mining           = 11;
        public const byte Hunting          = 12;
        public const byte Looting          = 13;
        public const byte Farming          = 14;
        public const byte Building         = 15;
        public const byte Cooking          = 16;
        public const byte Guarding         = 17;
        public const byte TravelingToWork  = 18;
        public const byte Crafting         = 19;
        public const byte Smithing         = 20;
    }

    /// <summary>Per-snapshot activity payload pushed into the ring queue by the writer ISystem. POD; size kept compact (16 bytes) so a 1024-entry ring fits in a single page.</summary>
    public struct ActivitySnapshot
    {
        public Entity Entity;
        public int2   TargetHex;
        public byte   Kind;
        public byte   Reserved0;
        public ushort TargetItemId;
    }

    /// <summary>Sticky per-entity record of the last ActivityKind the writer enqueued. Lets the writer skip duplicate snapshots (delta-only) without an external NativeHashMap.</summary>
    public struct ActivityState : IComponentData
    {
        public byte LastKind;
    }

    /// <summary>Singleton holding the ring queue handle. Allocated once by ActivityFeedBootstrapSystem; both the Burst writer and the managed drain consult it via TryGetSingleton. UnsafeRingQueue is blittable (no DOTS safety system) so it lives inside an IComponentData cleanly.</summary>
    public struct ActivityFeedSingleton : IComponentData
    {
        public UnsafeRingQueue<ActivitySnapshot> Queue;
    }
}
