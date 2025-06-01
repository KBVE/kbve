using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using Cysharp.Threading.Tasks;
// using Cysharp.Threading.Tasks.Addressables;
using System.Threading;
using VContainer;
using VContainer.Unity;


namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class OrchestratorNPCGlobals : IAsyncStartable
    {
        private readonly INPCDefinitionDatabase npcDatabase;
        private readonly Dictionary<string, Queue<GameObject>> npcPools = new();
        private readonly NPCGlobalController controller;

        public OrchestratorNPCGlobals(INPCDefinitionDatabase npcDatabase, NPCGlobalController controller)
        {
            this.npcDatabase = npcDatabase;
            this.controller = controller;
        }

         public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.NextFrame(cancellation); // Optional delay to let scene objects init

            var labels = npcDatabase.GetAllLabels();

            if (labels == null || labels.Count == 0)
            {
                Debug.LogWarning("[OrchestratorNPCGlobals] No NPC labels found in database.");
                return;
            }


                        foreach (var label in labels)
            {
                if (!npcPools.ContainsKey(label))
                    npcPools[label] = new Queue<GameObject>();

                var def = npcDatabase.GetDefinitionByLabel(label);
                GameObject prefab = def?.prefab;

                // Fallback to Addressables if prefab is not assigned
                if (prefab == null)
                {
                    var handle = Addressables.LoadAssetAsync<GameObject>(label);
                    await handle.ToUniTask(cancellationToken: cancellation);

                    if (handle.Status != AsyncOperationStatus.Succeeded)
                    {
                        Debug.LogError($"[NPCGlobals] Failed to load prefab for label '{label}' via Addressables.");
                        continue;
                    }

                    prefab = handle.Result;
                }

                if (prefab == null)
                {
                    Debug.LogError($"[NPCGlobals] No prefab found or loaded for label: {label}");
                    continue;
                }

                for (int i = 0; i < 5; i++)
                {
                    var obj = UnityEngine.Object.Instantiate(prefab);
                    obj.SetActive(false);
                    npcPools[label].Enqueue(obj);
                }

                Debug.Log($"[NPCGlobals] Initialized pool for '{label}' with {npcPools[label].Count} instances.");
            }
        }

        public GameObject DeployNPC(string label, Vector3 position, Quaternion rotation)
        {
            if (npcPools.TryGetValue(label, out var pool) && pool.Count > 0)
            {
                var npc = pool.Dequeue();
                npc.transform.SetPositionAndRotation(position, rotation);
                npc.SetActive(true);

                controller.RegisterNPC(npc, label);
                return npc;
            }

            Debug.LogWarning($"[OrchestratorNPCGlobals] No available NPCs in pool for label: {label}");
            return null;
        }

        
        public void ReturnNPC(string label, GameObject npc)
        {
            npc.SetActive(false);
            controller.UnregisterNPC(npc, label);

            if (!npcPools.ContainsKey(label))
                npcPools[label] = new Queue<GameObject>();

            npcPools[label].Enqueue(npc);
        }

        public async UniTask PrewarmPool(string label, int count)
        {
            if (!npcPools.ContainsKey(label))
                npcPools[label] = new Queue<GameObject>();

            var def = npcDatabase.GetDefinitionByLabel(label);
            GameObject prefab = def?.prefab;

            if (prefab == null)
            {
                var handle = Addressables.LoadAssetAsync<GameObject>(label);
                await handle.ToUniTask();

                if (handle.Status != AsyncOperationStatus.Succeeded)
                {
                    Debug.LogError($"[Globals] Failed to load prefab for label '{label}' during pool prewarm.");
                    return;
                }

                prefab = handle.Result;
            }

            if (prefab == null)
            {
                Debug.LogError($"[Globals] Prefab not found for label '{label}' during pool prewarm.");
                return;
            }

            for (int i = 0; i < count; i++)
            {
                var obj = UnityEngine.Object.Instantiate(prefab);
                obj.SetActive(false);
                npcPools[label].Enqueue(obj);
            }

            Debug.Log($"[Globals] Prewarmed pool for '{label}' with {count} instances.");
        }


    }

}