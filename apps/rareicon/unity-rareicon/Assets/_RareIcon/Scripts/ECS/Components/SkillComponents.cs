using Unity.Entities;

namespace RareIcon
{
    /// <summary>Skill IDs parallel to JobKind so UI + progression can cross-reference by index; values are canonical for Rust FFI.</summary>
    // TODO(rust-ffi): mirror as #[repr(u8)] SkillKind enum.
    public static class SkillKind
    {
        public const byte Foraging   = 0;
        public const byte Lumberjack = 1;
        public const byte Mining     = 2;
        public const byte Combat     = 3;
        public const byte Scavenging = 4;
        public const byte Husbandry  = 5;
    }

    /// <summary>Per-unit skill levels (byte 0..SkillCap); lookups by SkillKind byte index.</summary>
    // TODO(rust-ffi): persist across chunk unload.
    public struct Skills : IComponentData
    {
        public const byte SkillCap = 10;

        public byte Foraging;
        public byte Lumberjack;
        public byte Mining;
        public byte Combat;
        public byte Scavenging;
        public byte Husbandry;

        public byte Get(byte kind) => kind switch
        {
            SkillKind.Foraging   => Foraging,
            SkillKind.Lumberjack => Lumberjack,
            SkillKind.Mining     => Mining,
            SkillKind.Combat     => Combat,
            SkillKind.Scavenging => Scavenging,
            SkillKind.Husbandry  => Husbandry,
            _                    => (byte)0,
        };

        public void Set(byte kind, byte value)
        {
            switch (kind)
            {
                case SkillKind.Foraging:   Foraging   = value; break;
                case SkillKind.Lumberjack: Lumberjack = value; break;
                case SkillKind.Mining:     Mining     = value; break;
                case SkillKind.Combat:     Combat     = value; break;
                case SkillKind.Scavenging: Scavenging = value; break;
                case SkillKind.Husbandry:  Husbandry  = value; break;
            }
        }
    }

    /// <summary>Per-skill XP accumulator; rolls to the next skill level when it crosses SkillProgressionSystem.XPPerLevel.</summary>
    public struct SkillXP : IComponentData
    {
        public ushort Foraging;
        public ushort Lumberjack;
        public ushort Mining;
        public ushort Combat;
        public ushort Scavenging;
        public ushort Husbandry;

        public ushort Get(byte kind) => kind switch
        {
            SkillKind.Foraging   => Foraging,
            SkillKind.Lumberjack => Lumberjack,
            SkillKind.Mining     => Mining,
            SkillKind.Combat     => Combat,
            SkillKind.Scavenging => Scavenging,
            SkillKind.Husbandry  => Husbandry,
            _                    => (ushort)0,
        };

        public void Set(byte kind, ushort value)
        {
            switch (kind)
            {
                case SkillKind.Foraging:   Foraging   = value; break;
                case SkillKind.Lumberjack: Lumberjack = value; break;
                case SkillKind.Mining:     Mining     = value; break;
                case SkillKind.Combat:     Combat     = value; break;
                case SkillKind.Scavenging: Scavenging = value; break;
                case SkillKind.Husbandry:  Husbandry  = value; break;
            }
        }
    }
}
