using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CombatantAttackResourceSystem : ISystem
    {
        [BurstCompile]
        private partial struct FindAndAttackResourcesJob : IJobEntity
        {
            [ReadOnly] public NativeArray<Entity> ResourceEntities;
            [ReadOnly] public NativeArray<LocalTransform> ResourceTransforms;
            [ReadOnly] public ComponentLookup<Resource> ResourceLookup;

            private void Execute(
                ref Combatant combatant, 
                in LocalTransform transform,
                EnabledRefRW<MovingTag> movingTag)
            {
                // Skip if combatant is dead or already attacking
                if (combatant.Data.IsDead)
                    return;

                // Find nearest resource within detection range
                float nearestDistance = float.MaxValue;
                bool foundResource = false;

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
                    // If close enough to attack (use a smaller range for actual attacking)
                    float attackRange = math.min(combatant.Data.DetectionRange * 0.5f, 2f);
                    
                    if (nearestDistance <= attackRange)
                    {
                        // Switch to attacking state and STOP MOVING
                        if (combatant.Data.State != CombatantState.Attacking)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Attacking);
                        }
                        
                        // Disable MovingTag - combatant is in range and attacking
                        movingTag.ValueRW = false;
                    }
                    else if (combatant.Data.State == CombatantState.Idle || 
                             combatant.Data.State == CombatantState.Patrolling)
                    {
                        // Move towards resource (chasing state) and ENABLE MOVING
                        combatant.Data = combatant.Data.SetState(CombatantState.Chasing);
                        movingTag.ValueRW = true;
                    }
                }
                else
                {
                    // No resources nearby, return to idle if currently attacking
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

            // Get all resource entities and their transforms
            var resourceEntities = systemData.ResourceQuery.ToEntityArray(Allocator.TempJob);
            var resourceTransforms = systemData.ResourceQuery.ToComponentDataArray<LocalTransform>(Allocator.TempJob);

            // Early exit if no resources
            if (resourceEntities.Length == 0)
            {
                resourceEntities.Dispose();
                resourceTransforms.Dispose();
                return;
            }

            var job = new FindAndAttackResourcesJob
            {
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