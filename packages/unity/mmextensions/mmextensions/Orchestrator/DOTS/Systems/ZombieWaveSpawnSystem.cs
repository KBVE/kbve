using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;
using VContainer;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// ECS System that automatically spawns zombie waves for testing
    /// Uses VContainer dependency injection for configuration
    /// </summary>
    public partial class ZombieWaveSpawnSystem : SystemBase
    {
        private SpawnTestingConfiguration _config;
        private EntityCommandBufferSystem _ecbSystem;

        // Spawn tracking
        private float _lastSpawnTime;
        private int _wavesSpawned;
        private bool _hasSpawnedInitial;
        private bool _isInitialized;

        [Inject]
        public void Construct(SpawnTestingConfiguration config)
        {
            _config = config;

            if (_config.enableAutoSpawn)
            {
                Debug.Log("[ZombieWaveSpawnSystem] Initialized with auto-spawn enabled");
                Debug.Log($"[ZombieWaveSpawnSystem] Will spawn {_config.zombiesPerWave} {_config.spawnType} every {_config.spawnInterval}s");
            }
        }

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<EndSimulationEntityCommandBufferSystem>();

            // Don't require any entities to exist for this system to run
            RequireForUpdate(GetEntityQuery(ComponentType.ReadOnly<MinionSpawningSystem>()));
        }

        protected override void OnStartRunning()
        {
            _lastSpawnTime = (float)SystemAPI.Time.ElapsedTime;
            _wavesSpawned = 0;
            _hasSpawnedInitial = false;
            _isInitialized = false;

            if (_config?.enableAutoSpawn == true)
            {
                Debug.Log("[ZombieWaveSpawnSystem] Starting automatic zombie wave spawning");
            }
        }

        protected override void OnUpdate()
        {
            // Only run if auto-spawn is enabled
            if (_config?.enableAutoSpawn != true)
                return;

            // Wait for DOTS to be properly initialized
            if (!DOTSSingleton.IsInitialized)
                return;

            if (!_isInitialized)
            {
                _isInitialized = true;
                Debug.Log("[ZombieWaveSpawnSystem] DOTS initialized, ready to spawn");
            }

            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Handle initial spawn
            if (_config.spawnOnStart && !_hasSpawnedInitial && currentTime >= _config.initialDelay)
            {
                SpawnInitialWave();
                _hasSpawnedInitial = true;
                _lastSpawnTime = currentTime;
                return;
            }

            // Check if we've reached max waves
            if (_config.maxWaves > 0 && _wavesSpawned >= _config.maxWaves)
                return;

            // Check if it's time for next wave
            if (currentTime - _lastSpawnTime >= _config.spawnInterval)
            {
                SpawnNextWave();
                _lastSpawnTime = currentTime;
            }
        }

        private void SpawnInitialWave()
        {
            Debug.Log("[ZombieWaveSpawnSystem] Spawning initial zombie wave");

            // Spawn at the first location, or origin if no locations defined
            float3 spawnCenter = _config.spawnPositions.Length > 0
                ? new float3(_config.spawnPositions[0].x, _config.spawnPositions[0].y, _config.spawnPositions[0].z)
                : float3.zero;

            SpawnWaveAtLocation(spawnCenter);
            _wavesSpawned++;
        }

        private void SpawnNextWave()
        {
            if (_config.spawnPositions.Length == 0)
            {
                // No predefined locations, spawn at origin
                SpawnWaveAtLocation(float3.zero);
            }
            else
            {
                // Cycle through spawn locations
                int locationIndex = _wavesSpawned % _config.spawnPositions.Length;
                var location = _config.spawnPositions[locationIndex];
                float3 spawnCenter = new float3(location.x, location.y, location.z);

                SpawnWaveAtLocation(spawnCenter);
            }

            _wavesSpawned++;

            Debug.Log($"[ZombieWaveSpawnSystem] Spawned wave {_wavesSpawned}, next in {_config.spawnInterval}s");
        }

        private void SpawnWaveAtLocation(float3 center)
        {
            // Use the existing DOTSSingleton spawning system
            for (int i = 0; i < _config.zombiesPerWave; i++)
            {
                // Calculate position in a circle around the center
                float angle = (float)i / _config.zombiesPerWave * math.PI * 2f;
                float3 offset = new float3(
                    math.cos(angle) * _config.waveRadius,
                    0,
                    math.sin(angle) * _config.waveRadius
                );

                float3 spawnPosition = center + offset;

                // Spawn using DOTSSingleton (which handles the archetype creation)
                DOTSSingleton.RequestSingleSpawn(spawnPosition, _config.spawnType, _config.spawnFaction);
            }

            Debug.Log($"[ZombieWaveSpawnSystem] Spawned {_config.zombiesPerWave} zombies at {center}");
        }

        protected override void OnStopRunning()
        {
            if (_config?.enableAutoSpawn == true)
            {
                Debug.Log($"[ZombieWaveSpawnSystem] Stopped after spawning {_wavesSpawned} waves");
            }
        }

        // Context menu helper for testing
        [Unity.Collections.GenerateTestsForBurstCompatibility(GenericTypeArguments = new[] { typeof(ZombieWaveSpawnSystem) })]
        public void ForceSpawnWave()
        {
            if (_config?.enableAutoSpawn == true && _isInitialized)
            {
                SpawnNextWave();
                Debug.Log("[ZombieWaveSpawnSystem] Force spawned wave via debug command");
            }
            else
            {
                Debug.LogWarning("[ZombieWaveSpawnSystem] Cannot force spawn - auto-spawn disabled or not initialized");
            }
        }
    }
}