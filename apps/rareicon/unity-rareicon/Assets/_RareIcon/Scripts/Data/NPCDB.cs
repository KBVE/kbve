namespace RareIcon
{
    /// <summary>
    /// Behavioural / lore taxonomy for creatures. Drives high-level systems
    /// (faction lookup, "is this undead?" damage modifiers, AI archetypes)
    /// without coupling to the specific UnitType.
    /// </summary>
    public enum NPCCategory : byte
    {
        Civilian  = 0,
        Humanoid  = 1,  // goblins, orcs, soldiers, knights
        Beast     = 2,  // wolves, bears
        Undead    = 3,
        Elemental = 4,
        Boss      = 5,
    }

    /// <summary>
    /// Per-creature defaults — base stats + default loadout + locale key.
    /// UnitSpawnSystem pulls these so spawn code stays generic; per-instance
    /// jitter (speed, RNG seed) layers on top at spawn time.
    /// </summary>
    public readonly struct NPCDef
    {
        public readonly byte UnitType;
        public readonly string NameKey;
        public readonly NPCCategory Category;
        public readonly float MaxHealth;
        public readonly float MaxEnergy;
        public readonly float MaxMana;       // 0 = creature has no mana stat
        public readonly float MoveSpeed;     // base; spawn applies ±jitter
        public readonly float HealthRegen;   // per-second; 0 = no regen component
        public readonly float EnergyRegen;
        public readonly float ManaRegen;
        public readonly byte DefaultWeapon;  // WeaponType.* constant

        public NPCDef(byte unitType, string nameKey, NPCCategory category,
                      float maxHealth, float maxEnergy, float maxMana,
                      float moveSpeed,
                      float healthRegen, float energyRegen, float manaRegen,
                      byte defaultWeapon)
        {
            UnitType    = unitType;
            NameKey     = nameKey;
            Category    = category;
            MaxHealth   = maxHealth;
            MaxEnergy   = maxEnergy;
            MaxMana     = maxMana;
            MoveSpeed   = moveSpeed;
            HealthRegen = healthRegen;
            EnergyRegen = energyRegen;
            ManaRegen   = manaRegen;
            DefaultWeapon = defaultWeapon;
        }
    }

    /// <summary>
    /// Source of truth for creature defaults. Dense byte-indexed array —
    /// UnitType IDs fit in 0..255 so we get O(1) lookup with zero GC and
    /// no Dictionary overhead. Empty slots return a fallback "Unknown" def
    /// so callers never null-deref.
    ///
    /// Long-term: this table mirrors a Rust crate (uniti) so the server
    /// uses the same baseline stats as the client. For now: pure C#.
    /// </summary>
    public static class NPCDB
    {
        const int Capacity = 256;
        static readonly NPCDef[] _byId = new NPCDef[Capacity];
        static bool _initialized;

        static void EnsureInit()
        {
            if (_initialized) return;
            _initialized = true;

            Add(new NPCDef(
                unitType:      UnitType.Goblin,
                nameKey:       "creature.goblin",
                category:      NPCCategory.Humanoid,
                maxHealth:     30f,
                maxEnergy:     100f,
                maxMana:       0f,             // goblins don't carry mana
                moveSpeed:     0.7f,           // base — spawn jitters around this
                healthRegen:   0.5f,
                energyRegen:   5.0f,
                manaRegen:     0f,
                defaultWeapon: WeaponType.Club));

            // Future creatures land here — Wolf, Skeleton, GoblinShaman, etc.
        }

        static void Add(NPCDef def) => _byId[def.UnitType] = def;

        /// <summary>
        /// Look up the def by UnitType. Returns a placeholder NPCDef for
        /// unknown IDs so spawn code never NPEs on missing entries.
        /// </summary>
        public static NPCDef Get(byte unitType)
        {
            EnsureInit();
            var def = _byId[unitType];
            // UnitType.None entries default-construct with UnitType=0 — treat
            // any zero-named def as "missing" and return a fallback.
            if (def.NameKey == null)
                return new NPCDef(unitType, "creature.unknown",
                    NPCCategory.Humanoid, 10f, 10f, 0f, 0.5f, 0f, 0f, 0f,
                    WeaponType.None);
            return def;
        }
    }
}
