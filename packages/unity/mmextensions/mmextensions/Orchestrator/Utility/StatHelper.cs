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
            StatType.Intelligence => "stat_icon_intelligence",
            StatType.Strength => "stat_icon_strength",
            StatType.Armor => "stat_icon_armor",
            _ => "stat_icon_default"
        };

        public static bool IsRegenerating(StatType stat) => RegeneratingStats.Contains(stat);
    }
}
