using UnityEngine;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;
using Unity.Entities;

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
        [SerializeField] private SpawnTestingConfiguration _spawnTestingConfig;

        protected override void Configure(IContainerBuilder builder)
        {
            // Register configuration objects
            RegisterConfigurations(builder);

            // Register ECS systems with VContainer if spawn testing is enabled
            if (_spawnTestingConfig?.enableAutoSpawn == true)
            {
                RegisterECSSystems(builder);
            }
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
            if (_spawnTestingConfig == null)
                _spawnTestingConfig = SpawnTestingConfiguration.CreateDefault();

            builder.RegisterInstance(_dotsConfig).AsSelf();
            builder.RegisterInstance(_spatialConfig).AsSelf();
            builder.RegisterInstance(_combatConfig).AsSelf();
            builder.RegisterInstance(_spawnTestingConfig).AsSelf();
        }

        private void RegisterECSSystems(IContainerBuilder builder)
        {
            // Use VContainer ECS integration to register systems
            builder.UseDefaultWorld(systems =>
            {
                systems.Add<KBVE.MMExtensions.Orchestrator.DOTS.Systems.ZombieTargetingSystem>();
            });

            Debug.Log("[DOTSLifetimeScope] Registered zombie targeting system with VContainer ECS integration");
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
            Debug.Log($"[DOTSLifetimeScope] Spawn Testing Configuration: {_spawnTestingConfig != null}");
            Debug.Log($"[DOTSLifetimeScope] Auto Spawn Enabled: {_spawnTestingConfig?.enableAutoSpawn}");
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

    /// <summary>
    /// Configuration for spawn testing system
    /// </summary>
    [System.Serializable]
    public class SpawnTestingConfiguration
    {
        [Header("Testing Control")]
        [Tooltip("Enable automatic zombie wave spawning for testing")]
        public bool enableAutoSpawn = false;

        [Header("Spawn Settings")]
        [Tooltip("Type of minion to spawn (Tank = Zombie in current setup)")]
        public MinionType spawnType = MinionType.Tank; // Zombie is mapped to Tank type

        [Tooltip("Faction of spawned minions")]
        public FactionType spawnFaction = FactionType.Enemy;

        [Header("Wave Configuration")]
        [Tooltip("Number of zombies to spawn per wave")]
        [Range(1, 20)]
        public int zombiesPerWave = 3;

        [Tooltip("Time between wave spawns (seconds)")]
        [Range(1f, 60f)]
        public float spawnInterval = 5f;

        [Tooltip("Radius for wave spawn pattern")]
        [Range(1f, 20f)]
        public float waveRadius = 5f;

        [Header("Grid Spawn Boundaries")]
        [Tooltip("Top-left corner of the spawn grid")]
        public UnityEngine.Vector2 gridTopLeft = new UnityEngine.Vector2(17.4f, 5.6f);
        [Tooltip("Bottom-right corner of the spawn grid")]
        public UnityEngine.Vector2 gridBottomRight = new UnityEngine.Vector2(74.7f, -36.1f);
        [Tooltip("Spawn zombies randomly within the grid boundaries")]
        public bool spawnWithinGrid = true;
        [Tooltip("Allow spawning at grid edges for dramatic effect")]
        public bool allowEdgeSpawning = true;
        [Tooltip("Probability of edge spawning (0-1)")]
        [Range(0f, 1f)]
        public float edgeSpawnProbability = 0.3f;

        [Header("Spawn Locations")]
        [Tooltip("Fallback predefined spawn locations (used when grid spawning disabled)")]
        public UnityEngine.Vector3[] spawnPositions = new UnityEngine.Vector3[]
        {
            new UnityEngine.Vector3(46f, 0, -15f), // Center of grid
            new UnityEngine.Vector3(25f, 0, 0f),   // Left side
            new UnityEngine.Vector3(65f, 0, 0f),   // Right side
            new UnityEngine.Vector3(46f, 0, -25f)  // Bottom center
        };

        [Header("Pathfinding Settings")]
        [Tooltip("Enable A* pathfinding for spawned zombies")]
        public bool enableZombiePathfinding = true;
        [Tooltip("Base movement speed for zombies")]
        [Range(0.5f, 10f)]
        public float zombieMoveSpeed = 2f;
        [Tooltip("Target detection range for zombies")]
        [Range(5f, 50f)]
        public float zombieTargetRange = 15f;
        [Tooltip("Enable collision avoidance between zombies")]
        public bool enableZombieRVO = true;
        [Tooltip("Layer mask for detecting player targets")]
        public LayerMask playerLayerMask = 1 << 8; // Default to layer 8

        [Header("Testing Options")]
        [Tooltip("Spawn initial wave immediately on start")]
        public bool spawnOnStart = true;

        [Tooltip("Maximum number of waves to spawn (0 = unlimited)")]
        [Range(0, 100)]
        public int maxWaves = 10;

        [Tooltip("Delay before first spawn (seconds)")]
        [Range(0f, 10f)]
        public float initialDelay = 2f;

        public static SpawnTestingConfiguration CreateDefault()
        {
            return new SpawnTestingConfiguration();
        }
    }


}