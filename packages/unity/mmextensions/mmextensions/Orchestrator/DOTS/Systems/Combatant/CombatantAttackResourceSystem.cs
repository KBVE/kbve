using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Optimized system for combatants to detect and attack resources.
    /// Uses entity cache for resource positions when available (change-filtered).
    /// Maintains MovingTag until combatant is in attack range.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CombatantAttackResourceSystem : ISystem
    {
        [BurstCompile]
        private partial struct FindAndAttackResourcesJob : IJobEntity
        {
            // Cache-based resource data (preferred for performance)
            [ReadOnly] public NativeArray<EntityBlitContainer> CachedResources;
            [ReadOnly] public bool UseCacheData;

            // Legacy: Direct ECS query (fallback when cache not available)
            [ReadOnly] public NativeArray<Entity> ResourceEntities;
            [ReadOnly] public NativeArray<LocalTransform> ResourceTransforms;
            [ReadOnly] public ComponentLookup<Resource> ResourceLookup;

            private void Execute(
                ref Combatant combatant,
                in LocalTransform transform,
                EnabledRefRW<MovingTag> movingTag)
            {
                // Skip if combatant is dead
                if (combatant.Data.IsDead)
                    return;

                // Find nearest resource within detection range
                float nearestDistance = float.MaxValue;
                bool foundResource = false;

                // Use cache if available (preferred - change-filtered, no ECS query overhead)
                if (UseCacheData && CachedResources.Length > 0)
                {
                    for (int i = 0; i < CachedResources.Length; i++)
                    {
                        var cached = CachedResources[i];

                        // Only process resources (skip other entity types)
                        if (!cached.HasResource)
                            continue;

                        // Skip depleted resources
                        if (cached.Resource.IsDepleted)
                            continue;

                        var resourcePos = cached.EntityData.WorldPos;
                        float distance = math.distance(transform.Position, resourcePos);

                        // Check if resource is within detection range
                        if (distance <= combatant.Data.DetectionRange && distance < nearestDistance)
                        {
                            nearestDistance = distance;
                            foundResource = true;
                        }
                    }
                }
                else
                {
                    // Fallback to direct ECS query
                    for (int i = 0; i < ResourceEntities.Length; i++)
                    {
                        var resourceEntity = ResourceEntities[i];

                        // Check if resource still exists and has valid data
                        if (!ResourceLookup.HasComponent(resourceEntity))
                            continue;

                        var resource = ResourceLookup[resourceEntity];

                        // Skip depleted resources
                        if (resource.Data.IsDepleted)
                            continue;

                        var resourceTransform = ResourceTransforms[i];
                        float distance = math.distance(transform.Position, resourceTransform.Position);

                        // Check if resource is within detection range
                        if (distance <= combatant.Data.DetectionRange && distance < nearestDistance)
                        {
                            nearestDistance = distance;
                            foundResource = true;
                        }
                    }
                }

                // Update combatant state based on findings
                if (foundResource)
                {
                    // Attack range is smaller than detection range
                    // Combatant must get VERY close to resource before attacking
                    float attackRange = math.min(combatant.Data.DetectionRange * 0.5f, 2f);

                    if (nearestDistance <= attackRange)
                    {
                        // CRITICAL: Only stop moving when RIGHT NEXT TO the resource
                        // Switch to attacking state and STOP MOVING
                        if (combatant.Data.State != CombatantState.Attacking)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Attacking);
                        }

                        // Disable MovingTag - combatant is in attack range
                        movingTag.ValueRW = false;
                    }
                    else
                    {
                        // Resource detected but NOT in attack range yet
                        // KEEP MOVING towards resource (MovingTag stays enabled)
                        if (combatant.Data.State == CombatantState.Idle ||
                            combatant.Data.State == CombatantState.Patrolling)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Chasing);
                        }

                        // Ensure MovingTag is enabled while chasing
                        movingTag.ValueRW = true;
                    }
                }
                else
                {
                    // No resources nearby, return to idle if currently attacking/chasing
                    if (combatant.Data.State == CombatantState.Attacking ||
                        combatant.Data.State == CombatantState.Chasing)
                    {
                        combatant.Data = combatant.Data.SetState(CombatantState.Idle);

                        // Stop moving when going back to idle
                        movingTag.ValueRW = false;
                    }
                }
            }
        }

        private struct SystemData : IComponentData
        {
            public EntityQuery CombatantQuery;
            public EntityQuery ResourceQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();

            // Query for combatants with transforms and MovingTag
            var combatantQueryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Combatant, LocalTransform, MovingTag>()
                .WithOptions(EntityQueryOptions.IgnoreComponentEnabledState);
            systemData.CombatantQuery = state.GetEntityQuery(combatantQueryBuilder);
            combatantQueryBuilder.Dispose();

            // Query for resources with transforms
            var resourceQueryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Resource, LocalTransform>();
            systemData.ResourceQuery = state.GetEntityQuery(resourceQueryBuilder);
            resourceQueryBuilder.Dispose();

            state.EntityManager.AddComponentData(state.SystemHandle, systemData);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);

            // Try to get cache data first
            var cacheQuery = SystemAPI.QueryBuilder()
                .WithAll<EntityFrameCacheTag>()
                .Build();

            bool useCacheData = false;
            NativeArray<EntityBlitContainer> cachedData = default;

            if (!cacheQuery.IsEmpty)
            {
                var cacheEntity = cacheQuery.GetSingletonEntity();
                if (state.EntityManager.HasBuffer<EntityBlitContainer>(cacheEntity))
                {
                    var cacheBuffer = state.EntityManager.GetBuffer<EntityBlitContainer>(cacheEntity);
                    if (cacheBuffer.Length > 0)
                    {
                        // Use cache data - this is already filtered to changed entities only!
                        cachedData = cacheBuffer.AsNativeArray();
                        useCacheData = true;
                    }
                }
            }

            // Fallback: Get all resource entities and their transforms (legacy path)
            NativeArray<Entity> resourceEntities = default;
            NativeArray<LocalTransform> resourceTransforms = default;

            if (!useCacheData)
            {
                resourceEntities = systemData.ResourceQuery.ToEntityArray(Allocator.TempJob);
                resourceTransforms = systemData.ResourceQuery.ToComponentDataArray<LocalTransform>(Allocator.TempJob);

                // Early exit if no resources and no cache
                if (resourceEntities.Length == 0)
                {
                    resourceEntities.Dispose();
                    resourceTransforms.Dispose();
                    return;
                }
            }

            var job = new FindAndAttackResourcesJob
            {
                // Cache data (preferred)
                CachedResources = cachedData,
                UseCacheData = useCacheData,

                // Legacy ECS query data (fallback)
                ResourceEntities = resourceEntities,
                ResourceTransforms = resourceTransforms,
                ResourceLookup = SystemAPI.GetComponentLookup<Resource>(true)
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);

            // Dispose arrays after job completes (only if we allocated them)
            if (!useCacheData)
            {
                state.Dependency = resourceEntities.Dispose(state.Dependency);
                state.Dependency = resourceTransforms.Dispose(state.Dependency);
            }
        }
    }
}