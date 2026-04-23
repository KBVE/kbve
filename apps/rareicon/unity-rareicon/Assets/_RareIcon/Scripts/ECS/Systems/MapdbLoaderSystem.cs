using System.IO;
using Newtonsoft.Json;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that reads <c>StreamingAssets/mapdb.json</c> (codegen'd from the shared mdx pool by <c>astro-kbve:sync:rareicon-mapdb</c>) and populates <see cref="MapdbCache"/>. Runs in <see cref="InitializationSystemGroup"/> before any registry consumer; disables itself after a successful load. Managed SystemBase — JSON deserialisation + file I/O aren't Burst-safe.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class MapdbLoaderSystem : SystemBase
    {
        protected override void OnCreate()
        {
            Enabled = true;
        }

        protected override void OnUpdate()
        {
            Enabled = false;  // one-shot — self-disable whether we succeed or fail

            if (MapdbCache.IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "mapdb.json");
            if (!File.Exists(path))
            {
                Debug.LogError($"[MapdbLoader] mapdb.json missing at {path}. Run `npx nx run astro-kbve:sync:rareicon-mapdb` to regenerate.");
                return;
            }

            string raw;
            try { raw = File.ReadAllText(path); }
            catch (IOException e)
            {
                Debug.LogError($"[MapdbLoader] failed to read mapdb.json: {e.Message}");
                return;
            }

            MapdbBundle bundle;
            try { bundle = JsonConvert.DeserializeObject<MapdbBundle>(raw); }
            catch (JsonException e)
            {
                Debug.LogError($"[MapdbLoader] failed to parse mapdb.json: {e.Message}");
                return;
            }

            if (bundle?.Entries == null || bundle.Entries.Count == 0)
            {
                Debug.LogError("[MapdbLoader] mapdb.json had no entries");
                return;
            }

            MapdbCache.Load(bundle.Entries);
            Debug.Log($"[MapdbLoader] Loaded {bundle.Count} entries: " +
                      $"{MapdbCache.Buildings.Count} buildings, " +
                      $"{MapdbCache.ResourceNodes.Count} resource nodes, " +
                      $"{MapdbCache.Settlements.Count} settlements, " +
                      $"{MapdbCache.NpcMarkers.Count} NPC markers, " +
                      $"{MapdbCache.Landmarks.Count} landmarks, " +
                      $"{MapdbCache.Arenas.Count} arenas.");
        }
    }
}
