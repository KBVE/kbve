using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stable byte IDs for unit traits. Rolled at spawn for non-King Player units. Positive range 1-10 (stat / combat boosts), negative range 20-29 (flaws — stat penalties / extra need drain). TraitDB.IsFlaw(kind) differentiates them for UI / balance.</summary>
    public static class TraitKind
    {
        public const byte None        = 0;
        public const byte Tough       = 1;
        public const byte Swift       = 2;
        public const byte Ascetic     = 3;
        public const byte Restful     = 4;
        public const byte Energetic   = 5;
        public const byte Scholar     = 6;
        public const byte Keen        = 7;
        public const byte Strong      = 8;
        public const byte Stalwart    = 9;
        public const byte Industrious = 10;

        public const byte Frail       = 20;
        public const byte Sluggish    = 21;
        public const byte Glutton     = 22;
        public const byte Insomniac   = 23;
        public const byte Timid       = 24;
        public const byte Sickly      = 25;
    }

    /// <summary>Per-unit traits (up to 3). 0 = empty slot. Attached to non-King Player units at spawn.</summary>
    public struct UnitTraits : IComponentData
    {
        public byte T0;
        public byte T1;
        public byte T2;
    }

    /// <summary>Accumulated stat / combat modifier bundle for a set of traits. Produced by TraitDB.Accumulate and applied post-spawn to Health/Energy/Mana/Hunger/Fatigue/UnitMovement/RangedAttack/MeleeAttack.</summary>
    public struct TraitMod
    {
        public float HealthBonus;
        public float EnergyBonus;
        public float ManaBonus;
        public float HungerMaxBonus;
        public float FatigueMaxBonus;
        public float MoveSpeedBonus;
        public float HealthRegenBonus;
        public float EnergyRegenBonus;
        public float ManaRegenBonus;
        public float HungerPerSecMul;
        public float FatiguePerSecMul;
        public float RangedDamageBonus;
        public float MeleeDamageBonus;
    }
}
