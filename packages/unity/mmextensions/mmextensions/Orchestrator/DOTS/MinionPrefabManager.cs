using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Cysharp.Threading.Tasks;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Manages loading and caching of minion prefabs from Addressables
    /// Works with DOTS to spawn entity prefabs
    /// </summary>
    public class MinionPrefabManager : MonoBehaviour
    {
        private static MinionPrefabManager _instance;
        public static MinionPrefabManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindFirstObjectByType<MinionPrefabManager>();
                    if (_instance == null)
                    {
                        var go = new GameObject("MinionPrefabManager");
                        _instance = go.AddComponent<MinionPrefabManager>();
                        DontDestroyOnLoad(go);
                    }
                }
                return _instance;
            }
        }

        [Header("Configuration")]
        [SerializeField] private MinionPrefabRegistry prefabRegistry;
        [SerializeField] private bool preloadAllPrefabs = false;
        [SerializeField] private bool enableDebugLogging = true;

        // Cache for loaded prefabs
        private Dictionary<MinionType, GameObject> _loadedPrefabs = new Dictionary<MinionType, GameObject>();
        private Dictionary<MinionType, Entity> _entityPrefabs = new Dictionary<MinionType, Entity>();
        private Dictionary<string, AsyncOperationHandle<GameObject>> _loadingHandles = new Dictionary<string, AsyncOperationHandle<GameObject>>();

        // Loading state tracking
        private HashSet<MinionType> _loadingTypes = new HashSet<MinionType>();
        private bool _isInitialized = false;

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private async void Start()
        {
            await InitializeAsync();
        }

        /// <summary>
        /// Initialize the prefab manager
        /// </summary>
        public async UniTask InitializeAsync()
        {
            if (_isInitialized) return;

            if (prefabRegistry == null)
            {
                // Try to find the registry in Resources
                prefabRegistry = Resources.Load<MinionPrefabRegistry>("MinionPrefabRegistry");
                if (prefabRegistry == null)
                {
                    Debug.LogError("[MinionPrefabManager] No MinionPrefabRegistry assigned or found in Resources!");
                    return;
                }
            }

            if (preloadAllPrefabs)
            {
                await PreloadAllPrefabs();
            }

            _isInitialized = true;

            if (enableDebugLogging)
                Debug.Log("[MinionPrefabManager] Initialized successfully");
        }

        /// <summary>
        /// Preload all registered prefabs
        /// </summary>
        private async UniTask PreloadAllPrefabs()
        {
            var types = prefabRegistry.GetRegisteredTypes();
            var loadTasks = new List<UniTask>();

            foreach (var type in types)
            {
                loadTasks.Add(LoadPrefabAsync(type));
            }

            await UniTask.WhenAll(loadTasks);

            if (enableDebugLogging)
                Debug.Log($"[MinionPrefabManager] Preloaded {_loadedPrefabs.Count} prefabs");
        }

        /// <summary>
        /// Load a minion prefab asynchronously
        /// </summary>
        public async UniTask<GameObject> LoadPrefabAsync(MinionType type)
        {
            // Return cached if available
            if (_loadedPrefabs.TryGetValue(type, out var cached))
                return cached;

            // Wait if already loading
            if (_loadingTypes.Contains(type))
            {
                await UniTask.WaitUntil(() => !_loadingTypes.Contains(type));
                return _loadedPrefabs.TryGetValue(type, out var loaded) ? loaded : null;
            }

            _loadingTypes.Add(type);

            try
            {
                var address = prefabRegistry.GetAddressForType(type);

                if (string.IsNullOrEmpty(address))
                {
                    Debug.LogError($"[MinionPrefabManager] No address found for {type}");
                    return null;
                }

                if (enableDebugLogging)
                    Debug.Log($"[MinionPrefabManager] Loading prefab for {type} from address: {address}");

                // Load from Addressables
                var handle = Addressables.LoadAssetAsync<GameObject>(address);
                await handle;

                if (handle.Status == UnityEngine.ResourceManagement.AsyncOperations.AsyncOperationStatus.Succeeded)
                {
                    var prefab = handle.Result;
                    _loadedPrefabs[type] = prefab;
                    _loadingHandles[address] = handle;

                    // Convert to entity prefab
                    ConvertToEntityPrefab(type, prefab);

                    if (enableDebugLogging)
                        Debug.Log($"[MinionPrefabManager] Successfully loaded {type} prefab");

                    return prefab;
                }
                else
                {
                    Debug.LogWarning($"[MinionPrefabManager] Failed to load {type} from address: {address}, trying direct asset path");

                    // Fallback to direct asset loading for development
                    GameObject fallbackPrefab = null;

#if UNITY_EDITOR
                    // Try to load from known asset paths
                    if (type == MinionType.Tank) // Zombie uses Tank type
                    {
                        fallbackPrefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Dungeon/ECS/ECS_Zombie.prefab");
                        if (fallbackPrefab == null)
                            fallbackPrefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Sprites/Characters/Zombie/NewZombie.prefab");
                    }
#endif

                    if (fallbackPrefab != null)
                    {
                        _loadedPrefabs[type] = fallbackPrefab;
                        ConvertToEntityPrefab(type, fallbackPrefab);

                        if (enableDebugLogging)
                            Debug.Log($"[MinionPrefabManager] Loaded {type} prefab from fallback asset path");

                        return fallbackPrefab;
                    }

                    Debug.LogError($"[MinionPrefabManager] Failed to load {type} from both addressables and fallback paths");
                    return null;
                }
            }
            finally
            {
                _loadingTypes.Remove(type);
            }
        }

        /// <summary>
        /// Register GameObject prefab for Unity's baking system
        /// The actual entity prefab will be created when we instantiate it
        /// </summary>
        private void ConvertToEntityPrefab(MinionType type, GameObject prefab)
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[MinionPrefabManager] DOTS not initialized, cannot register prefab");
                return;
            }

            // Check if prefab has MinionAuthoring component
            var authoring = prefab.GetComponent<MinionAuthoring>();
            if (authoring == null)
            {
                Debug.LogWarning($"[MinionPrefabManager] Prefab for {type} missing MinionAuthoring component");
                return;
            }

            // In Unity Entities 1.0+, we don't manually convert prefabs
            // Instead, we rely on Unity's baking system to automatically convert
            // prefabs with Baker components when they're instantiated

            if (enableDebugLogging)
                Debug.Log($"[MinionPrefabManager] Registered {type} prefab for automatic baking: {prefab.name}");
        }

        /// <summary>
        /// Spawn a minion entity at a position using Unity's GameObject instantiation + baking
        /// </summary>
        public async UniTask<Entity> SpawnMinionAsync(MinionType type, float3 position, FactionType faction = FactionType.Enemy)
        {
            // Ensure prefab is loaded
            var prefab = await LoadPrefabAsync(type);
            if (prefab == null)
            {
                Debug.LogError($"[MinionPrefabManager] Cannot spawn {type} - prefab not found");
                return Entity.Null;
            }

            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogError("[MinionPrefabManager] Cannot spawn - DOTS not initialized");
                return Entity.Null;
            }

            // Check if we have an entity prefab cached from previous conversion
            if (_entityPrefabs.TryGetValue(type, out var entityPrefab) && entityPrefab != Entity.Null)
            {
                var entityManager = DOTSSingleton.GetEntityManager();

                // Instantiate from cached entity prefab
                var entity = entityManager.Instantiate(entityPrefab);

                // Set position
                entityManager.SetComponentData(entity, new LocalTransform
                {
                    Position = position,
                    Rotation = quaternion.identity,
                    Scale = 1f
                });

                // Update faction if needed
                if (entityManager.HasComponent<MinionData>(entity))
                {
                    var minionData = entityManager.GetComponentData<MinionData>(entity);
                    minionData.Faction = faction;
                    entityManager.SetComponentData(entity, minionData);
                }

                if (enableDebugLogging)
                    Debug.Log($"[MinionPrefabManager] Spawned {type} entity from cached prefab at {position}");

                return entity;
            }
            else
            {
                // Use GameObject instantiation - Unity will automatically convert via Baker
                var gameObjectInstance = Object.Instantiate(prefab, new Vector3(position.x, position.y, position.z), Quaternion.identity);

                // Update MinionAuthoring faction before baking
                var authoring = gameObjectInstance.GetComponent<MinionAuthoring>();
                if (authoring != null)
                {
                    authoring.faction = faction;
                }

                if (enableDebugLogging)
                    Debug.Log($"[MinionPrefabManager] Spawned {type} GameObject (will be auto-converted to entity) at {position}");

                // The entity will be created automatically by Unity's baking system
                // We could return the entity reference here, but for now return null
                // since the baking happens asynchronously
                return Entity.Null;
            }
        }

        /// <summary>
        /// Spawn multiple minions
        /// </summary>
        public async UniTask<List<Entity>> SpawnMinionWaveAsync(MinionType type, float3 center, int count, float radius, FactionType faction = FactionType.Enemy)
        {
            var entities = new List<Entity>();

            // Ensure prefab is loaded first
            await LoadPrefabAsync(type);

            for (int i = 0; i < count; i++)
            {
                // Calculate spawn position in a circle
                float angle = (float)i / count * math.PI * 2f;
                float3 offset = new float3(math.cos(angle), 0, math.sin(angle)) * radius;
                float3 position = center + offset;

                var entity = await SpawnMinionAsync(type, position, faction);
                if (entity != Entity.Null)
                {
                    entities.Add(entity);
                }
            }

            return entities;
        }

        /// <summary>
        /// Check if a prefab is loaded
        /// </summary>
        public bool IsPrefabLoaded(MinionType type)
        {
            return _loadedPrefabs.ContainsKey(type);
        }

        /// <summary>
        /// Set the prefab registry
        /// </summary>
        public void SetRegistry(MinionPrefabRegistry registry)
        {
            prefabRegistry = registry;
        }

        private void OnDestroy()
        {
            // Release all loaded addressables
            foreach (var handle in _loadingHandles.Values)
            {
                if (handle.IsValid())
                {
                    Addressables.Release(handle);
                }
            }

            _loadingHandles.Clear();
            _loadedPrefabs.Clear();
            _entityPrefabs.Clear();
        }

        /// <summary>
        /// Debug helper to spawn a test minion
        /// </summary>
        [ContextMenu("Spawn Test Zombie")]
        public async void SpawnTestZombie()
        {
            if (!Application.isPlaying)
            {
                Debug.LogError("Can only spawn in Play mode");
                return;
            }

            await InitializeAsync();

            var position = new float3(0, 0, 0);
            var entity = await SpawnMinionAsync(MinionType.Tank, position, FactionType.Enemy);

            Debug.Log($"Spawned test zombie: {entity}");
        }
    }
}