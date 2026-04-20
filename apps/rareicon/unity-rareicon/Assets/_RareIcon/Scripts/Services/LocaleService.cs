using System.Collections.Generic;
using UnityEngine;
using Cysharp.Text;

namespace RareIcon
{
    /// <summary>
    /// i18n service. Locale is chosen once on the title screen and stays for the session.
    /// Static strings resolve via Get(key). Dynamic HUD text uses ZString for zero-alloc formatting.
    /// </summary>
    public class LocaleService
    {
        Dictionary<string, string> _strings = new();

        public string CurrentLocale { get; private set; } = "en";

        public LocaleService()
        {
            LoadLocale("en");
        }

        /// <summary>
        /// Set locale once from the title screen. Loads the full string table.
        /// </summary>
        public void SetLocale(string locale)
        {
            if (CurrentLocale == locale) return;
            LoadLocale(locale);
            CurrentLocale = locale;
        }

        /// <summary>
        /// Resolve a static string by key. Returns the key itself if not found.
        /// </summary>
        public string Get(string key)
        {
            return _strings.TryGetValue(key, out var value) ? value : key;
        }

        /// <summary>
        /// Zero-alloc formatted string for HUD values like "HP 120/350".
        /// Uses ZString — no GC pressure per frame.
        /// </summary>
        public string Format(string key, int current, int max)
        {
            var label = Get(key);
            return ZString.Format("{0} {1}/{2}", label, current, max);
        }

        /// <summary>
        /// Zero-alloc formatted string for single values like "Lv. 42".
        /// </summary>
        public string Format(string key, int value)
        {
            var label = Get(key);
            return ZString.Format("{0} {1}", label, value);
        }

        void LoadLocale(string locale)
        {
            var asset = Resources.Load<TextAsset>($"Locales/{locale}");
            if (asset == null)
            {
                Debug.LogError($"[LocaleService] Locale file not found: Locales/{locale}");
                return;
            }

            _strings = ParseFlat(asset.text);
            Debug.Log($"[LocaleService] Loaded {_strings.Count} strings for '{locale}'");
        }

        static Dictionary<string, string> ParseFlat(string json)
        {
            var dict = new Dictionary<string, string>();
            var trimmed = json.Trim();
            if (trimmed.Length < 2) return dict;
            trimmed = trimmed.Substring(1, trimmed.Length - 2);

            var i = 0;
            while (i < trimmed.Length)
            {
                var keyStart = trimmed.IndexOf('"', i);
                if (keyStart < 0) break;
                var keyEnd = trimmed.IndexOf('"', keyStart + 1);
                var key = trimmed.Substring(keyStart + 1, keyEnd - keyStart - 1);

                var valStart = trimmed.IndexOf('"', keyEnd + 1);
                var valEnd = FindClosingQuote(trimmed, valStart + 1);
                var val = trimmed.Substring(valStart + 1, valEnd - valStart - 1);

                dict[key] = val;
                i = valEnd + 1;
            }
            return dict;
        }

        /// <summary>
        /// Resolve item ID (matches ItemId enum) to localized name.
        /// Add new entries here AND in the locale JSON when new items land.
        /// </summary>
        public string GetItemName(ushort itemId)
        {
            var key = itemId switch
            {
                (ushort)ItemId.WoodLog     => "item.wood_log",
                (ushort)ItemId.Stone       => "item.stone",
                (ushort)ItemId.Berry       => "item.berry",
                (ushort)ItemId.Mushroom    => "item.mushroom",
                (ushort)ItemId.Herb        => "item.herb",
                (ushort)ItemId.RawCacti    => "item.raw_cacti",
                (ushort)ItemId.CactiNeedle => "item.cacti_needle",
                (ushort)ItemId.PricklyPear => "item.prickly_pear",
                (ushort)ItemId.Dragonfruit => "item.dragonfruit",
                (ushort)ItemId.CactiSeeds  => "item.cacti_seeds",
                (ushort)ItemId.Leaves      => "item.leaves",
                (ushort)ItemId.Branches    => "item.branches",
                (ushort)ItemId.Compost     => "item.compost",
                (ushort)ItemId.Carrot      => "item.carrot",
                (ushort)ItemId.NaturalSand => "item.natural_sand",
                (ushort)ItemId.RawGlass    => "item.raw_glass",
                (ushort)ItemId.Coal        => "item.coal",
                (ushort)ItemId.Ash         => "item.ash",
                (ushort)ItemId.Arrow       => "item.arrow",
                (ushort)ItemId.CapitalLandGrant => "item.capital_land_grant",
                (ushort)ItemId.RawChicken  => "item.raw_chicken",
                (ushort)ItemId.Feather     => "item.feather",
                (ushort)ItemId.RawMutton   => "item.raw_mutton",
                (ushort)ItemId.Wool        => "item.wool",
                (ushort)ItemId.RawBeef     => "item.raw_beef",
                (ushort)ItemId.Leather     => "item.leather",
                (ushort)ItemId.CookedChicken => "item.cooked_chicken",
                (ushort)ItemId.CookedMutton  => "item.cooked_mutton",
                (ushort)ItemId.CookedBeef    => "item.cooked_beef",
                (ushort)ItemId.WolfPelt    => "item.wolf_pelt",
                (ushort)ItemId.WolfFang    => "item.wolf_fang",
                (ushort)ItemId.BanditCoin  => "item.bandit_coin",
                (ushort)ItemId.Egg         => "item.egg",
                (ushort)ItemId.Milk        => "item.milk",
                (ushort)ItemId.CookedEgg   => "item.cooked_egg",
                (ushort)ItemId.Cheese      => "item.cheese",
                (ushort)ItemId.Meat        => "item.meat",
                (ushort)ItemId.Hood        => "item.hood",
                BuildingDB.AnyFoodSentinel => "item.any_food",
                _ => "item.unknown",
            };
            return Get(key);
        }

        /// <summary>
        /// Resolve unit/creature ID to localized name.
        /// </summary>
        public string GetCreatureName(byte unitType)
        {
            var key = unitType switch
            {
                UnitType.Goblin  => "creature.goblin",
                UnitType.Knight  => "creature.knight",
                UnitType.Soldier => "creature.soldier",
                UnitType.Mage    => "creature.mage",
                UnitType.King    => "creature.king",
                UnitType.Chicken => "creature.chicken",
                UnitType.Sheep   => "creature.sheep",
                UnitType.Cow     => "creature.cow",
                UnitType.Wolf    => "creature.wolf",
                UnitType.Bandit  => "creature.bandit",
                _ => "creature.none",
            };
            return Get(key);
        }

        /// <summary>
        /// Resolve resource ID to localized name.
        /// </summary>
        public string GetResourceName(byte resourceType)
        {
            var key = resourceType switch
            {
                ResourceType.Wood      => "resource.wood",
                ResourceType.Stone     => "resource.stone",
                ResourceType.Berries   => "resource.berries",
                ResourceType.Mushrooms => "resource.mushrooms",
                ResourceType.Herbs     => "resource.herbs",
                ResourceType.Cactus    => "resource.cactus",
                ResourceType.Leaves    => "resource.leaves",
                ResourceType.Branches  => "resource.branches",
                ResourceType.Sand      => "resource.sand",
                _ => "resource.none",
            };
            return Get(key);
        }

        /// <summary>Variant-specific cactus label (e.g. "Prickly Pear Cactus"); falls back to generic "Cactus".</summary>
        public string GetCactusLabel(byte variant)
        {
            var key = variant switch
            {
                CactusVariantType.PricklyPear => "resource.cactus_prickly_pear",
                CactusVariantType.Dragonfruit => "resource.cactus_dragonfruit",
                _ => "resource.cactus",
            };
            return Get(key);
        }

        /// <summary>
        /// Resolve a UnitName (FirstNameId, EpithetId) pair to the
        /// displayable string. First names are language-neutral (a goblin
        /// "Skab" reads as "Skab" everywhere); epithets pull from the
        /// epithet.* locale keys so "the Sly" / "ずる賢き" swap per locale.
        /// Returns empty string when both ids are 0 — caller should fall
        /// back to the creature.* label.
        /// </summary>
        public string GetGoblinName(ushort firstNameId, ushort epithetId)
        {
            string first = UnitNaming.GetFirstName(firstNameId);
            if (first.Length == 0) return string.Empty;
            if (epithetId == 0) return first;

            string epKey = UnitNaming.GetEpithetKey(epithetId);
            if (epKey.Length == 0) return first;

            return ZString.Concat(first, " ", Get(epKey));
        }

        /// <summary>Resolve an ActivityKind.* byte to its localized "doing right now" label. Empty for ActivityKind.None so callers can hide the line.</summary>
        public string GetActivityName(byte kind)
        {
            var key = kind switch
            {
                ActivityKind.Idle             => "activity.idle",
                ActivityKind.Wandering        => "activity.wandering",
                ActivityKind.MovingToOrder    => "activity.moving_to_order",
                ActivityKind.Sleeping         => "activity.sleeping",
                ActivityKind.Eating           => "activity.eating",
                ActivityKind.Healing          => "activity.healing",
                ActivityKind.ReturningToBase  => "activity.returning_to_base",
                ActivityKind.SeekingAid       => "activity.seeking_aid",
                ActivityKind.Foraging         => "activity.foraging",
                ActivityKind.Lumberjacking    => "activity.lumberjacking",
                ActivityKind.Mining           => "activity.mining",
                ActivityKind.Hunting          => "activity.hunting",
                ActivityKind.Looting          => "activity.looting",
                ActivityKind.Farming          => "activity.farming",
                ActivityKind.Building         => "activity.building",
                ActivityKind.Cooking          => "activity.cooking",
                ActivityKind.Guarding         => "activity.guarding",
                _ => string.Empty,
            };
            return key.Length == 0 ? string.Empty : Get(key);
        }

        /// <summary>Resolve a FactionType.* byte to its localized name.</summary>
        public string GetFactionName(byte faction)
        {
            var key = faction switch
            {
                FactionType.Player   => "faction.player",
                FactionType.Hostile  => "faction.hostile",
                FactionType.Beast    => "faction.beast",
                FactionType.Wildlife => "faction.wildlife",
                _ => "faction.neutral",
            };
            return Get(key);
        }

        /// <summary>
        /// Resolve biome ID to localized name.
        /// </summary>
        public string GetBiomeName(byte biomeId)
        {
            var key = biomeId switch
            {
                BiomeGenerator.BIOME_GRASS  => "biome.grass",
                BiomeGenerator.BIOME_FOREST => "biome.forest",
                BiomeGenerator.BIOME_SAND   => "biome.sand",
                BiomeGenerator.BIOME_DIRT   => "biome.dirt",
                BiomeGenerator.BIOME_SNOW   => "biome.snow",
                BiomeGenerator.BIOME_STONE  => "biome.stone",
                BiomeGenerator.BIOME_RIVER  => "biome.river",
                _ => "biome.ocean",
            };
            return Get(key);
        }

        static int FindClosingQuote(string s, int start)
        {
            for (var i = start; i < s.Length; i++)
            {
                if (s[i] == '\\') { i++; continue; }
                if (s[i] == '"') return i;
            }
            return s.Length - 1;
        }
    }
}
