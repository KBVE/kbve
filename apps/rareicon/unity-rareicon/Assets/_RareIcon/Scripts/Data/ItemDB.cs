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

    /// <summary>Static per-item data; Restore* fields double as filters (RestoreEnergy > 0 = edible, etc.).</summary>
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

        public ItemDef(ushort id, string nameKey, ItemCategory category,
                       byte stackMax, ushort baseValue,
                       float restoreHealth = 0f,
                       float restoreEnergy = 0f,
                       float restoreMana   = 0f,
                       HarvestRole harvestRole = HarvestRole.None,
                       byte harvestWeight = 100)
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
        }
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
                "item.berry",    ItemCategory.Material, 99, 2,
                restoreEnergy: 20f,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.Mushroom,
                "item.mushroom", ItemCategory.Material, 99, 3,
                restoreEnergy: 15f,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.Herb,
                "item.herb",     ItemCategory.Material, 99, 5,
                restoreEnergy: 25f,
                harvestRole: HarvestRole.Forager));

            Add(new ItemDef((ushort)ItemId.RawCacti,
                "item.raw_cacti",    ItemCategory.Material, 99, 2,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.CactiNeedle,
                "item.cacti_needle", ItemCategory.Material, 99, 3,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.PricklyPear,
                "item.prickly_pear", ItemCategory.Material, 64, 8,
                restoreEnergy: 30f,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.Dragonfruit,
                "item.dragonfruit",  ItemCategory.Material, 64, 20,
                restoreEnergy: 45f,
                harvestRole: HarvestRole.Forager));
            Add(new ItemDef((ushort)ItemId.CactiSeeds,
                "item.cacti_seeds",  ItemCategory.Material, 64, 4,
                harvestRole: HarvestRole.Forager));

            Add(new ItemDef((ushort)ItemId.WoodLog,
                "item.wood_log",  ItemCategory.Material, 99, 3,
                harvestRole: HarvestRole.Lumberjack));
            Add(new ItemDef((ushort)ItemId.Branches,
                "item.branches",  ItemCategory.Material, 99, 1,
                harvestRole: HarvestRole.Lumberjack));
            Add(new ItemDef((ushort)ItemId.Leaves,
                "item.leaves",    ItemCategory.Material, 99, 1,
                harvestRole: HarvestRole.Lumberjack));

            Add(new ItemDef((ushort)ItemId.Stone,
                "item.stone",     ItemCategory.Material, 99, 2,
                harvestRole: HarvestRole.Miner));

            // Station / crafted outputs + environmental biome markers — NONE
            // of these are hand-harvestable. Sand tiles exist as furnace
            // fuel source, not as something a goblin picks up in a bucket.
            Add(new ItemDef((ushort)ItemId.NaturalSand,
                "item.natural_sand", ItemCategory.Material, 99, 1));
            Add(new ItemDef((ushort)ItemId.RawGlass,
                "item.raw_glass",    ItemCategory.Material, 99, 8));
            Add(new ItemDef((ushort)ItemId.Coal,
                "item.coal",         ItemCategory.Material, 99, 4));
            Add(new ItemDef((ushort)ItemId.Ash,
                "item.ash",          ItemCategory.Material, 99, 1));
            Add(new ItemDef((ushort)ItemId.Compost,
                "item.compost",      ItemCategory.Material, 99, 2));
            Add(new ItemDef((ushort)ItemId.Carrot,
                "item.carrot",       ItemCategory.Material, 99, 4,
                restoreEnergy: 18f));

            Add(new ItemDef((ushort)ItemId.Arrow,
                "item.arrow",        ItemCategory.Material, 255, 1));

            // Wildlife drops. Picked up off the ground (ItemPickupSystem)
            // rather than hand-harvested, so HarvestRole stays None.
            Add(new ItemDef((ushort)ItemId.RawChicken,
                "item.raw_chicken", ItemCategory.Material, 32, 6,
                restoreEnergy: 18f));
            Add(new ItemDef((ushort)ItemId.Feather,
                "item.feather",     ItemCategory.Material, 99, 1));
            Add(new ItemDef((ushort)ItemId.RawMutton,
                "item.raw_mutton",  ItemCategory.Material, 32, 12,
                restoreEnergy: 35f));
            Add(new ItemDef((ushort)ItemId.Wool,
                "item.wool",        ItemCategory.Material, 99, 4));
            Add(new ItemDef((ushort)ItemId.RawBeef,
                "item.raw_beef",    ItemCategory.Material, 32, 18,
                restoreEnergy: 50f));
            Add(new ItemDef((ushort)ItemId.Leather,
                "item.leather",     ItemCategory.Material, 99, 8));

            // Cooked foods — produced by CookingSystem from raw wildlife drops.
            // Higher RestoreEnergy than raw so cooking is a worthwhile loop.
            Add(new ItemDef((ushort)ItemId.CookedChicken,
                "item.cooked_chicken", ItemCategory.Consumable, 32, 12,
                restoreEnergy: 40f));
            Add(new ItemDef((ushort)ItemId.CookedMutton,
                "item.cooked_mutton",  ItemCategory.Consumable, 32, 24,
                restoreEnergy: 70f));
            Add(new ItemDef((ushort)ItemId.CookedBeef,
                "item.cooked_beef",    ItemCategory.Consumable, 32, 36,
                restoreEnergy: 100f));

            // Livestock production — emitted into FarmStorage by sheltered
            // animals once per WorldClock cadence (chickens/cows every 2
            // turns, sheep every 10). Edible so they flow through the same
            // AutoEat / Empire withdraw pipelines as other food.
            Add(new ItemDef((ushort)ItemId.Egg,
                "item.egg",  ItemCategory.Material, 64, 3,
                restoreEnergy: 12f));
            Add(new ItemDef((ushort)ItemId.Milk,
                "item.milk", ItemCategory.Material, 64, 5,
                restoreEnergy: 20f));

            // Chef outputs from livestock produce — higher energy return
            // than raw so the cooking loop still pays off on farm yields.
            Add(new ItemDef((ushort)ItemId.CookedEgg,
                "item.cooked_egg", ItemCategory.Consumable, 32, 8,
                restoreEnergy: 28f));
            Add(new ItemDef((ushort)ItemId.Cheese,
                "item.cheese",     ItemCategory.Consumable, 32, 15,
                restoreEnergy: 45f));
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
    }
}
