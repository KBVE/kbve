using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Configuration for bulk minion spawning
    /// </summary>
    public struct BulkSpawnConfig : IComponentData
    {
        public int TotalCount;
        public int BatchSize;
        public float SpawnRadius;
        public float3 SpawnCenter;
        public float SpawnDelay;
        public MinionType MinionType;
        public FactionType Faction;
        public SpawnPattern Pattern;

        // Performance settings
        public int MaxPerFrame;
        public bool UseJobSystem;
        public bool EnableSpatialOptimization;

        public static BulkSpawnConfig CreateDefault(in float3 center, int count)
        {
            return new BulkSpawnConfig
            {
                TotalCount = count,
                BatchSize = math.min(count, 50),
                SpawnRadius = 10f,
                SpawnCenter = center,
                SpawnDelay = 0.1f,
                MinionType = MinionType.Basic,
                Faction = FactionType.Enemy,
                Pattern = SpawnPattern.Circle,
                MaxPerFrame = 100,
                UseJobSystem = true,
                EnableSpatialOptimization = true
            };
        }
    }

    /// <summary>
    /// Spawn request component for individual spawns
    /// </summary>
    public struct SpawnRequest : IComponentData
    {
        public float3 Position;
        public quaternion Rotation;
        public MinionType Type;
        public FactionType Faction;
        public int Level;
        public float HealthMultiplier;
        public float SpeedMultiplier;
        public float DamageMultiplier;
        public Entity SpawnerEntity; // Reference to spawner if needed
    }

    /// <summary>
    /// Pattern for bulk spawning formations
    /// </summary>
    public enum SpawnPattern : byte
    {
        Random = 0,
        Circle = 1,
        Grid = 2,
        Line = 3,
        Arc = 4,
        Spiral = 5,
        Wave = 6
    }

    /// <summary>
    /// Component to track spawned minions from a bulk spawn
    /// </summary>
    public struct BulkSpawnGroup : ISharedComponentData
    {
        public int GroupId;
        public int WaveNumber;
        public float SpawnTime;
    }

    /// <summary>
    /// Buffer to store spawned entities from a bulk spawn
    /// </summary>
    public struct SpawnedMinionBuffer : IBufferElementData
    {
        public Entity MinionEntity;
        public float SpawnTime;
    }
}