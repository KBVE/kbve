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

        public void OnCreate(ref SystemState state)
        {
            // Simplified query without DynamicBuffer to avoid registration issues
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadWrite<LocalTransform>(),
                ComponentType.ReadWrite<ZombieDestination>(),
                ComponentType.ReadWrite<ZombiePathfindingState>(),
                ComponentType.ReadWrite<LocalAvoidanceData>(),
                ComponentType.ReadOnly<ZombieSpeed>(),
                ComponentType.ReadOnly<ZombiePathfindingConfig>(),
                ComponentType.ReadOnly<ZombieTag>()
            );
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Simple structure like original working code
            float deltaTime = SystemAPI.Time.DeltaTime;
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Get potential field configuration (cache it to avoid repeated lookups)
            var potentialConfig = SystemAPI.HasSingleton<PotentialFieldConfig>()
                ? SystemAPI.GetSingleton<PotentialFieldConfig>()
                : PotentialFieldConfig.Default;

            var moveJob = new PotentialFieldSteeringJob
            {
                deltaTime = deltaTime,
                currentTime = currentTime,
                config = potentialConfig,
                // Pre-calculate time-based values for noise functions
                timeBasedSeed = currentTime * 0.4f,
                timeBasedSeed2 = currentTime * 0.3f,
                organicTimeSeed = currentTime * 0.3f,
                organicTimeSeed2 = currentTime * 0.2f
            };

            // Schedule the job with default batch size for optimal parallelization
            state.Dependency = moveJob.ScheduleParallel(_zombieQuery, state.Dependency);
        }

        /// <summary>
        /// Mathematical potential field steering for 100K+ zombies - eliminates FPS spikes
        /// </summary>
        [BurstCompile]
        private partial struct PotentialFieldSteeringJob : IJobEntity
        {
            [ReadOnly] public float deltaTime;
            [ReadOnly] public float currentTime;
            [ReadOnly] public PotentialFieldConfig config;

            // Pre-calculated time-based values to reduce trigonometric calculations
            [ReadOnly] public float timeBasedSeed;
            [ReadOnly] public float timeBasedSeed2;
            [ReadOnly] public float organicTimeSeed;
            [ReadOnly] public float organicTimeSeed2;

            public void Execute([EntityIndexInQuery] int entityIndex,
                              Entity entity,
                              ref LocalTransform transform,
                              ref ZombieDestination destination,
                              ref ZombiePathfindingState pathState,
                              ref LocalAvoidanceData avoidance,
                              in ZombieSpeed speed,
                              in ZombiePathfindingConfig zombieConfig)
            {
                float3 currentPos = transform.Position;
                float3 targetPos = destination.targetPosition;

                float3 toTarget = targetPos - currentPos;
                // Use squared distance for comparison to avoid expensive sqrt
                float distanceSquared = math.lengthsq(toTarget);
                float stoppingDistanceSquared = zombieConfig.stoppingDistance * zombieConfig.stoppingDistance;

                // Only calculate actual distance when needed for pathState
                if (distanceSquared > stoppingDistanceSquared)
                {
                    float distance = math.sqrt(distanceSquared);
                    pathState.distanceToDestination = distance;

                    // Calculate steering forces with optimized functions
                    float3 steering = float3.zero;

                    // FORCE 1: Attraction to formation target (using cached distance)
                    steering += AttractToTargetOptimized(toTarget, distance, config.attractionStrength);

                    // FORCE 2: Noise-based collision avoidance (using pre-calculated time seeds)
                    float3 noiseAvoidanceForce = GetNoiseBasedAvoidanceOptimized(currentPos, avoidance, entityIndex, config);
                    steering += noiseAvoidanceForce;

                    // FORCE 3: Natural variation for organic movement (using pre-calculated time seeds)
                    steering += GetOrganicVariationOptimized(currentPos, avoidance, entityIndex);

                    // Cache the avoidance vector for future frames (only when we calculated new noise)
                    if ((entityIndex & 3) == ((int)(currentTime * 10f) & 3))
                    {
                        avoidance.avoidanceVector = noiseAvoidanceForce;
                        avoidance.lastAvoidanceUpdate = currentTime;
                    }

                    // Limit steering force using squared magnitude check first
                    float steeringMagnitudeSquared = math.lengthsq(steering);
                    float maxForceSquared = config.maxSteeringForce * config.maxSteeringForce;

                    if (steeringMagnitudeSquared > maxForceSquared)
                    {
                        steering = math.normalize(steering) * config.maxSteeringForce;
                    }

                    // Apply speed with natural variation
                    float actualSpeed = speed.value * avoidance.speedVariation;

                    // Apply steering and move entity
                    float3 movement = steering * actualSpeed * deltaTime;
                    transform.Position += movement;
                    transform.Position.z = 1f; // Keep on ground plane

                    pathState.isMoving = true;
                    pathState.state = ZombiePathfindingState.PathfindingState.FollowingPath;
                }
                else
                {
                    pathState.distanceToDestination = math.sqrt(distanceSquared);
                    pathState.isMoving = false;
                    pathState.state = ZombiePathfindingState.PathfindingState.ReachedDestination;
                }
            }

            /// <summary>
            /// Optimized attraction force toward formation target (using pre-calculated toTarget)
            /// </summary>
            private static float3 AttractToTargetOptimized(float3 toTarget, float distance, float strength)
            {
                if (distance < 0.1f) return float3.zero;
                return (toTarget / distance) * strength; // Avoid normalize() by using division
            }

            /// <summary>
            /// Optimized noise-based collision avoidance using pre-calculated time seeds
            /// </summary>
            private float3 GetNoiseBasedAvoidanceOptimized(float3 pos, LocalAvoidanceData avoidance, int entityIndex, PotentialFieldConfig config)
            {
                // Stagger expensive trigonometric calculations across frames using entity index
                // Only 1/4 of entities calculate full noise per frame for better frame distribution
                if ((entityIndex & 3) != ((int)(currentTime * 10f) & 3))
                {
                    // Use cached avoidance vector for non-update frames
                    return avoidance.avoidanceVector * 0.8f; // Slight decay
                }

                // Use position-based noise with pre-calculated time components
                float seed = pos.x + pos.y + entityIndex * 137f;

                // Use pre-calculated time seeds to reduce multiplication
                float avoidanceX = math.sin(seed * 0.2f + timeBasedSeed);
                float avoidanceY = math.cos(seed * 0.15f + timeBasedSeed2);

                // Scale by personal space and repulsion strength
                float3 noiseAvoidance = new float3(avoidanceX, avoidanceY, 0) * avoidance.personalSpace * config.repulsionStrength * 0.1f;

                // Cache the result for subsequent frames
                // Note: We can't modify avoidance here since it's 'in' parameter,
                // but this optimization still reduces calculations by 75%

                return noiseAvoidance;
            }

            /// <summary>
            /// Optimized organic variation using pre-calculated time seeds
            /// </summary>
            private float3 GetOrganicVariationOptimized(float3 position, LocalAvoidanceData avoidance, int entityIndex)
            {
                // Stagger organic variation calculations using a different pattern to avoid alignment with avoidance
                // Only 1/3 of entities calculate full variation per frame
                if ((entityIndex % 3) != ((int)(currentTime * 8f) % 3))
                {
                    // Use simplified variation for non-update frames
                    float simpleVariation = (entityIndex * 0.1f) % 1.0f - 0.5f;
                    return new float3(simpleVariation, -simpleVariation * 0.7f, 0) * avoidance.personalSpace * 0.05f;
                }

                // Use deterministic noise with pre-calculated time components
                float seed = position.x + position.y + entityIndex * 137f;

                // Use pre-calculated time seeds
                float wanderX = math.sin(seed * 0.1f + organicTimeSeed) * 0.15f;
                float wanderY = math.cos(seed * 0.07f + organicTimeSeed2) * 0.15f;

                return new float3(wanderX, wanderY, 0) * avoidance.personalSpace;
            }
        }
    }
}