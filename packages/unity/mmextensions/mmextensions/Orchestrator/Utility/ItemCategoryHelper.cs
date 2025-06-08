using System;
using System.Linq;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public static class ItemCategoryHelper
    {
        public static bool HasFlag(ItemCategoryFlags value, ItemCategoryFlags flag) =>
            (value & flag) != 0;

        public static bool IsEquipable(ItemCategoryFlags category) =>
            HasFlag(category, ItemCategoryFlags.Weapon | ItemCategoryFlags.Armor | ItemCategoryFlags.Tool);

        public static bool IsConsumable(ItemCategoryFlags category) =>
            HasFlag(category, ItemCategoryFlags.Food | ItemCategoryFlags.Drink | ItemCategoryFlags.Potion);

        public static bool IsMaterial(ItemCategoryFlags category) =>
            HasFlag(category, ItemCategoryFlags.Material | ItemCategoryFlags.Resource);

        public static string[] GetActiveLabels(ItemCategoryFlags category)
        {
            return Enum.GetValues(typeof(ItemCategoryFlags))
                .Cast<ItemCategoryFlags>()
                .Where(flag => flag != ItemCategoryFlags.None && HasFlag(category, flag))
                .Select(flag => flag.ToString())
                .ToArray();
        }
    }
}