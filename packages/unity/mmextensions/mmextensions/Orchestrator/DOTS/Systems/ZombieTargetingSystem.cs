using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Collections;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// High-performance zombie targeting system using ISystem and zero-allocation queries
    /// Finds nearest players and updates zombie navigation targets efficiently
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(Pathfinding.ECS.AIMovementSystemGroup))]
    [BurstCompile]
    public partial struct ZombieTargetingSystem : ISystem
    {
        private EntityQuery _zombieQuery;
        private EntityQuery _targetQuery;

        // Cached target data to eliminate per-frame allocations
        private NativeArray<Entity> _cachedTargetEntities;
        private NativeArray<LocalTransform> _cachedTargetTransforms;
        private NativeArray<ZombieTarget> _cachedTargetData;
        private float _lastTargetCacheUpdate;
        private bool _cacheInitialized;

        public void OnCreate(ref SystemState state)
        {
            // Query for zombies using new consolidated components
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadWrite<NavigationData>(),
                ComponentType.ReadWrite<Movement>(),
                ComponentType.ReadWrite<EntityState>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<EntityCore>()
            );

            // Query for potential targets (players, etc.)
            _targetQuery = state.GetEntityQuery(
                ComponentType.ReadOnly<ZombieTarget>(),
                ComponentType.ReadOnly<LocalTransform>()
            );

            // Require zombies to exist for this system to run
            state.RequireForUpdate(_zombieQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Early exit if no targets exist - saves massive computation
            if (_targetQuery.IsEmpty)
                return;

            // Update target cache every 0.5 seconds instead of every frame (MASSIVE performance gain)
            if (!_cacheInitialized || currentTime - _lastTargetCacheUpdate > 0.5f)
            {
                UpdateTargetCache();
                _lastTargetCacheUpdate = currentTime;
            }

            // Get map settings for patrol configuration
            var mapSettings = SystemAPI.HasSingleton<MapSettings>()
                ? SystemAPI.GetSingleton<MapSettings>()
                : MapSettings.CreateDefault();

            // Use cached data - zero allocations per frame!
            var targetingJob = new ZombieTargetingJob
            {
                currentTime = currentTime,
                targetEntities = _cachedTargetEntities,
                targetTransforms = _cachedTargetTransforms,
                targetData = _cachedTargetData,
                mapSettings = mapSettings,
                // Reduced staggering for better responsiveness
                frameStagger = (uint)(currentTime * 60f) % 10 // Spread across 10 frames instead of 30
            };

            state.Dependency = targetingJob.ScheduleParallel(_zombieQuery, state.Dependency);
        }

        private void UpdateTargetCache()
        {
            // Dispose old cache
            if (_cacheInitialized)
            {
                if (_cachedTargetEntities.IsCreated) _cachedTargetEntities.Dispose();
                if (_cachedTargetTransforms.IsCreated) _cachedTargetTransforms.Dispose();
                if (_cachedTargetData.IsCreated) _cachedTargetData.Dispose();
            }

            // Create new cache
            _cachedTargetEntities = _targetQuery.ToEntityArray(Allocator.Persistent);
            _cachedTargetTransforms = _targetQuery.ToComponentDataArray<LocalTransform>(Allocator.Persistent);
            _cachedTargetData = _targetQuery.ToComponentDataArray<ZombieTarget>(Allocator.Persistent);
            _cacheInitialized = true;
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            // Dispose cached arrays
            if (_cacheInitialized)
            {
                if (_cachedTargetEntities.IsCreated) _cachedTargetEntities.Dispose();
                if (_cachedTargetTransforms.IsCreated) _cachedTargetTransforms.Dispose();
                if (_cachedTargetData.IsCreated) _cachedTargetData.Dispose();
            }
        }
    }

    [BurstCompile]
    partial struct ZombieTargetingJob : IJobEntity
    {
        public float currentTime;
        public uint frameStagger;
        public MapSettings mapSettings;

        [ReadOnly] public NativeArray<Entity> targetEntities;
        [ReadOnly] public NativeArray<LocalTransform> targetTransforms;
        [ReadOnly] public NativeArray<ZombieTarget> targetData;

        public void Execute(
            [EntityIndexInQuery] int entityIndex,
            ref NavigationData navigation,
            ref Movement movement,
            ref EntityState entityState,
            in LocalTransform transform,
            in EntityCore core)
        {
            // Staggered updates for 100k entity scalability
            // Only process 1/30th of entities per frame = 3333 entities at 60fps
            if ((entityIndex + frameStagger) % 30 != 0)
                return;

            // Realistic targeting intervals - enemies don't retarget instantly
            float baseInterval = navigation.updateInterval;
            float adaptiveInterval = math.lerp(baseInterval, baseInterval * 3f, targetEntities.Length / 10000f);

            if (currentTime - navigation.lastUpdate < adaptiveInterval)
                return;

            navigation.lastUpdate = currentTime;

            // Skip if not actively searching and has valid target
            bool hasTarget = StateHelpers.HasFlag(entityState, EntityStateFlags.HasTarget);
            bool isSearching = StateHelpers.HasFlag(entityState, EntityStateFlags.SearchingTarget);

            if (!isSearching && hasTarget && navigation.targetEntity != Entity.Null)
                return;

            // Find the best target
            Entity bestTarget = Entity.Null;
            float bestDistance = float.MaxValue;
            float3 bestTargetPos = float3.zero;
            float bestPriority = 0f;

            float3 zombiePos = transform.Position;

            // Spatial optimization: Early distance culling using squared distance (faster)
            float scanRadiusSq = navigation.scanRadius * navigation.scanRadius;
            int maxTargetsToCheck = math.min(targetEntities.Length, 20); // Limit checks for 100k scale

            for (int i = 0; i < maxTargetsToCheck; i++)
            {
                var target = targetData[i];

                // Skip if target is not detectable or wrong faction
                if (!target.isDetectable || !IsValidTarget(target.faction, core.faction))
                    continue;

                float3 targetPos = targetTransforms[i].Position;

                // Fast squared distance check before expensive sqrt
                float distanceSq = math.distancesq(zombiePos, targetPos);
                if (distanceSq > scanRadiusSq)
                    continue;

                float distance = math.sqrt(distanceSq); // Only calculate sqrt if needed

                // Calculate target score (closer = better, higher priority = better)
                float score = target.priority / math.max(distance, 0.1f);

                // Prioritize current target slightly to avoid thrashing
                if (targetEntities[i].Equals(navigation.targetEntity))
                    score *= 1.2f;

                if (score > bestPriority)
                {
                    bestTarget = targetEntities[i];
                    bestDistance = distance;
                    bestTargetPos = targetPos;
                    bestPriority = score;
                }
            }

            // Update navigation based on findings
            if (bestTarget != Entity.Null)
            {
                // Found a valid target
                navigation.targetEntity = bestTarget;
                navigation.lastKnownTargetPos = bestTargetPos;

                // Update state flags
                StateHelpers.AddFlag(ref entityState, EntityStateFlags.HasTarget);
                StateHelpers.RemoveFlag(ref entityState, EntityStateFlags.SearchingTarget);
                StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Pursuing, currentTime);

                // Update destination to target position
                movement.destination = bestTargetPos;
                float2 zombiePos2D = zombiePos.xy;
                movement.facingDirection = math.normalize(bestTargetPos.xy - zombiePos2D);
            }
            else if (hasTarget)
            {
                // Lost target, but remember last position for a while
                navigation.targetEntity = Entity.Null;

                // Update state flags
                StateHelpers.RemoveFlag(ref entityState, EntityStateFlags.HasTarget);
                StateHelpers.AddFlag(ref entityState, EntityStateFlags.TargetLost);
                StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Moving, currentTime);

                // Keep moving toward last known position
                movement.destination = navigation.lastKnownTargetPos;
            }
            else
            {
                // No target and no memory, patrol around map center
                navigation.targetEntity = Entity.Null;

                // Update state flags for patrolling
                StateHelpers.RemoveFlag(ref entityState, EntityStateFlags.HasTarget);
                StateHelpers.AddFlag(ref entityState, EntityStateFlags.SearchingTarget);
                StateHelpers.SetMovementState(ref entityState, EntityStateFlags.Patrolling, currentTime);

                // Generate patrol waypoint using map settings
                GeneratePatrolWaypoint(ref movement, in zombiePos, entityIndex, currentTime, mapSettings);
            }
        }

        [BurstCompile]
        private static void GeneratePatrolWaypoint(ref Movement movement, in float3 currentPos, int entityIndex, float currentTime, in MapSettings mapSettings)
        {
            // SIMPLE DISTRIBUTED PATROL: Each zombie gets a random waypoint in the map
            // This avoids complex zone calculations that might cause clustering

            float2 currentPos2D = currentPos.xy;

            // Use entity index to seed random but stable patrol area
            Unity.Mathematics.Random random = new Unity.Mathematics.Random((uint)(entityIndex * 73856093u + 1));

            // Each zombie gets a "home" position based on its entity index
            // This spreads them across the entire map
            float homeAngle = (entityIndex * 2.39996f); // Golden angle for distribution
            float homeRadius = (entityIndex % 10) * (mapSettings.mapSize * 0.08f); // Varying distances from center

            float2 homePosition = new float2(
                math.cos(homeAngle) * homeRadius,
                math.sin(homeAngle) * homeRadius
            );

            // Check if zombie is too far from its home area (prevents wandering off)
            float distanceFromHome = math.length(currentPos2D - homePosition);
            if (distanceFromHome > mapSettings.defaultPatrolRadius * 3f)
            {
                // Guide back toward home area
                float2 directionToHome = math.normalize(homePosition - currentPos2D);
                movement.destination = new float3(
                    homePosition.x + random.NextFloat(-50f, 50f),
                    homePosition.y + random.NextFloat(-50f, 50f),
                    currentPos.z
                );
                movement.facingDirection = directionToHome;
                return;
            }

            // Generate next patrol waypoint around home position
            // Changes every few seconds to create movement
            int timeSegment = (int)(currentTime / 3f); // New waypoint every 3 seconds
            random = new Unity.Mathematics.Random((uint)(entityIndex * 19u + timeSegment));

            // Random offset from home position
            float patrolAngle = random.NextFloat(0f, math.PI * 2f);
            float patrolDistance = random.NextFloat(mapSettings.defaultPatrolRadius * 0.3f, mapSettings.defaultPatrolRadius);

            float2 patrolOffset = new float2(
                math.cos(patrolAngle) * patrolDistance,
                math.sin(patrolAngle) * patrolDistance
            );

            float2 targetPos = homePosition + patrolOffset;

            // Set the destination
            movement.destination = new float3(targetPos.x, targetPos.y, currentPos.z);

            // Set facing direction
            float2 direction = targetPos - currentPos2D;
            if (math.lengthsq(direction) > 0.01f)
            {
                movement.facingDirection = math.normalize(direction);
            }
        }

        [BurstCompile]
        private static bool IsValidTarget(FactionType targetFaction, FactionType zombieFaction)
        {
            // Zombies (enemies) should target players and allies
            return zombieFaction switch
            {
                FactionType.Enemy => targetFaction == FactionType.Player || targetFaction == FactionType.Ally,
                FactionType.Player => targetFaction == FactionType.Enemy,
                FactionType.Ally => targetFaction == FactionType.Enemy,
                _ => false
            };
        }
    }
}