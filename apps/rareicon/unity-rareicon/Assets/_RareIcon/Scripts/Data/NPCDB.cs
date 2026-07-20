using System.Collections.Generic;
using KBVE.Proto.Npc;

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

        /// <summary>Dialogue tree fired on first-contact for this unit type; 0 = silent (no auto-intro). FirstContactSystem scans hostile/beast spawns once per second and publishes <see cref="DialogueStartMessage"/> with this id the first time the type appears.</summary>
        public readonly ushort DialogueTreeId;

        public NPCDef(byte unitType, string nameKey, NPCCategory category,
                      float maxHealth, float maxEnergy, float maxMana,
                      float maxHunger, float maxFatigue,
                      float moveSpeed,
                      float healthRegen, float energyRegen, float manaRegen,
                      float hungerPerSec, float fatiguePerSec,
                      byte strength, byte agility, byte intellect, byte will,
                      byte defaultWeapon,
                      ushort dialogueTreeId = 0)
        {
            UnitType       = unitType;
            NameKey        = nameKey;
            Category       = category;
            MaxHealth      = maxHealth;
            MaxEnergy      = maxEnergy;
            MaxMana        = maxMana;
            MaxHunger      = maxHunger;
            MaxFatigue     = maxFatigue;
            MoveSpeed      = moveSpeed;
            HealthRegen    = healthRegen;
            EnergyRegen    = energyRegen;
            ManaRegen      = manaRegen;
            HungerPerSec   = hungerPerSec;
            FatiguePerSec  = fatiguePerSec;
            Strength       = strength;
            Agility        = agility;
            Intellect      = intellect;
            Will           = will;
            DefaultWeapon  = defaultWeapon;
            DialogueTreeId = dialogueTreeId;
        }
    }

    /// <summary>Proto-backed creature lookup — resolves each UnitType from the npcdb registry (npcdb.binpb) via
    /// <see cref="NpcdbCache"/>. The proto is the sole source of truth; unknown / not-yet-loaded IDs get a loud generic fallback.</summary>
    public static class NPCDB
    {
        static readonly HashSet<byte> _warnedMissingProto = new();

        /// <summary>Resolve the def by UnitType from the npcdb proto (loaded into <see cref="NpcdbCache"/>). A UnitType with
        /// no entry (or a not-yet-loaded registry) returns a loud generic humanoid so spawn code never null-derefs — warned
        /// once per UnitType so the gap is visible. NpcdbLoaderSystem (Init, OrderFirst) populates the cache before spawn.</summary>
        public static NPCDef Get(byte unitType)
        {
            if (NpcdbCache.IsLoaded
                && NpcdbCache.TryGetByUnitType(unitType, out var proto)
                && proto.Stats != null
                && proto.Stats.MaxHp > 0)
                return FromProto(unitType, proto);

            if (unitType != UnitType.None && _warnedMissingProto.Add(unitType))
                UnityEngine.Debug.LogWarning(
                    $"[NPCDB] UnitType {unitType} has no npcdb entry — using generic fallback.");

            return new NPCDef(unitType, "creature.unknown", NPCCategory.Humanoid,
                10f, 10f, 0f, 100f, 100f, 0.5f, 0f, 0f, 0f, 0.3f, 0.2f,
                strength: 10, agility: 10, intellect: 10, will: 10,
                defaultWeapon: WeaponType.None);
        }

        static NPCDef FromProto(byte unitType, Npc n)
        {
            var s = n.Stats;
            return new NPCDef(
                unitType:      unitType,
                nameKey:       n.HasNameKey ? n.NameKey : "creature.unknown",
                category:      MapCategory(n.Family),
                maxHealth:     s.MaxHp,
                maxEnergy:     s.HasMaxEp ? s.MaxEp : 0f,
                maxMana:       s.HasMaxMp ? s.MaxMp : 0f,
                maxHunger:     s.HasMaxHunger ? s.MaxHunger : 0f,
                maxFatigue:    s.HasMaxFatigue ? s.MaxFatigue : 0f,
                moveSpeed:     s.MoveSpeed,
                healthRegen:   s.HpRegen,
                energyRegen:   s.EpRegen,
                manaRegen:     s.MpRegen,
                hungerPerSec:  s.HungerPerSec,
                fatiguePerSec: s.FatiguePerSec,
                strength:      (byte)(s.HasStrength ? s.Strength : 0),
                agility:       (byte)(s.HasAgility ? s.Agility : 0),
                intellect:     (byte)(s.HasIntelligence ? s.Intelligence : 0),
                will:          (byte)(s.HasWill ? s.Will : 0),
                defaultWeapon: (byte)(n.HasDefaultWeapon ? n.DefaultWeapon : 0),
                dialogueTreeId:(ushort)(n.HasDialogueTreeId ? n.DialogueTreeId : 0));
        }

        static NPCCategory MapCategory(CreatureFamily family) => family switch
        {
            CreatureFamily.Beast     => NPCCategory.Beast,
            CreatureFamily.Undead    => NPCCategory.Undead,
            CreatureFamily.Elemental => NPCCategory.Elemental,
            CreatureFamily.Humanoid  => NPCCategory.Humanoid,
            _                        => NPCCategory.Humanoid,
        };
    }
}
