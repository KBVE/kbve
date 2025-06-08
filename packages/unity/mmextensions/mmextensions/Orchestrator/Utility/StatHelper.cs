using System.Collections.Generic;
using KBVE.MMExtensions.Orchestrator.Health;

namespace KBVE.MMExtensions.Orchestrator.Health
{
    public static class StatHelper
    {
        public static readonly HashSet<StatType> RegeneratingStats = new()
        {
            StatType.Mana,
            StatType.Energy
        };

        public static string GetLabel(StatType stat) => stat switch
        {
            StatType.Health => "Health",
            StatType.Mana => "Mana",
            StatType.Stamina => "Stamina",
            StatType.Energy => "Energy",
            StatType.Strength => "Strength",
            StatType.Intelligence => "Intelligence",
            StatType.Armor => "Armor",
            _ => stat.ToString()
        };

        public static string GetIconPath(StatType stat) => stat switch
        {
            StatType.Health => "Icons/Stats/health",
            StatType.Mana => "Icons/Stats/mana",
            StatType.Stamina => "Icons/Stats/stamina",
            StatType.Intelligence => "Icons/Stats/intelligence",
            StatType.Strength => "Icons/Stats/strength",
            StatType.Armor => "Icons/Stats/armor",
            _ => "Icons/Stats/default"
        };

        public static bool IsRegenerating(StatType stat) => RegeneratingStats.Contains(stat);
    }
}
