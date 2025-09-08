using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    /// <summary>
    /// MonoBehaviour container that organizes all NPC-related services under a single GameObject.
    /// This provides better hierarchy organization and enables pooling capabilities.
    /// </summary>
    public class NPCSystemManager : MonoBehaviour, IAsyncStartable
    {
        [Header("NPC System Configuration")]
        [SerializeField] private bool enableDebugLogging = true;
        
        // Injected NPC services - Manager coordinates all of these
        private INPCGlobalController npcGlobalController;
        private INPCFactory npcFactory;
        private OrchestratorNPCGlobals npcGlobals;
        private Transform poolRoot;
        
        [Inject]
        public void Construct(
            INPCGlobalController globalController,
            INPCFactory factory,
            OrchestratorNPCGlobals globals,
            Transform poolRoot)
        {
            this.npcGlobalController = globalController;
            this.npcFactory = factory;
            this.npcGlobals = globals;
            this.poolRoot = poolRoot;
            
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] All NPC services injected successfully");
            }
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] NPC System starting initialization...");
            }
            
            // 1. Set up the GameObject as a container for NPC pooling
            SetupPoolingContainer();
            
            // 2. Initialize NPC services in proper order
            await InitializeNPCServices(cancellationToken);
            
            // 3. Start NPC spawning through coordinated approach
            await InitializeNPCSpawning(cancellationToken);
            
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] NPC System fully initialized and ready");
            }
        }
        
        private async UniTask InitializeNPCServices(CancellationToken cancellationToken)
        {
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] Initializing NPC services...");
            }
            
            // Initialize OrchestratorNPCGlobals with this manager's transform as parent
            if (npcGlobals != null)
            {
                await npcGlobals.InitializeAsync(transform, cancellationToken);
            }
            
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] NPC services initialized");
            }
        }
        
        private async UniTask InitializeNPCSpawning(CancellationToken cancellationToken)
        {
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] Starting coordinated NPC spawning...");
            }
            
            // Now we control when and how NPCs spawn
            // All NPCs should be spawned as children of this manager's transform
            await StartCoordinatedSpawning(cancellationToken);
            
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] NPC spawning coordination established");
            }
        }
        
        private async UniTask StartCoordinatedSpawning(CancellationToken cancellationToken)
        {
            // Coordination is now established - NPCs will spawn under this manager's transform
            // when DeployNPC is called with the parentTransform parameter
            
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] NPC spawning coordination ready - all NPCs will spawn under this manager");
            }
            
            await UniTask.CompletedTask;
        }
        
        private void SetupPoolingContainer()
        {
            // Ensure this GameObject can serve as a pool container
            if (transform.childCount > 0)
            {
                if (enableDebugLogging)
                {
                    Debug.Log($"[NPCSystemManager] GameObject already has {transform.childCount} children");
                }
            }
            
            // Tag this GameObject for easier identification
            gameObject.name = "NPCSystem [Manager]";
            
            // Keep default tag - don't try to set undefined tags
            // gameObject.tag remains "Untagged" which is fine
        }
        
        /// <summary>
        /// Get a reference to the NPC pool container transform (this GameObject's transform)
        /// </summary>
        public Transform GetPoolContainer()
        {
            return transform;
        }
        
        /// <summary>
        /// Spawn an NPC through the coordinated system (all NPCs spawn under this manager)
        /// </summary>
        public async UniTask<GameObject> SpawnNPCAsync(string npcId, Vector3 position, CancellationToken cancellationToken = default)
        {
            if (npcFactory == null)
            {
                Debug.LogError("[NPCSystemManager] Cannot spawn NPC - factory is null");
                return null;
            }
            
            // Use the factory to create NPC, but ensure it spawns under this transform
            var npc = await npcFactory.CreateNPCAsync(npcId, position, transform, cancellationToken);
            
            if (enableDebugLogging && npc != null)
            {
                Debug.Log($"[NPCSystemManager] Spawned NPC '{npcId}' under manager at position {position}");
            }
            
            return npc;
        }
        
        /// <summary>
        /// Deploy an NPC using the global pools, ensuring it spawns under this manager
        /// </summary>
        public GameObject DeployNPCFromGlobalPool(string label, Vector3 position, Quaternion rotation = default)
        {
            if (npcGlobals == null)
            {
                Debug.LogError("[NPCSystemManager] Cannot deploy NPC - npcGlobals is null");
                return null;
            }
            
            // Use the updated DeployNPC method that accepts parent transform
            var npc = npcGlobals.DeployNPC(label, position, rotation, transform);
            
            if (enableDebugLogging && npc != null)
            {
                Debug.Log($"[NPCSystemManager] Deployed NPC '{label}' from global pool under manager control");
            }
            
            return npc;
        }
        
        /// <summary>
        /// Prewarm a specific NPC pool with additional instances under this manager
        /// </summary>
        public async UniTask PrewarmNPCPool(string label, int count, CancellationToken cancellationToken = default)
        {
            if (npcGlobals == null)
            {
                Debug.LogError("[NPCSystemManager] Cannot prewarm pool - npcGlobals is null");
                return;
            }
            
            if (enableDebugLogging)
            {
                Debug.Log($"[NPCSystemManager] Prewarming pool for '{label}' with {count} instances");
            }
            
            await npcGlobals.PrewarmPool(label, count, transform, cancellationToken);
        }
        
        /// <summary>
        /// Get all NPCs currently managed by this system
        /// </summary>
        public GameObject[] GetManagedNPCs()
        {
            var npcs = new List<GameObject>();
            for (int i = 0; i < transform.childCount; i++)
            {
                var child = transform.GetChild(i).gameObject;
                // You might want to filter only actual NPC objects here
                npcs.Add(child);
            }
            return npcs.ToArray();
        }
        
        /// <summary>
        /// Get information about the current NPC system state
        /// </summary>
        public NPCSystemInfo GetSystemInfo()
        {
            return new NPCSystemInfo
            {
                ManagerGameObject = gameObject,
                ChildCount = transform.childCount,
                IsActive = gameObject.activeInHierarchy,
                HasGlobalController = npcGlobalController != null,
                HasFactory = npcFactory != null,
                HasGlobals = npcGlobals != null
            };
        }
        
        private void OnDestroy()
        {
            if (enableDebugLogging)
            {
                Debug.Log("[NPCSystemManager] NPC System Manager destroyed");
            }
        }
        
        // Debug method to show system status in inspector
        [ContextMenu("Log System Status")]
        private void LogSystemStatus()
        {
            var info = GetSystemInfo();
            Debug.Log($"NPC System Status:\n" +
                     $"- Active: {info.IsActive}\n" +
                     $"- Children: {info.ChildCount}\n" +
                     $"- Has Controller: {info.HasGlobalController}\n" +
                     $"- Has Factory: {info.HasFactory}");
        }
    }
    
    /// <summary>
    /// Information about the NPC system state
    /// </summary>
    [System.Serializable]
    public struct NPCSystemInfo
    {
        public GameObject ManagerGameObject;
        public int ChildCount;
        public bool IsActive;
        public bool HasGlobalController;
        public bool HasFactory;
        public bool HasGlobals;
        
        public override string ToString()
        {
            return $"NPCSystem - Active: {IsActive}, Children: {ChildCount}, Controller: {HasGlobalController}, Factory: {HasFactory}, Globals: {HasGlobals}";
        }
    }
}