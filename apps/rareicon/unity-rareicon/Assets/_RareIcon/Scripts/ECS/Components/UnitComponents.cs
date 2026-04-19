using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Unit type IDs — passed to HexUnit.shader via _UnitType to pick which
    /// pixel-art include draws the creature. Add new ones at the end.
    /// </summary>
    public static class UnitType
    {
        public const byte None    = 0;
        public const byte Goblin  = 1;
        // Soldier, Wolf, Skeleton, etc. land here as we add them.
    }

    /// <summary>
    /// Tag + per-unit identity data. Movement / AI / stat components layer
    /// on top. Health / Energy / Mana live in their own components (see
    /// StatComponents.cs) so units only carry the stats they actually have.
    /// Weapon is intentionally separate from creature type: a Goblin can
    /// hold a Club today and a Sword tomorrow without changing UnitType.
    /// </summary>
    public struct Unit : IComponentData
    {
        public byte Type;     // UnitType.* constant
        public byte Weapon;   // WeaponType.* constant
    }

    /// <summary>Weapon IDs — each maps to one HexX.hlsl draw function.</summary>
    public static class WeaponType
    {
        public const byte None  = 0;
        public const byte Club  = 1;
        // Sword, Bow, Spear, Staff, etc. land here as we add their .hlsl files.
    }

    /// <summary>
    /// Per-instance MaterialProperty so the shader knows which weapon to
    /// draw on top of the creature sprite (positioned at the creature's
    /// hand anchor). 0 = no weapon, otherwise WeaponType.* constant.
    /// </summary>
    [MaterialProperty("_UnitWeapon")]
    public struct UnitWeaponVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Tag for the spawn-system test goblin (cleanup later).</summary>
    public struct UnitTestTag : IComponentData { }

    /// <summary>
    /// Per-instance MaterialProperty so HexUnit.shader knows which creature
    /// to draw on each unit entity. Value is the UnitType byte cast to float.
    /// </summary>
    [MaterialProperty("_UnitType")]
    public struct UnitVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// 4-direction sprite facing for top-down units. The unit shader picks a
    /// distinct sprite for each facing (West reuses East mirrored).
    /// </summary>
    public static class UnitFacing
    {
        public const byte East  = 0;  // looking right (default)
        public const byte North = 1;  // looking up — back of character
        public const byte West  = 2;  // looking left (mirrored East sprite)
        public const byte South = 3;  // looking down — toward camera
    }

    /// <summary>
    /// Per-instance MaterialProperty carrying the unit's facing direction.
    /// Updated by UnitMovementSystem from the most-recent movement vector.
    /// </summary>
    [MaterialProperty("_UnitFacing")]
    public struct UnitFacingVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-unit movement state for wandering. Sim stays in hex-space; world
    /// position is derived only when interpolating between CurrentHex and
    /// TargetHex. RandomState is a per-unit RNG so units that arrive at
    /// the same hex on the same tick still pick different next directions
    /// (no herd lockstep).
    /// </summary>
    public struct UnitMovement : IComponentData
    {
        public int2 CurrentHex;
        public int2 TargetHex;
        public float MoveSpeed;   // world units / second
        public byte Facing;       // mirrors UnitFacingVisual
        public uint RandomState;  // per-unit xorshift state
        public uint WanderStep;   // monotonic counter, advances each arrival
        // Time remaining (seconds) the unit stands still at its current hex
        // after arriving. Lets the sprite-facing flip happen while stationary,
        // so a 90°/180° turn reads as a deliberate pause-then-walk instead of
        // a teleport-flip.
        public float DwellTimer;
        // Last hex-neighbour direction (0..5) the unit moved in. Lets the
        // wander pick bias toward "continue forward" instead of uniform-
        // random ping-ponging. 255 = no previous direction (uniform pick).
        public byte LastDir;
    }
}
