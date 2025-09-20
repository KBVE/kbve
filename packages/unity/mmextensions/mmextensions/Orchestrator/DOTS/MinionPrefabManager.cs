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

                    // Note: We'll cache the entity prefab when Unity bakes the first GameObject

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
                        // Note: We'll cache the entity prefab when Unity bakes the first GameObject

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
        /// Spawn a minion entity using SubScene baked prefab (preferred) or fallback methods
        /// </summary>
        public async UniTask<Entity> SpawnMinionAsync(MinionType type, float3 position, FactionType faction = FactionType.Enemy)
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogError("[MinionPrefabManager] Cannot spawn - DOTS not initialized");
                return Entity.Null;
            }

            var entityManager = DOTSSingleton.GetEntityManager();

            // First, try to find the SubScene baked prefab (fastest and preferred)
            var bakedPrefab = FindSubSceneBakedPrefab(type);
            if (bakedPrefab != Entity.Null)
            {
                // Ultra-fast path: Use SubScene baked entity prefab
                var entity = entityManager.Instantiate(bakedPrefab);

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

                Debug.Log($"[MinionPrefabManager] SubScene prefab spawn {type} at {position}");
                return entity;
            }

            // Fallback: Check if we have a cached Unity-baked entity prefab from GameObject conversion
            if (_entityPrefabs.TryGetValue(type, out var cachedPrefab) && cachedPrefab != Entity.Null)
            {
                // Fast path: Use cached Unity-baked entity
                var entity = entityManager.Instantiate(cachedPrefab);

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

                Debug.Log($"[MinionPrefabManager] Cached prefab spawn {type} at {position}");
                return entity;
            }

            // Last resort: GameObject spawning (creates visible entities but slower)
            var prefab = await LoadPrefabAsync(type);
            if (prefab == null)
            {
                Debug.LogError($"[MinionPrefabManager] Cannot spawn {type} - no prefab available");
                return Entity.Null;
            }

            var gameObjectInstance = Object.Instantiate(prefab, new Vector3(position.x, position.y, position.z), Quaternion.identity);

            // Update MinionAuthoring faction before baking
            var authoring = gameObjectInstance.GetComponent<MinionAuthoring>();
            if (authoring != null)
            {
                authoring.faction = faction;
            }

            Debug.Log($"[MinionPrefabManager] GameObject fallback spawn {type} at {position}");

            // Schedule detection of the baked entity to cache it for future use
            DetectAndCacheUnityBakedEntity(type).Forget();

            return Entity.Null; // Unity's baking is asynchronous
        }

        /// <summary>
        /// Find a baked entity prefab from SubScene (ECS_Zombie prefab)
        /// </summary>
        private Entity FindSubSceneBakedPrefab(MinionType type)
        {
            if (!DOTSSingleton.IsInitialized)
                return Entity.Null;

            var entityManager = DOTSSingleton.GetEntityManager();

            // Look for entities with MinionData of the matching type
            // Prefer entities with Prefab component (indicating they're templates)
            var query = entityManager.CreateEntityQuery(typeof(MinionData));
            var entities = query.ToEntityArray(Unity.Collections.Allocator.TempJob);

            Entity bestCandidate = Entity.Null;

            foreach (var entity in entities)
            {
                var minionData = entityManager.GetComponentData<MinionData>(entity);

                if (minionData.Type == type)
                {
                    // Prefer entities with Prefab component (they're templates)
                    if (entityManager.HasComponent<Prefab>(entity))
                    {
                        entities.Dispose();
                        Debug.Log($"[MinionPrefabManager] Found SubScene baked prefab with Prefab tag for {type}: {entity}");
                        return entity;
                    }

                    // Otherwise, store as potential candidate
                    if (bestCandidate == Entity.Null)
                    {
                        bestCandidate = entity;
                    }
                }
            }

            entities.Dispose();

            if (bestCandidate != Entity.Null)
            {
                Debug.Log($"[MinionPrefabManager] Found SubScene baked entity for {type}: {bestCandidate}");
                return bestCandidate;
            }

            return Entity.Null;
        }

        /// <summary>
        /// Detect when Unity bakes a GameObject to entity and cache the result
        /// </summary>
        private async UniTaskVoid DetectAndCacheUnityBakedEntity(MinionType type)
        {
            if (_entityPrefabs.ContainsKey(type))
                return; // Already cached

            var entityManager = DOTSSingleton.GetEntityManager();

            // Wait a few frames for Unity's baking to complete
            await UniTask.DelayFrame(5);

            try
            {
                // Look for entities with MinionData of the right type
                // This is a simple approach - in production you might want more sophisticated detection
                var query = entityManager.CreateEntityQuery(typeof(MinionData));
                var entities = query.ToEntityArray(Unity.Collections.Allocator.TempJob);

                foreach (var entity in entities)
                {
                    var minionData = entityManager.GetComponentData<MinionData>(entity);
                    if (minionData.Type == type)
                    {
                        // Found a Unity-baked entity of this type
                        // Create a prefab copy of it
                        var prefabEntity = entityManager.Instantiate(entity);

                        // Mark it as a prefab (remove any runtime-specific components)
                        if (entityManager.HasComponent<LocalToWorld>(prefabEntity))
                        {
                            entityManager.SetComponentData(prefabEntity, LocalTransform.Identity);
                        }

                        // Add prefab tag
                        entityManager.AddComponent<Prefab>(prefabEntity);

                        // Cache it
                        _entityPrefabs[type] = prefabEntity;

                        Debug.Log($"[MinionPrefabManager] Detected and cached Unity-baked entity prefab for {type}: {prefabEntity}");
                        break;
                    }
                }

                entities.Dispose();
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[MinionPrefabManager] Failed to detect Unity-baked entity for {type}: {ex.Message}");
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