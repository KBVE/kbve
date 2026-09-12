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

        public static readonly string[] GoblinFirstNames =
        {
            "(unset)",
            "Grok", "Skab", "Vrak", "Murr", "Snik", "Brog", "Knob", "Drez",
            "Krug", "Snag", "Vex",  "Gnash","Brak", "Zog",  "Gak",  "Wog",
            "Squ", "Fungo","Mok",  "Pog",  "Nog",  "Krell","Tusk", "Gob",
            "Yark","Wug",  "Mig",  "Drub", "Frak", "Oot",  "Rak",  "Hek",
            "Ghu", "Skra", "Tib",  "Wak",  "Gort", "Nub",  "Plok", "Zik",
            "Snor","Vrek", "Glu",  "Crud", "Kob",  "Snerk","Hoog", "Rib",
            "Glub","Moz",

            "Brak", "Trog", "Nrr",  "Skog", "Vog",  "Mug",  "Bork", "Snib",
            "Krog", "Ghez", "Ulk",  "Drogg","Fnar", "Rok",  "Skra", "Vil",
            "Wrek", "Kib",  "Snug", "Burr", "Glok", "Mret", "Ozz",  "Krin",
            "Snak", "Bog",  "Dnu",  "Hrok", "Pluk", "Sneg", "Vog",  "Wim",
            "Gob",  "Zrak", "Tnug", "Brom", "Klak", "Mob",  "Nork", "Oggu",
            "Prek", "Rud",  "Sib",  "Trok", "Ump",  "Vez",  "Wob",  "Yog",
            "Zin",  "Goz",
        };

        public static readonly string[] GoblinEpithetKeys =
        {
            "",
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

        public static readonly string[] HeroFirstNames =
        {
            "(unset)",
            "Durek", "Thorin", "Balin", "Orik", "Borik",
            "Hagrok", "Morrin", "Kaz", "Valdir", "Rurik",
            "Brandir", "Ozrin", "Falk", "Gareth", "Tormun",
        };

        public static readonly string[] HeroEpithetKeys =
        {
            "",
            "epithet.smith",
            "epithet.craft",
            "epithet.maker",
            "epithet.forge",
            "epithet.gilded",
            "epithet.steady",
            "epithet.master",
        };

        public const ushort HeroFirstIdOffset = 10000;
        public const ushort HeroEpithetIdOffset = 10000;

        public static (ushort firstId, ushort epithetId) GenerateHero(uint rngSeed, byte heroRole)
        {
            uint h1 = MixHash(rngSeed ^ 0x7A3C9B41u);
            uint h2 = MixHash(rngSeed ^ 0xDEADBEEFu);

            int firstCount = HeroFirstNames.Length - 1;
            ushort firstId = (ushort)(HeroFirstIdOffset + 1 + (int)(h1 % (uint)firstCount));

            ushort epithetId;
            if (heroRole == HeroRole.MasterBlacksmith)
                epithetId = (ushort)(HeroEpithetIdOffset + 1);
            else if (heroRole == HeroRole.MasterCraftsman)
                epithetId = (ushort)(HeroEpithetIdOffset + 2);
            else
            {
                int epCount = HeroEpithetKeys.Length - 1;
                epithetId = (ushort)(HeroEpithetIdOffset + 1 + (int)(h2 % (uint)epCount));
            }

            return (firstId, epithetId);
        }

        public static bool IsHeroFirstId(ushort id) => id > HeroFirstIdOffset;
        public static bool IsHeroEpithetId(ushort id) => id > HeroEpithetIdOffset;

        public static string GetHeroFirstName(ushort id)
        {
            if (!IsHeroFirstId(id)) return string.Empty;
            int localId = id - HeroFirstIdOffset;
            if (localId <= 0 || localId >= HeroFirstNames.Length) return string.Empty;
            return HeroFirstNames[localId];
        }

        public static string GetHeroEpithetKey(ushort id)
        {
            if (!IsHeroEpithetId(id)) return string.Empty;
            int localId = id - HeroEpithetIdOffset;
            if (localId <= 0 || localId >= HeroEpithetKeys.Length) return string.Empty;
            return HeroEpithetKeys[localId];
        }

        /// <summary>Roll deterministic (firstNameId, epithetId) for a goblin from a seed. Same seed → same result across runs / serialization. Roughly 35% of goblins draw an epithet (id != 0).</summary>
        public static (ushort firstId, ushort epithetId) GenerateGoblin(uint rngSeed)
        {
            uint h1 = MixHash(rngSeed ^ 0x9E3779B1u);
            uint h2 = MixHash(rngSeed ^ 0x85EBCA77u);

            int firstCount = GoblinFirstNames.Length - 1;
            ushort firstId = (ushort)(1 + (int)(h1 % (uint)firstCount));

            int epCount = GoblinEpithetKeys.Length - 1;
            ushort epithetId = (ushort)(1 + (int)(h2 % (uint)epCount));

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
