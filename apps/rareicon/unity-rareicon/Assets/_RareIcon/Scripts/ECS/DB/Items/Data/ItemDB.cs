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

        public readonly bool   Perishable;
        public readonly uint   ShelfLifeSeconds;
        public readonly ushort SpoilsIntoId;

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
                       ushort poolGroup = 0,
                       bool perishable = false,
                       uint shelfLifeSeconds = 0,
                       ushort spoilsIntoId = 0)
        {
            Id               = id;
            Category         = category;
            StackMax         = stackMax;
            BaseValue        = baseValue;
            RestoreHealth    = restoreHealth;
            RestoreEnergy    = restoreEnergy;
            RestoreMana      = restoreMana;
            RegenPerSecond   = regenPerSecond;
            RegenDuration    = regenDuration;
            HarvestRole      = harvestRole;
            HarvestWeight    = harvestWeight;
            CompressesTo     = compressesTo;
            CompressRatio    = compressRatio;
            PoolGroup        = poolGroup;
            Perishable       = perishable;
            ShelfLifeSeconds = shelfLifeSeconds;
            SpoilsIntoId     = spoilsIntoId;
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

        /// <summary>Resolve an mdx ref through ItemDBRefMap, falling back through the spoilage chain (specific rotten variant, then rotten-food) when the ref is missing. Returns false if no mapping exists anywhere.</summary>
        public static bool TryResolveRef(string refSlug, out ItemId id)
        {
            if (!string.IsNullOrEmpty(refSlug) && ItemDBRefMap.RefToId.TryGetValue(refSlug, out id))
                return true;
            id = ItemId.RottenFood;
            return ItemDBRefMap.RefToId.ContainsKey("rotten-food");
        }

        /// <summary>Resolve a perishable item's spoilage target. Honors explicit `spoils_into_ref`; if absent or invalid, falls back to rotten-food. Returns false only if rotten-food itself is missing (catastrophic data failure).</summary>
        public static bool TryGetSpoilageTarget(string spoilsIntoRef, out ItemId target)
        {
            if (!string.IsNullOrEmpty(spoilsIntoRef) && ItemDBRefMap.RefToId.TryGetValue(spoilsIntoRef, out target))
                return true;
            if (ItemDBRefMap.RefToId.TryGetValue("rotten-food", out target))
                return true;
            target = default;
            return false;
        }

        /// <summary>Called by ItemDBLoaderSystem after ItemDBCache is filled. Walks the cache, materialises each entry resolved through the generated ItemDBRefMap into a blittable ItemDef. mdx is the sole source of truth, no hardcoded fallback.</summary>
        public static int HydrateFromCache()
        {
            if (_initialized) return 0;

            int mapped = 0;
            foreach (var def in ItemDBCache.All)
            {
                if (!ItemDBRefMap.RefToId.TryGetValue(def.Ref, out var id)) continue;
                var materialised = Materialise(def, id);
                _byId[(ushort)id] = materialised;
                _nameKeys[(ushort)id] = $"item.{def.Ref.Replace('-', '_')}";
                mapped++;
            }

            _initialized = true;
            return mapped;
        }

        public static bool IsHydrated => _initialized;

        static ItemDef Materialise(ItemDBDef src, ItemId id)
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
                ItemDBRefMap.RefToId.TryGetValue(src.Compress.TargetRef, out var ct))
            {
                compressesTo = (ushort)ct;
                compressRatio = (ushort)System.Math.Min(src.Compress.Ratio, ushort.MaxValue);
            }

            ushort poolGroup = src.PoolGroup == "food" ? PoolGroup.Food : PoolGroup.None;

            bool perishable = src.Food?.Perishable == true;
            uint shelfLifeSeconds = (uint)System.Math.Max(0, src.Food?.ShelfLifeSeconds ?? 0);
            ushort spoilsIntoId = 0;
            if (perishable)
            {
                if (!string.IsNullOrEmpty(src.Food.SpoilsIntoRef) &&
                    ItemDBRefMap.RefToId.TryGetValue(src.Food.SpoilsIntoRef, out var spoiled))
                    spoilsIntoId = (ushort)spoiled;
                else if (ItemDBRefMap.RefToId.TryGetValue("rotten-food", out var fallback))
                    spoilsIntoId = (ushort)fallback;
            }

            return new ItemDef(
                id:               (ushort)id,
                category:         category,
                stackMax:         stackMax,
                baseValue:        baseValue,
                restoreHealth:    heals,
                restoreEnergy:    restoreEnergy,
                restoreMana:      restoreMana,
                regenPerSecond:   regenPerSec,
                regenDuration:    regenDur,
                harvestRole:      harvestRole,
                harvestWeight:    harvestWeight,
                compressesTo:     compressesTo,
                compressRatio:    compressRatio,
                poolGroup:        poolGroup,
                perishable:       perishable,
                shelfLifeSeconds: shelfLifeSeconds,
                spoilsIntoId:     spoilsIntoId);
        }

        static byte ResolveStackMax(ItemDBDef src)
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

        public static bool TryGet(ushort id, out ItemDef def)
        {
            return _byId.TryGetValue(id, out def);
        }

        public static ItemDef Get(ushort id)
        {
            return _byId.TryGetValue(id, out var def) ? def
                 : new ItemDef(id, ItemCategory.Misc, 1, 0);
        }

        /// <summary>Managed main-thread localization lookup. Returns "item.unknown" for unregistered IDs. Never call from Burst — Burst jobs get their numeric data from ItemDBSingleton instead.</summary>
        public static string GetNameKey(ushort id)
        {
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
            foreach (var kv in _byId)
                if (kv.Value.HarvestRole == role) yield return kv.Value;
        }

        /// <summary>Seed a Burst-safe NativeHashMap&lt;ushort, ItemDefRuntime&gt; from the managed table. Called once at startup by ItemDBBootstrapSystem so Burst jobs can query item stats without touching the managed Dictionary.</summary>
        public static void PopulateRuntimeLookup(Unity.Collections.NativeHashMap<ushort, ItemDefRuntime> lookup)
        {
            foreach (var kv in _byId)
            {
                var d = kv.Value;
                lookup.TryAdd(d.Id, new ItemDefRuntime
                {
                    Id               = d.Id,
                    Category         = (byte)d.Category,
                    StackMax         = d.StackMax,
                    BaseValue        = d.BaseValue,
                    RestoreHealth    = d.RestoreHealth,
                    RestoreEnergy    = d.RestoreEnergy,
                    RestoreMana      = d.RestoreMana,
                    RegenPerSecond   = d.RegenPerSecond,
                    RegenDuration    = d.RegenDuration,
                    HarvestRole      = (byte)d.HarvestRole,
                    HarvestWeight    = d.HarvestWeight,
                    CompressesTo     = d.CompressesTo,
                    CompressRatio    = d.CompressRatio,
                    PoolGroup        = d.PoolGroup,
                    Perishable       = d.Perishable ? (byte)1 : (byte)0,
                    ShelfLifeSeconds = d.ShelfLifeSeconds,
                    SpoilsIntoId     = d.SpoilsIntoId,
                });
            }
        }
    }
}
