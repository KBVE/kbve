using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Authoring component for zombie wave spawning
    /// </summary>
    [DisallowMultipleComponent]
    public class ZombieWaveSpawnerAuthoring : MonoBehaviour
    {
        [Header("Spawn Settings")]
        [Tooltip("Type of minion to spawn (Tank = Zombie)")]
        public MinionType spawnType = MinionType.Tank;

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
        public Vector2 gridTopLeft = new Vector2(17.4f, 5.6f);
        [Tooltip("Bottom-right corner of the spawn grid")]
        public Vector2 gridBottomRight = new Vector2(74.7f, -36.1f);
        [Tooltip("Spawn zombies randomly within the grid boundaries")]
        public bool spawnWithinGrid = true;
        [Tooltip("Allow spawning at grid edges for dramatic effect")]
        public bool allowEdgeSpawning = true;
        [Tooltip("Probability of edge spawning (0-1)")]
        [Range(0f, 1f)]
        public float edgeSpawnProbability = 0.3f;

        [Header("Testing Options")]
        [Tooltip("Spawn initial wave immediately on start")]
        public bool spawnOnStart = true;

        [Tooltip("Maximum number of waves to spawn (0 = unlimited)")]
        [Range(0, 100)]
        public int maxWaves = 10;

        [Tooltip("Delay before first spawn (seconds)")]
        [Range(0f, 10f)]
        public float initialDelay = 2f;

        private void OnDrawGizmosSelected()
        {
            // Draw spawn grid
            if (spawnWithinGrid)
            {
                Gizmos.color = Color.yellow;
                Vector3 center = new Vector3((gridTopLeft.x + gridBottomRight.x) * 0.5f, 0, (gridTopLeft.y + gridBottomRight.y) * 0.5f);
                Vector3 size = new Vector3(Mathf.Abs(gridBottomRight.x - gridTopLeft.x), 0.1f, Mathf.Abs(gridTopLeft.y - gridBottomRight.y));
                Gizmos.DrawWireCube(center, size);
            }
        }
    }

    /// <summary>
    /// Baker for zombie wave spawner
    /// </summary>
    public class ZombieWaveSpawnerBaker : Baker<ZombieWaveSpawnerAuthoring>
    {
        public override void Bake(ZombieWaveSpawnerAuthoring authoring)
        {
            var entity = GetEntity(TransformUsageFlags.Dynamic);

            AddComponent(entity, new ZombieWaveSpawner
            {
                spawnType = authoring.spawnType,
                spawnFaction = authoring.spawnFaction,
                zombiesPerWave = authoring.zombiesPerWave,
                spawnInterval = authoring.spawnInterval,
                waveRadius = authoring.waveRadius,
                gridTopLeft = authoring.gridTopLeft,
                gridBottomRight = authoring.gridBottomRight,
                spawnWithinGrid = authoring.spawnWithinGrid,
                allowEdgeSpawning = authoring.allowEdgeSpawning,
                edgeSpawnProbability = authoring.edgeSpawnProbability,
                spawnOnStart = authoring.spawnOnStart,
                maxWaves = authoring.maxWaves,
                initialDelay = authoring.initialDelay
            });

            AddComponent(entity, new SpawnTimer
            {
                lastSpawnTime = 0f,
                wavesSpawned = 0,
                hasSpawnedInitial = false,
                isInitialized = false
            });
        }
    }
}