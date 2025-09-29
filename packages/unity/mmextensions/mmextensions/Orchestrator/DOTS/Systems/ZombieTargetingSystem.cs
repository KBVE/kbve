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

            // Get target data once for all zombies to use
            var targetEntities = _targetQuery.ToEntityArray(Allocator.TempJob);
            var targetTransforms = _targetQuery.ToComponentDataArray<LocalTransform>(Allocator.TempJob);
            var targetData = _targetQuery.ToComponentDataArray<ZombieTarget>(Allocator.TempJob);

            var targetingJob = new ZombieTargetingJob
            {
                currentTime = currentTime,
                targetEntities = targetEntities,
                targetTransforms = targetTransforms,
                targetData = targetData
            };

            var jobHandle = targetingJob.ScheduleParallel(_zombieQuery, state.Dependency);

            // Dispose arrays after job completes
            jobHandle = targetEntities.Dispose(jobHandle);
            jobHandle = targetTransforms.Dispose(jobHandle);
            state.Dependency = targetData.Dispose(jobHandle);
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            // Cleanup if needed
        }
    }

    [BurstCompile]
    partial struct ZombieTargetingJob : IJobEntity
    {
        public float currentTime;

        [ReadOnly] public NativeArray<Entity> targetEntities;
        [ReadOnly] public NativeArray<LocalTransform> targetTransforms;
        [ReadOnly] public NativeArray<ZombieTarget> targetData;

        public void Execute(
            ref ZombieNavigation navigation,
            ref ZombieDestination destination,
            in LocalTransform transform,
            in MinionData minionData)
        {
            // Only process if it's time to update target
            if (currentTime - navigation.lastTargetUpdate < navigation.targetUpdateInterval)
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

            for (int i = 0; i < targetEntities.Length; i++)
            {
                var target = targetData[i];

                // Skip if target is not detectable or wrong faction
                if (!target.isDetectable || !IsValidTarget(target.faction, minionData.Faction))
                    continue;

                float3 targetPos = targetTransforms[i].Position;
                float distance = math.distance(zombiePos, targetPos);

                // Skip if target is out of range
                if (distance > navigation.targetScanRadius)
                    continue;

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