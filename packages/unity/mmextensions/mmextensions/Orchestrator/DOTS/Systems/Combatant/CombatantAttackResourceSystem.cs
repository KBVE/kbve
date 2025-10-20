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
    /// Uses Combatant.State for movement control (MoveToDestinationSystem handles state-based movement).
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
                in LocalTransform transform)
            {
                // Skip if combatant is dead
                if (combatant.Data.IsDead)
                    return;

                // Find nearest resource within detection range
                float nearestDistance = float.MaxValue;
                bool foundResource = false;

                // HYBRID SEARCH: Check BOTH cache and direct query
                // Cache may contain recently placed resources, direct query has everything

                // 1. Check cache first (if available) - fast for recently changed resources
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

                // 2. ALWAYS check direct query (contains ALL resources including static ones)
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

                // Update combatant state based on findings
                if (foundResource)
                {
                    // Attack range is smaller than detection range
                    // Combatant must get VERY close to resource before attacking
                    float attackRange = math.min(combatant.Data.DetectionRange * 0.5f, 2f);

                    if (nearestDistance <= attackRange)
                    {
                        // CRITICAL: Only attack when RIGHT NEXT TO the resource
                        // MoveToDestinationSystem will automatically stop movement when State == Attacking
                        if (combatant.Data.State != CombatantState.Attacking)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Attacking);
                        }
                    }
                    else
                    {
                        // Resource detected but NOT in attack range yet
                        // MoveToDestinationSystem will automatically move when State == Chasing
                        if (combatant.Data.State == CombatantState.Idle ||
                            combatant.Data.State == CombatantState.Patrolling)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Chasing);
                        }
                    }
                }
                else
                {
                    // No resources nearby, return to idle if currently attacking/chasing
                    // MoveToDestinationSystem will automatically stop movement when State == Idle
                    if (combatant.Data.State == CombatantState.Attacking ||
                        combatant.Data.State == CombatantState.Chasing)
                    {
                        combatant.Data = combatant.Data.SetState(CombatantState.Idle);
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

            // Query for combatants with transforms
            var combatantQueryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Combatant, LocalTransform>();
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

            // HYBRID APPROACH: Use BOTH cache AND direct query
            // - Cache: Contains recently placed/changed resources (via EntityCommandBuffer updates)
            // - Direct Query: Contains ALL resources (including old static ones)
            // This ensures combatants can find both new and old resources

            NativeArray<EntityBlitContainer> cachedData = default;

            var cacheQuery = SystemAPI.QueryBuilder()
                .WithAll<EntityFrameCacheTag>()
                .Build();

            if (!cacheQuery.IsEmpty)
            {
                var cacheEntity = cacheQuery.GetSingletonEntity();
                if (state.EntityManager.HasBuffer<EntityBlitContainer>(cacheEntity))
                {
                    var cacheBuffer = state.EntityManager.GetBuffer<EntityBlitContainer>(cacheEntity);
                    if (cacheBuffer.Length > 0)
                    {
                        cachedData = cacheBuffer.AsNativeArray();
                    }
                }
            }

            // ALWAYS query ALL resources (guaranteed to find everything)
            var resourceEntities = systemData.ResourceQuery.ToEntityArray(Allocator.TempJob);
            var resourceTransforms = systemData.ResourceQuery.ToComponentDataArray<LocalTransform>(Allocator.TempJob);

            // Early exit if no resources exist at all
            if (resourceEntities.Length == 0 && (!cachedData.IsCreated || cachedData.Length == 0))
            {
                resourceEntities.Dispose();
                resourceTransforms.Dispose();
                return;
            }

            var job = new FindAndAttackResourcesJob
            {
                // Cache data (contains recently changed/placed resources)
                CachedResources = cachedData,
                UseCacheData = cachedData.IsCreated && cachedData.Length > 0,

                // Direct query data (contains ALL resources)
                ResourceEntities = resourceEntities,
                ResourceTransforms = resourceTransforms,
                ResourceLookup = SystemAPI.GetComponentLookup<Resource>(true)
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);

            // Dispose arrays after job completes
            state.Dependency = resourceEntities.Dispose(state.Dependency);
            state.Dependency = resourceTransforms.Dispose(state.Dependency);
        }
    }
}