using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ranged-attack loadout: cooldown-gated auto-fire at the nearest enemy inside Range.</summary>
    public struct RangedAttack : IComponentData
    {
        public float Range;
        public float Damage;
        public float Cooldown;
        public float TimeSinceShot;
        public byte  ProjectileType;
        public byte  ProjectileMod;
        public float ProjectileSpeed;
        public float ProjectileLifetime;
    }

    /// <summary>How a melee attacker prioritises targets when both units and buildings are in range. Closest is the default "whatever's nearest"; the Prefer* modes give units a strong bonus toward their preferred class, UnitsOnly / BuildingsOnly are hard filters.</summary>
    // TODO(rust-ffi): mirror as #[repr(u8)] enum alongside MeleeAttack.
    public static class MeleeTargetMode
    {
        public const byte Closest         = 0;
        public const byte PreferUnits     = 1;
        public const byte PreferBuildings = 2;
        public const byte UnitsOnly       = 3;
        public const byte BuildingsOnly   = 4;
    }

    /// <summary>Melee-attack loadout: cooldown-gated strike against the nearest viable target (unit or building). TargetMode biases the choice so e.g. sappers rush walls while raiders chase defenders.</summary>
    public struct MeleeAttack : IComponentData
    {
        public float Range;
        public float Damage;
        public float Cooldown;
        public float TimeSinceShot;
        public byte  TargetMode;
    }
}
