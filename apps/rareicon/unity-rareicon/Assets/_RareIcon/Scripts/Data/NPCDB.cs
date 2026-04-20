namespace RareIcon
{
    /// <summary>Behavioural taxonomy driving high-level AI / damage modifiers without coupling to UnitType.</summary>
    public enum NPCCategory : byte
    {
        Civilian  = 0,
        Humanoid  = 1,
        Beast     = 2,
        Undead    = 3,
        Elemental = 4,
        Boss      = 5,
    }

    /// <summary>Per-creature default stats + attributes + loadout; UnitSpawnSystem pulls these to stay generic across creature types.</summary>
    public readonly struct NPCDef
    {
        public readonly byte UnitType;
        public readonly string NameKey;
        public readonly NPCCategory Category;

        public readonly float MaxHealth;
        public readonly float MaxEnergy;
        public readonly float MaxMana;
        public readonly float MaxHunger;
        public readonly float MaxFatigue;
        public readonly float MoveSpeed;
        public readonly float HealthRegen;
        public readonly float EnergyRegen;
        public readonly float ManaRegen;
        public readonly float HungerPerSec;
        public readonly float FatiguePerSec;

        public readonly byte Strength;
        public readonly byte Agility;
        public readonly byte Intellect;
        public readonly byte Will;

        public readonly byte DefaultWeapon;

        public NPCDef(byte unitType, string nameKey, NPCCategory category,
                      float maxHealth, float maxEnergy, float maxMana,
                      float maxHunger, float maxFatigue,
                      float moveSpeed,
                      float healthRegen, float energyRegen, float manaRegen,
                      float hungerPerSec, float fatiguePerSec,
                      byte strength, byte agility, byte intellect, byte will,
                      byte defaultWeapon)
        {
            UnitType      = unitType;
            NameKey       = nameKey;
            Category      = category;
            MaxHealth     = maxHealth;
            MaxEnergy     = maxEnergy;
            MaxMana       = maxMana;
            MaxHunger     = maxHunger;
            MaxFatigue    = maxFatigue;
            MoveSpeed     = moveSpeed;
            HealthRegen   = healthRegen;
            EnergyRegen   = energyRegen;
            ManaRegen     = manaRegen;
            HungerPerSec  = hungerPerSec;
            FatiguePerSec = fatiguePerSec;
            Strength      = strength;
            Agility       = agility;
            Intellect     = intellect;
            Will          = will;
            DefaultWeapon = defaultWeapon;
        }
    }

    /// <summary>Dense byte-indexed creature table — O(1) lookup, zero GC, fallback NPCDef for unknown IDs.</summary>
    // TODO(rust-ffi): mirror this table in the uniti crate so server-authoritative code uses the same baseline stats (MaxHealth/Hunger/Fatigue + tick rates). Unity + Rust must stay in lockstep on values.
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
                maxMana:       0f,
                maxHunger:     100f,
                maxFatigue:    100f,
                moveSpeed:     0.7f,
                healthRegen:   0f,
                energyRegen:   5.0f,
                manaRegen:     0f,
                hungerPerSec:  0.30f,
                fatiguePerSec: 0.20f,
                strength:      8,
                agility:       12,
                intellect:     4,
                will:          5,
                defaultWeapon: WeaponType.Club));

            Add(new NPCDef(
                unitType:      UnitType.Knight,
                nameKey:       "creature.knight",
                category:      NPCCategory.Humanoid,
                maxHealth:     120f,
                maxEnergy:     120f,
                maxMana:       0f,
                maxHunger:     140f,
                maxFatigue:    120f,
                moveSpeed:     0.55f,
                healthRegen:   0f,
                energyRegen:   6.0f,
                manaRegen:     0f,
                hungerPerSec:  0.35f,
                fatiguePerSec: 0.22f,
                strength:      16,
                agility:       8,
                intellect:     8,
                will:          11,
                defaultWeapon: WeaponType.None));

            Add(new NPCDef(
                unitType:      UnitType.Soldier,
                nameKey:       "creature.soldier",
                category:      NPCCategory.Humanoid,
                maxHealth:     70f,
                maxEnergy:     140f,
                maxMana:       0f,
                maxHunger:     120f,
                maxFatigue:    110f,
                moveSpeed:     0.8f,
                healthRegen:   0f,
                energyRegen:   7.0f,
                manaRegen:     0f,
                hungerPerSec:  0.30f,
                fatiguePerSec: 0.20f,
                strength:      12,
                agility:       12,
                intellect:     9,
                will:          9,
                defaultWeapon: WeaponType.None));

            Add(new NPCDef(
                unitType:      UnitType.Mage,
                nameKey:       "creature.mage",
                category:      NPCCategory.Humanoid,
                maxHealth:     45f,
                maxEnergy:     80f,
                maxMana:       150f,
                maxHunger:     90f,
                maxFatigue:    100f,
                moveSpeed:     0.65f,
                healthRegen:   0f,
                energyRegen:   4.5f,
                manaRegen:     4.0f,
                hungerPerSec:  0.25f,
                fatiguePerSec: 0.28f,
                strength:      6,
                agility:       9,
                intellect:     17,
                will:          15,
                defaultWeapon: WeaponType.None));

            Add(new NPCDef(
                unitType:      UnitType.King,
                nameKey:       "creature.king",
                category:      NPCCategory.Humanoid,
                maxHealth:     200f,
                maxEnergy:     150f,
                maxMana:       100f,
                maxHunger:     150f,
                maxFatigue:    120f,
                moveSpeed:     0.7f,
                healthRegen:   0f,
                energyRegen:   7.0f,
                manaRegen:     2.0f,
                hungerPerSec:  0.33f,
                fatiguePerSec: 0.22f,
                strength:      14,
                agility:       11,
                intellect:     14,
                will:          16,
                defaultWeapon: WeaponType.Crossbow));
        }

        static void Add(NPCDef def) => _byId[def.UnitType] = def;

        /// <summary>Look up the def by UnitType; returns a fallback for unknown IDs so spawn code never null-derefs.</summary>
        public static NPCDef Get(byte unitType)
        {
            EnsureInit();
            var def = _byId[unitType];
            if (def.NameKey == null)
                return new NPCDef(unitType, "creature.unknown", NPCCategory.Humanoid,
                    10f, 10f, 0f, 100f, 100f, 0.5f, 0f, 0f, 0f, 0.3f, 0.2f,
                    strength: 10, agility: 10, intellect: 10, will: 10,
                    defaultWeapon: WeaponType.None);
            return def;
        }
    }
}
