using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>Top-level item category. Keep in sync with the Rust RareItem enum's ranges.</summary>
    public enum ItemCategory : byte
    {
        Misc       = 0,
        Consumable = 1,
        Equipment  = 2,
        Material   = 3,
        Quest      = 4,
        Magic      = 5,
    }

    /// <summary>Which job is allowed to pick this up off the world; None = never hand-harvested (crafted / station-only / environmental).</summary>
    public enum HarvestRole : byte
    {
        None       = 0,
        Forager    = 1,
        Lumberjack = 2,
        Miner      = 3,
    }

    /// <summary>Static per-item data; Restore* fields double as filters (RestoreEnergy > 0 = edible, etc.). CompressesTo / CompressRatio / PoolGroup drive StorageConsolidatorSystem's raw→bulk rollup at 100:1.</summary>
    public readonly struct ItemDef
    {
        public readonly ushort Id;
        public readonly string NameKey;
        public readonly ItemCategory Category;
        public readonly byte StackMax;
        public readonly ushort BaseValue;

        public readonly float RestoreHealth;
        public readonly float RestoreEnergy;
        public readonly float RestoreMana;

        public readonly HarvestRole HarvestRole;
        public readonly byte HarvestWeight;

        public readonly ushort CompressesTo;   // 0 = doesn't compress (already bulk / unique)
        public readonly ushort CompressRatio;  // e.g. 100
        public readonly ushort PoolGroup;      // shared pool id (food → Meal), 0 = standalone

        public ItemDef(ushort id, string nameKey, ItemCategory category,
                       byte stackMax, ushort baseValue,
                       float restoreHealth = 0f,
                       float restoreEnergy = 0f,
                       float restoreMana   = 0f,
                       HarvestRole harvestRole = HarvestRole.None,
                       byte harvestWeight = 100,
                       ushort compressesTo = 0,
                       ushort compressRatio = 0,
                       ushort poolGroup = 0)
        {
            Id            = id;
            NameKey       = nameKey;
            Category      = category;
            StackMax      = stackMax;
            BaseValue     = baseValue;
            RestoreHealth = restoreHealth;
            RestoreEnergy = restoreEnergy;
            RestoreMana   = restoreMana;
            HarvestRole   = harvestRole;
            HarvestWeight = harvestWeight;
            CompressesTo  = compressesTo;
            CompressRatio = compressRatio;
            PoolGroup     = poolGroup;
        }
    }

    /// <summary>Pool group IDs for the food → Meal consolidator. All edibles share PoolGroup.Food so a mix of Berry + Mushroom + CookedBeef all contribute to the same Meal bucket.</summary>
    public static class PoolGroup
    {
        public const ushort None = 0;
        public const ushort Food = 1;
    }

    /// <summary>Source of truth for item properties; extend as new consumables / materials come online.</summary>
    // TODO(rust-ffi): mirror table into uniti crate so client/server agree on HarvestRole + weights.
    public static class ItemDB
    {
        static readonly Dictionary<ushort, ItemDef> _byId = new();
        static bool _initialized;

        static void EnsureInit()
        {
            if (_initialized) return;
            _initialized = true;

            Add(new ItemDef((ushort)ItemId.Berry,
                "item.berry",    ItemCategory.Material, 30, 2,
                restoreEnergy: 10f,
                harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Mushroom,
                "item.mushroom", ItemCategory.Material, 30, 3,
                restoreEnergy: 7f,
                harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Herb,
                "item.herb",     ItemCategory.Material, 30, 5,
                restoreEnergy: 12f,
                harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add(new ItemDef((ushort)ItemId.RawCacti,
                "item.raw_cacti",    ItemCategory.Material, 20, 2,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.CactiNeedle,
                "item.cacti_needle", ItemCategory.Material, 20, 3,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.PricklyPear,
                "item.prickly_pear", ItemCategory.Material, 24, 8,
                restoreEnergy: 15f,
                harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Dragonfruit,
                "item.dragonfruit",  ItemCategory.Material, 24, 20,
                restoreEnergy: 22f,
                harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.CactiSeeds,
                "item.cacti_seeds",  ItemCategory.Material, 50, 4,
                harvestRole: HarvestRole.Forager));

            Add(new ItemDef((ushort)ItemId.WoodLog,
                "item.wood_log",  ItemCategory.Material, 12, 3,
                harvestRole: HarvestRole.Lumberjack,
                compressesTo: (ushort)ItemId.Timber, compressRatio: 100));
            Add(new ItemDef((ushort)ItemId.Branches,
                "item.branches",  ItemCategory.Material, 30, 1,
                harvestRole: HarvestRole.Lumberjack));
            Add(new ItemDef((ushort)ItemId.Leaves,
                "item.leaves",    ItemCategory.Material, 20, 1,
                harvestRole: HarvestRole.Lumberjack));

            Add(new ItemDef((ushort)ItemId.Stone,
                "item.stone",     ItemCategory.Material, 6, 2,
                harvestRole: HarvestRole.Miner,
                compressesTo: (ushort)ItemId.StoneBlock, compressRatio: 100));

            // Station / crafted outputs + environmental biome markers — NONE
            // of these are hand-harvestable. Sand tiles exist as furnace
            // fuel source, not as something a goblin picks up in a bucket.
            Add(new ItemDef((ushort)ItemId.NaturalSand,
                "item.natural_sand", ItemCategory.Material, 20, 1));
            Add(new ItemDef((ushort)ItemId.RawGlass,
                "item.raw_glass",    ItemCategory.Material, 24, 8));
            Add(new ItemDef((ushort)ItemId.Coal,
                "item.coal",         ItemCategory.Material, 20, 4));
            Add(new ItemDef((ushort)ItemId.Ash,
                "item.ash",          ItemCategory.Material, 20, 1));
            Add(new ItemDef((ushort)ItemId.Compost,
                "item.compost",      ItemCategory.Material, 30, 2));
            Add(new ItemDef((ushort)ItemId.Carrot,
                "item.carrot",       ItemCategory.Material, 30, 4,
                restoreEnergy: 9f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add(new ItemDef((ushort)ItemId.Arrow,
                "item.arrow",        ItemCategory.Material, 50, 1,
                compressesTo: (ushort)ItemId.Quiver, compressRatio: 100));

            // Wildlife drops. Picked up off the ground (ItemPickupSystem)
            // rather than hand-harvested, so HarvestRole stays None.
            Add(new ItemDef((ushort)ItemId.RawChicken,
                "item.raw_chicken", ItemCategory.Material, 20, 6,
                restoreEnergy: 9f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Feather,
                "item.feather",     ItemCategory.Material, 30, 1));
            Add(new ItemDef((ushort)ItemId.RawMutton,
                "item.raw_mutton",  ItemCategory.Material, 20, 12,
                restoreEnergy: 17f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Wool,
                "item.wool",        ItemCategory.Material, 30, 4));
            Add(new ItemDef((ushort)ItemId.RawBeef,
                "item.raw_beef",    ItemCategory.Material, 20, 18,
                restoreEnergy: 25f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Leather,
                "item.leather",     ItemCategory.Material, 30, 8));

            Add(new ItemDef((ushort)ItemId.CookedChicken,
                "item.cooked_chicken", ItemCategory.Consumable, 24, 12,
                restoreEnergy: 20f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.CookedMutton,
                "item.cooked_mutton",  ItemCategory.Consumable, 24, 24,
                restoreEnergy: 35f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.CookedBeef,
                "item.cooked_beef",    ItemCategory.Consumable, 24, 36,
                restoreEnergy: 50f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add(new ItemDef((ushort)ItemId.Egg,
                "item.egg",  ItemCategory.Material, 50, 3,
                restoreEnergy: 6f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Milk,
                "item.milk", ItemCategory.Material, 50, 5,
                restoreEnergy: 10f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add(new ItemDef((ushort)ItemId.CookedEgg,
                "item.cooked_egg", ItemCategory.Consumable, 24, 8,
                restoreEnergy: 14f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add(new ItemDef((ushort)ItemId.Cheese,
                "item.cheese",     ItemCategory.Consumable, 24, 15,
                restoreEnergy: 22f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add(new ItemDef((ushort)ItemId.Pouch,
                "item.pouch",   ItemCategory.Equipment, 2, 20));
            Add(new ItemDef((ushort)ItemId.Bag,
                "item.bag",     ItemCategory.Equipment, 2, 60));
            Add(new ItemDef((ushort)ItemId.Pack,
                "item.pack",    ItemCategory.Equipment, 2, 150));

            // Tier-2 bulk items — StackMax=1 so each fills a whole PackSlot.
            // Produced by StorageConsolidatorSystem at 100:1 from raws. Meal
            // carries 100% restore across all stats (HP/Mana/Energy) via
            // MealConsumeSystem, gated by Sated for 60s.
            Add(new ItemDef((ushort)ItemId.Timber,
                "item.timber",      ItemCategory.Material, 1, 300));
            Add(new ItemDef((ushort)ItemId.StoneBlock,
                "item.stone_block", ItemCategory.Material, 1, 200));
            Add(new ItemDef((ushort)ItemId.Quiver,
                "item.quiver",      ItemCategory.Material, 1, 100));
            Add(new ItemDef((ushort)ItemId.Meal,
                "item.meal",        ItemCategory.Consumable, 1, 500,
                restoreHealth: 100f,
                restoreEnergy: 100f,
                restoreMana:   100f));

            Add(new ItemDef((ushort)ItemId.Bones,
                "item.bones",          ItemCategory.Material, 30, 2));
            Add(new ItemDef((ushort)ItemId.UnknownKey,
                "item.unknown_key",    ItemCategory.Quest,    10, 0));
            Add(new ItemDef((ushort)ItemId.UnknownScroll,
                "item.unknown_scroll", ItemCategory.Magic,    10, 0));
            Add(new ItemDef((ushort)ItemId.UnknownTome,
                "item.unknown_tome",   ItemCategory.Magic,     5, 0));
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

        public static float EnergyValue(ushort id)
            => TryGet(id, out var def) ? def.RestoreEnergy : 0f;
        public static float HealthValue(ushort id)
            => TryGet(id, out var def) ? def.RestoreHealth : 0f;
        public static float ManaValue(ushort id)
            => TryGet(id, out var def) ? def.RestoreMana : 0f;

        /// <summary>True if eating one unit of this item would reduce Hunger.</summary>
        public static bool IsEdible(ushort id) => EnergyValue(id) > 0f;

        /// <summary>Which job is allowed to hand-harvest this item from the world; None = crafted / environmental.</summary>
        public static HarvestRole GetHarvestRole(ushort id)
            => TryGet(id, out var def) ? def.HarvestRole : HarvestRole.None;

        /// <summary>0-100 preference weight; UI later edits this to let players focus collection on specific drops.</summary>
        public static byte GetHarvestWeight(ushort id)
            => TryGet(id, out var def) ? def.HarvestWeight : (byte)100;

        /// <summary>Enumerate every item whose HarvestRole matches — used by the Diet UI to build per-item preference rows.</summary>
        public static IEnumerable<ItemDef> EnumerateByRole(HarvestRole role)
        {
            EnsureInit();
            foreach (var kv in _byId)
                if (kv.Value.HarvestRole == role) yield return kv.Value;
        }

        /// <summary>Seed a Burst-safe NativeHashMap&lt;ushort, ItemDefRuntime&gt; from the managed table. Called once at startup by ItemDBBootstrapSystem so Burst jobs can query item stats without touching the managed Dictionary.</summary>
        public static void PopulateRuntimeLookup(Unity.Collections.NativeHashMap<ushort, ItemDefRuntime> lookup)
        {
            EnsureInit();
            foreach (var kv in _byId)
            {
                var d = kv.Value;
                lookup.TryAdd(d.Id, new ItemDefRuntime
                {
                    Id            = d.Id,
                    Category      = (byte)d.Category,
                    StackMax      = d.StackMax,
                    BaseValue     = d.BaseValue,
                    RestoreHealth = d.RestoreHealth,
                    RestoreEnergy = d.RestoreEnergy,
                    RestoreMana   = d.RestoreMana,
                    HarvestRole   = (byte)d.HarvestRole,
                    HarvestWeight = d.HarvestWeight,
                    CompressesTo  = d.CompressesTo,
                    CompressRatio = d.CompressRatio,
                    PoolGroup     = d.PoolGroup,
                });
            }
        }
    }
}
