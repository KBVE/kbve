using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using System.Runtime.InteropServices;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct SectorNavigationData : IComponentData
    {
        public int sectorsPerAxis;
        public float sectorSize;
        public float3 mapOrigin;

        public int2 GetSectorCoordinates(float3 worldPosition)
        {
            float3 localPos = worldPosition - mapOrigin;
            return new int2(
                math.clamp((int)(localPos.x / sectorSize), 0, sectorsPerAxis - 1),
                math.clamp((int)(localPos.y / sectorSize), 0, sectorsPerAxis - 1)
            );
        }

        public int GetSectorIndex(int2 sectorCoords)
        {
            return sectorCoords.y * sectorsPerAxis + sectorCoords.x;
        }

        public float3 GetSectorCenter(int2 sectorCoords)
        {
            return mapOrigin + new float3(
                (sectorCoords.x + 0.5f) * sectorSize,
                (sectorCoords.y + 0.5f) * sectorSize,
                0
            );
        }
    }

    public struct SectorGateway : IBufferElementData
    {
        public float3 position;
        public int fromSectorIndex;
        public int toSectorIndex;
        public float traversalCost;
    }

    public struct FlowFieldCache : IComponentData
    {
        public int sectorIndex;
        public int2 targetCell;
        public float lastAccessTime;
        public int accessCount;
    }

    [InternalBufferCapacity(64)]
    public struct FlowFieldDirection : IBufferElementData
    {
        public byte direction;

        public float3 GetDirectionVector()
        {
            return direction switch
            {
                1 => new float3(0, 1, 0),
                2 => math.normalize(new float3(1, 1, 0)),
                3 => new float3(1, 0, 0),
                4 => math.normalize(new float3(1, -1, 0)),
                5 => new float3(0, -1, 0),
                6 => math.normalize(new float3(-1, -1, 0)),
                7 => new float3(-1, 0, 0),
                8 => math.normalize(new float3(-1, 1, 0)),
                _ => float3.zero
            };
        }

        public static byte EncodeDirection(float3 dir)
        {
            if (math.lengthsq(dir) < 0.01f) return 0;

            float angle = math.atan2(dir.y, dir.x);
            int octant = (int)math.round(angle / (math.PI / 4f));

            return octant switch
            {
                0 => 3,  // East
                1 => 2,  // Northeast
                2 => 1,  // North
                3 => 8,  // Northwest
                -4 => 7, // West
                -3 => 6, // Southwest
                -2 => 5, // South
                -1 => 4, // Southeast
                4 => 7,  // West (wrap around)
                _ => 0
            };
        }
    }

    public struct PathCacheEntry : IComponentData
    {
        public int fromSectorIndex;
        public int toSectorIndex;
        public float lastUsedTime;
        public int useCount;
        [MarshalAs(UnmanagedType.U1)]
        public bool isValid;
    }

    [InternalBufferCapacity(32)]
    public struct CachedWaypoint : IBufferElementData
    {
        public float3 position;
        public int sectorIndex;
    }


    public struct PathfindingRequest : IComponentData
    {
        public float3 startPosition;
        public float3 targetPosition;
        public Entity requester;
        public float requestTime;
        public byte priority;
        [MarshalAs(UnmanagedType.U1)]
        public bool allowCaching;
        [MarshalAs(UnmanagedType.U1)]
        public bool isGroupRequest;
    }

    public struct PathfindingStats : IComponentData
    {
        public int totalRequests;
        public int cacheHits;
        public int cacheMisses;
        public float averageCalculationTime;
        public float cacheHitRate;
        public int activeFlowFields;
        public int cachedPaths;

        public void RecordCacheHit()
        {
            cacheHits++;
            totalRequests++;
            UpdateHitRate();
        }

        public void RecordCacheMiss(float calculationTime)
        {
            cacheMisses++;
            totalRequests++;
            averageCalculationTime = (averageCalculationTime * (cacheMisses - 1) + calculationTime) / cacheMisses;
            UpdateHitRate();
        }

        private void UpdateHitRate()
        {
            if (totalRequests > 0)
                cacheHitRate = (float)cacheHits / totalRequests;
        }
    }

    [InternalBufferCapacity(100)]
    public struct SectorObstacleMap : IBufferElementData
    {
        public ulong obstacleData;

        public bool IsObstacle(int bitIndex)
        {
            return (obstacleData & (1UL << bitIndex)) != 0;
        }

        public void SetObstacle(int bitIndex, bool isObstacle)
        {
            if (isObstacle)
                obstacleData |= (1UL << bitIndex);
            else
                obstacleData &= ~(1UL << bitIndex);
        }
    }

    public struct FlowFieldRequest : IComponentData
    {
        public int sectorIndex;
        public int2 targetCell;
        public float priority;
        [MarshalAs(UnmanagedType.U1)]
        public bool generateImmediate;
    }

    public struct PathfindingConfig : IComponentData
    {
        public int maxCachedFlowFields;
        public int maxCachedPaths;
        public float cacheEvictionTime;
        public float pathRecalculationInterval;
        [MarshalAs(UnmanagedType.U1)]
        public bool enableCollisionAvoidance;
        public float collisionAvoidanceRadius;
        public float separationForce;
        public float flowFieldCellSize;

        public static PathfindingConfig Default => new PathfindingConfig
        {
            maxCachedFlowFields = 30,
            maxCachedPaths = 100,
            cacheEvictionTime = 30f,
            pathRecalculationInterval = 1f,
            enableCollisionAvoidance = true,
            collisionAvoidanceRadius = 2f,
            separationForce = 1.5f,
            flowFieldCellSize = 10f
        };
    }

    public struct LocalAvoidanceData : IComponentData
    {
        public float personalSpace;
        public float lastAvoidanceUpdate;
        public float3 avoidanceVector;
        public float speedVariation;
        public int updateOffset; // For staggered updates

        public static LocalAvoidanceData CreateRandom(uint seed)
        {
            var random = new Unity.Mathematics.Random(seed);
            return new LocalAvoidanceData
            {
                personalSpace = random.NextFloat(0.8f, 1.5f),
                lastAvoidanceUpdate = 0f,
                avoidanceVector = float3.zero,
                speedVariation = random.NextFloat(0.95f, 1.05f),
                updateOffset = random.NextInt(0, 3)
            };
        }
    }

    /// <summary>
    /// Simple obstacle data for potential field repulsion
    /// </summary>
    public struct ObstacleData : IComponentData
    {
        public float3 position;
        public float radius;
        public float repulsionStrength;
    }


    /// <summary>
    /// Potential field steering forces configuration
    /// </summary>
    public struct PotentialFieldConfig : IComponentData
    {
        public float attractionStrength;
        public float repulsionStrength;
        public float repulsionRadius;
        public float obstacleRepulsionStrength;
        public float maxSteeringForce;
        public float neighborDetectionRadius;

        public static PotentialFieldConfig Default => new PotentialFieldConfig
        {
            attractionStrength = 1.5f,      // Reduced from 2.0f for smoother movement
            repulsionStrength = 2.0f,       // Reduced from 5.0f to prevent bouncing
            repulsionRadius = 3.0f,         // Keep the same
            obstacleRepulsionStrength = 4.0f, // Reduced from 8.0f
            maxSteeringForce = 5.0f,       // Reduced from 10.0f to prevent jitter
            neighborDetectionRadius = 5.0f  // Keep the same
        };
    }
}