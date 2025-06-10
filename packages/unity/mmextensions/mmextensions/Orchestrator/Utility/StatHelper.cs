using System;
using System.Collections.Generic;
using KBVE.MMExtensions.Orchestrator.Health;
using UnityEngine;
using Cysharp.Threading.Tasks;
using UnityEngine.AddressableAssets;


namespace KBVE.MMExtensions.Orchestrator.Health
{
    public static class StatHelper
    {
        public static readonly HashSet<StatType> RegeneratingStats = new()
        {
            StatType.Mana,
            StatType.Energy
        };

        // public static async UniTask<Sprite> LoadStatIconAsync(StatType stat)
        // {
        //     var path = GetIconPath(stat);
        //     var handle = Addressables.LoadAssetAsync<Sprite>(path);
        //     await handle.ToUniTask();
        //     return handle.Result;
        // }

        public static async UniTask<Sprite> LoadStatIconAsync(StatType stat)
        {
            string key = GetIconAddressKey(stat);
            var handle = Addressables.LoadAssetAsync<Sprite>(key);
            await handle.ToUniTask();
            return handle.Result;
        }

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
            StatType.Energy => "Icons/Stats/energy",
            StatType.Intelligence => "Icons/Stats/intelligence",
            StatType.Strength => "Icons/Stats/strength",
            StatType.Armor => "Icons/Stats/armor",
            _ => "Icons/Stats/default"
        };

        public static string GetIconAddressKey(StatType stat) => stat switch
        {
            StatType.Health => "stat_icon_health",
            StatType.Mana => "stat_icon_mana",
            StatType.Stamina => "stat_icon_stamina",
            StatType.Energy => "stat_icon_energy",
            StatType.Intelligence => "stat_icon_intelligence",
            StatType.Strength => "stat_icon_strength",
            StatType.Armor => "stat_icon_armor",
            _ => "stat_icon_default"
        };

        public static Color GetStatColor(StatType stat) => stat switch
        {
            StatType.Health => new Color(1f, 0.2f, 0.2f),     // Red
            StatType.Mana => new Color(0.3f, 0.5f, 1f),       // Blue
            StatType.Stamina => new Color(0.3f, 1f, 0.3f),    // Green
            StatType.Energy => new Color(1f, 0.9f, 0.2f),     // Yellow
            StatType.Intelligence => new Color(0.6f, 0.4f, 1f), // Purple
            StatType.Strength => new Color(1f, 0.5f, 0.1f),   // Orange
            StatType.Armor => new Color(0.7f, 0.7f, 0.7f),    // Grey
            _ => Color.white
        };


        public static bool IsRegenerating(StatType stat) => RegeneratingStats.Contains(stat);

        // Default Stats

        public static float GetDefaultBase(StatType stat) => stat switch
        {
            StatType.Mana => 50f,
            StatType.Energy => 100f,
            StatType.Intelligence => 10f,
            StatType.Stamina => 10f,
            StatType.Armor => 5f,
            StatType.Strength => 10f,
            _ => 10f
        };

        public static float GetDefaultMax(StatType stat) => GetDefaultBase(stat);

        public static float GetDefaultRegen(StatType stat) => IsRegenerating(stat) ? stat switch
        {
            StatType.Mana => 3f,
            StatType.Energy => 5f,
            _ => 0f
        } : 0f;
    }
}
