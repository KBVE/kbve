namespace RareIcon
{
    /// <summary>
    /// Goblin name pools + deterministic roller. Names live as ushort
    /// pool indexes on UnitName so the per-entity cost is 4 bytes
    /// (FirstNameId + EpithetId) and Burst can read the component
    /// without managed strings. The actual display string is resolved
    /// by LocaleService.GetGoblinName which can swap epithets per
    /// locale; first names are language-neutral and shared.
    ///
    /// Pool conventions:
    ///   index 0 is reserved as "unset" and intentionally unused —
    ///   resolvers treat (0, 0) as "no UnitName, fall back to
    ///   creature.* locale label".
    /// </summary>
    public static class UnitNaming
    {
        // Hand-picked goblin first names — short, gnarled syllables with
        // hard consonants. Index 0 reserved for "unset"; real names start
        // at 1. Pool size + 1 (the reserved slot) keeps roll math simple.
        public static readonly string[] GoblinFirstNames =
        {
            "(unset)",  // 0 — sentinel
            "Grok", "Skab", "Vrak", "Murr", "Snik", "Brog", "Knob", "Drez",
            "Krug", "Snag", "Vex",  "Gnash","Brak", "Zog",  "Gak",  "Wog",
            "Squ", "Fungo","Mok",  "Pog",  "Nog",  "Krell","Tusk", "Gob",
            "Yark","Wug",  "Mig",  "Drub", "Frak", "Oot",  "Rak",  "Hek",
            "Ghu", "Skra", "Tib",  "Wak",  "Gort", "Nub",  "Plok", "Zik",
            "Snor","Vrek", "Glu",  "Crud", "Kob",  "Snerk","Hoog", "Rib",
            "Glub","Moz",
        };

        // Epithet locale keys — fed into LocaleService.Get(...) so the
        // display string ("the Sly" / "ずる賢き") swaps per language.
        // Index 0 is the "no epithet" sentinel — resolvers skip it and
        // print only the first name.
        public static readonly string[] GoblinEpithetKeys =
        {
            "",                       // 0 — no epithet
            "epithet.sly",
            "epithet.sturdy",
            "epithet.quick",
            "epithet.snaggletooth",
            "epithet.greenfist",
            "epithet.bold",
            "epithet.mudfoot",
            "epithet.splinterhand",
            "epithet.stumpy",
            "epithet.sneaky",
            "epithet.bonebreaker",
            "epithet.hungry",
            "epithet.coalhand",
            "epithet.tall",
            "epithet.onefang",
            "epithet.brave",
            "epithet.pigsticker",
            "epithet.wartfoot",
            "epithet.mean",
            "epithet.knottail",
        };

        /// <summary>Roll deterministic (firstNameId, epithetId) for a goblin from a seed. Same seed → same result across runs / serialization. Roughly 35% of goblins draw an epithet (id != 0).</summary>
        public static (ushort firstId, ushort epithetId) GenerateGoblin(uint rngSeed)
        {
            uint h1 = MixHash(rngSeed ^ 0x9E3779B1u);
            uint h2 = MixHash(rngSeed ^ 0x85EBCA77u);

            // Skip index 0 (sentinel) — first names start at 1.
            int firstCount = GoblinFirstNames.Length - 1;
            ushort firstId = (ushort)(1 + (int)(h1 % (uint)firstCount));

            // ~35% epithet chance. Skip index 0 (no epithet).
            ushort epithetId = 0;
            if ((h2 & 0xFFu) < 90)
            {
                int epCount = GoblinEpithetKeys.Length - 1;
                epithetId = (ushort)(1 + (int)((h2 >> 8) % (uint)epCount));
            }

            return (firstId, epithetId);
        }

        /// <summary>Bounds-checked first-name lookup. Returns empty string for out-of-range / sentinel ids so the caller can branch on the empty string instead of guarding around the array.</summary>
        public static string GetFirstName(ushort id)
        {
            if (id == 0 || id >= GoblinFirstNames.Length) return string.Empty;
            return GoblinFirstNames[id];
        }

        /// <summary>Bounds-checked epithet locale-key lookup. Returns empty string when the goblin has no epithet (id 0) or the id is out of range.</summary>
        public static string GetEpithetKey(ushort id)
        {
            if (id == 0 || id >= GoblinEpithetKeys.Length) return string.Empty;
            return GoblinEpithetKeys[id];
        }

        // Tiny xor-shift mixer.
        static uint MixHash(uint x)
        {
            x ^= x >> 13;
            x *= 0xC2B2AE3Du;
            x ^= x >> 16;
            x *= 0x85EBCA6Bu;
            x ^= x >> 13;
            return x | 1u;
        }
    }
}
