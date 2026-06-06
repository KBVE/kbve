using System.IO;
using Google.Protobuf;
using KBVE.Proto.Map;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that reads <c>StreamingAssets/mapdb.binpb</c> (codegen'd from the shared mdx pool by <c>astro-kbve:sync:mapdb</c>) and populates <see cref="MapdbCache"/>. Runs in <see cref="InitializationSystemGroup"/> before any registry consumer; disables itself after a successful load. Managed SystemBase — proto wire-format parsing + file I/O aren't Burst-safe.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class MapdbLoaderSystem : SystemBase
    {
        protected override void OnCreate()
        {
            Enabled = true;
        }

        protected override void OnUpdate()
        {
            Enabled = false;

            if (MapdbCache.IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "mapdb.binpb");
            if (!File.Exists(path))
            {
                Debug.LogError($"[MapdbLoader] mapdb.binpb missing at {path}. Run `npx nx run astro-kbve:sync:mapdb` to regenerate.");
                return;
            }

            byte[] bytes;
            try { bytes = File.ReadAllBytes(path); }
            catch (IOException e)
            {
                Debug.LogError($"[MapdbLoader] failed to read mapdb.binpb: {e.Message}");
                return;
            }

            MapRegistry registry;
            try { registry = MapRegistry.Parser.ParseFrom(bytes); }
            catch (InvalidProtocolBufferException e)
            {
                Debug.LogError($"[MapdbLoader] failed to parse mapdb.binpb: {e.Message}");
                return;
            }

            MapdbCache.Load(registry);
            Debug.Log($"[MapdbLoader] Loaded {registry.ObjectDefs.Count} world object defs: " +
                      $"{MapdbCache.Buildings.Count} buildings, " +
                      $"{MapdbCache.ResourceNodes.Count} resource nodes, " +
                      $"{MapdbCache.Settlements.Count} settlements, " +
                      $"{MapdbCache.NpcMarkers.Count} NPC markers, " +
                      $"{MapdbCache.Landmarks.Count} landmarks, " +
                      $"{MapdbCache.Arenas.Count} arenas.");
        }
    }
}
