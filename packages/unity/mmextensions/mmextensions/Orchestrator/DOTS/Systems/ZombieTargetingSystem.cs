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
        private EntityQuery _waypointNetworkQuery;

        // Cached target data to eliminate per-frame allocations
        private NativeArray<Entity> _cachedTargetEntities;
        private NativeArray<LocalTransform> _cachedTargetTransforms;
        private NativeArray<ZombieTarget> _cachedTargetData;
        private float _lastTargetCacheUpdate;
        private bool _cacheInitialized;

        // Empty arrays for when no targets exist
        private NativeArray<Entity> _emptyEntityArray;
        private NativeArray<LocalTransform> _emptyTransformArray;
        private NativeArray<ZombieTarget> _emptyTargetArray;

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

            // Query for waypoint network
            _waypointNetworkQuery = state.GetEntityQuery(
                ComponentType.ReadOnly<WaypointNetwork>()
            );

            // Require zombies to exist for this system to run
            state.RequireForUpdate(_zombieQuery);

            // Initialize empty arrays for when no targets exist
            _emptyEntityArray = new NativeArray<Entity>(0, Allocator.Persistent);
            _emptyTransformArray = new NativeArray<LocalTransform>(0, Allocator.Persistent);
            _emptyTargetArray = new NativeArray<ZombieTarget>(0, Allocator.Persistent);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Update target cache if targets exist (but don't exit if they don't - zombies still need to patrol!)
            bool hasTargets = !_targetQuery.IsEmpty;

            if (hasTargets)
            {
                // Update target cache every 0.5 seconds instead of every frame (MASSIVE performance gain)
                if (!_cacheInitialized || currentTime - _lastTargetCacheUpdate > 0.5f)
                {
                    UpdateTargetCache();
                    _lastTargetCacheUpdate = currentTime;
                }
            }
            else if (_cacheInitialized)
            {
                // Clear cache if no targets exist anymore
                DisposeCaches();
                _cacheInitialized = false;
            }

            // Get map settings for patrol configuration
            var mapSettings = SystemAPI.HasSingleton<MapSettings>()
                ? SystemAPI.GetSingleton<MapSettings>()
                : MapSettings.CreateDefault();

            // Get waypoint network for patrol waypoints (if available)
            DynamicBuffer<WaypointNode> waypointNodes = default;
            WaypointNetwork waypointNetwork = default;
            SectorNavigationData sectorNav = default;
            bool hasWaypoints = false;

            if (!_waypointNetworkQuery.IsEmpty)
            {
                var networkEntity = _waypointNetworkQuery.GetSingletonEntity();
                waypointNetwork = SystemAPI.GetComponent<WaypointNetwork>(networkEntity);
                if (waypointNetwork.isInitialized)
                {
                    waypointNodes = SystemAPI.GetBuffer<WaypointNode>(networkEntity);
                    hasWaypoints = SystemAPI.TryGetSingleton<SectorNavigationData>(out sectorNav);
                }
            }

            // Use cached data - zero allocations per frame!
            var targetingJob = new ZombieTargetingJob
            {
                currentTime = currentTime,
                targetEntities = hasTargets && _cacheInitialized ? _cachedTargetEntities : _emptyEntityArray,
                targetTransforms = hasTargets && _cacheInitialized ? _cachedTargetTransforms : _emptyTransformArray,
                targetData = hasTargets && _cacheInitialized ? _cachedTargetData : _emptyTargetArray,
                hasValidTargets = hasTargets && _cacheInitialized,
                mapSettings = mapSettings,
                waypointNodes = waypointNodes,
                waypointNetwork = waypointNetwork,
                sectorNav = sectorNav,
                hasWaypoints = hasWaypoints,
                // Reduced staggering for better responsiveness
                frameStagger = (uint)(currentTime * 60f) % 3 // Spread across only 3 frames for faster updates
            };

            state.Dependency = targetingJob.ScheduleParallel(_zombieQuery, state.Dependency);
        }

        private void DisposeCaches()
        {
            if (_cachedTargetEntities.IsCreated) _cachedTargetEntities.Dispose();
            if (_cachedTargetTransforms.IsCreated) _cachedTargetTransforms.Dispose();
            if (_cachedTargetData.IsCreated) _cachedTargetData.Dispose();
        }

        private void UpdateTargetCache()
        {
            // Dispose old cache
            if (_cacheInitialized)
            {
                DisposeCaches();
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
                DisposeCaches();
            }

            // Dispose empty arrays
            if (_emptyEntityArray.IsCreated) _emptyEntityArray.Dispose();
            if (_emptyTransformArray.IsCreated) _emptyTransformArray.Dispose();
            if (_emptyTargetArray.IsCreated) _emptyTargetArray.Dispose();
        }
    }

    [BurstCompile]
    partial struct ZombieTargetingJob : IJobEntity
    {
        public float currentTime;
        public uint frameStagger;
        public MapSettings mapSettings;
        public bool hasWaypoints;
        public bool hasValidTargets;

        [ReadOnly] public NativeArray<Entity> targetEntities;
        [ReadOnly] public NativeArray<LocalTransform> targetTransforms;
        [ReadOnly] public NativeArray<ZombieTarget> targetData;

        [ReadOnly] public DynamicBuffer<WaypointNode> waypointNodes;
        [ReadOnly] public WaypointNetwork waypointNetwork;
        [ReadOnly] public SectorNavigationData sectorNav;

        public void Execute(
            [EntityIndexInQuery] int entityIndex,
            ref NavigationData navigation,
            ref Movement movement,
            ref EntityState entityState,
            in LocalTransform transform,
            in EntityCore core)
        {
            // Staggered updates - process 1/3rd of entities per frame for responsiveness
            // At 60fps, all zombies update within 0.05 seconds
            if ((entityIndex + frameStagger) % 3 != 0)
                return;

            // Check if we should skip this update based on timing
            // Patrolling zombies should update more frequently than hunting zombies
            bool isPatrolling = StateHelpers.IsPatrolling(entityState);

            float baseInterval = navigation.updateInterval;
            // Patrolling zombies update faster (0.5s) to get new waypoints quickly
            // Hunting zombies use normal interval
            float adaptiveInterval = isPatrolling ? 0.5f :
                math.lerp(baseInterval, baseInterval * 3f, targetEntities.Length / 10000f);

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

            // Only search for targets if we have any
            if (hasValidTargets && targetEntities.IsCreated && targetEntities.Length > 0)
            {
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

                // Generate patrol waypoint using waypoint network if available
                if (hasWaypoints)
                    GeneratePatrolWaypointFromNetwork(ref movement, in zombiePos, entityIndex, currentTime, mapSettings);
                else
                    GeneratePatrolWaypoint(ref movement, in zombiePos, entityIndex, currentTime, mapSettings);
            }
        }

        [BurstCompile]
        private void GeneratePatrolWaypointFromNetwork(ref Movement movement, in float3 currentPos, int entityIndex, float currentTime, in MapSettings mapSettings)
        {
            // WAYPOINT-BASED PATROL: Use existing waypoint network for patrol
            float2 currentPos2D = currentPos.xy;

            // Get nearest waypoint to current position
            int nearestWaypoint = WaypointNetworkUtilities.GetNearestWaypoint(
                currentPos, waypointNodes, sectorNav, waypointNetwork);

            if (nearestWaypoint == -1 || waypointNodes.Length == 0)
            {
                // Fallback to random patrol if no waypoints
                GeneratePatrolWaypoint(ref movement, in currentPos, entityIndex, currentTime, mapSettings);
                return;
            }

            // Generate a random target waypoint that's different from current
            // Use entity index as primary entropy source to ensure each zombie gets unique destinations
            // Add time component for variation over time
            uint seed = (uint)(entityIndex + 1) * 31337u + (uint)(currentTime * 100f);
            seed = math.max(1u, seed); // Ensure never zero
            Unity.Mathematics.Random random = new Unity.Mathematics.Random(seed);

            // Pick a random waypoint from the network
            int targetWaypoint = random.NextInt(0, waypointNodes.Length);

            // Make sure we pick a different waypoint that's far enough away
            int attempts = 0;
            while (attempts < 10)
            {
                targetWaypoint = random.NextInt(0, waypointNodes.Length);
                float3 waypointPos = waypointNodes[targetWaypoint].position;
                float distanceToWaypoint = math.distance(currentPos, waypointPos);

                // Accept waypoint if it's far enough (at least 50 units away)
                if (distanceToWaypoint > 50f && targetWaypoint != nearestWaypoint)
                {
                    break;
                }
                attempts++;
            }

            // Set destination to the selected waypoint
            float3 targetPos = waypointNodes[targetWaypoint].position;
            movement.destination = targetPos;

            // Set facing direction
            float2 direction = targetPos.xy - currentPos2D;
            if (math.lengthsq(direction) > 0.01f)
            {
                movement.facingDirection = math.normalize(direction);
            }
        }

        [BurstCompile]
        private static void GeneratePatrolWaypoint(ref Movement movement, in float3 currentPos, int entityIndex, float currentTime, in MapSettings mapSettings)
        {
            // MAP-WIDE GRID PATROL: Zombies patrol random points across the entire map
            float2 currentPos2D = currentPos.xy;

            // Calculate map boundaries
            float halfMapSize = mapSettings.mapSize * 0.5f;

            // Generate unique waypoints for each zombie
            // Use entity index as primary entropy to ensure different destinations
            uint seed = (uint)(entityIndex + 1) * 31337u + (uint)(currentTime * 100f);
            seed = math.max(1u, seed); // Ensure never zero
            Unity.Mathematics.Random random = new Unity.Mathematics.Random(seed);

            // Generate random position anywhere on the map
            float2 randomMapPosition = new float2(
                random.NextFloat(-halfMapSize, halfMapSize),
                random.NextFloat(-halfMapSize, halfMapSize)
            );

            // If zombie is at edge of map, bring it back toward center area
            float distanceFromOrigin = math.length(currentPos2D);
            if (distanceFromOrigin > halfMapSize * 0.9f)
            {
                // Move back toward a random point closer to center
                float2 centerDirection = -math.normalize(currentPos2D);
                float moveDistance = random.NextFloat(halfMapSize * 0.3f, halfMapSize * 0.6f);
                randomMapPosition = currentPos2D + centerDirection * moveDistance;
            }

            // Ensure the destination is not too close (avoid jittering)
            float2 toDestination = randomMapPosition - currentPos2D;
            float distanceToDestination = math.length(toDestination);

            if (distanceToDestination < 50f) // If too close, pick a farther point
            {
                // Pick a point at least 100-200 units away
                float angle = random.NextFloat(0f, math.PI * 2f);
                float distance = random.NextFloat(100f, 200f);
                randomMapPosition = currentPos2D + new float2(
                    math.cos(angle) * distance,
                    math.sin(angle) * distance
                );

                // Clamp to map bounds
                randomMapPosition = math.clamp(randomMapPosition, -halfMapSize, halfMapSize);
            }

            // Set the destination
            movement.destination = new float3(randomMapPosition.x, randomMapPosition.y, currentPos.z);

            // Set facing direction
            float2 direction = randomMapPosition - currentPos2D;
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