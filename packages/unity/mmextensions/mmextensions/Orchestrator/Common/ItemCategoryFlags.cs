using System;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    [Flags]
    public enum ItemCategoryFlags
    {
        None = 0,
        Weapon = 1 << 0,
        Armor = 1 << 1,
        Tool = 1 << 2,
        Food = 1 << 3,
        Drink = 1 << 4,
        Potion = 1 << 5,
        Material = 1 << 6,
        Resource = 1 << 7,
        Skilling = 1 << 8,
        Combat = 1 << 9,
        Structure = 1 << 10,
        Magic = 1 << 11,
        Quest = 1 << 12,
        Utility = 1 << 13,
        Depletable = 1 << 14,
        Legendary = 1 << 15,
        Vehicle = 1 << 16,
        Pet = 1 << 17,
        Soul = 1 << 30
    }
}
