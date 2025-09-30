using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using System.Runtime.InteropServices;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Precomputed waypoint network for efficient pathfinding
    /// Eliminates per-frame pathfinding calculations and staggering artifacts
    /// </summary>
    public struct WaypointNetwork : IComponentData
    {
        public int waypointsPerSector;
        public float waypointSpacing;
        public int totalWaypoints;
        [MarshalAs(UnmanagedType.U1)]
        public bool isInitialized;
    }

    /// <summary>
    /// Individual waypoint in the network with connectivity data
    /// </summary>
    [InternalBufferCapacity(64)]
    public struct WaypointNode : IBufferElementData
    {
        public float3 position;
        public int sectorIndex;
        public int nodeIndex;

        // Traffic flow data for load balancing
        public float trafficDensity;
        public float baseCost;
        public float currentCost;

        // Node type for specialized routing
        public WaypointType nodeType;
    }

    public enum WaypointType : byte
    {
        Standard = 0,
        SectorGateway = 1,
        HighTraffic = 2,
        Chokepoint = 3,
        FastLane = 4,
        SafeZone = 5
    }

    /// <summary>
    /// Precomputed path between waypoints for instant lookup
    /// </summary>
    [InternalBufferCapacity(50)]
    public struct WaypointPath : IBufferElementData
    {
        public int fromWaypointIndex;
        public int toWaypointIndex;
        public float totalCost;
        public int pathLength;

        // Alternative routes for load balancing
        public int alternativeRoute1;
        public int alternativeRoute2;
    }

    /// <summary>
    /// Individual step in a waypoint path
    /// </summary>
    [InternalBufferCapacity(20)]
    public struct WaypointStep : IBufferElementData
    {
        public int waypointIndex;
        public float3 position;
        public float stepCost;
        public float estimatedTravelTime;
    }

    /// <summary>
    /// Component for entities following waypoint paths
    /// </summary>
    public struct WaypointFollower : IComponentData
    {
        public int currentWaypointIndex;
        public int targetWaypointIndex;
        public int currentPathIndex;
        public int currentStepIndex;

        // Path following state
        public float distanceToWaypoint;
        public float waypointReachThreshold;
        [MarshalAs(UnmanagedType.U1)]
        public bool hasValidPath;
        [MarshalAs(UnmanagedType.U1)]
        public bool recomputePathRequested;

        // Traffic awareness
        public float preferredSpeed;
        public float currentSpeed;
        public float routePreference; // 0 = shortest, 1 = least crowded
    }

    /// <summary>
    /// Cached path data for efficient following
    /// </summary>
    [InternalBufferCapacity(15)]
    public struct CachedWaypointPath : IBufferElementData
    {
        public int waypointIndex;
        public float3 position;
        public float arrivalTime;
        [MarshalAs(UnmanagedType.U1)]
        public bool isAlternativeRoute;
    }

    /// <summary>
    /// Sector-based waypoint lookup for O(1) pathfinding
    /// </summary>
    public struct SectorWaypointData : IComponentData
    {
        public int startWaypointIndex;
        public int waypointCount;
        public float averageTrafficDensity;
        public float sectorCongestionLevel;
    }

    /// <summary>
    /// Traffic management data for dynamic route optimization
    /// </summary>
    public struct WaypointTrafficManager : IComponentData
    {
        public float lastTrafficUpdate;
        public float trafficUpdateInterval;
        public int totalActiveUnits;
        public float globalCongestionMultiplier;

        // Load balancing parameters
        public float congestionThreshold;
        public float alternativeRouteWeight;
        [MarshalAs(UnmanagedType.U1)]
        public bool enableDynamicRouting;
    }

    /// <summary>
    /// Fast lookup table for waypoint connections
    /// </summary>
    [InternalBufferCapacity(32)]
    public struct WaypointConnectionLookup : IBufferElementData
    {
        public int fromSector;
        public int toSector;
        public int primaryPathIndex;
        public int alternativePathIndex;
        public float baseCost;
        public float congestionMultiplier;
    }

    /// <summary>
    /// Precomputed waypoint network utilities
    /// </summary>
    [BurstCompile]
    public static class WaypointNetworkUtilities
    {
        /// <summary>
        /// Get the nearest waypoint to a world position
        /// </summary>
        [BurstCompile]
        public static int GetNearestWaypoint(in float3 worldPosition,
            in DynamicBuffer<WaypointNode> waypoints,
            in SectorNavigationData sectorNav,
            in WaypointNetwork network)
        {
            int2 sectorCoords = sectorNav.GetSectorCoordinates(worldPosition);
            int sectorIndex = sectorNav.GetSectorIndex(sectorCoords);

            int startIndex = sectorIndex * network.waypointsPerSector;
            int endIndex = math.min(startIndex + network.waypointsPerSector, waypoints.Length);

            int nearestIndex = -1;
            float nearestDistanceSq = float.MaxValue;

            for (int i = startIndex; i < endIndex; i++)
            {
                float distanceSq = math.distancesq(worldPosition, waypoints[i].position);
                if (distanceSq < nearestDistanceSq)
                {
                    nearestDistanceSq = distanceSq;
                    nearestIndex = i;
                }
            }

            return nearestIndex;
        }

        /// <summary>
        /// Calculate dynamic cost based on traffic and congestion
        /// </summary>
        [BurstCompile]
        public static float CalculateDynamicCost(float baseCost, float trafficDensity, float congestionMultiplier)
        {
            return baseCost * (1f + trafficDensity * congestionMultiplier);
        }

        /// <summary>
        /// Select best route considering traffic conditions
        /// </summary>
        [BurstCompile]
        public static int SelectOptimalRoute(int primaryRoute, int alternativeRoute1, int alternativeRoute2,
            in DynamicBuffer<WaypointPath> paths, float routePreference)
        {
            if (routePreference < 0.5f)
            {
                // Prefer shortest path
                return primaryRoute;
            }
            else
            {
                // Prefer less congested routes
                float primaryCost = paths[primaryRoute].totalCost;
                float alt1Cost = alternativeRoute1 >= 0 ? paths[alternativeRoute1].totalCost : float.MaxValue;
                float alt2Cost = alternativeRoute2 >= 0 ? paths[alternativeRoute2].totalCost : float.MaxValue;

                if (alt1Cost < primaryCost && alt1Cost <= alt2Cost)
                    return alternativeRoute1;
                else if (alt2Cost < primaryCost)
                    return alternativeRoute2;
                else
                    return primaryRoute;
            }
        }
    }
}