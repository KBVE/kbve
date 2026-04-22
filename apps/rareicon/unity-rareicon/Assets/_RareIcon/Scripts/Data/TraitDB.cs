namespace RareIcon
{
    /// <summary>Canonical trait metadata: per-trait stat/combat modifier bundles + locale keys + pool/roll logic. Accumulate sums up to three traits into a single TraitMod for post-spawn application. Positive traits (1-10) are boosts; Flaws (20-29) are penalties — IsFlaw(kind) differentiates for UI tint and profession-bias gating.</summary>
    public static class TraitDB
    {
        static readonly byte[] PositivePool =
        {
            TraitKind.Tough, TraitKind.Swift, TraitKind.Ascetic, TraitKind.Restful,
            TraitKind.Energetic, TraitKind.Scholar, TraitKind.Keen, TraitKind.Strong,
            TraitKind.Stalwart, TraitKind.Industrious,
        };

        static readonly byte[] FlawPool =
        {
            TraitKind.Frail, TraitKind.Sluggish, TraitKind.Glutton,
            TraitKind.Insomniac, TraitKind.Timid, TraitKind.Sickly,
        };

        public static bool IsFlaw(byte kind) => kind >= 20 && kind < 30;

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

            TraitKind.Frail       => new TraitMod { HealthBonus = -10f },
            TraitKind.Sluggish    => new TraitMod { MoveSpeedBonus = -0.10f },
            TraitKind.Glutton     => new TraitMod { HungerPerSecMul = 0.30f },
            TraitKind.Insomniac   => new TraitMod { FatiguePerSecMul = 0.30f },
            TraitKind.Timid       => new TraitMod { RangedDamageBonus = -1.0f, MeleeDamageBonus = -0.5f },
            TraitKind.Sickly      => new TraitMod { HealthRegenBonus = -0.25f, HealthBonus = -5f },

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
            TraitKind.Frail       => "trait.frail",
            TraitKind.Sluggish    => "trait.sluggish",
            TraitKind.Glutton     => "trait.glutton",
            TraitKind.Insomniac   => "trait.insomniac",
            TraitKind.Timid       => "trait.timid",
            TraitKind.Sickly      => "trait.sickly",
            _                     => "trait.none",
        };

        /// <summary>Deterministic trait roll from an rngSeed. Picks up to 3 distinct traits (~60/30/10% for 1/2/3 count). Each slot has ~20% chance of pulling from the flaw pool instead of the positive pool — flaws are balancing weight, not the default outcome.</summary>
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
                bool flaw = ((h >> 24) & 0xFFu) < 51u;
                var pool = flaw ? FlawPool : PositivePool;
                byte roll = pool[h % (uint)pool.Length];
                if (roll == a || roll == b) continue;
                if      (a == 0) a = roll;
                else if (b == 0) b = roll;
                else if (c == 0) c = roll;
            }
            return new UnitTraits { T0 = a, T1 = b, T2 = c };
        }
    }
}
