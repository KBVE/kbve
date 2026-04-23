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

        /// <summary>Called by ItemdbLoaderSystem after ItemdbCache is filled. Walks the cache, materialises each entry resolved through the generated ItemdbRefMap into a blittable ItemDef, then appends legacy fallback for ItemId members not yet covered by mdx.</summary>
        public static int HydrateFromCache()
        {
            if (_initialized) return 0;

            int mapped = 0;
            foreach (var def in ItemdbCache.All)
            {
                if (!ItemdbRefMap.RefToId.TryGetValue(def.Ref, out var id)) continue;
                var materialised = Materialise(def, id);
                _byId[(ushort)id] = materialised;
                _nameKeys[(ushort)id] = $"item.{def.Ref.Replace('-', '_')}";
                mapped++;
            }

            AddLegacyFallback();
            _initialized = true;
            return mapped;
        }

        /// <summary>Fallback when ItemdbLoaderSystem couldn't load the StreamingAssets bundle — hydrates directly from the hardcoded legacy table so existing code keeps working.</summary>
        public static void EnsureHydrated()
        {
            if (_initialized) return;
            AddLegacyFallback();
            _initialized = true;
        }

        static void EnsureInit()
        {
            if (_initialized) return;
            AddLegacyFallback();
            _initialized = true;
        }

        static ItemDef Materialise(ItemdbDef src, ItemId id)
        {
            var category = DeriveCategory(src.TypeFlags);
            byte stackMax = ResolveStackMax(src);
            ushort baseValue = (ushort)System.Math.Min(src.BuyPrice ?? 0, ushort.MaxValue);

            float heals = src.Food?.Heals ?? 0;
            float restoreEnergy = src.Food?.RestoreEnergy ?? 0;
            float restoreMana = src.Food?.RestoreMana ?? 0;
            float regenPerSec = src.Food?.RegenPerSecond ?? 0f;
            float regenDur = src.Food?.RegenDuration ?? 0f;

            HarvestRole harvestRole = HarvestRole.None;
            byte harvestWeight = 100;
            if (src.Skilling != null)
            {
                harvestRole = SkillToHarvestRole(src.Skilling.Skill);
                if (src.Skilling.HarvestWeight.HasValue) harvestWeight = (byte)System.Math.Min(src.Skilling.HarvestWeight.Value, 255);
            }

            ushort compressesTo = 0, compressRatio = 0;
            if (src.Compress != null && !string.IsNullOrEmpty(src.Compress.TargetRef) &&
                ItemdbRefMap.RefToId.TryGetValue(src.Compress.TargetRef, out var ct))
            {
                compressesTo = (ushort)ct;
                compressRatio = (ushort)System.Math.Min(src.Compress.Ratio, ushort.MaxValue);
            }

            ushort poolGroup = src.PoolGroup == "food" ? PoolGroup.Food : PoolGroup.None;

            return new ItemDef(
                id:             (ushort)id,
                category:       category,
                stackMax:       stackMax,
                baseValue:      baseValue,
                restoreHealth:  heals,
                restoreEnergy:  restoreEnergy,
                restoreMana:    restoreMana,
                regenPerSecond: regenPerSec,
                regenDuration:  regenDur,
                harvestRole:    harvestRole,
                harvestWeight:  harvestWeight,
                compressesTo:   compressesTo,
                compressRatio:  compressRatio,
                poolGroup:      poolGroup);
        }

        static byte ResolveStackMax(ItemdbDef src)
        {
            if (src.Stacking?.PackMax.HasValue == true)
                return (byte)System.Math.Min(src.Stacking.PackMax.Value, 255);
            if (src.MaxStack.HasValue)
                return (byte)System.Math.Min(src.MaxStack.Value, 255);
            return 1;
        }

        const int FLAG_WEAPON   = 0x1;
        const int FLAG_ARMOR    = 0x2;
        const int FLAG_TOOL     = 0x4;
        const int FLAG_FOOD     = 0x8;
        const int FLAG_POTION   = 0x20;
        const int FLAG_MATERIAL = 0x40;
        const int FLAG_MAGIC    = 0x800;
        const int FLAG_QUEST    = 0x1000;
        const int FLAG_UTILITY  = 0x2000;

        static ItemCategory DeriveCategory(int typeFlags)
        {
            if ((typeFlags & FLAG_QUEST) != 0) return ItemCategory.Quest;
            if ((typeFlags & FLAG_MAGIC) != 0) return ItemCategory.Magic;
            if ((typeFlags & FLAG_POTION) != 0) return ItemCategory.Consumable;
            if ((typeFlags & FLAG_FOOD) != 0 && (typeFlags & FLAG_MATERIAL) == 0) return ItemCategory.Consumable;
            if ((typeFlags & (FLAG_WEAPON | FLAG_ARMOR)) != 0) return ItemCategory.Equipment;
            if ((typeFlags & FLAG_UTILITY) != 0 && (typeFlags & FLAG_TOOL) != 0) return ItemCategory.Equipment;
            return ItemCategory.Material;
        }

        static HarvestRole SkillToHarvestRole(string skill) => skill switch
        {
            "foraging"    => HarvestRole.Forager,
            "woodcutting" => HarvestRole.Lumberjack,
            "mining"      => HarvestRole.Miner,
            _              => HarvestRole.None,
        };

        /// <summary>Legacy hardcoded entries — filling gaps for ItemId members not yet covered in MDX (Meat, WolfPelt, WolfFang, Hood, CapitalLandGrant, ManaPotion) and serving as a full fallback when StreamingAssets are missing. AddIfMissing means MDX-loaded values take precedence.</summary>
        static void AddLegacyFallback()
        {
            AddIfMissing("item.berry",          new ItemDef((ushort)ItemId.Berry,         ItemCategory.Material, 30, 2,
                restoreEnergy: 10f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.mushroom",       new ItemDef((ushort)ItemId.Mushroom,      ItemCategory.Material, 30, 3,
                restoreEnergy: 7f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.herb",           new ItemDef((ushort)ItemId.Herb,          ItemCategory.Material, 30, 5,
                harvestRole: HarvestRole.Forager));
            AddIfMissing("item.raw_cacti",      new ItemDef((ushort)ItemId.RawCacti,      ItemCategory.Material, 20, 2,
                harvestRole: HarvestRole.Forager));
            AddIfMissing("item.cacti_needle",   new ItemDef((ushort)ItemId.CactiNeedle,   ItemCategory.Material, 20, 3,
                harvestRole: HarvestRole.Forager));
            AddIfMissing("item.prickly_pear",   new ItemDef((ushort)ItemId.PricklyPear,   ItemCategory.Material, 24, 8,
                restoreEnergy: 15f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.dragonfruit",    new ItemDef((ushort)ItemId.Dragonfruit,   ItemCategory.Material, 24, 20,
                restoreEnergy: 22f, harvestRole: HarvestRole.Forager,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.cacti_seeds",    new ItemDef((ushort)ItemId.CactiSeeds,    ItemCategory.Material, 50, 4,
                harvestRole: HarvestRole.Forager));
            AddIfMissing("item.log",       new ItemDef((ushort)ItemId.Log,       ItemCategory.Material, 12, 3,
                harvestRole: HarvestRole.Lumberjack,
                compressesTo: (ushort)ItemId.Timber, compressRatio: 100));
            AddIfMissing("item.branches",       new ItemDef((ushort)ItemId.Branches,      ItemCategory.Material, 30, 1,
                harvestRole: HarvestRole.Lumberjack));
            AddIfMissing("item.leaves",         new ItemDef((ushort)ItemId.Leaves,        ItemCategory.Material, 20, 1,
                harvestRole: HarvestRole.Lumberjack));
            AddIfMissing("item.stone",          new ItemDef((ushort)ItemId.Stone,         ItemCategory.Material, 6, 2,
                harvestRole: HarvestRole.Miner,
                compressesTo: (ushort)ItemId.StoneBlock, compressRatio: 100));
            AddIfMissing("item.natural_sand",   new ItemDef((ushort)ItemId.NaturalSand,   ItemCategory.Material, 20, 1));
            AddIfMissing("item.raw_glass",      new ItemDef((ushort)ItemId.RawGlass,      ItemCategory.Material, 24, 8));
            AddIfMissing("item.coal",           new ItemDef((ushort)ItemId.Coal,          ItemCategory.Material, 20, 4));
            AddIfMissing("item.ash",            new ItemDef((ushort)ItemId.Ash,           ItemCategory.Material, 20, 1));
            AddIfMissing("item.oil",            new ItemDef((ushort)ItemId.Oil,           ItemCategory.Material, 20, 12));
            AddIfMissing("item.compost",        new ItemDef((ushort)ItemId.Compost,       ItemCategory.Material, 30, 2));
            AddIfMissing("item.carrot",         new ItemDef((ushort)ItemId.Carrot,        ItemCategory.Material, 30, 4,
                restoreEnergy: 9f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.arrow",          new ItemDef((ushort)ItemId.Arrow,         ItemCategory.Material, 50, 1,
                compressesTo: (ushort)ItemId.Quiver, compressRatio: 100));
            AddIfMissing("item.raw_chicken",    new ItemDef((ushort)ItemId.RawChicken,    ItemCategory.Material, 20, 6,
                restoreEnergy: 9f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.feather",        new ItemDef((ushort)ItemId.Feather,       ItemCategory.Material, 30, 1));
            AddIfMissing("item.raw_mutton",     new ItemDef((ushort)ItemId.RawMutton,     ItemCategory.Material, 20, 12,
                restoreEnergy: 17f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.wool",           new ItemDef((ushort)ItemId.Wool,          ItemCategory.Material, 30, 4));
            AddIfMissing("item.raw_beef",       new ItemDef((ushort)ItemId.RawBeef,       ItemCategory.Material, 20, 18,
                restoreEnergy: 25f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.leather",        new ItemDef((ushort)ItemId.Leather,       ItemCategory.Material, 30, 8));
            AddIfMissing("item.cooked_chicken", new ItemDef((ushort)ItemId.CookedChicken, ItemCategory.Consumable, 24, 12,
                restoreEnergy: 20f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.cooked_mutton",  new ItemDef((ushort)ItemId.CookedMutton,  ItemCategory.Consumable, 24, 24,
                restoreEnergy: 35f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.cooked_beef",    new ItemDef((ushort)ItemId.CookedBeef,    ItemCategory.Consumable, 24, 36,
                restoreEnergy: 50f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.egg",            new ItemDef((ushort)ItemId.Egg,           ItemCategory.Material, 50, 3,
                restoreEnergy: 6f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.fresh_milk",           new ItemDef((ushort)ItemId.FreshMilk,          ItemCategory.Material, 50, 5,
                restoreEnergy: 10f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.cooked_egg",     new ItemDef((ushort)ItemId.CookedEgg,     ItemCategory.Consumable, 24, 8,
                restoreEnergy: 14f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.cheese",         new ItemDef((ushort)ItemId.Cheese,        ItemCategory.Consumable, 24, 15,
                restoreEnergy: 22f,
                compressesTo: (ushort)ItemId.Meal, compressRatio: 100, poolGroup: PoolGroup.Food));
            AddIfMissing("item.pouch",          new ItemDef((ushort)ItemId.Pouch,         ItemCategory.Equipment, 2, 20));
            AddIfMissing("item.bag",            new ItemDef((ushort)ItemId.Bag,           ItemCategory.Equipment, 2, 60));
            AddIfMissing("item.pack",           new ItemDef((ushort)ItemId.Pack,          ItemCategory.Equipment, 2, 150));
            AddIfMissing("item.coin",           new ItemDef((ushort)ItemId.Coin,          ItemCategory.Material, 50, 1,
                compressesTo: (ushort)ItemId.GoldBar, compressRatio: 100));
            AddIfMissing("item.timber",         new ItemDef((ushort)ItemId.Timber,        ItemCategory.Material,   1, 300));
            AddIfMissing("item.stone_block",    new ItemDef((ushort)ItemId.StoneBlock,    ItemCategory.Material,   1, 200));
            AddIfMissing("item.quiver",         new ItemDef((ushort)ItemId.Quiver,        ItemCategory.Material,   1, 100));
            AddIfMissing("item.meal",           new ItemDef((ushort)ItemId.Meal,          ItemCategory.Consumable, 1, 500,
                restoreHealth: 100f, restoreEnergy: 100f, restoreMana: 100f));
            AddIfMissing("item.gold_bar",       new ItemDef((ushort)ItemId.GoldBar,       ItemCategory.Material,   1, 150));
            AddIfMissing("item.bone",          new ItemDef((ushort)ItemId.Bone,         ItemCategory.Material, 30, 2));
            AddIfMissing("item.unknown_key",    new ItemDef((ushort)ItemId.UnknownKey,    ItemCategory.Quest,    10, 0));
            AddIfMissing("item.unknown_scroll", new ItemDef((ushort)ItemId.UnknownScroll, ItemCategory.Magic,    10, 0));
            AddIfMissing("item.unknown_tome",   new ItemDef((ushort)ItemId.UnknownTome,   ItemCategory.Magic,     5, 0));
            AddIfMissing("item.medkit",         new ItemDef((ushort)ItemId.Medkit,        ItemCategory.Consumable, 10, 80,
                restoreHealth: 25f, regenPerSecond: 2f, regenDuration: 15f));

            AddIfMissing("item.potion",      new ItemDef((ushort)ItemId.Potion,      ItemCategory.Consumable, 16, 25, restoreHealth: 25f));
            AddIfMissing("item.mana_potion",        new ItemDef((ushort)ItemId.ManaPotion,        ItemCategory.Consumable, 16, 25, restoreMana:   25f));
            AddIfMissing("item.antidote",           new ItemDef((ushort)ItemId.Antidote,          ItemCategory.Consumable, 16, 30));
            AddIfMissing("item.iron_ore",           new ItemDef((ushort)ItemId.IronOre,           ItemCategory.Material,   20, 5, harvestRole: HarvestRole.Miner));
            AddIfMissing("item.crystal_ore",            new ItemDef((ushort)ItemId.CrystalOre,           ItemCategory.Material,   20, 25, harvestRole: HarvestRole.Miner));
            AddIfMissing("item.wolf_pelt",          new ItemDef((ushort)ItemId.WolfPelt,          ItemCategory.Material,   20, 6));
            AddIfMissing("item.wolf_fang",          new ItemDef((ushort)ItemId.WolfFang,          ItemCategory.Material,   30, 3));
            AddIfMissing("item.meat",               new ItemDef((ushort)ItemId.Meat,              ItemCategory.Material,   30, 4, restoreEnergy: 12f, poolGroup: PoolGroup.Food));
            AddIfMissing("item.hood",               new ItemDef((ushort)ItemId.Hood,              ItemCategory.Equipment,   2, 15));
            AddIfMissing("item.capital_land_grant", new ItemDef((ushort)ItemId.CapitalLandGrant,  ItemCategory.Quest,       1, 0));
        }

        static void AddIfMissing(string nameKey, ItemDef def)
        {
            if (_byId.ContainsKey(def.Id)) return;
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
