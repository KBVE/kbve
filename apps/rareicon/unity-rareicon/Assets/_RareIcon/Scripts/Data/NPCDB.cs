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
    /// Per-creature defaults — base stats + attributes + default loadout +
    /// locale key. UnitSpawnSystem pulls these so spawn code stays generic;
    /// per-instance jitter (speed, RNG seed) layers on top at spawn time.
    ///
    /// Two stat tiers:
    ///   - Vital stats (MaxHealth/Energy/Mana + regen) → become Health /
    ///     Energy / Mana IComponentData on the spawned entity (composed by
    ///     presence — Max=0 → component skipped).
    ///   - Attributes (Strength / Agility / Intellect / Will) → spec data
    ///     for now; will become a single Attributes IComponentData when the
    ///     first gameplay system reads them (combat / magic / etc.). Stored
    ///     as bytes so a creature sheet stays small; most values sit 1..20,
    ///     boss / legendary can run higher (cap is 255).
    /// </summary>
    public readonly struct NPCDef
    {
        public readonly byte UnitType;
        public readonly string NameKey;
        public readonly NPCCategory Category;

        // ---- Vital stats ----
        public readonly float MaxHealth;
        public readonly float MaxEnergy;
        public readonly float MaxMana;       // 0 = creature has no mana stat
        public readonly float MoveSpeed;     // base; spawn applies ±jitter
        public readonly float HealthRegen;   // per-second; 0 = no regen component
        public readonly float EnergyRegen;
        public readonly float ManaRegen;

        // ---- Attributes ----
        public readonly byte Strength;       // melee damage, carry weight
        public readonly byte Agility;        // move-speed mod, dodge, ranged accuracy
        public readonly byte Intellect;      // spell damage, mana scaling
        public readonly byte Will;           // magic resistance, mana regen rate

        // ---- Loadout ----
        public readonly byte DefaultWeapon;  // WeaponType.* constant

        public NPCDef(byte unitType, string nameKey, NPCCategory category,
                      float maxHealth, float maxEnergy, float maxMana,
                      float moveSpeed,
                      float healthRegen, float energyRegen, float manaRegen,
                      byte strength, byte agility, byte intellect, byte will,
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
            Strength    = strength;
            Agility     = agility;
            Intellect   = intellect;
            Will        = will;
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
                // NO PASSIVE REGEN for Health or Energy on any creature
                // — vitals only come back from consumables (food for
                // Energy via AutoEatSystem / EmpireWithdrawSystem,
                // potions/bandages for Health once those systems
                // land). Applies to every def in this table; change
                // here only if a creature has a clear lore reason
                // (troll regeneration, angelic blessings, etc.). Mana
                // still regens because it's already conceptually a
                // magical resource.
                healthRegen:   0f,
                energyRegen:   0f,
                manaRegen:     0f,
                // Weak, scrappy, dumb — but quick on their feet.
                strength:      8,
                agility:       12,
                intellect:     4,
                will:          5,
                defaultWeapon: WeaponType.Club));

            // Heavy human infantry — plate armour, closed helm. Tanks the
            // front line; trades speed + agility for bulk HP and strength.
            // DefaultWeapon stays None until HexSword.hlsl lands.
            Add(new NPCDef(
                unitType:      UnitType.Knight,
                nameKey:       "creature.knight",
                category:      NPCCategory.Humanoid,
                maxHealth:     120f,
                maxEnergy:     120f,
                maxMana:       0f,
                moveSpeed:     0.55f,
                healthRegen:   0f,
                energyRegen:   0f,
                manaRegen:     0f,
                strength:      16,
                agility:       8,
                intellect:     8,
                will:          11,
                defaultWeapon: WeaponType.None));

            // Light human infantry — leather vest over cloth shirt. Middle
            // of the road: decent HP, good stamina, balanced attributes.
            Add(new NPCDef(
                unitType:      UnitType.Soldier,
                nameKey:       "creature.soldier",
                category:      NPCCategory.Humanoid,
                maxHealth:     70f,
                maxEnergy:     140f,
                maxMana:       0f,
                moveSpeed:     0.8f,
                healthRegen:   0f,
                energyRegen:   0f,
                manaRegen:     0f,
                strength:      12,
                agility:       12,
                intellect:     9,
                will:          9,
                defaultWeapon: WeaponType.None));

            // Robed caster — low HP, carries mana, average movement. Glass
            // cannon profile: high intellect + will, poor physical stats.
            Add(new NPCDef(
                unitType:      UnitType.Mage,
                nameKey:       "creature.mage",
                category:      NPCCategory.Humanoid,
                maxHealth:     45f,
                maxEnergy:     80f,
                maxMana:       150f,
                moveSpeed:     0.65f,
                healthRegen:   0f,
                energyRegen:   0f,
                manaRegen:     4.0f,
                strength:      6,
                agility:       9,
                intellect:     17,
                will:          15,
                defaultWeapon: WeaponType.None));

            // The player-controlled King. Visually a Soldier base + Crown
            // helmet (HelmetType.Cap with gold palette) — see UnitSpawnSystem.
            // High HP, balanced attributes; no weapon yet (regal scepter +
            // royal sword variants are future polish). MoveSpeed sits between
            // Knight and Soldier so the player feels deliberate, not sluggish.
            Add(new NPCDef(
                unitType:      UnitType.King,
                nameKey:       "creature.king",
                category:      NPCCategory.Humanoid,
                maxHealth:     200f,
                maxEnergy:     150f,
                maxMana:       100f,            // mana — kings dabble in magic too
                moveSpeed:     0.7f,
                // King still has no passive Health/Energy regen — the
                // "game over on death" weight comes from his HP pool
                // (200) + your ability to pull him back to the capital
                // to eat. Keep ManaRegen so he can still cast.
                healthRegen:   0f,
                energyRegen:   0f,
                manaRegen:     2.0f,
                strength:      14,
                agility:       11,
                intellect:     14,
                will:          16,
                defaultWeapon: WeaponType.None));

            // Passive wildlife — sand/grass fauna. No energy/mana/regen; tiny
            // HP so a stray arrow or swing ends them cleanly. Slow MoveSpeed
            // keeps them grounded as ambience rather than chasing anyone.
            Add(new NPCDef(
                unitType:      UnitType.Chicken,
                nameKey:       "creature.chicken",
                category:      NPCCategory.Beast,
                maxHealth:     5f,   maxEnergy: 0f, maxMana: 0f,
                moveSpeed:     0.45f,
                healthRegen:   0f,   energyRegen: 0f, manaRegen: 0f,
                strength:      1, agility: 10, intellect: 1, will: 1,
                defaultWeapon: WeaponType.None));

            Add(new NPCDef(
                unitType:      UnitType.Sheep,
                nameKey:       "creature.sheep",
                category:      NPCCategory.Beast,
                maxHealth:     20f,  maxEnergy: 0f, maxMana: 0f,
                moveSpeed:     0.35f,
                healthRegen:   0f,   energyRegen: 0f, manaRegen: 0f,
                strength:      3, agility: 5, intellect: 2, will: 2,
                defaultWeapon: WeaponType.None));

            Add(new NPCDef(
                unitType:      UnitType.Cow,
                nameKey:       "creature.cow",
                category:      NPCCategory.Beast,
                maxHealth:     40f,  maxEnergy: 0f, maxMana: 0f,
                moveSpeed:     0.30f,
                healthRegen:   0f,   energyRegen: 0f, manaRegen: 0f,
                strength:      6, agility: 3, intellect: 2, will: 3,
                defaultWeapon: WeaponType.None));

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
                    strength: 10, agility: 10, intellect: 10, will: 10,
                    defaultWeapon: WeaponType.None);
            return def;
        }
    }
}
