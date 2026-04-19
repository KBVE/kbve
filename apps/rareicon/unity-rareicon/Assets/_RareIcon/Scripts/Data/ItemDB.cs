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
    /// category. Visual / icon data lives elsewhere (sprite sheets / shader
    /// includes) so this struct stays blittable + Burst-friendly.
    /// </summary>
    public readonly struct ItemDef
    {
        public readonly ushort Id;          // matches ItemId enum value
        public readonly string NameKey;     // locale key, e.g. "item.health_potion"
        public readonly ItemCategory Category;
        public readonly byte StackMax;      // inventory stack limit
        public readonly ushort BaseValue;   // currency value at vendor

        public ItemDef(ushort id, string nameKey, ItemCategory category,
                       byte stackMax, ushort baseValue)
        {
            Id = id;
            NameKey = nameKey;
            Category = category;
            StackMax = stackMax;
            BaseValue = baseValue;
        }
    }

    /// <summary>
    /// Source of truth for item properties. Stub: items are added as we wire
    /// gameplay systems that consume them. Long-term path: this table is the
    /// hand-off into a Rust crate (uniti) so client and server share defs.
    ///
    /// Lookup is Dictionary because ItemId is sparse (gaps between ranges).
    /// Burst can't access static dicts directly; pre-bake into a NativeHashMap
    /// or BlobAsset when a Burst system needs item lookups.
    /// </summary>
    public static class ItemDB
    {
        static readonly Dictionary<ushort, ItemDef> _byId = new();
        static bool _initialized;

        static void EnsureInit()
        {
            if (_initialized) return;
            _initialized = true;

            // Add entries here as gameplay systems start consuming items.
            // Example shape (uncomment when content lands):
            // Add(new ItemDef((ushort)ItemId.HealthPotion,
            //     "item.health_potion", ItemCategory.Consumable, 99, 25));
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
    }
}
