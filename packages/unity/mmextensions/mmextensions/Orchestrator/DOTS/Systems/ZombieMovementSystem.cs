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
            // Simplified query using new consolidated components
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadWrite<LocalTransform>(),
                ComponentType.ReadWrite<Movement>(),
                ComponentType.ReadWrite<EntityState>(),
                ComponentType.ReadWrite<AvoidanceData>(),
                ComponentType.ReadOnly<EntityCore>(),
                ComponentType.ReadOnly<NavigationData>(),
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

            // Get configurations (cache them to avoid repeated lookups)
            var potentialConfig = SystemAPI.HasSingleton<PotentialFieldConfig>()
                ? SystemAPI.GetSingleton<PotentialFieldConfig>()
                : PotentialFieldConfig.Default;

            var mapSettings = SystemAPI.HasSingleton<MapSettings>()
                ? SystemAPI.GetSingleton<MapSettings>()
                : MapSettings.CreateDefault();

            var moveJob = new PotentialFieldSteeringJob
            {
                deltaTime = deltaTime,
                currentTime = currentTime,
                config = potentialConfig,
                mapSettings = mapSettings,
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
            [ReadOnly] public MapSettings mapSettings;

            // Pre-calculated time-based values to reduce trigonometric calculations
            [ReadOnly] public float timeBasedSeed;
            [ReadOnly] public float timeBasedSeed2;
            [ReadOnly] public float organicTimeSeed;
            [ReadOnly] public float organicTimeSeed2;

            public void Execute([EntityIndexInQuery] int entityIndex,
                              Entity entity,
                              ref LocalTransform transform,
                              ref Movement movement,
                              ref EntityState entityState,
                              ref AvoidanceData avoidance,
                              in EntityCore core,
                              in NavigationData navigation)
            {
                float3 currentPos = transform.Position;
                float3 targetPos = movement.destination;

                float3 toTarget = targetPos - currentPos;
                // Use squared distance for comparison to avoid expensive sqrt
                float distanceSquared = math.lengthsq(toTarget);
                float stoppingDistanceSquared = movement.stoppingDistance * movement.stoppingDistance;

                float distance = math.sqrt(distanceSquared);

                // Calculate steering forces with optimized functions
                float3 steering = float3.zero;

                // Check if we're close to destination for special behavior
                if (distanceSquared <= stoppingDistanceSquared)
                {
                    // NEAR DESTINATION: Handle differently based on state flags

                    // Check if entity is patrolling
                    if (StateHelpers.IsPatrolling(entityState))
                    {
                        // PATROL MODE: Generate new waypoint when reaching destination
                        // Simple approach: each zombie patrols around its own "home" area

                        // Each zombie gets a unique home position based on entity index
                        float homeAngle = (entityIndex * 2.39996f); // Golden angle
                        float homeRadius = (entityIndex % 10) * (mapSettings.mapSize * 0.08f);
                        float2 homePosition = new float2(
                            math.cos(homeAngle) * homeRadius,
                            math.sin(homeAngle) * homeRadius
                        );

                        // Generate new patrol waypoint around home
                        // Change waypoint periodically for movement
                        int timeSegment = (int)(currentTime / 3f);
                        Unity.Mathematics.Random random = new Unity.Mathematics.Random((uint)(entityIndex * 31u + timeSegment));

                        float patrolAngle = random.NextFloat(0f, math.PI * 2f);
                        float patrolDistance = random.NextFloat(
                            mapSettings.defaultPatrolRadius * 0.3f,
                            mapSettings.defaultPatrolRadius
                        );

                        float2 patrolPoint = homePosition + new float2(
                            math.cos(patrolAngle) * patrolDistance,
                            math.sin(patrolAngle) * patrolDistance
                        );

                        // Update destination
                        movement.destination = new float3(patrolPoint.x, patrolPoint.y, currentPos.z);
                        float2 currentPos2D = currentPos.xy;
                        float2 direction = patrolPoint - currentPos2D;
                        if (math.lengthsq(direction) > 0.01f)
                        {
                            movement.facingDirection = math.normalize(direction);
                        }

                        // Keep patrolling state active
                        StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Patrolling, currentTime);
                    }
                    else
                    {
                        // Original orbiting behavior for when chasing actual targets
                        // Calculate orbital position around target
                        float orbitRadius = movement.stoppingDistance + avoidance.personalSpace;
                        float orbitSpeed = 0.5f + (entityIndex * 0.1f) % 0.5f; // Vary orbit speed by entity
                        float orbitAngle = currentTime * orbitSpeed + entityIndex * 2.39996f; // Golden angle for distribution

                        // Desired orbital position
                        float3 orbitOffset = new float3(
                            math.cos(orbitAngle) * orbitRadius,
                            math.sin(orbitAngle) * orbitRadius,
                            0
                        );
                        float3 desiredPos = targetPos + orbitOffset;

                        // Soft attraction to orbital position
                        float3 toOrbit = desiredPos - currentPos;
                        float orbitDistance = math.length(toOrbit);
                        if (orbitDistance > 0.1f)
                        {
                            steering += (toOrbit / orbitDistance) * config.attractionStrength * 0.3f;
                        }

                        // Maintain collision avoidance even at destination
                        float3 noiseAvoidanceForce = GetNoiseBasedAvoidanceOptimized(currentPos, avoidance, entityIndex, config);
                        steering += noiseAvoidanceForce * 1.5f; // Stronger avoidance at destination

                        // Add slight repulsion from exact center to prevent clustering
                        if (distance < movement.stoppingDistance * 0.5f)
                        {
                            steering -= (toTarget / distance) * config.repulsionStrength * 0.5f;
                        }

                        // Cache avoidance vector
                        if ((entityIndex & 3) == ((int)(currentTime * 10f) & 3))
                        {
                            avoidance.avoidanceVector = noiseAvoidanceForce;
                            avoidance.lastAvoidanceUpdate = currentTime;
                        }

                        // Apply reduced speed near destination
                        float actualSpeed = core.speed * avoidance.speedVariation * 0.4f;

                        // Limit steering force
                        float steeringMagnitudeSquared = math.lengthsq(steering);
                        float maxForceSquared = config.maxSteeringForce * config.maxSteeringForce * 0.25f;

                        if (steeringMagnitudeSquared > maxForceSquared)
                        {
                            steering = math.normalize(steering) * config.maxSteeringForce * 0.5f;
                        }

                        // Apply movement
                        float3 movementDelta = steering * actualSpeed * deltaTime;
                        transform.Position += movementDelta;
                        transform.Position.z = 1f;

                        // Update state to orbiting
                        StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Orbiting, currentTime);
                    }
                }
                else
                {
                    // FAR FROM DESTINATION: Normal pathfinding behavior

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
                    float actualSpeed = core.speed * avoidance.speedVariation;

                    // Apply steering and move entity
                    float3 movementDelta = steering * actualSpeed * deltaTime;
                    transform.Position += movementDelta;
                    transform.Position.z = 1f; // Keep on ground plane

                    // Update state to moving
                    StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Moving, currentTime);
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
            private float3 GetNoiseBasedAvoidanceOptimized(float3 pos, AvoidanceData avoidance, int entityIndex, PotentialFieldConfig config)
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
            private float3 GetOrganicVariationOptimized(float3 position, AvoidanceData avoidance, int entityIndex)
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