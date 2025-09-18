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
            RequireForUpdate(GetEntityQuery(ComponentType.ReadOnly<MinionSpawningSystemTag>()));
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
            for (int i = 0; i < _config.zombiesPerWave; i++)
            {
                float3 spawnPosition;

                if (_config.spawnWithinGrid)
                {
                    // Use grid-based spawning
                    spawnPosition = GetRandomGridPosition();
                }
                else
                {
                    // Use circular pattern around center
                    float angle = (float)i / _config.zombiesPerWave * math.PI * 2f;
                    float3 offset = new float3(
                        math.cos(angle) * _config.waveRadius,
                        0,
                        math.sin(angle) * _config.waveRadius
                    );
                    spawnPosition = center + offset;
                }

                // Spawn zombie using existing system
                SpawnZombieWithPathfinding(spawnPosition);
            }

            string spawnMethod = _config.spawnWithinGrid ? "grid" : "circular";
            Debug.Log($"[ZombieWaveSpawnSystem] Spawned {_config.zombiesPerWave} zombies using {spawnMethod} pattern");
        }

        private float3 GetRandomGridPosition()
        {
            var gridMin = new float2(_config.gridTopLeft.x, _config.gridBottomRight.y);
            var gridMax = new float2(_config.gridBottomRight.x, _config.gridTopLeft.y);

            // Check if we should spawn at edges
            if (_config.allowEdgeSpawning && UnityEngine.Random.value < _config.edgeSpawnProbability)
            {
                return GetEdgeSpawnPosition(gridMin, gridMax);
            }

            // Random position within grid
            float x = UnityEngine.Random.Range(gridMin.x, gridMax.x);
            float z = UnityEngine.Random.Range(gridMin.y, gridMax.y);

            return new float3(x, 0, z);
        }

        private float3 GetEdgeSpawnPosition(float2 gridMin, float2 gridMax)
        {
            // Choose random edge: 0=top, 1=right, 2=bottom, 3=left
            int edge = UnityEngine.Random.Range(0, 4);

            return edge switch
            {
                0 => new float3(UnityEngine.Random.Range(gridMin.x, gridMax.x), 0, gridMax.y), // Top edge
                1 => new float3(gridMax.x, 0, UnityEngine.Random.Range(gridMin.y, gridMax.y)), // Right edge
                2 => new float3(UnityEngine.Random.Range(gridMin.x, gridMax.x), 0, gridMin.y), // Bottom edge
                3 => new float3(gridMin.x, 0, UnityEngine.Random.Range(gridMin.y, gridMax.y)), // Left edge
                _ => new float3(gridMin.x + (gridMax.x - gridMin.x) * 0.5f, 0, gridMin.y + (gridMax.y - gridMin.y) * 0.5f) // Center fallback
            };
        }

        private void SpawnZombieWithPathfinding(float3 position)
        {
            // For now, use the existing spawn system
            // The pathfinding components will be added by MinionAuthoring when prefabs are used
            DOTSSingleton.RequestSingleSpawn(position, _config.spawnType, _config.spawnFaction);

            // TODO: When we integrate with MinionPrefabManager, we can add pathfinding components here
            // For entities spawned through archetype system, we'd need to add the components manually
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