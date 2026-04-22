using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stable byte IDs for relief actions; mirrors a repr(u8) Rust enum for future FFI.</summary>
    // TODO(rust-ffi): add matching #[repr(u8)] ReliefKind enum in uniti crate; values here are the canonical IDs.
    public static class ReliefKind
    {
        public const byte None            = 0;
        public const byte Eat             = 1;
        public const byte Sleep           = 2;
        public const byte Heal            = 3;
        public const byte ReturnToCapital = 4;
        public const byte SeekAid         = 5;
    }

    /// <summary>Chosen relief action for a creature, rewritten each frame by ReliefSystem; executors key off Kind. StartTick is the nowTick when Kind transitioned from None→non-None; used by ShelterSystem to eject units stuck in relief with empty packs past ShelterStuckTimeoutTicks.</summary>
    public struct ReliefIntent : IComponentData
    {
        public byte  Kind;
        public float Urgency;
        public uint  StartTick;
    }
}
