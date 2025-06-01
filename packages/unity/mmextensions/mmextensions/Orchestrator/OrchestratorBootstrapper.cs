using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.ResourceLocations;
using UnityEngine.ResourceManagement.AsyncOperations;
using Cysharp.Threading.Tasks;
using System.Threading;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// Bootstraps orchestrator data before container registration.
    /// </summary>
    public class OrchestratorBootstrapper : MonoBehaviour, IAsyncStartable
    {
        [Header("Boot Config")]
        [SerializeField] private string npcLabelGroup = "NPC"; // Shared Addressables label

        [Header("Diagnostics")]
        [SerializeField] private List<string> npcLabels = new(); // Exposed for debug

        public IReadOnlyList<string> NPCLabels => npcLabels;

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            Debug.Log("[OrchestratorBootstrapper] Loading NPC labels...");

            npcLabels.Clear();

          
            AsyncOperationHandle<IList<IResourceLocation>> handle = Addressables.LoadResourceLocationsAsync(npcLabelGroup);
            await handle.ToUniTask(cancellationToken: cancellation);
            IList<IResourceLocation> locations = handle.Result;

            foreach (IResourceLocation location in locations)
            {
                npcLabels.Add(location.PrimaryKey);
            }

            Debug.Log($"[OrchestratorBootstrapper] Loaded {npcLabels.Count} NPC labels.");
        }
    }
}
