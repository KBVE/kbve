using System.IO;
using Google.Protobuf;
using KBVE.Proto.Npc;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>One-shot bootstrap that reads <c>StreamingAssets/npcdb.binpb</c> and populates <see cref="NpcdbCache"/>. Lives under the Units domain because NPCs spawn through the same Unit pipeline as goblins / heroes — there's no separate Npcs ECS domain. Self-disables after one tick.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class NpcdbLoaderSystem : SystemBase
    {
        protected override void OnCreate() { Enabled = true; }

        protected override void OnUpdate()
        {
            Enabled = false;

            if (NpcdbCache.IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "npcdb.binpb");
            if (!File.Exists(path))
            {
                Debug.LogWarning($"[NpcdbLoader] npcdb.binpb missing at {path}. Run `node packages/data/codegen/gen-npcdb-data.mjs` to regenerate.");
                return;
            }

            byte[] bytes;
            try { bytes = File.ReadAllBytes(path); }
            catch (IOException e)
            {
                Debug.LogError($"[NpcdbLoader] failed to read npcdb.binpb: {e.Message}");
                return;
            }

            NpcRegistry registry;
            try { registry = NpcRegistry.Parser.ParseFrom(bytes); }
            catch (InvalidProtocolBufferException e)
            {
                Debug.LogError($"[NpcdbLoader] failed to parse npcdb.binpb: {e.Message}");
                return;
            }

            NpcdbCache.Load(registry);
            Debug.Log($"[NpcdbLoader] Loaded {registry.Npcs.Count} npc defs: " +
                      $"{NpcdbCache.Innkeepers.Count} innkeepers, " +
                      $"{NpcdbCache.Enemies.Count} enemies.");
        }
    }
}
