using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// System that precomputes waypoint networks for known maps
    /// Runs once during initialization to create optimized path networks
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(PathfindingInitSystem))]
    public partial struct WaypointNetworkGenerationSystem : ISystem
    {
        private bool _networkGenerated;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SectorNavigationData>();
            state.RequireForUpdate<MapSettings>();
        }

        public void OnUpdate(ref SystemState state)
        {
            // Only generate once
            if (_networkGenerated)
            {
                state.Enabled = false;
                return;
            }

            // Check if network already exists
            var networkQuery = state.GetEntityQuery(ComponentType.ReadOnly<WaypointNetwork>());
            if (!networkQuery.IsEmpty)
            {
                _networkGenerated = true;
                state.Enabled = false;
                return;
            }

            var sectorNav = SystemAPI.GetSingleton<SectorNavigationData>();
            var mapSettings = SystemAPI.GetSingleton<MapSettings>();

            // Create waypoint network entity directly
            var networkEntity = state.EntityManager.CreateEntity();

            // Initialize network configuration
            var waypointNetwork = new WaypointNetwork
            {
                waypointsPerSector = CalculateOptimalWaypointsPerSector(sectorNav.sectorSize),
                waypointSpacing = sectorNav.sectorSize / 4f, // 4 waypoints across each sector
                totalWaypoints = 0,
                isInitialized = false
            };

            // Generate waypoint nodes
            var waypointNodes = GenerateWaypointNodes(ref state, sectorNav, waypointNetwork);
            waypointNetwork.totalWaypoints = waypointNodes.Length;

            // Precompute all paths between sectors
            var paths = PrecomputeWaypointPaths(ref state, waypointNodes, sectorNav);

            // Generate connection lookup table
            var connectionLookup = GenerateConnectionLookup(ref state, waypointNodes, paths, sectorNav);

            // Create traffic manager
            var trafficManager = new WaypointTrafficManager
            {
                lastTrafficUpdate = 0f,
                trafficUpdateInterval = 1f, // Update traffic every second
                totalActiveUnits = 0,
                globalCongestionMultiplier = 1f,
                congestionThreshold = 0.7f,
                alternativeRouteWeight = 1.3f,
                enableDynamicRouting = true
            };

            // Add all components and buffers at once
            state.EntityManager.AddComponentData(networkEntity, waypointNetwork);
            state.EntityManager.AddComponentData(networkEntity, trafficManager);

            // Add buffers with initial data directly
            var nodeBuffer = state.EntityManager.AddBuffer<WaypointNode>(networkEntity);
            nodeBuffer.ResizeUninitialized(waypointNodes.Length);
            for (int i = 0; i < waypointNodes.Length; i++)
            {
                nodeBuffer[i] = waypointNodes[i];
            }

            var pathBuffer = state.EntityManager.AddBuffer<WaypointPath>(networkEntity);
            pathBuffer.ResizeUninitialized(paths.Length);
            for (int i = 0; i < paths.Length; i++)
            {
                pathBuffer[i] = paths[i];
            }

            var lookupBuffer = state.EntityManager.AddBuffer<WaypointConnectionLookup>(networkEntity);
            lookupBuffer.ResizeUninitialized(connectionLookup.Length);
            for (int i = 0; i < connectionLookup.Length; i++)
            {
                lookupBuffer[i] = connectionLookup[i];
            }

            // Mark as complete
            waypointNetwork.isInitialized = true;
            state.EntityManager.SetComponentData(networkEntity, waypointNetwork);

            _networkGenerated = true;

            Debug.Log($"[WaypointNetwork] Generated {waypointNetwork.totalWaypoints} waypoints with {paths.Length} precomputed paths");

            // Cleanup temporary arrays
            waypointNodes.Dispose();
            paths.Dispose();
            connectionLookup.Dispose();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        private static int CalculateOptimalWaypointsPerSector(float sectorSize)
        {
            // Create 4x4 grid of waypoints per sector for good coverage
            return 16; // 4 * 4
        }

        private static NativeArray<WaypointNode> GenerateWaypointNodes(ref SystemState state,
            SectorNavigationData sectorNav, WaypointNetwork network)
        {
            int totalSectors = sectorNav.sectorsPerAxis * sectorNav.sectorsPerAxis;
            int totalWaypoints = totalSectors * network.waypointsPerSector;

            var waypoints = new NativeArray<WaypointNode>(totalWaypoints, Allocator.Temp);
            int waypointIndex = 0;

            // Generate grid of waypoints for each sector
            for (int sectorY = 0; sectorY < sectorNav.sectorsPerAxis; sectorY++)
            {
                for (int sectorX = 0; sectorX < sectorNav.sectorsPerAxis; sectorX++)
                {
                    int2 sectorCoords = new int2(sectorX, sectorY);
                    int sectorIndex = sectorNav.GetSectorIndex(sectorCoords);
                    float3 sectorCenter = sectorNav.GetSectorCenter(sectorCoords);

                    // Create 4x4 grid within sector
                    for (int localY = 0; localY < 4; localY++)
                    {
                        for (int localX = 0; localX < 4; localX++)
                        {
                            float3 localOffset = new float3(
                                (localX - 1.5f) * (network.waypointSpacing * 0.8f),
                                (localY - 1.5f) * (network.waypointSpacing * 0.8f),
                                0
                            );

                            var waypoint = new WaypointNode
                            {
                                position = sectorCenter + localOffset,
                                sectorIndex = sectorIndex,
                                nodeIndex = waypointIndex,
                                trafficDensity = 0f,
                                baseCost = 1f,
                                currentCost = 1f,
                                nodeType = DetermineNodeType(localX, localY, sectorX, sectorY, sectorNav.sectorsPerAxis)
                            };

                            waypoints[waypointIndex] = waypoint;
                            waypointIndex++;
                        }
                    }
                }
            }

            return waypoints;
        }

        private static WaypointType DetermineNodeType(int localX, int localY, int sectorX, int sectorY, int sectorsPerAxis)
        {
            // Mark edge waypoints as gateways
            bool isEdgeX = localX == 0 || localX == 3;
            bool isEdgeY = localY == 0 || localY == 3;
            bool isSectorEdge = sectorX == 0 || sectorX == sectorsPerAxis - 1 || sectorY == 0 || sectorY == sectorsPerAxis - 1;

            if ((isEdgeX || isEdgeY) && !isSectorEdge)
                return WaypointType.SectorGateway;
            else if (localX == 1 && localY == 1) // Center-left for fast lanes
                return WaypointType.FastLane;
            else if (localX == 2 && localY == 2) // Center-right for high traffic
                return WaypointType.HighTraffic;
            else
                return WaypointType.Standard;
        }

        private static NativeArray<WaypointPath> PrecomputeWaypointPaths(ref SystemState state,
            NativeArray<WaypointNode> waypoints, SectorNavigationData sectorNav)
        {
            int totalSectors = sectorNav.sectorsPerAxis * sectorNav.sectorsPerAxis;

            // Estimate path count (each sector connects to adjacent sectors)
            int estimatedPaths = totalSectors * 8; // 8 directions max
            var pathList = new NativeList<WaypointPath>(estimatedPaths, Allocator.Temp);

            // Generate paths between adjacent sectors
            for (int fromSector = 0; fromSector < totalSectors; fromSector++)
            {
                for (int toSector = 0; toSector < totalSectors; toSector++)
                {
                    if (fromSector == toSector) continue;

                    // Check if sectors are adjacent or within reasonable distance
                    if (AreSectorsConnected(fromSector, toSector, sectorNav))
                    {
                        var path = ComputePathBetweenSectors(fromSector, toSector, waypoints, sectorNav);
                        if (path.pathLength > 0)
                        {
                            pathList.Add(path);
                        }
                    }
                }
            }

            var paths = new NativeArray<WaypointPath>(pathList.Length, Allocator.Temp);
            for (int i = 0; i < pathList.Length; i++)
            {
                paths[i] = pathList[i];
            }

            pathList.Dispose();
            return paths;
        }

        private static bool AreSectorsConnected(int fromSector, int toSector, SectorNavigationData sectorNav)
        {
            int fromX = fromSector % sectorNav.sectorsPerAxis;
            int fromY = fromSector / sectorNav.sectorsPerAxis;
            int toX = toSector % sectorNav.sectorsPerAxis;
            int toY = toSector / sectorNav.sectorsPerAxis;

            int deltaX = math.abs(fromX - toX);
            int deltaY = math.abs(fromY - toY);

            // Connect to adjacent sectors (including diagonals) and some further ones for long paths
            return (deltaX <= 1 && deltaY <= 1) || (deltaX + deltaY <= 3);
        }

        private static WaypointPath ComputePathBetweenSectors(int fromSector, int toSector,
            NativeArray<WaypointNode> waypoints, SectorNavigationData sectorNav)
        {
            // Find best waypoints in each sector for connection
            int fromWaypoint = FindBestGatewayWaypoint(fromSector, toSector, waypoints, sectorNav);
            int toWaypoint = FindBestGatewayWaypoint(toSector, fromSector, waypoints, sectorNav);

            if (fromWaypoint == -1 || toWaypoint == -1)
            {
                return new WaypointPath { pathLength = 0 };
            }

            float distance = math.distance(waypoints[fromWaypoint].position, waypoints[toWaypoint].position);

            return new WaypointPath
            {
                fromWaypointIndex = fromWaypoint,
                toWaypointIndex = toWaypoint,
                totalCost = distance,
                pathLength = 2, // Simple direct connection for now
                alternativeRoute1 = -1,
                alternativeRoute2 = -1
            };
        }

        private static int FindBestGatewayWaypoint(int sectorIndex, int targetSector,
            NativeArray<WaypointNode> waypoints, SectorNavigationData sectorNav)
        {
            int startWaypoint = sectorIndex * 16; // 16 waypoints per sector
            int endWaypoint = startWaypoint + 16;

            if (startWaypoint >= waypoints.Length) return -1;

            int bestWaypoint = -1;
            float bestScore = float.MaxValue;

            for (int i = startWaypoint; i < math.min(endWaypoint, waypoints.Length); i++)
            {
                var waypoint = waypoints[i];

                // Prefer gateway waypoints
                float score = waypoint.nodeType == WaypointType.SectorGateway ? 0.5f : 1f;

                if (score < bestScore)
                {
                    bestScore = score;
                    bestWaypoint = i;
                }
            }

            return bestWaypoint;
        }

        private static NativeArray<WaypointConnectionLookup> GenerateConnectionLookup(ref SystemState state,
            NativeArray<WaypointNode> waypoints, NativeArray<WaypointPath> paths, SectorNavigationData sectorNav)
        {
            int totalSectors = sectorNav.sectorsPerAxis * sectorNav.sectorsPerAxis;
            var lookupList = new NativeList<WaypointConnectionLookup>(totalSectors * totalSectors, Allocator.Temp);

            // Create fast lookup table for sector-to-sector connections
            for (int fromSector = 0; fromSector < totalSectors; fromSector++)
            {
                for (int toSector = 0; toSector < totalSectors; toSector++)
                {
                    if (fromSector == toSector) continue;

                    // Find path for this sector pair
                    int pathIndex = FindPathForSectors(fromSector, toSector, paths, waypoints);

                    if (pathIndex >= 0)
                    {
                        var lookup = new WaypointConnectionLookup
                        {
                            fromSector = fromSector,
                            toSector = toSector,
                            primaryPathIndex = pathIndex,
                            alternativePathIndex = -1, // Could add alternative paths later
                            baseCost = paths[pathIndex].totalCost,
                            congestionMultiplier = 1f
                        };

                        lookupList.Add(lookup);
                    }
                }
            }

            var lookupArray = new NativeArray<WaypointConnectionLookup>(lookupList.Length, Allocator.Temp);
            for (int i = 0; i < lookupList.Length; i++)
            {
                lookupArray[i] = lookupList[i];
            }

            lookupList.Dispose();
            return lookupArray;
        }

        private static int FindPathForSectors(int fromSector, int toSector,
            NativeArray<WaypointPath> paths, NativeArray<WaypointNode> waypoints)
        {
            for (int i = 0; i < paths.Length; i++)
            {
                var path = paths[i];
                if (path.fromWaypointIndex >= 0 && path.toWaypointIndex >= 0)
                {
                    int fromWaypointSector = waypoints[path.fromWaypointIndex].sectorIndex;
                    int toWaypointSector = waypoints[path.toWaypointIndex].sectorIndex;

                    if (fromWaypointSector == fromSector && toWaypointSector == toSector)
                    {
                        return i;
                    }
                }
            }
            return -1;
        }
    }
}