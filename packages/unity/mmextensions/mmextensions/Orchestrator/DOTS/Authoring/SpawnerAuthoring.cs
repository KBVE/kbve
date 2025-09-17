using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Authoring component for spawner GameObjects
    /// Converts spawner configurations to ECS spawn systems
    /// </summary>
    [DisallowMultipleComponent]
    public class SpawnerAuthoring : MonoBehaviour
    {
        [Header("Spawn Configuration")]
        public SpawnMode spawnMode = SpawnMode.Wave;
        public bool autoStart = true;
        public float startDelay = 1f;

        [Header("What to Spawn")]
        public MinionType minionType = MinionType.Basic;
        public FactionType faction = FactionType.Enemy;
        [Range(1, 100)]
        public int minionLevel = 1;

        [Header("Spawn Count")]
        [Range(1, 1000)]
        public int totalSpawnCount = 100;
        [Range(1, 100)]
        public int spawnBatchSize = 10;

        [Header("Spawn Timing")]
        [Range(0.1f, 10f)]
        public float spawnInterval = 1f;
        [Range(0f, 60f)]
        public float waveCooldown = 5f;

        [Header("Spawn Area")]
        public SpawnPattern spawnPattern = SpawnPattern.Circle;
        [Range(1f, 50f)]
        public float spawnRadius = 10f;
        public Transform[] spawnPoints;

        [Header("Wave Configuration")]
        public List<WaveConfig> waves = new List<WaveConfig>();

        [Header("Performance")]
        [Range(1, 100)]
        public int maxPerFrame = 50;
        public bool useJobSystem = true;

        [Header("Debug")]
        public bool showGizmos = true;
        public Color gizmoColor = Color.cyan;

        public enum SpawnMode
        {
            Once,           // Spawn all at once
            Continuous,     // Keep spawning until limit
            Wave,           // Spawn in waves
            Triggered       // Wait for trigger
        }

        [System.Serializable]
        public class WaveConfig
        {
            public string waveName = "Wave";
            public int minionCount = 10;
            public MinionType minionType = MinionType.Basic;
            public float difficultyMultiplier = 1f;
            public float delayAfterWave = 5f;
        }

        private void OnDrawGizmos()
        {
            if (!showGizmos) return;

            // Draw spawn area
            Gizmos.color = gizmoColor;
            Gizmos.DrawWireSphere(transform.position, spawnRadius);

            // Draw spawn pattern preview
            DrawSpawnPatternGizmo();

            // Draw spawn points
            if (spawnPoints != null)
            {
                Gizmos.color = Color.yellow;
                foreach (var point in spawnPoints)
                {
                    if (point != null)
                    {
                        Gizmos.DrawWireSphere(point.position, 1f);
                        Gizmos.DrawLine(transform.position, point.position);
                    }
                }
            }
        }

        private void DrawSpawnPatternGizmo()
        {
            int previewCount = Mathf.Min(20, spawnBatchSize);
            var positions = CalculateSpawnPositions(previewCount);

            Gizmos.color = new Color(gizmoColor.r, gizmoColor.g, gizmoColor.b, 0.5f);
            foreach (var pos in positions)
            {
                Gizmos.DrawCube(pos, Vector3.one * 0.5f);
            }
        }

        private List<Vector3> CalculateSpawnPositions(int count)
        {
            var positions = new List<Vector3>();

            switch (spawnPattern)
            {
                case SpawnPattern.Circle:
                    for (int i = 0; i < count; i++)
                    {
                        float angle = (i / (float)count) * Mathf.PI * 2f;
                        Vector3 pos = transform.position + new Vector3(
                            Mathf.Cos(angle) * spawnRadius,
                            0,
                            Mathf.Sin(angle) * spawnRadius
                        );
                        positions.Add(pos);
                    }
                    break;

                case SpawnPattern.Grid:
                    int gridSize = Mathf.CeilToInt(Mathf.Sqrt(count));
                    float spacing = (spawnRadius * 2) / gridSize;
                    for (int i = 0; i < count; i++)
                    {
                        int x = i % gridSize;
                        int z = i / gridSize;
                        Vector3 pos = transform.position + new Vector3(
                            (x - gridSize / 2f) * spacing,
                            0,
                            (z - gridSize / 2f) * spacing
                        );
                        positions.Add(pos);
                    }
                    break;

                default:
                    for (int i = 0; i < count; i++)
                    {
                        Vector2 randomPoint = UnityEngine.Random.insideUnitCircle * spawnRadius;
                        Vector3 pos = transform.position + new Vector3(randomPoint.x, 0, randomPoint.y);
                        positions.Add(pos);
                    }
                    break;
            }

            return positions;
        }
    }

    /// <summary>
    /// Baker to convert SpawnerAuthoring to ECS components
    /// </summary>
    public class SpawnerBaker : Unity.Entities.Baker<SpawnerAuthoring>
    {
        public override void Bake(SpawnerAuthoring authoring)
        {
            var entity = GetEntity(TransformUsageFlags.Dynamic);

            // Add spawner configuration
            AddComponent(entity, new SpawnerConfig
            {
                SpawnMode = (int)authoring.spawnMode,
                AutoStart = authoring.autoStart,
                StartDelay = authoring.startDelay,
                MinionType = authoring.minionType,
                Faction = authoring.faction,
                MinionLevel = authoring.minionLevel,
                TotalSpawnCount = authoring.totalSpawnCount,
                SpawnBatchSize = authoring.spawnBatchSize,
                SpawnInterval = authoring.spawnInterval,
                WaveCooldown = authoring.waveCooldown,
                SpawnPattern = authoring.spawnPattern,
                SpawnRadius = authoring.spawnRadius,
                MaxPerFrame = authoring.maxPerFrame,
                Position = new float3(
                    authoring.transform.position.x,
                    authoring.transform.position.y,
                    authoring.transform.position.z
                )
            });

            // Add spawner state
            AddComponent(entity, new SpawnerState
            {
                IsActive = false,
                SpawnedCount = 0,
                CurrentWaveIndex = 0,
                LastSpawnTime = 0f,
                NextWaveTime = 0f
            });

            // Add buffer for spawned entities tracking
            AddBuffer<SpawnedMinionBuffer>(entity);

            // Add wave buffer if using wave mode
            if (authoring.spawnMode == SpawnerAuthoring.SpawnMode.Wave)
            {
                var waveBuffer = AddBuffer<WaveData>(entity);
                foreach (var wave in authoring.waves)
                {
                    waveBuffer.Add(new WaveData
                    {
                        MinionCount = wave.minionCount,
                        MinionType = wave.minionType,
                        DifficultyMultiplier = wave.difficultyMultiplier,
                        DelayAfterWave = wave.delayAfterWave
                    });
                }
            }
        }
    }

    /// <summary>
    /// ECS component for spawner configuration
    /// </summary>
    public struct SpawnerConfig : IComponentData
    {
        public int SpawnMode;
        public bool AutoStart;
        public float StartDelay;
        public MinionType MinionType;
        public FactionType Faction;
        public int MinionLevel;
        public int TotalSpawnCount;
        public int SpawnBatchSize;
        public float SpawnInterval;
        public float WaveCooldown;
        public SpawnPattern SpawnPattern;
        public float SpawnRadius;
        public int MaxPerFrame;
        public float3 Position;
    }

    /// <summary>
    /// Runtime state of spawner
    /// </summary>
    public struct SpawnerState : IComponentData
    {
        public bool IsActive;
        public int SpawnedCount;
        public int CurrentWaveIndex;
        public float LastSpawnTime;
        public float NextWaveTime;
    }

    /// <summary>
    /// Wave configuration data
    /// </summary>
    public struct WaveData : IBufferElementData
    {
        public int MinionCount;
        public MinionType MinionType;
        public float DifficultyMultiplier;
        public float DelayAfterWave;
    }

    /// <summary>
    /// Component to trigger spawner
    /// </summary>
    public struct SpawnerTrigger : IComponentData
    {
        public bool Trigger;
        public int OverrideCount; // 0 = use default
    }

    /// <summary>
    /// Tag component for active spawners
    /// </summary>
    public struct ActiveSpawner : IComponentData { }
}