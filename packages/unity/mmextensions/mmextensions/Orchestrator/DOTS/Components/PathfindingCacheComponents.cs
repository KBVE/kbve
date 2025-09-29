using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;

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

    [InternalBufferCapacity(2500)]
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
        public bool allowCaching;
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
        public bool generateImmediate;
    }

    public struct PathfindingConfig : IComponentData
    {
        public int maxCachedFlowFields;
        public int maxCachedPaths;
        public float cacheEvictionTime;
        public float pathRecalculationInterval;
        public bool enableHordeOptimization;
        public int minHordeSize;
        public float flowFieldCellSize;

        public static PathfindingConfig Default => new PathfindingConfig
        {
            maxCachedFlowFields = 30,
            maxCachedPaths = 100,
            cacheEvictionTime = 30f,
            pathRecalculationInterval = 1f,
            enableHordeOptimization = true,
            minHordeSize = 5,
            flowFieldCellSize = 10f
        };
    }
}