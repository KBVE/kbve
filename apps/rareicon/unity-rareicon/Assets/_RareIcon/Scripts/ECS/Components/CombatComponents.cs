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
}
