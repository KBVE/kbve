using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stable u8 IDs for persistent status effects; Obsidian is on-hit damage only and lives in DamageSystem.</summary>
    public static class StatusEffectKind
    {
        public const byte None   = 0;
        public const byte Poison = 1;
        public const byte Fire   = 2;
        public const byte Ice    = 3;
        public const byte Curse  = 4;
    }

    /// <summary>One active status effect on a target; targets accumulate several in a DynamicBuffer.</summary>
    [InternalBufferCapacity(4)]
    public struct StatusEffect : IBufferElementData
    {
        public byte  Kind;
        public float Remaining;
        public float Magnitude;
    }

    /// <summary>Locomotion speed multiplier (1.0 = normal); status-effect writes stack here, base MoveSpeed stays authoritative.</summary>
    public struct MovementModifier : IComponentData
    {
        public float SpeedMul;
    }
}
