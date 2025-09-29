using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Jobs;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// High-performance zombie movement system using ISystem with burst compilation
    /// Eliminates SystemBase overhead and per-frame allocations for 10k+ entities
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(WaypointMovementSystem))]
    [UpdateAfter(typeof(ZombieTargetingSystem))]
    [BurstCompile]
    public partial struct ZombieMovementSystem : ISystem
    {
        private EntityQuery _zombieQuery;
        private NativeParallelMultiHashMap<int2, float3> _sectorPositions;
        private float _lastSectorRebuildTime;

        public void OnCreate(ref SystemState state)
        {
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadWrite<LocalTransform>(),
                ComponentType.ReadWrite<ZombieDestination>(),
                ComponentType.ReadWrite<ZombiePathfindingState>(),
                ComponentType.ReadWrite<LocalAvoidanceData>(),
                ComponentType.ReadOnly<ZombieSpeed>(),
                ComponentType.ReadOnly<ZombiePathfindingConfig>(),
                ComponentType.ReadOnly<ZombieTag>()
            );

            // Fixed large capacity to avoid per-frame resizing
            _sectorPositions = new NativeParallelMultiHashMap<int2, float3>(150000, Allocator.Persistent);
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            if (_sectorPositions.IsCreated)
                _sectorPositions.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<SectorNavigationData>(out var sectorNav))
            {
                sectorNav = new SectorNavigationData
                {
                    sectorsPerAxis = 10,
                    sectorSize = 500f,
                    mapOrigin = float3.zero
                };
            }

            if (!SystemAPI.TryGetSingleton<PathfindingConfig>(out var config))
            {
                config = PathfindingConfig.Default;
            }

            float currentTime = (float)SystemAPI.Time.ElapsedTime;
            float deltaTime = SystemAPI.Time.DeltaTime;

            // Only rebuild sector positions periodically (every 200ms instead of every frame)
            bool shouldRebuildSectors = (currentTime - _lastSectorRebuildTime) > 0.2f;
            JobHandle collectHandle = state.Dependency;

            if (shouldRebuildSectors)
            {
                _lastSectorRebuildTime = currentTime;
                _sectorPositions.Clear();

                // Collect positions by sector for efficient neighbor queries
                var collectJob = new CollectPositionsBySectorJob
                {
                    sectorNav = sectorNav,
                    writer = _sectorPositions.AsParallelWriter()
                };
                collectHandle = collectJob.ScheduleParallel(_zombieQuery, state.Dependency);
            }

            var moveJob = new ZombieMovementWithLocalAvoidanceJob
            {
                deltaTime = deltaTime,
                currentTime = currentTime,
                sectorNav = sectorNav,
                sectorPositions = _sectorPositions,
                avoidanceRadius = config.collisionAvoidanceRadius,
                updateInterval = 0.2f, // Update avoidance every 200ms instead of 100ms
                frameStagger = (uint)(currentTime * 10f) % 10 // Spread updates across 10 frames instead of 5
            };

            // Schedule jobs with proper dependency chain
            state.Dependency = moveJob.ScheduleParallel(_zombieQuery, collectHandle);
        }


        [BurstCompile]
        private partial struct CollectPositionsBySectorJob : IJobEntity
        {
            [ReadOnly] public SectorNavigationData sectorNav;
            public NativeParallelMultiHashMap<int2, float3>.ParallelWriter writer;

            public void Execute(in LocalTransform transform)
            {
                int2 sector = sectorNav.GetSectorCoordinates(transform.Position);
                writer.Add(sector, transform.Position);
            }
        }

        [BurstCompile]
        private partial struct ZombieMovementWithLocalAvoidanceJob : IJobEntity
        {
            [ReadOnly] public float deltaTime;
            [ReadOnly] public float currentTime;
            [ReadOnly] public SectorNavigationData sectorNav;
            [ReadOnly] public NativeParallelMultiHashMap<int2, float3> sectorPositions;
            [ReadOnly] public float avoidanceRadius;
            [ReadOnly] public float updateInterval;
            [ReadOnly] public uint frameStagger;

            public void Execute([EntityIndexInQuery] int entityIndex,
                              ref LocalTransform transform,
                              ref ZombieDestination destination,
                              ref ZombiePathfindingState pathState,
                              ref LocalAvoidanceData avoidance,
                              in ZombieSpeed speed,
                              in ZombiePathfindingConfig config)
            {
                float3 currentPos = transform.Position;
                float3 targetPos = destination.targetPosition;

                // Much more aggressive staggering - each entity only updates avoidance every 10th frame
                // This spreads the computational load across frames
                uint entityGroup = (uint)entityIndex % 10;
                bool isMyUpdateFrame = entityGroup == frameStagger;
                bool needsUpdate = (currentTime - avoidance.lastAvoidanceUpdate) > updateInterval;

                if (isMyUpdateFrame && needsUpdate)
                {
                    avoidance.avoidanceVector = CalculateLocalAvoidance(currentPos, sectorNav,
                                                                        avoidance.personalSpace);
                    avoidance.lastAvoidanceUpdate = currentTime;
                }

                // Calculate movement direction
                int2 currentSector = sectorNav.GetSectorCoordinates(currentPos);
                int2 targetSector = sectorNav.GetSectorCoordinates(targetPos);

                float3 moveTarget = targetPos;
                if (!math.all(currentSector == targetSector))
                {
                    moveTarget = GetSectorGateway(currentSector, targetSector, sectorNav);
                }

                // Apply movement with avoidance and destination offsetting
                float3 toTarget = moveTarget - currentPos;
                float distance = math.length(toTarget);
                pathState.distanceToDestination = distance;

                // Add destination offsetting to prevent stacking - each unit gets unique arrival point
                float arrivalRadius = math.max(config.stoppingDistance, 2f);
                bool nearDestination = distance < arrivalRadius * 3f;

                if (distance > config.stoppingDistance)
                {
                    float3 desiredDirection = math.normalize(toTarget);

                    // Apply destination offsetting when near target to spread units out
                    if (nearDestination)
                    {
                        // Create unique offset based on entity characteristics
                        float offsetAngle = (entityIndex * 2.4f) + (avoidance.updateOffset * 6.28f);
                        float offsetRadius = arrivalRadius * 0.8f;
                        float3 offset = new float3(
                            math.cos(offsetAngle) * offsetRadius,
                            math.sin(offsetAngle) * offsetRadius,
                            0
                        );

                        // Blend towards offset position when close to destination
                        float offsetBlend = math.saturate(1f - distance / (arrivalRadius * 3f));
                        float3 offsetTarget = moveTarget + offset;
                        desiredDirection = math.normalize(math.lerp(toTarget, offsetTarget - currentPos, offsetBlend));
                    }

                    // Stronger avoidance when near destination to prevent clustering
                    float avoidanceStrength = nearDestination ? 1.2f : 0.5f;
                    float3 finalDirection = math.normalize(desiredDirection + avoidance.avoidanceVector * avoidanceStrength);

                    // Apply speed variation for natural movement
                    float actualSpeed = speed.value * avoidance.speedVariation;

                    // Slow down when approaching destination and crowded
                    if (nearDestination && math.length(avoidance.avoidanceVector) > 0.3f)
                    {
                        actualSpeed *= 0.7f; // Slow down in crowds
                    }

                    // Smooth movement
                    float3 movement = finalDirection * actualSpeed * deltaTime;
                    transform.Position += movement;

                    // Reduced drift when near destination for precision
                    float driftScale = nearDestination ? 0.005f : 0.01f;
                    float3 drift = new float3(
                        math.sin(currentTime * 2f + avoidance.updateOffset) * driftScale,
                        math.cos(currentTime * 2f + avoidance.updateOffset) * driftScale,
                        0
                    );
                    transform.Position += drift;
                    transform.Position.z = 1f;

                    pathState.isMoving = true;
                    pathState.state = ZombiePathfindingState.PathfindingState.FollowingPath;
                }
                else
                {
                    pathState.isMoving = false;
                    pathState.state = ZombiePathfindingState.PathfindingState.ReachedDestination;
                }
            }

            private float3 CalculateLocalAvoidance(float3 position, SectorNavigationData sectorNav,
                                                   float personalSpace)
            {
                float3 avoidanceForce = float3.zero;
                int2 currentSector = sectorNav.GetSectorCoordinates(position);
                int neighborCount = 0;

                float personalSpaceSq = personalSpace * personalSpace * 4f;

                // Only check current sector and immediately adjacent ones (5 sectors instead of 9)
                // And limit to 4 neighbors instead of 8 for performance
                const int maxNeighbors = 4;

                // Check current sector first
                if (sectorPositions.TryGetFirstValue(currentSector, out float3 neighborPos, out var iterator))
                {
                    do
                    {
                        float3 toNeighbor = position - neighborPos;
                        float distanceSq = math.lengthsq(toNeighbor);

                        if (distanceSq > 0.0001f && distanceSq < personalSpaceSq)
                        {
                            float invDistance = math.rsqrt(distanceSq);
                            float3 direction = toNeighbor * invDistance;
                            float strength = math.saturate(1f - distanceSq / personalSpaceSq);

                            avoidanceForce += direction * strength;
                            neighborCount++;

                            if (neighborCount >= maxNeighbors)
                                break;
                        }
                    } while (sectorPositions.TryGetNextValue(out neighborPos, ref iterator) && neighborCount < maxNeighbors);
                }

                // Only check 4 adjacent sectors if needed (not diagonals)
                if (neighborCount < maxNeighbors)
                {
                    // Check each adjacent sector directly without managed arrays
                    for (int i = 0; i < 4 && neighborCount < maxNeighbors; i++)
                    {
                        int2 checkSector = i switch
                        {
                            0 => currentSector + new int2(1, 0),   // Right
                            1 => currentSector + new int2(-1, 0),  // Left
                            2 => currentSector + new int2(0, 1),   // Up
                            3 => currentSector + new int2(0, -1),  // Down
                            _ => currentSector
                        };

                        if (sectorPositions.TryGetFirstValue(checkSector, out neighborPos, out iterator))
                        {
                            float3 toNeighbor = position - neighborPos;
                            float distanceSq = math.lengthsq(toNeighbor);

                            if (distanceSq > 0.0001f && distanceSq < personalSpaceSq)
                            {
                                float invDistance = math.rsqrt(distanceSq);
                                float3 direction = toNeighbor * invDistance;
                                float strength = math.saturate(1f - distanceSq / personalSpaceSq);

                                avoidanceForce += direction * strength;
                                neighborCount++;

                                if (neighborCount >= maxNeighbors)
                                    break;
                            }
                        }
                    }
                }

                // Better force scaling to prevent oscillation
                if (neighborCount > 0)
                {
                    avoidanceForce = math.normalize(avoidanceForce) * math.min(1f, neighborCount * 0.15f);
                }

                return avoidanceForce;
            }

            private static float3 GetSectorGateway(int2 fromSector, int2 toSector, SectorNavigationData sectorNav)
            {
                int2 direction = math.clamp(toSector - fromSector, -1, 1);
                float3 fromCenter = sectorNav.GetSectorCenter(fromSector);

                float3 gateway = fromCenter;
                gateway.x += direction.x * sectorNav.sectorSize * 0.5f;
                gateway.y += direction.y * sectorNav.sectorSize * 0.5f;

                return gateway;
            }
        }
    }
}