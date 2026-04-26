using System.IO;
using Newtonsoft.Json;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class ItemDBLoaderSystem : SystemBase
    {
        protected override void OnCreate()
        {
            Enabled = true;
        }

        protected override void OnUpdate()
        {
            Enabled = false;

            if (ItemDBCache.IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "itemdb.json");
            if (!File.Exists(path))
            {
                Debug.LogError($"[ItemDBLoader] itemdb.json missing at {path}. Run `npx nx run astro-kbve:sync:itemdb` to regenerate. ItemDB will remain empty until the bundle is present.");
                return;
            }

            string raw;
            try { raw = File.ReadAllText(path); }
            catch (IOException e)
            {
                Debug.LogError($"[ItemDBLoader] failed to read itemdb.json: {e.Message}");
                return;
            }

            ItemDBBundle bundle;
            try { bundle = JsonConvert.DeserializeObject<ItemDBBundle>(raw); }
            catch (JsonException e)
            {
                Debug.LogError($"[ItemDBLoader] failed to parse itemdb.json: {e.Message}");
                return;
            }

            if (bundle?.Entries == null || bundle.Entries.Count == 0)
            {
                Debug.LogError("[ItemDBLoader] itemdb.json had no entries");
                return;
            }

            ItemDBCache.Load(bundle.Entries);
            int mapped = ItemDB.HydrateFromCache();

            int edible = 0, harvestable = 0, compressible = 0;
            foreach (var def in bundle.Entries)
            {
                if (def.Food != null && (def.Food.Heals.HasValue || def.Food.RestoreEnergy.HasValue || def.Food.RestoreMana.HasValue)) edible++;
                if (def.Skilling != null && !string.IsNullOrEmpty(def.Skilling.Skill)) harvestable++;
                if (def.Compress != null && !string.IsNullOrEmpty(def.Compress.TargetRef)) compressible++;
            }

            Debug.Log($"[ItemDBLoader] Loaded {bundle.Count} entries, mapped {mapped} to Unity ItemId: " +
                      $"{edible} edible, {harvestable} harvestable, {compressible} compressible.");
        }
    }
}
