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

    /// <summary>Static per-item numeric data. Fully blittable — NameKey localization strings live in ItemDB._nameKeys, a parallel managed Dictionary&lt;ushort, string&gt; that only main-thread callers touch. This way ItemDef is safe to materialize inside Burst jobs if anyone ever bypasses ItemDBSingleton and pokes the managed ItemDB directly, and the Burst error BC1051 "managed String field" can't reoccur.</summary>
    public readonly struct ItemDef
    {
        public readonly ushort Id;
        public readonly ItemCategory Category;
        public readonly byte StackMax;
        public readonly ushort BaseValue;

        public readonly float RestoreHealth;
        public readonly float RestoreEnergy;
        public readonly float RestoreMana;

        public readonly float RegenPerSecond;
        public readonly float RegenDuration;

        public readonly HarvestRole HarvestRole;
        public readonly byte HarvestWeight;

        public readonly ushort CompressesTo;
        public readonly ushort CompressRatio;
        public readonly ushort PoolGroup;

        public ItemDef(ushort id, ItemCategory category,
                       byte stackMax, ushort baseValue,
                       float restoreHealth = 0f,
                       float restoreEnergy = 0f,
                       float restoreMana   = 0f,
                       float regenPerSecond = 0f,
                       float regenDuration  = 0f,
                       HarvestRole harvestRole = HarvestRole.None,
                       byte harvestWeight = 100,
                       ushort compressesTo = 0,
                       ushort compressRatio = 0,
                       ushort poolGroup = 0)
        {
            Id             = id;
            Category       = category;
            StackMax       = stackMax;
            BaseValue      = baseValue;
            RestoreHealth  = restoreHealth;
            RestoreEnergy  = restoreEnergy;
            RestoreMana    = restoreMana;
            RegenPerSecond = regenPerSecond;
            RegenDuration  = regenDuration;
            HarvestRole    = harvestRole;
            HarvestWeight  = harvestWeight;
            CompressesTo   = compressesTo;
            CompressRatio  = compressRatio;
            PoolGroup      = poolGroup;
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
        static readonly Dictionary<ushort, ItemDef> _byId     = new();
        static readonly Dictionary<ushort, string>  _nameKeys = new();
        static bool _initialized;

        static void EnsureInit()
        {
            if (_initialized) return;
            _initialized = true;

            Add("item.berry",          new ItemDef((ushort)ItemId.Berry,         ItemCategory.Material, 30, 2,
                restoreEnergy: 10f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.mushroom",       new ItemDef((ushort)ItemId.Mushroom,      ItemCategory.Material, 30, 3,
                restoreEnergy: 7f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.herb",           new ItemDef((ushort)ItemId.Herb,          ItemCategory.Material, 30, 5,
                harvestRole: HarvestRole.Forager));

            Add("item.raw_cacti",      new ItemDef((ushort)ItemId.RawCacti,      ItemCategory.Material, 20, 2,
                harvestRole: HarvestRole.Forager));
            Add("item.cacti_needle",   new ItemDef((ushort)ItemId.CactiNeedle,   ItemCategory.Material, 20, 3,
                harvestRole: HarvestRole.Forager));
            Add("item.prickly_pear",   new ItemDef((ushort)ItemId.PricklyPear,   ItemCategory.Material, 24, 8,
                restoreEnergy: 15f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.dragonfruit",    new ItemDef((ushort)ItemId.Dragonfruit,   ItemCategory.Material, 24, 20,
                restoreEnergy: 22f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.cacti_seeds",    new ItemDef((ushort)ItemId.CactiSeeds,    ItemCategory.Material, 50, 4,
                harvestRole: HarvestRole.Forager));

            Add("item.wood_log",       new ItemDef((ushort)ItemId.WoodLog,       ItemCategory.Material, 12, 3,
                harvestRole: HarvestRole.Lumberjack,
                compressesTo: (ushort)ItemId.Timber, compressRatio: 100));
            Add("item.branches",       new ItemDef((ushort)ItemId.Branches,      ItemCategory.Material, 30, 1,
                harvestRole: HarvestRole.Lumberjack));
            Add("item.leaves",         new ItemDef((ushort)ItemId.Leaves,        ItemCategory.Material, 20, 1,
                harvestRole: HarvestRole.Lumberjack));

            Add("item.stone",          new ItemDef((ushort)ItemId.Stone,         ItemCategory.Material, 6, 2,
                harvestRole: HarvestRole.Miner,
                compressesTo: (ushort)ItemId.StoneBlock, compressRatio: 100));

            Add("item.natural_sand",   new ItemDef((ushort)ItemId.NaturalSand,   ItemCategory.Material, 20, 1));
            Add("item.raw_glass",      new ItemDef((ushort)ItemId.RawGlass,      ItemCategory.Material, 24, 8));
            Add("item.coal",           new ItemDef((ushort)ItemId.Coal,          ItemCategory.Material, 20, 4));
            Add("item.ash",            new ItemDef((ushort)ItemId.Ash,           ItemCategory.Material, 20, 1));
            Add("item.oil",            new ItemDef((ushort)ItemId.Oil,           ItemCategory.Material, 20, 12));
            Add("item.compost",        new ItemDef((ushort)ItemId.Compost,       ItemCategory.Material, 30, 2));
            Add("item.carrot",         new ItemDef((ushort)ItemId.Carrot,        ItemCategory.Material, 30, 4,
                restoreEnergy: 9f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add("item.arrow",          new ItemDef((ushort)ItemId.Arrow,         ItemCategory.Material, 50, 1,
                compressesTo: (ushort)ItemId.Quiver, compressRatio: 100));

            Add("item.raw_chicken",    new ItemDef((ushort)ItemId.RawChicken,    ItemCategory.Material, 20, 6,
                restoreEnergy: 9f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.feather",        new ItemDef((ushort)ItemId.Feather,       ItemCategory.Material, 30, 1));
            Add("item.raw_mutton",     new ItemDef((ushort)ItemId.RawMutton,     ItemCategory.Material, 20, 12,
                restoreEnergy: 17f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.wool",           new ItemDef((ushort)ItemId.Wool,          ItemCategory.Material, 30, 4));
            Add("item.raw_beef",       new ItemDef((ushort)ItemId.RawBeef,       ItemCategory.Material, 20, 18,
                restoreEnergy: 25f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.leather",        new ItemDef((ushort)ItemId.Leather,       ItemCategory.Material, 30, 8));

            Add("item.cooked_chicken", new ItemDef((ushort)ItemId.CookedChicken, ItemCategory.Consumable, 24, 12,
                restoreEnergy: 20f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.cooked_mutton",  new ItemDef((ushort)ItemId.CookedMutton,  ItemCategory.Consumable, 24, 24,
                restoreEnergy: 35f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.cooked_beef",    new ItemDef((ushort)ItemId.CookedBeef,    ItemCategory.Consumable, 24, 36,
                restoreEnergy: 50f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add("item.egg",            new ItemDef((ushort)ItemId.Egg,           ItemCategory.Material, 50, 3,
                restoreEnergy: 6f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.milk",           new ItemDef((ushort)ItemId.Milk,          ItemCategory.Material, 50, 5,
                restoreEnergy: 10f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add("item.cooked_egg",     new ItemDef((ushort)ItemId.CookedEgg,     ItemCategory.Consumable, 24, 8,
                restoreEnergy: 14f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            Add("item.cheese",         new ItemDef((ushort)ItemId.Cheese,        ItemCategory.Consumable, 24, 15,
                restoreEnergy: 22f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));

            Add("item.pouch",          new ItemDef((ushort)ItemId.Pouch,         ItemCategory.Equipment, 2, 20));
            Add("item.bag",            new ItemDef((ushort)ItemId.Bag,           ItemCategory.Equipment, 2, 60));
            Add("item.pack",           new ItemDef((ushort)ItemId.Pack,          ItemCategory.Equipment, 2, 150));

            Add("item.coin",           new ItemDef((ushort)ItemId.Coin,          ItemCategory.Material, 50, 1,
                compressesTo: (ushort)ItemId.GoldBar, compressRatio: 100));

            Add("item.timber",         new ItemDef((ushort)ItemId.Timber,        ItemCategory.Material,   1, 300));
            Add("item.stone_block",    new ItemDef((ushort)ItemId.StoneBlock,    ItemCategory.Material,   1, 200));
            Add("item.quiver",         new ItemDef((ushort)ItemId.Quiver,        ItemCategory.Material,   1, 100));
            Add("item.meal",           new ItemDef((ushort)ItemId.Meal,          ItemCategory.Consumable, 1, 500,
                restoreHealth: 100f, restoreEnergy: 100f, restoreMana: 100f));
            Add("item.gold_bar",       new ItemDef((ushort)ItemId.GoldBar,       ItemCategory.Material,   1, 150));

            Add("item.bones",          new ItemDef((ushort)ItemId.Bones,         ItemCategory.Material, 30, 2));
            Add("item.unknown_key",    new ItemDef((ushort)ItemId.UnknownKey,    ItemCategory.Quest,    10, 0));
            Add("item.unknown_scroll", new ItemDef((ushort)ItemId.UnknownScroll, ItemCategory.Magic,    10, 0));
            Add("item.unknown_tome",   new ItemDef((ushort)ItemId.UnknownTome,   ItemCategory.Magic,     5, 0));

            Add("item.medkit",         new ItemDef((ushort)ItemId.MedKit,        ItemCategory.Consumable, 10, 80,
                restoreHealth: 25f, regenPerSecond: 2f, regenDuration: 15f));
        }

        static void Add(string nameKey, ItemDef def)
        {
            _byId[def.Id]     = def;
            _nameKeys[def.Id] = nameKey;
        }

        public static bool TryGet(ushort id, out ItemDef def)
        {
            EnsureInit();
            return _byId.TryGetValue(id, out def);
        }

        public static ItemDef Get(ushort id)
        {
            EnsureInit();
            return _byId.TryGetValue(id, out var def) ? def
                 : new ItemDef(id, ItemCategory.Misc, 1, 0);
        }

        /// <summary>Managed main-thread localization lookup. Returns "item.unknown" for unregistered IDs. Never call from Burst — Burst jobs get their numeric data from ItemDBSingleton instead.</summary>
        public static string GetNameKey(ushort id)
        {
            EnsureInit();
            return _nameKeys.TryGetValue(id, out var key) ? key : "item.unknown";
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
                    Id             = d.Id,
                    Category       = (byte)d.Category,
                    StackMax       = d.StackMax,
                    BaseValue      = d.BaseValue,
                    RestoreHealth  = d.RestoreHealth,
                    RestoreEnergy  = d.RestoreEnergy,
                    RestoreMana    = d.RestoreMana,
                    RegenPerSecond = d.RegenPerSecond,
                    RegenDuration  = d.RegenDuration,
                    HarvestRole    = (byte)d.HarvestRole,
                    HarvestWeight  = d.HarvestWeight,
                    CompressesTo   = d.CompressesTo,
                    CompressRatio  = d.CompressRatio,
                    PoolGroup      = d.PoolGroup,
                });
            }
        }
    }
}
