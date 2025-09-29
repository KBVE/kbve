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
    [UpdateAfter(typeof(FlowFieldGenerationSystem))]
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
                updateInterval = 0.1f // Update avoidance every 100ms
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

            public void Execute(ref LocalTransform transform,
                              ref ZombieDestination destination,
                              ref ZombiePathfindingState pathState,
                              ref LocalAvoidanceData avoidance,
                              in ZombieSpeed speed,
                              in ZombiePathfindingConfig config)
            {
                float3 currentPos = transform.Position;
                float3 targetPos = destination.targetPosition;

                // Update avoidance vector (staggered updates for performance)
                bool shouldUpdateAvoidance = (currentTime - avoidance.lastAvoidanceUpdate) >
                                            (updateInterval + avoidance.updateOffset * 0.033f);

                if (shouldUpdateAvoidance)
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

                // Apply movement with avoidance
                float3 toTarget = moveTarget - currentPos;
                float distance = math.length(toTarget);
                pathState.distanceToDestination = distance;

                if (distance > config.stoppingDistance)
                {
                    float3 desiredDirection = math.normalize(toTarget);

                    // Blend desired movement with avoidance
                    float3 finalDirection = math.normalize(desiredDirection + avoidance.avoidanceVector * 0.5f);

                    // Apply speed variation for natural movement
                    float actualSpeed = speed.value * avoidance.speedVariation;

                    // Smooth movement
                    float3 movement = finalDirection * actualSpeed * deltaTime;
                    transform.Position += movement;

                    // Add slight random drift for natural movement
                    float3 drift = new float3(
                        math.sin(currentTime * 2f + avoidance.updateOffset) * 0.01f,
                        math.cos(currentTime * 2f + avoidance.updateOffset) * 0.01f,
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

                // Check current and adjacent sectors
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
                                float distance = math.length(toNeighbor);

                                if (distance > 0.01f && distance < personalSpace * 2f)
                                {
                                    // Stronger repulsion when closer
                                    float strength = math.saturate(1f - distance / (personalSpace * 2f));
                                    avoidanceForce += math.normalize(toNeighbor) * strength;
                                    neighborCount++;

                                    if (neighborCount >= 5) // Limit for performance
                                        break;
                                }
                            } while (sectorPositions.TryGetNextValue(out neighborPos, ref iterator) && neighborCount < 5);
                        }

                        if (neighborCount >= 5)
                            break;
                    }

                    if (neighborCount >= 5)
                        break;
                }

                if (neighborCount > 0)
                {
                    avoidanceForce = math.normalize(avoidanceForce) * math.min(1f, neighborCount * 0.3f);
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