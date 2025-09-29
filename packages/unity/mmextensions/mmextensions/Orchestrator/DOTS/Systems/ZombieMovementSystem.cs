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

            // Clear and rebuild sector positions for local avoidance - no more per-frame resizing
            _sectorPositions.Clear();

            // First pass: Collect positions by sector for efficient neighbor queries
            var collectJob = new CollectPositionsBySectorJob
            {
                sectorNav = sectorNav,
                writer = _sectorPositions.AsParallelWriter()
            };

            var moveJob = new ZombieMovementWithLocalAvoidanceJob
            {
                deltaTime = deltaTime,
                currentTime = currentTime,
                sectorNav = sectorNav,
                sectorPositions = _sectorPositions,
                avoidanceRadius = config.collisionAvoidanceRadius,
                updateInterval = 0.1f, // Update avoidance every 100ms
                // Frame-based staggering for 100k entity scalability
                frameStagger = (uint)(currentTime * 60f) % 5 // Spread avoidance across 5 frames
            };

            // Schedule jobs with proper dependency chain - NO MORE Dependency.Complete()!
            var collectHandle = collectJob.ScheduleParallel(_zombieQuery, state.Dependency);
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

                // Improved staggering - update every 2 frames instead of 5 for better coordination
                bool staggerFrame = (entityIndex + frameStagger) % 2 == 0;
                bool timingUpdate = (currentTime - avoidance.lastAvoidanceUpdate) >
                                   (updateInterval + avoidance.updateOffset * 0.033f);

                if (staggerFrame && timingUpdate)
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

                // Check all 8 surrounding sectors for proper avoidance (fixes stacking!)
                for (int dx = -1; dx <= 1; dx++)
                {
                    for (int dy = -1; dy <= 1; dy++)
                    {
                        int2 checkSector = currentSector + new int2(dx, dy);

                        if (sectorPositions.TryGetFirstValue(checkSector, out float3 neighborPos, out var iterator))
                        {
                            do
                            {
                                float3 toNeighbor = position - neighborPos;
                                float distanceSq = math.lengthsq(toNeighbor);

                                // Use squared distance for performance
                                if (distanceSq > 0.0001f && distanceSq < personalSpaceSq)
                                {
                                    float invDistance = math.rsqrt(distanceSq);
                                    float3 direction = toNeighbor * invDistance;
                                    float strength = math.saturate(1f - distanceSq / personalSpaceSq);

                                    avoidanceForce += direction * strength;
                                    neighborCount++;

                                    // Increased neighbor limit for better crowd behavior
                                    if (neighborCount >= 8)
                                        break;
                                }
                            } while (sectorPositions.TryGetNextValue(out neighborPos, ref iterator) && neighborCount < 8);
                        }

                        if (neighborCount >= 8)
                            break;
                    }

                    if (neighborCount >= 8)
                        break;
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