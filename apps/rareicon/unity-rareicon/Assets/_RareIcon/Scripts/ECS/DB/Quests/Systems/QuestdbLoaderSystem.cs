using System.IO;
using Google.Protobuf;
using KBVE.Proto.Quest;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that reads <c>StreamingAssets/questdb.binpb</c> and populates <see cref="QuestdbCache"/>. Runs in <see cref="InitializationSystemGroup"/> before <see cref="QuestsDomainSystem"/> so the domain's OnCreate can overlay the proto-authored quests into the Burst Defs map. Self-disables after one tick.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    [UpdateBefore(typeof(QuestsDomainSystem))]
    public partial class QuestdbLoaderSystem : SystemBase
    {
        protected override void OnCreate() { Enabled = true; }

        protected override void OnUpdate()
        {
            Enabled = false;

            if (QuestdbCache.IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "questdb.binpb");
            if (!File.Exists(path))
            {
                Debug.LogWarning($"[QuestdbLoader] questdb.binpb missing at {path}. Run `node packages/data/codegen/gen-questdb-data.mjs` to regenerate.");
                return;
            }

            byte[] bytes;
            try { bytes = File.ReadAllBytes(path); }
            catch (IOException e)
            {
                Debug.LogError($"[QuestdbLoader] failed to read questdb.binpb: {e.Message}");
                return;
            }

            QuestRegistry registry;
            try { registry = QuestRegistry.Parser.ParseFrom(bytes); }
            catch (InvalidProtocolBufferException e)
            {
                Debug.LogError($"[QuestdbLoader] failed to parse questdb.binpb: {e.Message}");
                return;
            }

            QuestdbCache.Load(registry);
            Debug.Log($"[QuestdbLoader] Loaded {registry.Quests.Count} quest defs from binpb.");
        }
    }
}
