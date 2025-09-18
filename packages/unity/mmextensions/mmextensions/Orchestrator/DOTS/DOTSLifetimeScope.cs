using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Minimal VContainer scope for DOTS configuration only
    /// All DOTS systems are managed by DOTSSingleton - no DI integration
    /// </summary>
    public class DOTSLifetimeScope : LifetimeScope
    {
        [Header("Configuration Objects")]
        [SerializeField] private DOTSConfiguration _dotsConfig;
        [SerializeField] private SpatialIndexConfiguration _spatialConfig;
        [SerializeField] private CombatConfiguration _combatConfig;

        protected override void Configure(IContainerBuilder builder)
        {
            // Only register configuration objects
            RegisterConfigurations(builder);
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

        protected override void Awake()
        {
            base.Awake();
            Debug.Log("[DOTSLifetimeScope] Minimal configuration scope initialized");
        }

        protected override void OnDestroy()
        {
            base.OnDestroy();
        }

        // Debug helper
        [ContextMenu("Log Configuration Status")]
        private void LogConfigurationStatus()
        {
            Debug.Log($"[DOTSLifetimeScope] VContainer scope active: {Container != null}");
            Debug.Log($"[DOTSLifetimeScope] DOTS Configuration: {_dotsConfig != null}");
            Debug.Log($"[DOTSLifetimeScope] Spatial Configuration: {_spatialConfig != null}");
            Debug.Log($"[DOTSLifetimeScope] Combat Configuration: {_combatConfig != null}");
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
        public int defaultHeapComparison = 0; // 0 = Min, 1 = Max

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