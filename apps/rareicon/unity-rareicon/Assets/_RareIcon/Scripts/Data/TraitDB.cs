namespace RareIcon
{
    /// <summary>Canonical trait metadata: per-trait stat/combat modifier bundles + locale keys. Accumulate sums up to three traits into a single TraitMod for post-spawn application.</summary>
    public static class TraitDB
    {
        public static TraitMod Get(byte kind) => kind switch
        {
            TraitKind.Tough       => new TraitMod { HealthBonus = 15f, EnergyBonus = 5f },
            TraitKind.Swift       => new TraitMod { MoveSpeedBonus = 0.12f },
            TraitKind.Ascetic     => new TraitMod { HungerPerSecMul = -0.20f, HungerMaxBonus = -20f },
            TraitKind.Restful     => new TraitMod { FatiguePerSecMul = -0.20f, FatigueMaxBonus = -20f },
            TraitKind.Energetic   => new TraitMod { EnergyBonus = 25f, EnergyRegenBonus = 1.0f },
            TraitKind.Scholar     => new TraitMod { ManaBonus = 30f, ManaRegenBonus = 1.0f },
            TraitKind.Keen        => new TraitMod { RangedDamageBonus = 1.5f },
            TraitKind.Strong      => new TraitMod { MeleeDamageBonus = 1.0f },
            TraitKind.Stalwart    => new TraitMod { HealthBonus = 20f, HealthRegenBonus = 0.5f },
            TraitKind.Industrious => new TraitMod { EnergyRegenBonus = 0.5f, FatiguePerSecMul = -0.10f },
            _                     => default,
        };

        /// <summary>Sum three slot kinds into one TraitMod. Empty slots (Kind.None) contribute nothing.</summary>
        public static TraitMod Accumulate(UnitTraits traits)
        {
            var sum = default(TraitMod);
            Add(ref sum, Get(traits.T0));
            Add(ref sum, Get(traits.T1));
            Add(ref sum, Get(traits.T2));
            return sum;
        }

        static void Add(ref TraitMod sum, TraitMod m)
        {
            sum.HealthBonus       += m.HealthBonus;
            sum.EnergyBonus       += m.EnergyBonus;
            sum.ManaBonus         += m.ManaBonus;
            sum.HungerMaxBonus    += m.HungerMaxBonus;
            sum.FatigueMaxBonus   += m.FatigueMaxBonus;
            sum.MoveSpeedBonus    += m.MoveSpeedBonus;
            sum.HealthRegenBonus  += m.HealthRegenBonus;
            sum.EnergyRegenBonus  += m.EnergyRegenBonus;
            sum.ManaRegenBonus    += m.ManaRegenBonus;
            sum.HungerPerSecMul   += m.HungerPerSecMul;
            sum.FatiguePerSecMul  += m.FatiguePerSecMul;
            sum.RangedDamageBonus += m.RangedDamageBonus;
            sum.MeleeDamageBonus  += m.MeleeDamageBonus;
        }

        public static string GetLocaleKey(byte kind) => kind switch
        {
            TraitKind.Tough       => "trait.tough",
            TraitKind.Swift       => "trait.swift",
            TraitKind.Ascetic     => "trait.ascetic",
            TraitKind.Restful     => "trait.restful",
            TraitKind.Energetic   => "trait.energetic",
            TraitKind.Scholar     => "trait.scholar",
            TraitKind.Keen        => "trait.keen",
            TraitKind.Strong      => "trait.strong",
            TraitKind.Stalwart    => "trait.stalwart",
            TraitKind.Industrious => "trait.industrious",
            _                     => "trait.none",
        };

        /// <summary>Deterministic trait roll from an rngSeed. Picks up to 3 distinct traits; output slots that are 0 mean "no trait". ~60% chance of 1 trait, ~30% of 2, ~10% of 3.</summary>
        public static UnitTraits Roll(uint rngSeed)
        {
            uint h = rngSeed * 0x9E3779B1u;
            h ^= h >> 13; h *= 0x85EBCA77u; h ^= h >> 16;

            int traitCount;
            uint pick = h & 0xFFu;
            if      (pick < 26)  traitCount = 3;
            else if (pick < 102) traitCount = 2;
            else                 traitCount = 1;

            byte a = 0, b = 0, c = 0;
            for (int i = 0; i < traitCount; i++)
            {
                h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
                byte roll = (byte)(1u + (h % (uint)(TraitKind.Count - 1)));
                if (roll == a || roll == b) continue;
                if      (a == 0) a = roll;
                else if (b == 0) b = roll;
                else if (c == 0) c = roll;
            }
            return new UnitTraits { T0 = a, T1 = b, T2 = c };
        }
    }
}
