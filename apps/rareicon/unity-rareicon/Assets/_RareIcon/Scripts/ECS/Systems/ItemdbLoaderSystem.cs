using System.IO;
using Newtonsoft.Json;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that reads <c>StreamingAssets/itemdb.json</c> (codegen'd from the shared mdx pool by <c>astro-kbve:sync:rareicon-itemdb</c>), populates <see cref="ItemdbCache"/>, then materialises the Burst-safe slice into <see cref="ItemDB"/>. Runs in <see cref="InitializationSystemGroup"/> with <c>OrderFirst = true</c> so the table is warm before any consumer. Managed SystemBase — JSON deserialisation + file I/O aren't Burst-safe.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class ItemdbLoaderSystem : SystemBase
    {
        protected override void OnCreate()
        {
            Enabled = true;
        }

        protected override void OnUpdate()
        {
            Enabled = false;

            if (ItemdbCache.IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "itemdb.json");
            if (!File.Exists(path))
            {
                Debug.LogWarning($"[ItemdbLoader] itemdb.json missing at {path} — falling back to legacy hardcoded table. Run `npx nx run astro-kbve:sync:rareicon-itemdb` to regenerate.");
                ItemDB.EnsureHydrated();
                return;
            }

            string raw;
            try { raw = File.ReadAllText(path); }
            catch (IOException e)
            {
                Debug.LogError($"[ItemdbLoader] failed to read itemdb.json: {e.Message}");
                ItemDB.EnsureHydrated();
                return;
            }

            ItemdbBundle bundle;
            try { bundle = JsonConvert.DeserializeObject<ItemdbBundle>(raw); }
            catch (JsonException e)
            {
                Debug.LogError($"[ItemdbLoader] failed to parse itemdb.json: {e.Message}");
                ItemDB.EnsureHydrated();
                return;
            }

            if (bundle?.Entries == null || bundle.Entries.Count == 0)
            {
                Debug.LogError("[ItemdbLoader] itemdb.json had no entries");
                ItemDB.EnsureHydrated();
                return;
            }

            ItemdbCache.Load(bundle.Entries);
            int mapped = ItemDB.HydrateFromCache();

            int edible = 0, harvestable = 0, compressible = 0;
            foreach (var def in bundle.Entries)
            {
                if (def.Food != null && (def.Food.Heals.HasValue || def.Food.RestoreEnergy.HasValue || def.Food.RestoreMana.HasValue)) edible++;
                if (def.Skilling != null && !string.IsNullOrEmpty(def.Skilling.Skill)) harvestable++;
                if (def.Compress != null && !string.IsNullOrEmpty(def.Compress.TargetRef)) compressible++;
            }

            Debug.Log($"[ItemdbLoader] Loaded {bundle.Count} entries, mapped {mapped} to Unity ItemId: " +
                      $"{edible} edible, {harvestable} harvestable, {compressible} compressible.");
        }
    }
}
