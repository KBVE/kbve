using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using Cysharp.Threading.Tasks;
using VContainer.Unity;


namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class OrchestratorNPCGlobals : IAsyncStartable
    {
        private readonly List<string> npcLabels;
        private readonly Dictionary<string, Queue<GameObject>> npcPools = new();
        private readonly NPCGlobalController controller;

        public OrchestratorNPCGlobals(List<string> npcLabels, NPCGlobalController controller)
        {
            this.npcLabels = npcLabels;
            this.controller = controller;
        }

        public async UniTask StartAsync()
        {
            foreach (var label in npcLabels)
            {
                if (!npcPools.ContainsKey(label))
                    npcPools[label] = new Queue<GameObject>();

                for (int i = 0; i < 5; i++) // Default pool size per label , think of it as a place holder.
                {
                    var handle = Addressables.LoadAssetAsync<GameObject>(label);
                    await handle.ToUniTask();

                    if (handle.Status == AsyncOperationStatus.Succeeded)
                    {
                        var obj = Object.Instantiate(handle.Result);
                        obj.SetActive(false);
                        npcPools[label].Enqueue(obj);
                    }
                    else
                    {
                        Debug.LogError($"[OrchestratorNPCGlobals] Failed to load NPC prefab with label: {label}");
                    }
                }
            }
        }


    }

}