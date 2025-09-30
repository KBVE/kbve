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
                        // PATROL MODE: Mark as needing new waypoint
                        // The targeting system will pick a new waypoint on next update
                        StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Patrolling | EntityStateFlags.SearchingTarget, currentTime);

                        // REDUCED idle movement - just a tiny drift to look natural
                        // Much smaller to prevent bouncing
                        float driftScale = 0.02f;
                        steering = new float3(
                            math.sin(currentTime * 0.3f + entityIndex) * driftScale,
                            math.cos(currentTime * 0.3f + entityIndex * 1.5f) * driftScale,
                            0
                        );
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

                        // Gentle separation at destination
                        float3 separationForce = GetSimplifiedSeparation(currentPos, entityIndex, config);
                        steering += separationForce * 0.3f; // Gentle force to prevent stacking

                        // Add slight repulsion from exact center to prevent clustering
                        if (distance < movement.stoppingDistance * 0.5f)
                        {
                            steering -= (toTarget / distance) * config.repulsionStrength * 0.5f;
                        }

                        // Update cached separation for next frame
                        if ((entityIndex & 3) == ((int)(currentTime * 10f) & 3))
                        {
                            avoidance.avoidanceVector = separationForce;
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

                    // SIMPLIFIED FORCE CALCULATION - Reduce conflicting forces

                    // Primary: Move toward target
                    steering = AttractToTargetOptimized(toTarget, distance, config.attractionStrength);

                    // Secondary: Add separation (only if close to destination to prevent fighting with attraction)
                    if (distance < 20f)
                    {
                        float3 separationForce = GetSimplifiedSeparation(currentPos, entityIndex, config);
                        steering += separationForce * 0.5f; // Gentle separation
                    }

                    // Tiny bit of noise for organic feel (much reduced)
                    float noiseScale = 0.1f;
                    float3 noise = new float3(
                        math.sin(currentTime * 0.5f + entityIndex * 1.23f) * noiseScale,
                        math.cos(currentTime * 0.5f + entityIndex * 2.34f) * noiseScale,
                        0
                    );
                    steering += noise;

                    // Limit steering force using squared magnitude check first
                    float steeringMagnitudeSquared = math.lengthsq(steering);
                    float maxForceSquared = config.maxSteeringForce * config.maxSteeringForce;

                    if (steeringMagnitudeSquared > maxForceSquared)
                    {
                        steering = math.normalize(steering) * config.maxSteeringForce;
                    }

                    // Apply speed with natural variation
                    float actualSpeed = core.speed * avoidance.speedVariation;

                    // VELOCITY DAMPING - Smooth out movement to prevent jitter
                    // Blend current velocity with new steering for smoother transitions
                    float2 currentVelocity = movement.velocity;
                    float2 targetVelocity = steering.xy * actualSpeed;

                    // Smooth interpolation (higher value = more damping, smoother movement)
                    float damping = 0.15f; // Adjust between 0 (no damping) and 1 (full damping)
                    movement.velocity = math.lerp(targetVelocity, currentVelocity, damping);

                    // Apply smoothed velocity
                    float3 movementDelta = new float3(movement.velocity * deltaTime, 0);
                    transform.Position += movementDelta;
                    transform.Position.z = 1f; // Keep on ground plane

                    // Update facing direction based on velocity
                    if (math.lengthsq(movement.velocity) > 0.01f)
                    {
                        movement.facingDirection = math.normalize(movement.velocity);
                    }

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
            /// Simplified separation force - consistent and stable
            /// </summary>
            private float3 GetSimplifiedSeparation(float3 pos, int entityIndex, PotentialFieldConfig config)
            {
                // Use entity index to create unique but stable offset pattern
                // This prevents zombies from stacking without complex calculations

                float separationRadius = config.repulsionRadius;

                // Create a unique angle for this zombie that doesn't change over time
                float baseAngle = (entityIndex * 2.39996f) % (math.PI * 2f); // Golden angle distribution

                // Only apply separation in crowded areas (determined by grid position)
                float gridSize = separationRadius * 2f;
                int2 gridPos = new int2((int)(pos.x / gridSize), (int)(pos.y / gridSize));

                // Simple hash to determine if this grid cell should have separation
                uint gridHash = (uint)(gridPos.x * 73856093 ^ gridPos.y * 19349663);
                float crowdingFactor = (gridHash % 100) / 100f; // 0 to 1 based on grid

                // Generate stable separation direction
                float2 separationDir = new float2(math.cos(baseAngle), math.sin(baseAngle));

                // Apply separation force scaled by crowding
                float3 separation = new float3(
                    separationDir.x * crowdingFactor * separationRadius * 0.5f,
                    separationDir.y * crowdingFactor * separationRadius * 0.5f,
                    0
                );

                return separation;
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