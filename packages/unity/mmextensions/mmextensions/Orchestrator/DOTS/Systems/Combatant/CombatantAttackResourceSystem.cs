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
    /// Uses ONLY the entity cache from the QuadTree spatial system for maximum performance.
    /// The cache contains all entities (resources, combatants, etc.) updated by EntityCacheDrainSystem.
    /// Uses Combatant.State for movement control (MoveToDestinationSystem handles state-based movement).
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CombatantAttackResourceSystem : ISystem
    {
        [BurstCompile]
        private partial struct FindAndAttackResourcesJob : IJobEntity
        {
            // Cache-based resource data from QuadTree spatial system
            [ReadOnly] public NativeArray<EntityBlitContainer> CachedResources;

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

                // Search through cache for resources
                // Cache is populated by EntityCacheDrainSystem -> SpatialSystemUtilities.UpdateFromCache()
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
            public NativeArray<EntityBlitContainer> EmptyCacheArray; // Reusable empty array to avoid allocations when cache is empty
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();

            // Create persistent empty array to avoid per-frame allocations when cache is empty
            systemData.EmptyCacheArray = new NativeArray<EntityBlitContainer>(0, Allocator.Persistent);

            state.EntityManager.AddComponentData(state.SystemHandle, systemData);
        }

        public void OnDestroy(ref SystemState state)
        {
            // Cleanup persistent empty array
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);
            if (systemData.EmptyCacheArray.IsCreated)
            {
                systemData.EmptyCacheArray.Dispose();
            }
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);

            // Get cache data from EntityCacheDrainSystem
            // Cache is populated by EntityCacheDrainSystem -> SpatialSystemUtilities.UpdateFromCache()
            // and contains ALL entities in the spatial system (resources, combatants, etc.)
            NativeArray<EntityBlitContainer> cachedData;

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
                    else
                    {
                        // Cache exists but is empty - use persistent empty array
                        cachedData = systemData.EmptyCacheArray;
                    }
                }
                else
                {
                    // Cache entity exists but no buffer - use persistent empty array
                    cachedData = systemData.EmptyCacheArray;
                }
            }
            else
            {
                // Cache not initialized yet - use persistent empty array
                cachedData = systemData.EmptyCacheArray;
            }

            var job = new FindAndAttackResourcesJob
            {
                CachedResources = cachedData
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);
        }
    }
}