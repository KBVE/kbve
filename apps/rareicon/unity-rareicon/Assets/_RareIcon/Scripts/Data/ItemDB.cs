using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>
    /// Top-level item categories. Used both for inventory filtering and
    /// for ID-range hints (consumables = 0-99, equipment = 100-199, etc.
    /// — match the ranges in ItemId.cs / Rust RareItem enum).
    /// </summary>
    public enum ItemCategory : byte
    {
        Misc       = 0,
        Consumable = 1,
        Equipment  = 2,
        Material   = 3,
        Quest      = 4,
        Magic      = 5,
    }

    /// <summary>
    /// Static per-item properties — name, stack size, base trade value,
    /// category, and on-consume restore effect. Visual / icon data lives
    /// elsewhere (sprite sheets / shader includes) so this struct stays
    /// blittable + Burst-friendly.
    ///
    /// Restore* fields do double duty: they describe the immediate
    /// effect of consuming one unit of the item AND signal edibility /
    /// potion-ness to systems that need to filter (AutoEatSystem looks
    /// for RestoreEnergy > 0, a future DrinkPotionSystem would look for
    /// RestoreHealth or RestoreMana > 0). Non-consumable items just
    /// carry zeros — cheap (12 bytes) and the field set stays uniform
    /// across every item.
    /// </summary>
    public readonly struct ItemDef
    {
        public readonly ushort Id;          // matches ItemId enum value
        public readonly string NameKey;     // locale key, e.g. "item.health_potion"
        public readonly ItemCategory Category;
        public readonly byte StackMax;      // inventory stack limit
        public readonly ushort BaseValue;   // currency value at vendor

        // Per-consume restore amounts. 0 = item doesn't restore that stat.
        public readonly float RestoreHealth;
        public readonly float RestoreEnergy;
        public readonly float RestoreMana;

        public ItemDef(ushort id, string nameKey, ItemCategory category,
                       byte stackMax, ushort baseValue,
                       float restoreHealth = 0f,
                       float restoreEnergy = 0f,
                       float restoreMana   = 0f)
        {
            Id            = id;
            NameKey       = nameKey;
            Category      = category;
            StackMax      = stackMax;
            BaseValue     = baseValue;
            RestoreHealth = restoreHealth;
            RestoreEnergy = restoreEnergy;
            RestoreMana   = restoreMana;
        }
    }

    /// <summary>
    /// Source of truth for item properties. Populated as gameplay systems
    /// start consuming items — right now that's just the foraged foods
    /// that EmpireWithdrawSystem / AutoEatSystem eat to refill Energy.
    /// Add more as features come online (potions when combat needs them,
    /// materials when crafting lands, etc.).
    ///
    /// Long-term path: this table is the hand-off into a Rust crate
    /// (uniti) so client and server share defs.
    ///
    /// Lookup is Dictionary because ItemId is sparse (gaps between ranges).
    /// Burst can't access static dicts directly; pre-bake into a
    /// NativeHashMap or BlobAsset when a Burst system needs item lookups.
    /// </summary>
    public static class ItemDB
    {
        static readonly Dictionary<ushort, ItemDef> _byId = new();
        static bool _initialized;

        static void EnsureInit()
        {
            if (_initialized) return;
            _initialized = true;

            // --- Foraged foods (Material category so they also count
            // as crafting reagents later — the category is about source,
            // the Restore* fields are about consume behaviour). Tuned
            // for goblin MaxEnergy 100 + 30% hunger threshold: one bite
            // clears the hunger gate with room to spare.
            Add(new ItemDef((ushort)ItemId.Berry,
                "item.berry",    ItemCategory.Material, 99, 2,
                restoreEnergy: 20f));
            Add(new ItemDef((ushort)ItemId.Mushroom,
                "item.mushroom", ItemCategory.Material, 99, 3,
                restoreEnergy: 15f));
            Add(new ItemDef((ushort)ItemId.Herb,
                "item.herb",     ItemCategory.Material, 99, 5,
                restoreEnergy: 25f));

            // Potions / equipment / quest items land here when the
            // systems that read them come online.
        }

        static void Add(ItemDef def) => _byId[def.Id] = def;

        public static bool TryGet(ushort id, out ItemDef def)
        {
            EnsureInit();
            return _byId.TryGetValue(id, out def);
        }

        public static ItemDef Get(ushort id)
        {
            EnsureInit();
            return _byId.TryGetValue(id, out var def) ? def
                 : new ItemDef(id, "item.unknown", ItemCategory.Misc, 1, 0);
        }

        // --- Consumable helpers -------------------------------------
        // Thin wrappers so callers don't have to spell out
        // `ItemDB.TryGet(...).RestoreEnergy > 0` on every food check.

        /// <summary>Energy restored by eating one unit (0 if not food).</summary>
        public static float EnergyValue(ushort id)
            => TryGet(id, out var def) ? def.RestoreEnergy : 0f;

        /// <summary>Health restored by consuming one unit (0 if not a
        /// healing item).</summary>
        public static float HealthValue(ushort id)
            => TryGet(id, out var def) ? def.RestoreHealth : 0f;

        /// <summary>Mana restored by consuming one unit (0 if not a
        /// mana item).</summary>
        public static float ManaValue(ushort id)
            => TryGet(id, out var def) ? def.RestoreMana : 0f;

        /// <summary>True if eating one unit of this item would raise
        /// Energy — used by AutoEatSystem + EmpireWithdrawSystem to
        /// filter food out of generic inventories.</summary>
        public static bool IsEdible(ushort id) => EnergyValue(id) > 0f;
    }
}
