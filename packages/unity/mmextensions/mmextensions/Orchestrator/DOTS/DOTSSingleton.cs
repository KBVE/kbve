using Unity.Entities;
using UnityEngine;
using Unity.Mathematics;
using Unity.Collections;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Singleton MonoBehaviour that manages the DOTS world lifecycle
    /// Provides static access to DOTS systems and world management
    /// Should be placed on the same GameObject as DOTSLifetimeScope
    /// </summary>
    [DefaultExecutionOrder(-1000)] // Execute before VContainer
    public class DOTSSingleton : MonoBehaviour
    {
        [Header("DOTS Configuration")]
        [SerializeField] private bool _initializeOnAwake = true;
        [SerializeField] private bool _enableDebugLogging = true;
        [SerializeField] private bool _destroyWorldOnDestroy = true;

        // Static singleton access
        private static DOTSSingleton _instance;
        private static World _dotsWorld;
        private static bool _isInitialized;

        // Cached system references for performance
        private static MinionSpawningSystem _spawningSystem;
        private static MinionSpawnRequestSystem _spawnRequestSystem;
        private static SpatialIndexingSystem _spatialIndexingSystem;
        private static SpatialQuerySystem _spatialQuerySystem;
        private static MinionCombatSystem _combatSystem;
        private static MinionBatchDestructionSystem _destructionSystem;

        // Sprite rendering components
        private static Mesh _spriteMesh;
        private static Material[] _spriteMaterials;

        #region Static Properties

        /// <summary>
        /// Get the singleton instance
        /// </summary>
        public static DOTSSingleton Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindFirstObjectByType<DOTSSingleton>();
                    if (_instance == null)
                    {
                        Debug.LogError("[DOTSSingleton] No DOTSSingleton found in scene. Please add one to your scene.");
                    }
                }
                return _instance;
            }
        }

        /// <summary>
        /// Get the active DOTS world
        /// </summary>
        public static World DOTSWorld
        {
            get
            {
                if (_dotsWorld == null || !_dotsWorld.IsCreated)
                {
                    InitializeWorld();
                }
                return _dotsWorld;
            }
        }

        /// <summary>
        /// Check if DOTS systems are initialized and ready
        /// </summary>
        public static bool IsInitialized => _isInitialized && _dotsWorld != null && _dotsWorld.IsCreated;

        #endregion

        #region Unity Lifecycle

        private void Awake()
        {
            // Ensure singleton pattern
            if (_instance != null && _instance != this)
            {
                Debug.LogWarning("[DOTSSingleton] Multiple DOTSSingleton instances found. Destroying duplicate.");
                Destroy(gameObject);
                return;
            }

            _instance = this;

            if (_initializeOnAwake)
            {
                InitializeWorld();
            }

            if (_enableDebugLogging)
            {
                Debug.Log("[DOTSSingleton] DOTS Singleton initialized");
            }
        }

        private void OnDestroy()
        {
            if (_instance == this)
            {
                if (_destroyWorldOnDestroy && _dotsWorld != null && _dotsWorld.IsCreated)
                {
                    if (_enableDebugLogging)
                    {
                        Debug.Log("[DOTSSingleton] Disposing DOTS World");
                    }
                    _dotsWorld.Dispose();
                }

                _isInitialized = false;
                _instance = null;
                ClearCachedSystems();
            }
        }

        private void OnApplicationQuit()
        {
            // Ensure clean shutdown
            if (_dotsWorld != null && _dotsWorld.IsCreated)
            {
                _dotsWorld.Dispose();
            }
        }

        #endregion

        #region DOTS World Management

        /// <summary>
        /// Register generic component types required for DOTS
        /// Note: In modern Unity DOTS, buffer types are automatically registered when systems use them
        /// </summary>
        private static void RegisterGenericComponentTypes()
        {
            // Buffer element types like SpatialQueryResult are automatically registered
            // when the systems that use them are created by Unity DOTS
            if (Instance != null && Instance._enableDebugLogging)
            {
                Debug.Log("[DOTSSingleton] Component types will be registered automatically by DOTS systems");
            }
        }

        /// <summary>
        /// Initialize the DOTS world and systems
        /// </summary>
        private static void InitializeWorld()
        {
            if (_isInitialized && _dotsWorld != null && _dotsWorld.IsCreated)
                return;

            try
            {
                // Register generic component types at runtime
                RegisterGenericComponentTypes();

                // Let Unity create the default world if it doesn't exist
                if (World.DefaultGameObjectInjectionWorld == null)
                {
                    DefaultWorldInitialization.Initialize("Default World", false);
                }

                _dotsWorld = World.DefaultGameObjectInjectionWorld;

                if (_dotsWorld == null)
                {
                    Debug.LogError("[DOTSSingleton] Failed to get or create DOTS World");
                    return;
                }

                // Cache system references for performance
                CacheSystemReferences();

                // Initialize sprite rendering
                InitializeSpriteRendering();

                _isInitialized = true;

                if (Instance != null && Instance._enableDebugLogging)
                {
                    Debug.Log($"[DOTSSingleton] DOTS World initialized with {_dotsWorld.Systems.Count} systems");
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[DOTSSingleton] Failed to initialize DOTS World: {ex.Message}");
                _isInitialized = false;
            }
        }

        /// <summary>
        /// Cache system references for fast access
        /// </summary>
        private static void CacheSystemReferences()
        {
            if (_dotsWorld == null || !_dotsWorld.IsCreated)
                return;

            _spawningSystem = _dotsWorld.GetExistingSystemManaged<MinionSpawningSystem>();
            _spawnRequestSystem = _dotsWorld.GetExistingSystemManaged<MinionSpawnRequestSystem>();
            _spatialIndexingSystem = _dotsWorld.GetExistingSystemManaged<SpatialIndexingSystem>();
            _spatialQuerySystem = _dotsWorld.GetExistingSystemManaged<SpatialQuerySystem>();
            _combatSystem = _dotsWorld.GetExistingSystemManaged<MinionCombatSystem>();
            _destructionSystem = _dotsWorld.GetExistingSystemManaged<MinionBatchDestructionSystem>();
        }

        /// <summary>
        /// Clear cached system references
        /// </summary>
        private static void ClearCachedSystems()
        {
            _spawningSystem = null;
            _spawnRequestSystem = null;
            _spatialIndexingSystem = null;
            _spatialQuerySystem = null;
            _combatSystem = null;
            _destructionSystem = null;

            // Clean up sprite rendering assets
            CleanupSpriteRendering();
        }

        /// <summary>
        /// Clean up sprite rendering assets
        /// </summary>
        private static void CleanupSpriteRendering()
        {
            if (_spriteMesh != null)
            {
                UnityEngine.Object.DestroyImmediate(_spriteMesh);
                _spriteMesh = null;
            }

            if (_spriteMaterials != null)
            {
                foreach (var material in _spriteMaterials)
                {
                    if (material != null)
                    {
                        UnityEngine.Object.DestroyImmediate(material);
                    }
                }
                _spriteMaterials = null;
            }
        }

        #endregion

        #region Sprite Rendering

        /// <summary>
        /// Initialize sprite rendering assets
        /// </summary>
        private static void InitializeSpriteRendering()
        {
            try
            {
                // Create quad mesh for sprites
                _spriteMesh = CreateSpriteMesh();

                // Create materials for each minion type
                _spriteMaterials = new Material[5];
                var shader = Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color") ?? Shader.Find("Unlit/Texture");

                if (shader != null)
                {
                    Color[] colors = { Color.red, Color.green, Color.blue, Color.yellow, Color.magenta };

                    for (int i = 0; i < 5; i++)
                    {
                        _spriteMaterials[i] = new Material(shader);
                        _spriteMaterials[i].color = colors[i];
                        _spriteMaterials[i].name = $"Minion Sprite Material {i}";
                    }

                    Debug.Log("[DOTSSingleton] Sprite rendering initialized");
                }
                else
                {
                    Debug.LogError("[DOTSSingleton] Could not find suitable shader for sprite rendering");
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[DOTSSingleton] Failed to initialize sprite rendering: {ex.Message}");
            }
        }

        /// <summary>
        /// Create a simple quad mesh for sprite rendering
        /// </summary>
        private static Mesh CreateSpriteMesh()
        {
            var mesh = new Mesh();
            mesh.name = "Sprite Quad";

            var vertices = new Vector3[]
            {
                new Vector3(-0.5f, -0.5f, 0),
                new Vector3(0.5f, -0.5f, 0),
                new Vector3(0.5f, 0.5f, 0),
                new Vector3(-0.5f, 0.5f, 0)
            };

            var triangles = new int[] { 0, 2, 1, 0, 3, 2 };
            var uvs = new Vector2[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };

            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.uv = uvs;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();

            return mesh;
        }

        /// <summary>
        /// Get sprite mesh for rendering
        /// </summary>
        public static Mesh GetSpriteMesh()
        {
            return _spriteMesh;
        }

        /// <summary>
        /// Get sprite material for a minion type
        /// </summary>
        public static Material GetSpriteMaterial(MinionType type)
        {
            if (_spriteMaterials == null) return null;

            int index = (int)type;
            if (index >= 0 && index < _spriteMaterials.Length)
            {
                return _spriteMaterials[index];
            }

            return _spriteMaterials[0]; // Default material
        }

        #endregion

        #region Public API

        /// <summary>
        /// Get a system from the DOTS world
        /// </summary>
        public static T GetSystem<T>() where T : ComponentSystemBase
        {
            if (!IsInitialized)
            {
                Debug.LogWarning("[DOTSSingleton] Attempting to get system before DOTS world is initialized");
                return null;
            }

            return _dotsWorld.GetExistingSystemManaged<T>();
        }

        /// <summary>
        /// Get the entity manager
        /// </summary>
        public static EntityManager GetEntityManager()
        {
            if (!IsInitialized)
            {
                Debug.LogError("[DOTSSingleton] Attempting to get EntityManager before DOTS world is initialized");
                return default;
            }

            return _dotsWorld.EntityManager;
        }

        /// <summary>
        /// Request bulk minion spawn
        /// </summary>
        public static Entity RequestBulkSpawn(in float3 position, int count, MinionType type, FactionType faction)
        {
            if (_spawnRequestSystem == null)
            {
                _spawnRequestSystem = GetSystem<MinionSpawnRequestSystem>();
                if (_spawnRequestSystem == null)
                {
                    Debug.LogError("[DOTSSingleton] MinionSpawnRequestSystem not found");
                    return Entity.Null;
                }
            }

            return _spawnRequestSystem.RequestBulkSpawn(position, count, type, faction);
        }

        /// <summary>
        /// Request single minion spawn
        /// </summary>
        public static void RequestSingleSpawn(in float3 position, MinionType type, FactionType faction)
        {
            if (_spawnRequestSystem == null)
            {
                _spawnRequestSystem = GetSystem<MinionSpawnRequestSystem>();
                if (_spawnRequestSystem == null)
                {
                    Debug.LogError("[DOTSSingleton] MinionSpawnRequestSystem not found");
                    return;
                }
            }

            _spawnRequestSystem.RequestSingleSpawn(position, type, faction);
        }

        /// <summary>
        /// Destroy minions in radius
        /// </summary>
        public static void DestroyInRadius(float3 center, float radius)
        {
            if (_destructionSystem == null)
            {
                _destructionSystem = GetSystem<MinionBatchDestructionSystem>();
                if (_destructionSystem == null)
                {
                    Debug.LogError("[DOTSSingleton] MinionBatchDestructionSystem not found");
                    return;
                }
            }

            _destructionSystem.DestroyInRadius(center, radius);
        }

        /// <summary>
        /// Get world statistics for debugging
        /// </summary>
        public static DOTSWorldStats GetWorldStats()
        {
            if (!IsInitialized)
                return new DOTSWorldStats();

            var entityManager = GetEntityManager();

            // Get entity count safely
            var allEntities = entityManager.GetAllEntities(Unity.Collections.Allocator.Temp);
            int entityCount = allEntities.Length;
            allEntities.Dispose();

            return new DOTSWorldStats
            {
                TotalEntities = entityCount,
                TotalSystems = _dotsWorld.Systems.Count,
                IsWorldCreated = _dotsWorld.IsCreated,
                WorldName = _dotsWorld.Name
            };
        }

        #endregion

        #region Debug Methods

        /// <summary>
        /// Force reinitialize the DOTS world (use with caution)
        /// </summary>
        [ContextMenu("Force Reinitialize DOTS World")]
        public void ForceReinitialize()
        {
            if (_dotsWorld != null && _dotsWorld.IsCreated)
            {
                _dotsWorld.Dispose();
            }

            _isInitialized = false;
            ClearCachedSystems();
            InitializeWorld();
        }

        /// <summary>
        /// Log current world status
        /// </summary>
        [ContextMenu("Log World Status")]
        public void LogWorldStatus()
        {
            var stats = GetWorldStats();
            Debug.Log($"[DOTSSingleton] World Status:\n" +
                     $"  - World Created: {stats.IsWorldCreated}\n" +
                     $"  - World Name: {stats.WorldName}\n" +
                     $"  - Total Entities: {stats.TotalEntities}\n" +
                     $"  - Total Systems: {stats.TotalSystems}\n" +
                     $"  - Initialized: {IsInitialized}");
        }

        #endregion
    }

    /// <summary>
    /// Statistics about the DOTS world
    /// </summary>
    public struct DOTSWorldStats
    {
        public int TotalEntities;
        public int TotalSystems;
        public bool IsWorldCreated;
        public string WorldName;
    }
}