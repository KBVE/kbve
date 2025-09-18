using Unity.Entities;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;
using KBVE.MMExtensions.Orchestrator.DOTS.Utilities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// VContainer lifetime scope for DOTS systems
    /// Manages spatial indexing, AI behavior, and combat systems
    /// Only active during gameplay scenes
    /// </summary>
    public class DOTSLifetimeScope : LifetimeScope
    {
        [Header("DOTS Configuration")]
        [SerializeField] private DOTSConfiguration _dotsConfig;
        [SerializeField] private SpatialIndexConfiguration _spatialConfig;
        [SerializeField] private CombatConfiguration _combatConfig;

        [Header("Scene Management")]
        [SerializeField] private bool _autoActivateInGameScenes = true;
        [SerializeField] private string[] _gameSceneNames = { "GameScene", "CombatScene", "MainLevel" };

        private World _dotsWorld;
        private bool _isInitialized;

        protected override void Configure(IContainerBuilder builder)
        {
            // Register configuration objects
            RegisterConfigurations(builder);

            // Register utility classes
            RegisterUtilities(builder);

            // Use VContainer's ECS integration for proper DOTS system management
            RegisterDOTSWorld(builder);

            // Register world management
            RegisterWorldManagement(builder);

            // Register performance monitoring
            RegisterPerformanceMonitoring(builder);
        }

        private void RegisterConfigurations(IContainerBuilder builder)
        {
            // Create default configurations if not assigned
            if (_dotsConfig == null)
                _dotsConfig = DOTSConfiguration.CreateDefault();
            if (_spatialConfig == null)
                _spatialConfig = SpatialIndexConfiguration.CreateDefault();
            if (_combatConfig == null)
                _combatConfig = CombatConfiguration.CreateDefault();

            builder.RegisterInstance(_dotsConfig).AsSelf();
            builder.RegisterInstance(_spatialConfig).AsSelf();
            builder.RegisterInstance(_combatConfig).AsSelf();
        }

        private void RegisterUtilities(IContainerBuilder builder)
        {
            // Register spatial data structure factories
            builder.Register<ISpatialIndexFactory, SpatialIndexFactory>(Lifetime.Singleton);
            builder.Register<IPriorityHeapFactory, PriorityHeapFactory>(Lifetime.Singleton);
        }

        private void RegisterDOTSWorld(IContainerBuilder builder)
        {
            // Use VContainer's default world integration for DOTS systems
            builder.UseDefaultWorld(systems =>
            {
                // Core spatial systems (order is critical)
                systems.Add<SpatialIndexingSystem>();
                systems.Add<SpatialQuerySystem>();
                systems.Add<HighPrioritySpatialQuerySystem>();

                // Behavior systems
                systems.Add<MinionBehaviorSystem>();
                systems.Add<AdvancedMinionBehaviorSystem>();

                // Combat systems
                systems.Add<MinionCombatSystem>();
            });
        }

        private void RegisterWorldManagement(IContainerBuilder builder)
        {
            builder.Register<DOTSWorldManager>(Lifetime.Singleton);
            builder.Register<SystemUpdateOrderManager>(Lifetime.Singleton);
        }

        private void RegisterPerformanceMonitoring(IContainerBuilder builder)
        {
            builder.Register<DOTSPerformanceMonitor>(Lifetime.Singleton);
            builder.Register<SpatialQueryProfiler>(Lifetime.Singleton);
        }

        protected override void Awake()
        {
            base.Awake();

            // Check if we should be active in this scene
            if (_autoActivateInGameScenes && !IsGameScene())
            {
                gameObject.SetActive(false);
                return;
            }

            // VContainer will handle world initialization through UseNewWorld
            Debug.Log("[DOTSLifetimeScope] Initialized for game scene");
        }

        private bool IsGameScene()
        {
            string currentScene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name;

            foreach (string sceneName in _gameSceneNames)
            {
                if (currentScene.Contains(sceneName))
                    return true;
            }

            return false;
        }

        protected override void OnDestroy()
        {
            // VContainer will handle world cleanup automatically
            base.OnDestroy();
        }

        // Debug and development helpers
        [ContextMenu("Log VContainer Status")]
        private void LogVContainerStatus()
        {
            Debug.Log($"[DOTSLifetimeScope] VContainer scope active: {Container != null}");
            if (Container != null)
            {
                Debug.Log($"[DOTSLifetimeScope] Container has {Container.GetType().Name} configuration");
            }
        }
    }

    /// <summary>
    /// Configuration for DOTS systems performance and behavior
    /// </summary>
    [System.Serializable]
    public class DOTSConfiguration
    {
        [Header("Performance Settings")]
        public int maxEntitiesPerFrame = 1000;
        public float systemUpdateInterval = 0.016f; // ~60 FPS
        public bool enableBurstCompilation = true;
        public bool enableJobDebugging = false;

        [Header("Memory Management")]
        public int initialEntityCapacity = 10000;
        public Unity.Collections.Allocator defaultAllocator = Unity.Collections.Allocator.Persistent;

        public static DOTSConfiguration CreateDefault()
        {
            return new DOTSConfiguration();
        }
    }

    /// <summary>
    /// Configuration for spatial indexing systems
    /// </summary>
    [System.Serializable]
    public class SpatialIndexConfiguration
    {
        [Header("KDTree Settings")]
        public int kdTreeCapacity = 10000;
        public int kdTreeLeafSize = 16;
        public int kdTreeRebuildInterval = 30; // frames

        [Header("Query Settings")]
        public int maxQueryResults = 100;
        public float defaultQueryRadius = 15f;
        public float spatialUpdateThreshold = 0.1f;

        [Header("Priority Heap Settings")]
        public int heapInitialCapacity = 64;
        public HeapComparison defaultHeapComparison = HeapComparison.Min;

        public static SpatialIndexConfiguration CreateDefault()
        {
            return new SpatialIndexConfiguration();
        }
    }

    /// <summary>
    /// Configuration for combat systems
    /// </summary>
    [System.Serializable]
    public class CombatConfiguration
    {
        [Header("Targeting Settings")]
        public float defaultDetectionRange = 15f;
        public float defaultAttackRange = 2f;
        public float threatAssessmentThreshold = 0.3f;

        [Header("Combat Timing")]
        public float combatUpdateInterval = 0.1f;
        public float targetLossTimeout = 3f;
        public float aggroDecayRate = 1f;

        public static CombatConfiguration CreateDefault()
        {
            return new CombatConfiguration();
        }
    }
}