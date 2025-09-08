using UnityEngine;
using System.Threading;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// Interface for NPC factory that handles creation and destruction of NPCs
    /// with support for parent transform coordination
    /// </summary>
    public interface INPCFactory
    {
        GameObject Create(string label, Vector3 position, Quaternion rotation);
        GameObject Create(string label, Vector3 position, Quaternion rotation, Transform parentTransform);
        UniTask<GameObject> CreateNPCAsync(string label, Vector3 position, Transform parentTransform, CancellationToken cancellationToken = default);
        void Destroy(string label, GameObject npc);
    }

    public class NPCFactory: INPCFactory
    {
        private readonly OrchestratorNPCGlobals orchestratorGlobals;
        private readonly NPCGlobalController npcController;

        public NPCFactory(
            OrchestratorNPCGlobals orchestratorGlobals,
            NPCGlobalController npcController)
        {
            this.orchestratorGlobals = orchestratorGlobals;
            this.npcController = npcController;
        }

        /// <summary>
        /// Create NPC under the specified parent transform (coordinated with NPCSystemManager)
        /// </summary>
        public GameObject Create(string label, Vector3 position, Quaternion rotation, Transform parentTransform = null)
        {
            // Use the updated DeployNPC method with parent transform
            var npc = orchestratorGlobals.DeployNPC(label, position, rotation, parentTransform);
            
            // Note: OrchestratorNPCGlobals.DeployNPC already calls npcController.RegisterNPC,
            // so we don't need to duplicate the registration here
            
            return npc;
        }

        /// <summary>
        /// Create NPC asynchronously under the specified parent transform
        /// </summary>
        public async UniTask<GameObject> CreateNPCAsync(string label, Vector3 position, Transform parentTransform, CancellationToken cancellationToken = default)
        {
            // For now, the creation is not async, but this provides the API for future async operations
            await UniTask.Yield(cancellationToken);
            
            return Create(label, position, Quaternion.identity, parentTransform);
        }

        /// <summary>
        /// Legacy Create method for backward compatibility (without parent transform)
        /// </summary>
        public GameObject Create(string label, Vector3 position, Quaternion rotation)
        {
            return Create(label, position, rotation, null);
        }

        public void Destroy(string label, GameObject npc)
        {
            // OrchestratorNPCGlobals.ReturnNPC already calls npcController.UnregisterNPC,
            // so we don't need to duplicate the unregistration here
            orchestratorGlobals.ReturnNPC(label, npc);
        }
    }
}
