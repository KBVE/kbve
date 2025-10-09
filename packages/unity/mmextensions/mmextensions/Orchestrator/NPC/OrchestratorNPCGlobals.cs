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
    public class OrchestratorNPCGlobals
    {
        private readonly INPCDefinitionDatabase npcDatabase;
        private readonly Dictionary<string, Queue<GameObject>> npcPools = new();
        private readonly NPCGlobalController controller;

        public OrchestratorNPCGlobals(INPCDefinitionDatabase npcDatabase, NPCGlobalController controller)
        {
            this.npcDatabase = npcDatabase;
            this.controller = controller;
        }

        /// <summary>
        /// Initialize NPC pools under the specified parent transform (called by NPCSystemManager)
        /// </summary>
        public async UniTask InitializeAsync(Transform parentTransform, CancellationToken cancellation = default)
        {
            await UniTask.NextFrame(cancellation); // Optional delay to let scene objects init

            var labels = npcDatabase.GetAllLabels();

            if (labels == null || labels.Count == 0)
            {
                Debug.LogWarning("[OrchestratorNPCGlobals] No NPC labels found in database.");
                return;
            }

            Debug.Log($"[OrchestratorNPCGlobals] Initializing NPC pools under parent: {parentTransform.name}");

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
                    var obj = UnityEngine.Object.Instantiate(prefab, parentTransform);
                    obj.SetActive(false);
                    npcPools[label].Enqueue(obj);
                }

                Debug.Log($"[NPCGlobals] Initialized pool for '{label}' with {npcPools[label].Count} instances under {parentTransform.name}.");
            }
        }

        /// <summary>
        /// Deploy an NPC from the pool at the specified position (optionally under a specific parent)
        /// </summary>
        public GameObject DeployNPC(string label, Vector3 position, Quaternion rotation, Transform parentTransform = null)
        {
            if (npcPools.TryGetValue(label, out var pool) && pool.Count > 0)
            {
                var npc = pool.Dequeue();
                
                // Set parent if specified (for organization purposes)
                if (parentTransform != null && npc.transform.parent != parentTransform)
                {
                    npc.transform.SetParent(parentTransform);
                }
                
                npc.transform.SetPositionAndRotation(position, rotation);
                npc.SetActive(true);

                controller.RegisterNPC(npc, label);
                
                Debug.Log($"[OrchestratorNPCGlobals] Deployed NPC '{label}' at {position} under parent {parentTransform?.name ?? "none"}");
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

        /// <summary>
        /// Prewarm the pool for a specific label with additional instances under the parent transform
        /// </summary>
        public async UniTask PrewarmPool(string label, int count, Transform parentTransform, CancellationToken cancellation = default)
        {
            if (!npcPools.ContainsKey(label))
                npcPools[label] = new Queue<GameObject>();

            var def = npcDatabase.GetDefinitionByLabel(label);
            GameObject prefab = def?.prefab;

            if (prefab == null)
            {
                var handle = Addressables.LoadAssetAsync<GameObject>(label);
                await handle.ToUniTask(cancellationToken: cancellation);

                if (handle.Status != AsyncOperationStatus.Succeeded)
                {
                    Debug.LogError($"[OrchestratorNPCGlobals] Failed to load prefab for label '{label}' during pool prewarm.");
                    return;
                }

                prefab = handle.Result;
            }

            if (prefab == null)
            {
                Debug.LogError($"[OrchestratorNPCGlobals] Prefab not found for label '{label}' during pool prewarm.");
                return;
            }

            for (int i = 0; i < count; i++)
            {
                var obj = UnityEngine.Object.Instantiate(prefab, parentTransform);
                obj.SetActive(false);
                npcPools[label].Enqueue(obj);
            }

            Debug.Log($"[OrchestratorNPCGlobals] Prewarmed pool for '{label}' with {count} instances under {parentTransform.name}.");
        }


    }

}