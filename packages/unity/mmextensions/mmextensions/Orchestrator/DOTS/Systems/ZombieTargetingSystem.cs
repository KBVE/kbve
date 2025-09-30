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
            // Query for zombies with navigation components
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadWrite<ZombieNavigation>(),
                ComponentType.ReadWrite<ZombieDestination>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<MinionData>()
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

            // Use cached data - zero allocations per frame!
            var targetingJob = new ZombieTargetingJob
            {
                currentTime = currentTime,
                targetEntities = _cachedTargetEntities,
                targetTransforms = _cachedTargetTransforms,
                targetData = _cachedTargetData,
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

        [ReadOnly] public NativeArray<Entity> targetEntities;
        [ReadOnly] public NativeArray<LocalTransform> targetTransforms;
        [ReadOnly] public NativeArray<ZombieTarget> targetData;

        public void Execute(
            [EntityIndexInQuery] int entityIndex,
            ref ZombieNavigation navigation,
            ref ZombieDestination destination,
            in LocalTransform transform,
            in MinionData minionData)
        {
            // Staggered updates for 100k entity scalability
            // Only process 1/30th of entities per frame = 3333 entities at 60fps
            if ((entityIndex + frameStagger) % 30 != 0)
                return;

            // Realistic targeting intervals - enemies don't retarget instantly
            float baseInterval = navigation.targetUpdateInterval;
            float adaptiveInterval = math.lerp(baseInterval, baseInterval * 3f, targetEntities.Length / 10000f);

            if (currentTime - navigation.lastTargetUpdate < adaptiveInterval)
                return;

            navigation.lastTargetUpdate = currentTime;

            // Skip if not actively searching and has valid target
            if (!navigation.isActivelySearching && navigation.hasTarget && navigation.targetEntity != Entity.Null)
                return;

            // Find the best target
            Entity bestTarget = Entity.Null;
            float bestDistance = float.MaxValue;
            float3 bestTargetPos = float3.zero;
            float bestPriority = 0f;

            float3 zombiePos = transform.Position;

            // Spatial optimization: Early distance culling using squared distance (faster)
            float scanRadiusSq = navigation.targetScanRadius * navigation.targetScanRadius;
            int maxTargetsToCheck = math.min(targetEntities.Length, 20); // Limit checks for 100k scale

            for (int i = 0; i < maxTargetsToCheck; i++)
            {
                var target = targetData[i];

                // Skip if target is not detectable or wrong faction
                if (!target.isDetectable || !IsValidTarget(target.faction, minionData.Faction))
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
                navigation.hasTarget = true;

                // Update destination to target position
                destination.targetPosition = bestTargetPos;
                destination.facingDirection = math.normalize(bestTargetPos - zombiePos);
            }
            else if (navigation.hasTarget)
            {
                // Lost target, but remember last position for a while
                navigation.hasTarget = false;
                navigation.targetEntity = Entity.Null;

                // Keep moving toward last known position
                destination.targetPosition = navigation.lastKnownTargetPos;
            }
            else
            {
                // No target and no memory, stop or wander
                navigation.hasTarget = false;
                navigation.targetEntity = Entity.Null;

                // Could implement wandering behavior here
                // For now, just stay in place
                destination.targetPosition = zombiePos;
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