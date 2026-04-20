using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Intent layer: byte Kind + byte Priority + int2 TargetHex; blittable for Rust FFI.</summary>
    // TODO(rust-ffi): mirror as #[repr(C)] MovementGoal in uniti so server-side behavior trees can read/write the same memory layout.
    public struct MovementGoal : IComponentData
    {
        public byte Kind;
        public byte Priority;
        public int2 TargetHex;
    }

    /// <summary>Reason a unit is moving. Stable byte IDs mirroring a repr(u8) Rust enum.</summary>
    public static class GoalKind
    {
        public const byte None         = 0;
        public const byte MoveToHex    = 1;
        public const byte ReturnToBase = 2;
        public const byte Wander       = 3;
        public const byte Hunt         = 4;
        public const byte Flee         = 5;
        public const byte Follow       = 6;
    }

    /// <summary>Priority bands; a behavior only overwrites an existing goal when its priority is strictly higher.</summary>
    public static class GoalPriority
    {
        public const byte None    = 0;
        public const byte Wander  = 10;
        public const byte Harvest = 30;
        public const byte Hunt    = 40;
        public const byte Return  = 50;
        public const byte Order   = 100;
        public const byte Flee    = 200;
    }
}
